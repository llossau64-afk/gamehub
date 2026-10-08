// Streams the mountain around the camera in 100 m chunks: terrain, road, shoulders,
// decals, guard rails, tunnels, bridges, trees, rocks, signs, buildings, obstacles.
// Chunks are built one per frame ahead of the player and disposed behind.

import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { STEP, SHOULDER, SURF, RAIL } from './track.js';
import { mats } from '../gfx/materials.js';
import * as PR from '../models/props.js';
import { CarModel } from '../models/carModel.js';
import { CARS } from '../data/cars.js';
import { rng, clamp, lerp, smoothstep } from '../core/util.js';

export const CHUNK = 100;
const NS = CHUNK / STEP;
const OFFS = [0, 0.6, 1.6, 3, 5, 8, 12, 17, 24, 33, 45, 60, 80, 105, 140];

const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();

export class World {
  constructor(scene, track, quality = 'medium') {
    this.scene = scene;
    this.track = track;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.chunks = new Map();
    this.queue = [];
    this.setQuality(quality);
    this.time = 0;
    this.extra = new Map(); // per chunk colliders (trees, rocks near the road)
    track.extraCol = new Map();
    this.animated = [];
    this.railMeshes = new Map();
  }

  setQuality(q) {
    this.quality = q;
    this.ahead = q === 'low' ? 600 : q === 'high' ? 1000 : 800;
    this.behind = 200;
    this.treeMul = q === 'low' ? 0.45 : q === 'high' ? 1.15 : 0.8;
    this.castTrees = q !== 'low';
  }

  dispose() {
    for (const k of [...this.chunks.keys()]) this.unload(k);
    this.scene.remove(this.root);
  }

  // Load / unload around progress s; build at most `budget` chunks per call.
  update(s, budget = 1) {
    const t = this.track;
    const first = Math.max(0, Math.floor((s - this.behind) / CHUNK));
    const last = Math.min(Math.floor(t.total / CHUNK) - 1, Math.floor((s + this.ahead) / CHUNK));
    for (const k of [...this.chunks.keys()]) if (k < first - 1 || k > last + 1) this.unload(k);
    let built = 0;
    // nearest first
    const order = [];
    for (let c = first; c <= last; c++) if (!this.chunks.has(c)) order.push(c);
    order.sort((a, b) => Math.abs(a * CHUNK + 50 - s) - Math.abs(b * CHUNK + 50 - s));
    for (const c of order) {
      if (built >= budget) break;
      this.build(c);
      built++;
    }
    return order.length - built;
  }

  unload(k) {
    const ch = this.chunks.get(k);
    if (!ch) return;
    this.root.remove(ch.group);
    ch.group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh || o.isLine) {
        if (!o.userData.sharedGeo) o.geometry.dispose();
      }
    });
    for (const m of ch.ownedMats || []) m.dispose();
    for (const car of ch.cars || []) car.dispose();
    this.track.extraCol.delete(k);
    this.chunks.delete(k);
    this.animated = this.animated.filter((a) => a.chunk !== k);
  }

  build(k) {
    const t = this.track;
    const j0 = k * NS, j1 = Math.min(t.N - 1, j0 + NS);
    const group = new THREE.Group();
    group.name = 'chunk' + k;
    const ch = { k, group, j0, j1, ownedMats: [], cars: [], railSegs: [] };
    const R = rng(t.m.seed * 1000 + k * 7919);
    this.buildTerrain(ch);
    this.buildRoad(ch);
    this.buildDecals(ch);
    this.buildRails(ch);
    this.buildStructures(ch);
    this.buildVegetation(ch, R);
    this.buildSigns(ch);
    this.buildProps(ch, R);
    this.buildObstacles(ch, R);
    this.root.add(group);
    this.chunks.set(k, ch);
  }

  // ------------------------------------------------------------- terrain
  buildTerrain(ch) {
    const t = this.track;
    const rows = [];
    for (let j = ch.j0; j <= ch.j1; j += 2) rows.push(j);
    if (rows[rows.length - 1] !== ch.j1) rows.push(ch.j1);
    const cols = OFFS.length * 2;
    const nv = rows.length * cols;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const q = {};
    for (let ri = 0; ri < rows.length; ri++) {
      const j = rows[ri];
      const s = j * STEP;
      const k = t.k[j];
      const halfW = t.width[j] / 2;
      const look = t.biome(s).look;
      const [ba, bb, bt] = t.biomeBlend(s);
      const lookB = t.m.biomes[bb].look;
      const grass = tmpC.setHex(look.grass).lerp(tmpC2.setHex(lookB.grass), bt).clone();
      const dirt = new THREE.Color(look.dirt).lerp(new THREE.Color(lookB.dirt), bt);
      const rock = new THREE.Color(look.rock).lerp(new THREE.Color(lookB.rock), bt);
      const snow = lerp(look.snow, lookB.snow, bt);
      for (let side = 0; side < 2; side++) {
        const sg = side ? 1 : -1;
        const inner = (k > 0 && sg < 0) || (k < 0 && sg > 0);
        const maxD = inner && Math.abs(k) > 1e-4 ? 0.85 / Math.abs(k) : 1e9;
        for (let ci = 0; ci < OFFS.length; ci++) {
          const off = OFFS[ci];
          let d = halfW + off;
          if (d > maxD) d = Math.max(halfW + 0.6, maxD);
          d *= sg;
          const x = t.px[j] + t.rx[j] * d, z = t.pz[j] + t.rz[j] * d;
          t.query(x, z, q);
          const h = ci === 0 ? t.roadY(s) - 0.012 * halfW - 0.02 : q.h;
          const vi = ri * cols + (side ? OFFS.length + ci : OFFS.length - 1 - ci);
          pos[vi * 3] = x; pos[vi * 3 + 1] = h; pos[vi * 3 + 2] = z;
          uv[vi * 2] = x * 0.11; uv[vi * 2 + 1] = z * 0.11;
          // colour
          const u = Math.abs(d) - halfW;
          const o = (j * 2 + side) * 5;
          const wall = t.sw[o], cut = t.sw[o + 3], vd = t.sw[o + 4];
          const steep = wall * smoothstep(0.9, 1.8, t.slW[j * 2 + side]) * smoothstep(1.5, 5, u);
          const n = t.noise.n2(x * 0.05, z * 0.05) * 0.5 + 0.5;
          const n2 = t.noise.n2(x * 0.21, z * 0.21) * 0.5 + 0.5;
          const c = tmpC.copy(grass).lerp(dirt, smoothstep(0.55, 0.85, n) * 0.6);
          if (u < SHOULDER + 0.6) c.copy(dirt).lerp(tmpC2.setHex(0x8a8274), 0.45).multiplyScalar(0.9 + n2 * 0.2);
          else if (u < 3.5) c.lerp(dirt, 0.5);
          c.lerp(rock, Math.max(steep, smoothstep(2.2, 3.5, Math.abs(h - t.roadY(s)) / Math.max(1, u)) * 0.8));
          if (cut > 0.4 && u > 0.5) c.lerp(dirt, cut * 0.7);
          if (vd > 0.3) c.lerp(rock, 0.5);
          const sn = snow * smoothstep(0.25, 0.6, n2 * 0.6 + (1 - steep) * 0.5);
          if (sn > 0) c.lerp(tmpC2.setHex(0xe9edf1), clamp(sn * (u < SHOULDER ? 0.6 : 1), 0, 0.95));
          c.multiplyScalar(0.85 + n2 * 0.25);
          col[vi * 3] = c.r; col[vi * 3 + 1] = c.g; col[vi * 3 + 2] = c.b;
        }
      }
    }
    const idx = [];
    for (let ri = 0; ri < rows.length - 1; ri++) for (let ci = 0; ci < cols - 1; ci++) {
      if (ci === OFFS.length - 1) continue; // the road sits between the two halves
      const a = ri * cols + ci, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.terrain);
    m.receiveShadow = true;
    ch.group.add(m);
  }

  // ------------------------------------------------------------- road
  buildRoad(ch) {
    const t = this.track;
    const across = [-1, -0.5, 0, 0.5, 1];
    const n = ch.j1 - ch.j0 + 1;
    const pos = new Float32Array(n * 5 * 3), uv = new Float32Array(n * 5 * 2);
    for (let i = 0; i < n; i++) {
      const j = ch.j0 + i, hw = t.width[j] / 2;
      for (let a = 0; a < 5; a++) {
        const d = across[a] * hw;
        const o = (i * 5 + a);
        pos[o * 3] = t.px[j] + t.rx[j] * d;
        pos[o * 3 + 1] = t.py[j] - 0.012 * Math.abs(d) + 0.015;
        pos[o * 3 + 2] = t.pz[j] + t.rz[j] * d;
        uv[o * 2] = (across[a] + 1) / 2; uv[o * 2 + 1] = (j * STEP) / 16;
      }
    }
    const idx = [];
    const groups = [];
    let gStart = 0, gType = t.surf[ch.j0];
    for (let i = 0; i < n - 1; i++) {
      const j = ch.j0 + i;
      const ty = t.surf[j];
      if (ty !== gType) { groups.push([gStart, idx.length - gStart, gType]); gStart = idx.length; gType = ty; }
      for (let a = 0; a < 4; a++) {
        const p = i * 5 + a, q = p + 1, r = p + 5, s = r + 1;
        idx.push(p, q, r, q, s, r);
      }
    }
    groups.push([gStart, idx.length - gStart, gType]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const matList = [];
    for (const [start, count, ty] of groups) {
      let mi = matList.indexOf(mats.road[ty]);
      if (mi < 0) { matList.push(mats.road[ty]); mi = matList.length - 1; }
      g.addGroup(start, count, mi);
    }
    const m = new THREE.Mesh(g, matList);
    m.receiveShadow = true;
    ch.group.add(m);
  }

  // strip quad following the road between s0..s1 and d0..d1
  roadQuad(s0, s1, d0, d1, lift = 0.03, uvRepeat = 1) {
    const t = this.track;
    const segs = Math.max(1, Math.ceil((s1 - s0) / 2));
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const s = lerp(s0, s1, i / segs);
      const f = clamp(s / STEP, 0, t.N - 1.001), a = Math.floor(f), tt = f - a;
      const x = lerp(t.px[a], t.px[a + 1], tt), z = lerp(t.pz[a], t.pz[a + 1], tt);
      const rx = lerp(t.rx[a], t.rx[a + 1], tt), rz = lerp(t.rz[a], t.rz[a + 1], tt);
      const y = lerp(t.py[a], t.py[a + 1], tt);
      for (const d of [d0, d1]) {
        pos.push(x + rx * d, y - 0.012 * Math.abs(d) + lift, z + rz * d);
        uv.push(d === d0 ? 0 : uvRepeat, i / segs * uvRepeat);
      }
      if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  buildDecals(ch) {
    const t = this.track;
    const s0 = ch.j0 * STEP, s1 = ch.j1 * STEP;
    const byMat = new Map();
    const push = (mat, g) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g); };
    for (const d of t.decals) {
      if (d.s1 < s0 || d.s0 >= s1) continue;
      const a = Math.max(d.s0, s0), b = Math.min(d.s1, s1);
      if (b - a < 0.5) continue;
      const mat = d.type === SURF.MUD ? mats.mud : d.type === SURF.WATER ? mats.puddle : d.type === SURF.ICE ? mats.ice : mats.road[SURF.GRAVEL];
      if (d.type === SURF.GRAVEL) { push(mats.gravelSpill || (mats.gravelSpill = new THREE.MeshStandardMaterial({ map: mats.road[SURF.GRAVEL].map, transparent: true, opacity: 0.85, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })), this.roadQuad(a, b, d.d0, d.d1, 0.03, 1)); continue; }
      push(mat, this.roadQuad(a, b, d.d0, d.d1, d.type === SURF.WATER ? 0.035 : 0.03, 1));
    }
    for (const p of t.potholes) {
      if (p.s < s0 || p.s >= s1) continue;
      push(mats.pothole, this.roadQuad(p.s - p.r * 1.3, p.s + p.r * 1.3, p.d - p.r * 1.3, p.d + p.r * 1.3, 0.025, 1));
    }
    for (const [mat, list] of byMat) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.receiveShadow = true;
      m.renderOrder = 1;
      ch.group.add(m);
    }
  }

  // ------------------------------------------------------------- rails
  buildRails(ch) {
    const t = this.track;
    for (let side = 0; side < 2; side++) {
      const sg = side ? 1 : -1;
      let j = ch.j0;
      while (j < ch.j1) {
        const type = t.rail[j * 2 + side];
        if (!type || t.tunnel[j]) { j++; continue; }
        // segment of up to 10 samples with the same type
        let e = j;
        while (e < ch.j1 && e - j < 10 && t.rail[(e + 1) * 2 + side] === type) e++;
        if (e > j) {
          const mesh = this.railSegment(j, e, side, type);
          mesh.userData.rail = { j0: j, j1: e, side };
          ch.group.add(mesh);
          ch.railSegs.push(mesh);
        }
        j = e + 1;
      }
    }
  }

  railSegment(j0, j1, side, type) {
    const t = this.track, sg = side ? 1 : -1;
    const geos = [];
    const D = (j) => sg * (t.width[j] / 2 + 0.55);
    const P = (j, d, y) => [t.px[j] + t.rx[j] * d, t.py[j] + y, t.pz[j] + t.rz[j] * d];
    if (type === RAIL.CONCRETE) {
      const sec = [[-0.3, 0], [-0.12, 0.25], [-0.08, 0.82], [0.08, 0.82], [0.12, 0.25], [0.3, 0]];
      const pos = [], idx = [];
      for (let j = j0; j <= j1; j++) for (const [o, y] of sec) pos.push(...P(j, D(j) + o * sg + 0.12 * sg, y - 0.05));
      const nr = sec.length;
      for (let i = 0; i < j1 - j0; i++) for (let a = 0; a < nr - 1; a++) { const p = i * nr + a; idx.push(p, p + nr, p + 1, p + 1, p + nr, p + nr + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mats.concrete); m.castShadow = m.receiveShadow = true;
      return m;
    }
    const wood = type === RAIL.WOOD;
    // beam profile (W-beam for steel, round log for wood)
    const prof = wood ? [[0, 0.55], [0.06, 0.6], [0, 0.65], [-0.06, 0.6], [0, 0.55]] : [[0, 0.52], [0.05, 0.56], [0.02, 0.63], [0.05, 0.7], [0, 0.74]];
    const pos = [], idx = [];
    for (let j = j0; j <= j1; j++) for (const [o, y] of prof) pos.push(...P(j, D(j) - o * sg, y));
    const nr = prof.length;
    for (let i = 0; i < j1 - j0; i++) for (let a = 0; a < nr - 1; a++) { const p = i * nr + a; idx.push(p, p + 1, p + nr, p + 1, p + nr + 1, p + nr); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.computeVertexNormals();
    geos.push(g);
    for (let j = j0; j <= j1; j += 2) {
      const [x, y, z] = P(j, D(j) + 0.08 * sg, 0);
      const post = wood ? new THREE.CylinderGeometry(0.08, 0.09, 0.85, 6) : new THREE.BoxGeometry(0.08, 0.85, 0.12);
      post.rotateY(-t.hd[j]);
      post.translate(x, y + 0.36, z);
      geos.push(post.index ? post.toNonIndexed() : post);
    }
    const merged = mergeGeometries(geos.map((q) => (q.index ? q.toNonIndexed() : q)));
    const m = new THREE.Mesh(merged, wood ? mats.post : mats.galv);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // Called when the physics breaks a rail: hide nearby segments.
  breakRail(idx, side) {
    const k = Math.floor((idx * STEP) / CHUNK);
    for (const kk of [k - 1, k, k + 1]) {
      const ch = this.chunks.get(kk);
      if (!ch) continue;
      for (const m of ch.railSegs) {
        const r = m.userData.rail;
        if (r.side === side && idx >= r.j0 - 2 && idx <= r.j1 + 2 && m.visible) { m.visible = false; return m; }
      }
    }
    return null;
  }
  resetRails() { for (const ch of this.chunks.values()) for (const m of ch.railSegs) m.visible = true; }

  // ------------------------------------------------------------- tunnels & bridges
  buildStructures(ch) {
    const t = this.track;
    for (const tn of t.tunnels) {
      const a = Math.max(tn.a, ch.j0), b = Math.min(tn.b, ch.j1);
      if (b <= a) continue;
      const inner = [], outer = [];
      const arch = (hw) => {
        const pts = [];
        const w = hw + 1.2, H = 4.2;
        pts.push([-w, -0.3], [-w, 2.6]);
        for (let i = 1; i < 10; i++) { const ang = Math.PI - (i / 10) * Math.PI; pts.push([Math.cos(ang) * w, 2.6 + Math.sin(ang) * (H - 2.6 + 1.6)]); }
        pts.push([w, 2.6], [w, -0.3]);
        return pts;
      };
      const make = (scale, extra, flip) => {
        const pos = [], uv = [], idx = [];
        let nr = 0;
        for (let j = a; j <= b; j++) {
          const pts = arch(t.width[j] / 2).map(([d, y]) => [d * scale + Math.sign(d) * extra, y * scale + (y > 0 ? extra : 0)]);
          nr = pts.length;
          let acc = 0;
          pts.forEach(([d, y], i) => {
            if (i) acc += Math.hypot(d - pts[i - 1][0], y - pts[i - 1][1]);
            pos.push(t.px[j] + t.rx[j] * d, t.py[j] + y, t.pz[j] + t.rz[j] * d);
            uv.push(acc * 0.25, j * STEP * 0.25);
          });
        }
        for (let i = 0; i < b - a; i++) for (let k = 0; k < nr - 1; k++) {
          const p = i * nr + k;
          if (flip) idx.push(p, p + 1, p + nr, p + 1, p + nr + 1, p + nr); else idx.push(p, p + nr, p + 1, p + 1, p + nr, p + nr + 1);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx); g.computeVertexNormals();
        return g;
      };
      const im = new THREE.Mesh(make(1, 0, false), mats.concreteDark); im.receiveShadow = true; ch.group.add(im);
      const om = new THREE.Mesh(make(1, 2.2, true), mats.rock); om.castShadow = true; ch.group.add(om);
      if (!om.geometry.attributes.color) PR_colorAll(om.geometry, 0x7a776f);
      // ceiling lamps (emissive strips) every 12 m
      const lamps = [];
      for (let j = a; j <= b; j += 6) {
        const l = new THREE.BoxGeometry(0.25, 0.08, 1.4);
        l.rotateY(-t.hd[j]);
        l.translate(t.px[j], t.py[j] + 5.6, t.pz[j]);
        lamps.push(l);
      }
      if (lamps.length) {
        const lm = new THREE.Mesh(mergeGeometries(lamps), mats.tunnelLamp || (mats.tunnelLamp = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 2.2 })));
        ch.group.add(lm);
      }
      // portals
      for (const pj of [tn.a, tn.b]) {
        if (pj < ch.j0 || pj > ch.j1) continue;
        const hw = t.width[pj] / 2 + 1.2;
        const face = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 8, 9, 1.2), mats.concrete);
        // cut the opening visually with a dark arch behind: use two side pillars + lintel
        const g = new THREE.Group();
        const left = new THREE.Mesh(new THREE.BoxGeometry(4, 9, 1.4), mats.concrete); left.position.set(-hw - 2, 4.2, 0);
        const right = left.clone(); right.position.x = hw + 2;
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 8, 2.2, 1.4), mats.concrete); lintel.position.set(0, 7.9, 0);
        g.add(left, right, lintel);
        g.position.set(t.px[pj], t.py[pj], t.pz[pj]);
        g.rotation.y = t.hd[pj];
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        face.geometry.dispose();
        ch.group.add(g);
      }
    }
    for (const br of t.bridges) {
      const a = Math.max(br.a - 2, ch.j0), b = Math.min(br.b + 2, ch.j1);
      if (b <= a) continue;
      // deck slab
      const pos = [], idx = [];
      const sec = (hw) => [[-hw - 0.7, 0.02], [hw + 0.7, 0.02], [hw + 0.7, -0.9], [-hw - 0.7, -0.9], [-hw - 0.7, 0.02]];
      for (let j = a; j <= b; j++) for (const [d, y] of sec(t.width[j] / 2)) pos.push(t.px[j] + t.rx[j] * d, t.py[j] + y, t.pz[j] + t.rz[j] * d);
      for (let i = 0; i < b - a; i++) for (let k = 0; k < 4; k++) { const p = i * 5 + k; idx.push(p, p + 5, p + 1, p + 1, p + 5, p + 6); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
      g.computeVertexNormals();
      const deck = new THREE.Mesh(g, mats.concrete); deck.castShadow = true; ch.group.add(deck);
      // piers
      const piers = [];
      for (let j = br.a + 12; j < br.b - 6; j += 14) {
        if (j < ch.j0 || j > ch.j1) continue;
        const ground = t.height(t.px[j] + t.rx[j] * (t.width[j] / 2 + 4), t.pz[j] + t.rz[j] * (t.width[j] / 2 + 4));
        const top = t.py[j] - 0.9;
        const h = Math.max(2, top - Math.min(ground, top - 2) + 4);
        const p = br.style === 'stone' ? new THREE.BoxGeometry(2.2, h, 3.2) : new THREE.CylinderGeometry(0.9, 1.2, h, 10);
        p.rotateY(-t.hd[j]);
        p.translate(t.px[j], top - h / 2, t.pz[j]);
        piers.push(p.index ? p.toNonIndexed() : p);
      }
      if (piers.length) { const pm = new THREE.Mesh(mergeGeometries(piers), br.style === 'stone' ? mats.concreteDark : mats.concrete); pm.castShadow = true; ch.group.add(pm); }
      // truss
      if (br.style === 'truss') {
        const tr = [];
        for (const sg of [-1, 1]) for (let j = a; j < b; j += 4) {
          const d = sg * (t.width[j] / 2 + 0.7), j2 = Math.min(b, j + 4);
          const A = [t.px[j] + t.rx[j] * d, t.py[j] + 0.1, t.pz[j] + t.rz[j] * d];
          const B = [t.px[j2] + t.rx[j2] * d, t.py[j2] + 3.2, t.pz[j2] + t.rz[j2] * d];
          const C = [t.px[j2] + t.rx[j2] * d, t.py[j2] + 0.1, t.pz[j2] + t.rz[j2] * d];
          const D2 = [t.px[j] + t.rx[j] * d, t.py[j] + 3.2, t.pz[j] + t.rz[j] * d];
          tr.push(PR.beamGeo(A, B, 0.08), PR.beamGeo(D2, B, 0.1), PR.beamGeo(C, B, 0.08), PR.beamGeo(A, C, 0.1));
        }
        const tm = new THREE.Mesh(mergeGeometries(tr), mats.rusty); tm.castShadow = true; ch.group.add(tm);
      }
      // stream at the bottom of the gorge
      if (br.a >= ch.j0 && br.a <= ch.j1) {
        const jm = Math.round((br.a + br.b) / 2);
        const yb = t.height(t.px[jm] + t.rx[jm] * 25, t.pz[jm] + t.rz[jm] * 25);
        const water = new THREE.Mesh(new THREE.PlaneGeometry(24, 220), mats.stream);
        water.rotation.x = -Math.PI / 2;
        water.rotation.z = -t.hd[jm] + Math.PI / 2;
        water.position.set(t.px[jm], Math.min(yb, t.py[jm] - 30) + 0.6, t.pz[jm]);
        ch.group.add(water);
        ch.stream = water.position.clone();
      }
    }
  }

  // ------------------------------------------------------------- vegetation
  buildVegetation(ch, R) {
    const t = this.track;
    const s0 = ch.j0 * STEP;
    const b = t.biome(s0 + 50);
    const tr = b.trees || {};
    const density = (tr.density || 0) * this.treeMul;
    const kinds = ['pine', 'spruce', 'birch', 'oak'].filter((k) => tr[k]);
    const weights = kinds.map((k) => tr[k]);
    const wsum = weights.reduce((a, c) => a + c, 0) || 1;
    const snowy = b.look.snow > 0.5;
    const autumn = b.look.warmth > 0.3 && !tr.dry;
    const inst = new Map();
    const push = (key, geo, mat, m4, cast) => {
      let e = inst.get(key);
      if (!e) inst.set(key, (e = { geo, mat, list: [], cast }));
      e.list.push(m4.clone());
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const qr = {};
    const cols = [];
    const nTrees = Math.round(140 * density);
    for (let n = 0; n < nTrees; n++) {
      const s = s0 + R() * CHUNK;
      const j = Math.min(t.N - 1, Math.round(s / STEP));
      if (t.tunnel[j] || t.bridge[j]) continue;
      const side = R() < 0.5 ? 0 : 1;
      const o = (j * 2 + side) * 5;
      const u = 3 + Math.pow(R(), 1.6) * 130;
      const d = (side ? 1 : -1) * (t.width[j] / 2 + SHOULDER + u);
      const inner = (t.k[j] > 0 && !side) || (t.k[j] < 0 && side);
      if (inner && Math.abs(d) > 0.8 / Math.max(1e-4, Math.abs(t.k[j]))) continue;
      const x = t.px[j] + t.rx[j] * d, z = t.pz[j] + t.rz[j] * d;
      t.query(x, z, qr);
      if (Math.abs(qr.d) < qr.halfW + 3) continue; // on some other leg of the road
      if (t.sw[o + 4] > 0.3) continue;
      // avoid steep crags
      const h2 = t.height(x + 1.5, z);
      if (Math.abs(h2 - qr.h) > 2.2) continue;
      let r = R() * wsum, ki = 0;
      while (ki < kinds.length - 1 && (r -= weights[ki]) > 0) ki++;
      const kind = kinds[ki] || 'pine';
      const v = Math.floor(R() * 3);
      const dry = !!tr.dry;
      const geo = dry && R() < 0.3 ? PR.deadTreeGeometry(v) : PR.treeGeometry(kind, v, { snowy, autumn, dry });
      const s2 = 0.7 + R() * 0.6;
      p.set(x, qr.h - 0.3, z);
      q.setFromAxisAngle(up, R() * 6.28);
      sc.set(s2, s2 * (0.85 + R() * 0.3), s2);
      m4.compose(p, q, sc);
      push(geo.uuid, geo, mats.foliage, m4, this.castTrees && u < 40);
      if (u < 9) cols.push({ t: 's', x, y: qr.h + 0.6, z, r: 0.35 * s2, s }, { t: 's', x, y: qr.h + 1.6, z, r: 0.3 * s2, s });
    }
    // bushes and rocks
    const nRocks = Math.round(40 * (b.rocks || 0.5) * (this.quality === 'low' ? 0.5 : 1));
    for (let n = 0; n < nRocks; n++) {
      const s = s0 + R() * CHUNK;
      const j = Math.min(t.N - 1, Math.round(s / STEP));
      if (t.tunnel[j] || t.bridge[j]) continue;
      const side = R() < 0.5 ? 0 : 1;
      const u = 1.5 + Math.pow(R(), 2) * 70;
      const d = (side ? 1 : -1) * (t.width[j] / 2 + SHOULDER + u);
      const inner = (t.k[j] > 0 && !side) || (t.k[j] < 0 && side);
      if (inner && Math.abs(d) > 0.8 / Math.max(1e-4, Math.abs(t.k[j]))) continue;
      const x = t.px[j] + t.rx[j] * d, z = t.pz[j] + t.rz[j] * d;
      t.query(x, z, qr);
      if (Math.abs(qr.d) < qr.halfW + 1) continue;
      const size = (0.3 + Math.pow(R(), 3) * 3.5) * Math.min(1, 0.25 + u / 14);
      if (Math.abs(t.height(x + 1.2, z) - qr.h) > 1.6) continue;
      this.addRock(push, x, qr.h, z, R, snowy, b, size);
      if (u < 5 && size > 0.5) cols.push({ t: 's', x, y: qr.h + size * 0.3, z, r: size * 0.85, s });
    }
    const nBush = Math.round(30 * density);
    for (let n = 0; n < nBush; n++) {
      const s = s0 + R() * CHUNK;
      const j = Math.min(t.N - 1, Math.round(s / STEP));
      if (t.tunnel[j] || t.bridge[j]) continue;
      const side = R() < 0.5 ? 0 : 1;
      const d = (side ? 1 : -1) * (t.width[j] / 2 + SHOULDER + 1 + R() * 25);
      const x = t.px[j] + t.rx[j] * d, z = t.pz[j] + t.rz[j] * d;
      t.query(x, z, qr);
      if (Math.abs(qr.d) < qr.halfW + 1) continue;
      const geo = PR.bushGeometry(Math.floor(R() * 3), { snowy, dry: !!tr.dry });
      const s2 = 0.5 + R() * 0.9;
      m4.compose(p.set(x, qr.h - 0.1, z), q.setFromAxisAngle(up, R() * 6.28), sc.set(s2, s2, s2));
      push(geo.uuid, geo, mats.foliage, m4, false);
    }
    for (const e of inst.values()) {
      const im = new THREE.InstancedMesh(e.geo, e.mat, e.list.length);
      e.list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.castShadow = e.cast; im.receiveShadow = true;
      im.userData.sharedGeo = true;
      im.computeBoundingSphere();
      ch.group.add(im);
    }
    if (cols.length) this.addColliders(ch.k, cols);
  }

  addRock(push, x, y, z, R, snowy, b, size) {
    const v = Math.floor(R() * 6);
    const geo = PR.rockGeometry(v, { snowy, tint: b.look.rock });
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 0.3, R() * 6.28, R() * 0.3));
    m4.compose(new THREE.Vector3(x, y - size * 0.15, z), q, new THREE.Vector3(size, size * (0.7 + R() * 0.5), size));
    push(geo.uuid, geo, mats.rock, m4, size > 1);
  }

  addColliders(k, cols) {
    const ex = this.track.extraCol;
    let l = ex.get(k);
    if (!l) ex.set(k, (l = []));
    l.push(...cols);
  }

  // ------------------------------------------------------------- signs
  buildSigns(ch) {
    const t = this.track;
    const s0 = ch.j0 * STEP, s1 = ch.j1 * STEP;
    for (const sg of t.signs) {
      if (sg.s < s0 || sg.s >= s1) continue;
      const j = Math.min(t.N - 1, Math.round(sg.s / STEP));
      if (t.tunnel[j]) continue;
      const text = sg.type === 'km' ? String(sg.km) : sg.text;
      const g = PR.buildSign(sg.type, text, sg.broken && sg.type !== 'region');
      const d = sg.side * (t.width[j] / 2 + (sg.outer ? 1.2 : 1.8));
      const p = t.posAt(sg.s, d);
      g.position.set(p.x, Math.max(p.y, t.py[j] - 0.3) - 0.05, p.z);
      // face drivers coming down the road
      g.rotation.y = t.hd[j] + Math.PI;
      ch.group.add(g);
    }
  }

  // ------------------------------------------------------------- props
  buildProps(ch, R) {
    const t = this.track;
    const s0 = ch.j0 * STEP, s1 = ch.j1 * STEP;
    const inst = new Map();
    const push = (geo, mat, m4, cast = true) => {
      let e = inst.get(geo.uuid);
      if (!e) inst.set(geo.uuid, (e = { geo, mat, list: [], cast }));
      e.list.push(m4.clone());
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const poleTops = [];
    for (const pr of t.props) {
      if (pr.s < s0 || pr.s >= s1) continue;
      if (pr.type === 'house' || pr.type === 'barn' || pr.type === 'chapel') {
        const g = PR.buildHouse(pr.seed, pr.type);
        g.position.set(pr.x, pr.y, pr.z); g.rotation.y = pr.yaw; g.scale.setScalar(pr.size);
        ch.group.add(g);
      } else if (pr.type === 'shack') {
        const g = PR.buildShack(pr.seed); g.position.set(pr.x, pr.y, pr.z); g.rotation.y = pr.yaw; ch.group.add(g);
      } else if (pr.type === 'gasstation') {
        const g = PR.buildGasStation(pr.seed); g.position.set(pr.x, pr.y, pr.z); g.rotation.y = pr.yaw; ch.group.add(g);
      } else if (pr.type === 'pole') {
        m4.compose(p.set(pr.x, pr.y - 0.2, pr.z), q.setFromAxisAngle(up, pr.yaw), sc.set(1, 1, 1));
        push(PR.poleGeometry(), mats.foliage, m4);
        const rx = Math.cos(pr.yaw), rz = -Math.sin(pr.yaw);
        poleTops.push([pr.x, pr.y + 7.45, pr.z, rx, rz]);
      } else if (pr.type === 'snowpole') {
        m4.compose(p.set(pr.x, pr.y - 0.1, pr.z), q.identity(), sc.set(1, 1, 1));
        push(PR.snowPoleGeometry(), mats.foliage, m4, false);
      } else if (pr.type === 'fence') {
        for (let u = 0; u < pr.len; u += 2.5) {
          const pp = t.posAt(pr.s + u, pr.d);
          m4.compose(p.set(pp.x, pp.y - 0.1, pp.z), q.setFromAxisAngle(up, pp.hd), sc.set(1, 1, 1));
          push(PR.fencePostGeometry(), mats.foliage, m4);
        }
        const rails = [];
        for (const y of [0.5, 0.95]) {
          const pts = [];
          for (let u = 0; u <= pr.len; u += 2.5) { const pp = t.posAt(pr.s + u, pr.d); pts.push([pp.x, pp.y - 0.1 + y, pp.z]); }
          for (let i = 0; i < pts.length - 1; i++) rails.push(PR.beamGeo(pts[i], pts[i + 1], 0.035));
        }
        if (rails.length) { const rm = new THREE.Mesh(mergeGeometries(rails), mats.post); rm.castShadow = true; ch.group.add(rm); }
      } else if (pr.type === 'logs') {
        m4.compose(p.set(pr.x, pr.y - 0.1, pr.z), q.setFromAxisAngle(up, pr.yaw), sc.set(1, 1, 1));
        push(PR.logsGeometry(), mats.foliage, m4);
      } else if (pr.type === 'waterfall') {
        this.buildWaterfall(ch, pr);
      } else if (pr.type === 'finish') {
        this.buildFinish(ch, pr);
      }
    }
    // wires between consecutive poles
    if (poleTops.length > 1) {
      const pts = [];
      for (let i = 0; i < poleTops.length - 1; i++) {
        const A = poleTops[i], B = poleTops[i + 1];
        if (Math.hypot(A[0] - B[0], A[2] - B[2]) > 60) continue;
        for (const off of [-0.75, 0, 0.75]) {
          let prev = null;
          for (let k = 0; k <= 8; k++) {
            const f = k / 8;
            const x = lerp(A[0] + A[3] * off, B[0] + B[3] * off, f), z = lerp(A[2] + A[4] * off, B[2] + B[4] * off, f);
            const y = lerp(A[1], B[1], f) + 0.1 - Math.sin(f * Math.PI) * 0.9;
            if (prev) pts.push(...prev, x, y, z);
            prev = [x, y, z];
          }
        }
      }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      ch.group.add(new THREE.LineSegments(lg, mats.wire || (mats.wire = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7 }))));
    }
    for (const e of inst.values()) {
      const im = new THREE.InstancedMesh(e.geo, e.mat, e.list.length);
      e.list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.castShadow = e.cast; im.receiveShadow = true; im.userData.sharedGeo = true;
      im.computeBoundingSphere();
      ch.group.add(im);
    }
  }

  buildWaterfall(ch, pr) {
    const t = this.track;
    const base = t.posAt(pr.s, pr.d);
    const hd = t.posAt(pr.s, 0).hd;
    const top = base.y + 40;
    const w = 7;
    const geo = new THREE.PlaneGeometry(w, top - base.y + 30, 1, 8);
    const mat = mats.water.clone();
    mat.map = mats.water.map.clone(); mat.map.needsUpdate = true; mat.map.repeat.set(1, 3);
    ch.ownedMats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(base.x + Math.cos(hd) * pr.side * 6, (base.y + top) / 2 + 5, base.z - Math.sin(hd) * pr.side * 6);
    m.rotation.y = hd + (pr.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    ch.group.add(m);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 16), mats.stream);
    pool.rotation.x = -Math.PI / 2; pool.position.set(m.position.x, base.y + 0.2, m.position.z);
    ch.group.add(pool);
    this.animated.push({ chunk: ch.k, type: 'water', mat, pos: new THREE.Vector3(m.position.x, base.y + 1, m.position.z) });
  }

  buildFinish(ch, pr) {
    const g = new THREE.Group();
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.5, 0.6), mats.woodDark); postL.position.set(-7, 3.2, 0);
    const postR = postL.clone(); postR.position.x = 7;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.6), signMaterialVillage('BOTTOM OF THE MOUNTAIN'));
    banner.position.set(0, 5.6, 0); banner.rotation.y = Math.PI;
    const bannerB = banner.clone(); bannerB.rotation.y = 0;
    g.add(postL, postR, banner, bannerB);
    g.position.set(pr.x, pr.y, pr.z); g.rotation.y = pr.yaw;
    ch.group.add(g);
  }

  // ------------------------------------------------------------- obstacles
  buildObstacles(ch, R) {
    const t = this.track;
    const s0 = ch.j0 * STEP, s1 = ch.j1 * STEP;
    for (const o of t.obstacles) {
      if (o.s < s0 || o.s >= s1) continue;
      if (o.type === 'rock') {
        const g = PR.rockGeometry(Math.floor(o.s) % 6, { tint: t.biome(o.s).look.rock });
        const m = new THREE.Mesh(g, mats.rock); m.userData.sharedGeo = true;
        m.position.set(o.x, o.y - o.r * 0.1, o.z); m.scale.set(o.r * 1.05, o.r * 0.9, o.r);
        m.rotation.y = o.s; m.castShadow = true; m.receiveShadow = true;
        ch.group.add(m);
      } else if (o.type === 'tree') {
        const g = PR.fallenTreeGeometry(o.len + 1.5, o.r);
        const m = new THREE.Mesh(g, mats.foliage);
        const root = t.posAt(o.s, o.d + o.side * 0.8);
        m.position.set(root.x, root.y - 0.05, root.z);
        // trunk points across the road (towards -side)
        const tip = o.colliders[o.colliders.length - 1];
        m.rotation.y = Math.atan2(-(tip.z - root.z), tip.x - root.x);
        m.castShadow = true;
        ch.group.add(m);
      } else if (o.type === 'car') {
        const pool = CARS.filter((c) => ['rusty', 'brick', 'dusty', 'diplomat', 'sparrow', 'nomad'].includes(c.id));
        const c = pool[Math.floor(o.s) % pool.length];
        const colors = [0x6a5a48, 0x4a5a52, 0x7a3a2a, 0x8a8478, 0x3a4250];
        const cm = new CarModel(c, { paint: colors[Math.floor(o.s * 7) % colors.length] });
        cm.wear = { dirt: 0.9, rust: 0.9, scratch: 1 }; cm.applyWear();
        cm.setStaticWheels(0.2);
        cm.dent(0.4, 0, cm.dims.zF, 0.6);
        cm.syncDamage({ lightL: 0, lightR: 0.2, glass: 2, front: 0.3, rear: 1, left: 1, right: 1, bumperF: 0.2, bumperR: 0.8 });
        if ((Math.floor(o.s) % 3) === 0) cm.wheels[1].pivot.visible = false;
        cm.group.position.set(o.x, o.y + cm.ph.cg - 0.08, o.z);
        cm.group.rotation.set(0, o.yaw, (Math.floor(o.s) % 3) === 0 ? -0.08 : 0);
        ch.group.add(cm.group);
        ch.cars.push(cm);
      } else if (o.type === 'barrier') {
        const m = new THREE.Mesh(PR.barrierGeometry(), mats.concrete); m.userData.sharedGeo = true;
        const c = o.colliders[0];
        m.position.set(o.x, o.y - 0.02, o.z); m.rotation.y = c.yaw; m.castShadow = true;
        ch.group.add(m);
      } else if (o.type === 'barrel') {
        const m = new THREE.Mesh(PR.barrelGeometry(), mats.foliage); m.userData.sharedGeo = true;
        m.position.set(o.x, o.y, o.z); m.castShadow = true;
        ch.group.add(m);
        o.colliders[0].mesh = m;
      }
    }
  }

  update2(dt) {
    this.time += dt;
    for (const a of this.animated) if (a.type === 'water') a.mat.map.offset.y = -this.time * 0.9;
  }

  nearestWaterfall(pos) {
    let best = 1e9;
    for (const a of this.animated) if (a.type === 'water') best = Math.min(best, a.pos.distanceTo(pos));
    for (const ch of this.chunks.values()) if (ch.stream) best = Math.min(best, ch.stream.distanceTo(pos) * 1.5);
    return best;
  }
}

function PR_colorAll(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = 0.85 + Math.random() * 0.2; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

const villageMats = new Map();
function signMaterialVillage(text) {
  if (!villageMats.has(text)) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2a27'; g.fillRect(0, 0, 1024, 128);
    g.strokeStyle = '#d8d2c0'; g.lineWidth = 6; g.strokeRect(10, 10, 1004, 108);
    g.fillStyle = '#e8e2d0'; g.font = '600 72px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 512, 68);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    villageMats.set(text, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  }
  return villageMats.get(text);
}
