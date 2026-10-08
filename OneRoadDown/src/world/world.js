// Streams the mountain around the camera in 100 m chunks: terrain, road, shoulders,
// decals, guard rails, tunnels, bridges, trees, rocks, signs, buildings, obstacles.
// Chunks are built one per frame ahead of the player and disposed behind.

import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { STEP, SHOULDER, SURF, RAIL } from './track.js';
import { mats } from '../gfx/materials.js';
import * as PR from '../models/props.js';
import * as CIR from '../models/circuit.js';
import { CarModel } from '../models/carModel.js';
import { CARS } from '../data/cars.js';
import { rng, clamp, lerp, smoothstep } from '../core/util.js';
import { shared as AS, assetParts, cloneAsset, makeTerrainMaterial } from './assets.js';

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
    this.job = null;      // chunk being built in stages
    this.sliceMs = 4;     // per-frame build budget while driving
    this.setQuality(quality);
    this.time = 0;
    this.extra = new Map(); // per chunk colliders (trees, rocks near the road)
    track.extraCol = new Map();
    this.animated = [];
    this.railMeshes = new Map();
    this.splat = AS.ready ? makeTerrainMaterial(quality) : null;
    this.camPos = new THREE.Vector3();
  }

  setQuality(q) {
    this.quality = q;
    this.ahead = q === 'low' ? 600 : q === 'high' ? 1000 : 800;
    this.behind = 200;
    this.treeMul = q === 'low' ? 0.45 : q === 'high' ? 1.15 : 0.8;
    this.castTrees = q !== 'low';
  }

  dispose() {
    this.job = null;
    for (const k of [...this.chunks.keys()]) this.unload(k);
    this.scene.remove(this.root);
  }

  // Load / unload around progress s; build at most `budget` chunks per call.
  update(s, budget = 1) {
    const t = this.track;
    let order = [];
    if (t.loop) {
      // circuits: chunks wrap around the start / finish line
      const nC = Math.ceil((t.N - 1) / NS);
      const want = new Map();
      const back = Math.min(this.behind + 100, t.length / 2), fwd = Math.min(this.ahead, t.length - back);
      for (let c = Math.floor((s - back) / CHUNK); c <= Math.floor((s + fwd) / CHUNK); c++) {
        const kk = ((c % nC) + nC) % nC;
        const dist = Math.abs(c * CHUNK + 50 - s);
        if (!want.has(kk) || want.get(kk) > dist) want.set(kk, dist);
      }
      for (const k of [...this.chunks.keys()]) if (!want.has(k)) this.unload(k);
      for (const [kk, dist] of want) if (!this.chunks.has(kk)) order.push([kk, dist]);
      order.sort((a, b) => a[1] - b[1]);
      order = order.map((o) => o[0]);
    } else {
      const first = Math.max(0, Math.floor((s - this.behind) / CHUNK));
      const last = Math.min(Math.floor(t.total / CHUNK) - 1, Math.floor((s + this.ahead) / CHUNK));
      for (const k of [...this.chunks.keys()]) if (k < first - 1 || k > last + 1) this.unload(k);
      for (let c = first; c <= last; c++) if (!this.chunks.has(c)) order.push(c);
      order.sort((a, b) => Math.abs(a * CHUNK + 50 - s) - Math.abs(b * CHUNK + 50 - s));
    }
    if (budget > 1) {
      // loading screen: build everything wanted right away
      if (this.job) this.finishJob();
      let built = 0;
      for (const c of order) {
        if (built >= budget) break;
        this.build(c);
        built++;
      }
      return order.length - built;
    }
    // while driving: build chunks in stages under a small per-frame time budget, so a
    // new stretch of road never costs one long frame (that was the periodic stutter)
    const t0 = performance.now();
    while (performance.now() - t0 < this.sliceMs) {
      if (!this.job) {
        const next = order.find((c) => !this.chunks.has(c));
        if (next === undefined) break;
        this.job = { k: next, it: this.buildStages(next) };
      }
      if (this.job.it.next().done) this.job = null;
    }
    return order.length;
  }

  finishJob() {
    while (this.job && !this.job.it.next().done);
    this.job = null;
  }

  unload(k) {
    if (this.job && this.job.k === k) this.finishJob();
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
    if (this.job && this.job.k === k) { this.finishJob(); return; }
    const it = this.buildStages(k);
    while (!it.next().done);
  }

  *buildStages(k) {
    const t = this.track;
    const j0 = k * NS, j1 = Math.min(t.N - 1, j0 + NS);
    const group = new THREE.Group();
    group.name = 'chunk' + k;
    const jm = Math.min(t.N - 1, (j0 + j1) >> 1);
    const ch = { k, group, j0, j1, ownedMats: [], cars: [], railSegs: [], cx: t.px[jm], cz: t.pz[jm] };
    const R = rng(t.m.seed * 1000 + k * 7919);
    this.building = ch;
    this.buildTerrain(ch); yield;
    this.buildRoad(ch); this.buildDecals(ch); yield;
    this.buildRails(ch); this.buildStructures(ch); yield;
    this.buildVegetation(ch, R); yield;
    this.buildSigns(ch); this.buildProps(ch, R); this.buildObstacles(ch, R);
    this.building = null;
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
    const spA = new Float32Array(nv * 4), spB = new Float32Array(nv * 4);
    const q = {};
    const REF = [0.37, 0.46, 0.17];
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
          if (this.splat) {
            // layer weights for the textured terrain material
            const b = t.biome(s);
            const sand = t.offSurf[j] === SURF.SAND ? 1 : 0;
            const slopeRock = smoothstep(2.2, 3.5, Math.abs(h - t.roadY(s)) / Math.max(1, u)) * 0.85;
            let wr = Math.max(steep, slopeRock, vd > 0.3 ? 0.6 : 0, t.offSurf[j] === SURF.ROCK ? 0.25 * smoothstep(3, 10, u) : 0);
            let wgv = u < SHOULDER + 0.5 ? 1 : u < 2.2 ? 0.45 : 0;
            let wd = Math.max(cut > 0.4 && u > 0.5 ? cut * 0.9 : 0, u < 3.5 ? 0.35 : 0, smoothstep(0.62, 0.85, n) * 0.5);
            const forestK = (b.trees && b.trees.density || 0) > 0.7 ? 1 : (b.trees && b.trees.density || 0) > 0.45 ? 0.45 : 0;
            let wf = forestK * smoothstep(3, 9, u) * (0.5 + 0.6 * n2);
            const wsn = snow > 0 ? clamp(sn * 1.15, 0, 1) : 0;
            let wg = 1;
            const rem = (v) => { const k = Math.min(v, wg); wg -= k; return k; };
            const R1 = rem(wgv), R2 = rem(wr), R3 = rem(wd), R4 = rem(wf);
            let grassW = wg;
            let sandW = grassW * sand; grassW -= sandW;
            const k2 = 1 - wsn * 0.95;
            spA[vi * 4] = grassW * k2; spA[vi * 4 + 1] = R4 * k2; spA[vi * 4 + 2] = R3 * k2; spA[vi * 4 + 3] = R1 * k2;
            spB[vi * 4] = R2 * (1 - wsn * 0.6); spB[vi * 4 + 1] = wsn * 0.95 + (R2 * wsn * 0.6) * 0; spB[vi * 4 + 2] = sandW * k2;
            // tint: biome grass colour relative to the texture's own colour, faded for other layers
            const tg = grass;
            const tr = lerp(1, clamp(tg.r / REF[0], 0.55, 1.8), grassW), tgg = lerp(1, clamp(tg.g / REF[1], 0.55, 1.6), grassW), tb = lerp(1, clamp(tg.b / REF[2], 0.55, 1.8), grassW);
            const rt = rock;
            const rk = R2 * (1 - wsn);
            const vary = 0.9 + n2 * 0.2;
            col[vi * 3] = lerp(tr, rt.r / 0.48, rk * 0.5) * vary; col[vi * 3 + 1] = lerp(tgg, rt.g / 0.47, rk * 0.5) * vary; col[vi * 3 + 2] = lerp(tb, rt.b / 0.44, rk * 0.5) * vary;
          } else { col[vi * 3] = c.r; col[vi * 3 + 1] = c.g; col[vi * 3 + 2] = c.b; }
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
    if (this.splat) { g.setAttribute('splatA', new THREE.BufferAttribute(spA, 4)); g.setAttribute('splatB', new THREE.BufferAttribute(spB, 4)); }
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.splat || mats.terrain);
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
  // Instanced Blender trees with two LODs (near/far groups switched by distance),
  // bushes, rocks and ground cover (grass tufts, ferns, flowers) close to the road.
  instancer() {
    const inst = new Map();
    return {
      push(key, list, m4, cast, layer = 'near') {
        const k = key + '|' + layer;
        let e = inst.get(k);
        if (!e) inst.set(k, (e = { list, mats: [], cast, layer, meshes: [] }));
        e.mats.push(m4.clone());
        return { e, i: e.mats.length - 1 };
      },
      flush(ch) {
        for (const e of inst.values()) {
          for (const part of e.list) {
            const im = new THREE.InstancedMesh(part.geometry, part.material, e.mats.length);
            e.mats.forEach((mm, i) => im.setMatrixAt(i, mm));
            im.castShadow = e.cast; im.receiveShadow = true;
            im.userData.sharedGeo = true;
            im.computeBoundingSphere();
            (ch[e.layer] || ch.group).add(im);
            e.meshes.push(im);
          }
        }
      },
    };
  }

  treeNames(kind, v, b, tr, R) {
    const dry = !!tr.dry, autumn = b.look.warmth > 0.3 && !dry;
    if (dry && R() < 0.3) return ['dead' + (v % 2) + '_none_lod0', 'dead' + (v % 2) + '_none_lod0'];
    let base;
    if (kind === 'pine' || kind === 'spruce') base = kind + (v % 3);
    else if (kind === 'birch') base = 'birch' + (v % 2) + (autumn && R() < 0.6 ? '_autumn' : '');
    else if (kind === 'cherry') base = 'cherry' + (v % 3);
    else if (kind === 'maple') base = 'maple' + (v % 2) + '_maple';
    else if (kind === 'cypress') base = 'cypress' + (v % 2);
    else base = 'oak' + (v % 2) + (dry ? '_dry' : autumn && R() < 0.7 ? '_autumn' : '');
    return [base + '_lod0', base + '_lod1'];
  }

  buildVegetation(ch, R) {
    const t = this.track;
    const s0 = ch.j0 * STEP;
    const b = t.biome(s0 + 50);
    const tr = b.trees || {};
    const density = (tr.density || 0) * this.treeMul;
    const kinds = ['pine', 'spruce', 'birch', 'oak', 'cherry', 'maple', 'cypress'].filter((k) => tr[k]);
    const weights = kinds.map((k) => tr[k]);
    const wsum = weights.reduce((a, c) => a + c, 0) || 1;
    const snowy = b.look.snow > 0.5;
    const useAssets = AS.ready && assetParts('pine0_lod0');
    ch.near = new THREE.Group(); ch.far = new THREE.Group(); ch.mid = new THREE.Group(); ch.cover = new THREE.Group(); ch.bg = new THREE.Group();
    ch.group.add(ch.near, ch.far, ch.mid, ch.cover, ch.bg);
    const I = this.instancer();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const qr = {};
    const cols = [];
    // keep trees out of buildings and pastures
    const blocks = [];
    for (const pr of t.props) {
      if (Math.abs(pr.s - (s0 + 50)) > 260) continue;
      if (pr.type === 'farm') blocks.push({ x: pr.x, z: pr.z, fx: pr.fx, fz: pr.fz, rx: pr.rx, rz: pr.rz, a: pr.w / 2 + 3, b: pr.dpt / 2 + 16 });
      else if (pr.col) blocks.push({ x: pr.col.x, z: pr.col.z, fx: Math.cos(pr.col.yaw), fz: -Math.sin(pr.col.yaw), rx: Math.sin(pr.col.yaw), rz: Math.cos(pr.col.yaw), a: pr.col.hx + 3, b: pr.col.hz + 3 });
    }
    const blocked = (x, z) => {
      for (const k of blocks) {
        const dx = x - k.x, dz = z - k.z;
        if (Math.abs(dx * k.fx + dz * k.fz) < k.a && Math.abs(dx * k.rx + dz * k.rz) < k.b) return true;
      }
      return false;
    };
    const spot = (umin, umax, pow) => {
      const s = s0 + R() * CHUNK;
      const j = Math.min(t.N - 1, Math.round(s / STEP));
      if (t.tunnel[j] || t.bridge[j]) return null;
      const side = R() < 0.5 ? 0 : 1;
      const u = umin + Math.pow(R(), pow) * (umax - umin);
      const d = (side ? 1 : -1) * (t.width[j] / 2 + SHOULDER + u);
      const inner = (t.k[j] > 0 && !side) || (t.k[j] < 0 && side);
      if (inner && Math.abs(d) > 0.8 / Math.max(1e-4, Math.abs(t.k[j]))) return null;
      const x = t.px[j] + t.rx[j] * d, z = t.pz[j] + t.rz[j] * d;
      if (blocks.length && blocked(x, z)) return null;
      t.query(x, z, qr);
      return { s, j, side, u, x, z, h: qr.h, d: qr.d, halfW: qr.halfW, o: (j * 2 + side) * 5 };
    };
    // trees
    const nTrees = Math.round((useAssets ? 170 : 140) * density);
    for (let n = 0; n < nTrees; n++) {
      const sp = spot(3, 130, 1.5);
      // crowns stay clear of the carriageway (the camera must not drive through branches)
      if (!sp || Math.abs(sp.d) < sp.halfW + SHOULDER + 4.2 || t.sw[sp.o + 4] > 0.3) continue;
      const slope = Math.abs(t.height(sp.x + 1.5, sp.z) - sp.h);
      if (slope > (useAssets ? 4.2 : 2.2)) continue;
      let r = R() * wsum, ki = 0;
      while (ki < kinds.length - 1 && (r -= weights[ki]) > 0) ki++;
      const kind = kinds[ki] || 'pine';
      const v = Math.floor(R() * 3);
      const s2 = 0.75 + R() * 0.55;
      p.set(sp.x, sp.h - 0.25 - slope * 0.45, sp.z);
      q.setFromAxisAngle(up, R() * 6.28);
      sc.set(s2, s2 * (0.88 + R() * 0.24), s2);
      m4.compose(p, q, sc);
      if (useAssets) {
        const [n0, n1] = this.treeNames(kind, v, b, tr, R);
        const p0 = assetParts(n0), p1 = assetParts(n1) || p0;
        if (p0) { I.push(n0, p0, m4, this.castTrees && sp.u < 45, 'near'); I.push(n1, p1, m4, this.castTrees && sp.u < 30, 'far'); }
      } else {
        const geo = PR.treeGeometry(kind, v, { snowy, autumn: b.look.warmth > 0.3, dry: !!tr.dry });
        I.push(geo.uuid, [{ geometry: geo, material: mats.foliage }], m4, this.castTrees && sp.u < 40, 'near');
      }
      // grown trees are solid: you do not drive through a trunk
      if (sp.u < 80) cols.push({ t: 's', x: sp.x, y: sp.h + 0.8, z: sp.z, r: 0.28 * s2 + 0.12, s: sp.s, tree: 1 });
    }
    // rocks
    const nRocks = Math.round(44 * (b.rocks || 0.5) * (this.quality === 'low' ? 0.5 : 1));
    for (let n = 0; n < nRocks; n++) {
      const sp = spot(1.5, 70, 2);
      if (!sp || Math.abs(sp.d) < sp.halfW + 1) continue;
      const size = (0.3 + Math.pow(R(), 3) * 3.2) * Math.min(1, 0.25 + sp.u / 14);
      if (Math.abs(t.height(sp.x + 1.2, sp.z) - sp.h) > 1.6) continue;
      this.addRock(I, sp.x, sp.h, sp.z, R, snowy, b, size, useAssets);
      if (sp.u < 40 && size > 0.7) cols.push({ t: 's', x: sp.x, y: sp.h + size * 0.3, z: sp.z, r: size * 0.75, s: sp.s });
    }
    // groves: clusters of trees standing close together
    const placeTree = (x, z, h, s2, kind, uDist, sAlong) => {
      if (!useAssets) return;
      const [n0, n1] = this.treeNames(kind, Math.floor(R() * 3), b, tr, R);
      const p0 = assetParts(n0), p1 = assetParts(n1) || p0;
      if (!p0) return;
      m4.compose(p.set(x, h - 0.3, z), q.setFromAxisAngle(up, R() * 6.28), sc.set(s2, s2 * (0.88 + R() * 0.24), s2));
      if (uDist > 120) { I.push(n1, p1, m4, false, 'bg'); return; }
      I.push(n0, p0, m4, this.castTrees && uDist < 45, 'near'); I.push(n1, p1, m4, false, 'far');
      if (uDist < 80) cols.push({ t: 's', x, y: h + 0.8, z, r: 0.28 * s2 + 0.12, s: sAlong, tree: 1 });
    };
    const pickKind = () => {
      let r = R() * wsum, ki = 0;
      while (ki < kinds.length - 1 && (r -= weights[ki]) > 0) ki++;
      return kinds[ki] || 'pine';
    };
    if (kinds.length && useAssets) {
      const nGroves = Math.round((2 + density * 5) * (this.quality === 'low' ? 0.5 : 1));
      for (let gI = 0; gI < nGroves; gI++) {
        const c0 = spot(10, 110, 1.2);
        if (!c0 || Math.abs(c0.d) < c0.halfW + 8) continue;
        const kind = pickKind();
        const nT = 8 + Math.floor(R() * 14);
        const rad = 5 + R() * 9;
        for (let k = 0; k < nT; k++) {
          const a = R() * 6.283, rr = Math.sqrt(R()) * rad;
          const x = c0.x + Math.cos(a) * rr, z = c0.z + Math.sin(a) * rr;
          if (blocks.length && blocked(x, z)) continue;
          t.query(x, z, qr);
          if (Math.abs(qr.d) < qr.halfW + SHOULDER + 5) continue;
          if (Math.abs(t.height(x + 1.5, z) - qr.h) > 3.5) continue;
          placeTree(x, z, qr.h, 0.7 + R() * 0.6, R() < 0.8 ? kind : pickKind(), Math.abs(qr.d) - qr.halfW, qr.s);
        }
      }
      // background forest on the slopes further away (cheap card LOD only)
      const nBg = Math.round((60 + 160 * density) * (this.quality === 'low' ? 0.4 : this.quality === 'high' ? 1.2 : 0.85));
      for (let n = 0; n < nBg; n++) {
        // the terrain mesh reaches ~140 m from the road
        const sp = spot(55, 136, 1.0);
        if (!sp || Math.abs(sp.d) < sp.halfW + 50) continue;
        // clump them: skip a fraction based on noise so forests have edges and clearings
        if (t.noise.n2(sp.x * 0.012, sp.z * 0.012) < -0.15) continue;
        placeTree(sp.x, sp.z, sp.h, 0.8 + R() * 0.6, pickKind(), 200, sp.s);
        if (sp.u < 80) cols.push({ t: 's', x: sp.x, y: sp.h + 0.8, z: sp.z, r: 0.4, s: sp.s, tree: 1 });
      }
    }
    // young trees along the verges: these snap when you hit them
    if (useAssets) {
      const nSap = Math.round(26 * density + 4);
      for (let n = 0; n < nSap; n++) {
        const sp = spot(0.6, 28, 1.4);
        if (!sp || Math.abs(sp.d) < sp.halfW + SHOULDER + 0.3 || t.sw[sp.o + 4] > 0.3) continue;
        let r = R() * wsum, ki = 0;
        while (ki < kinds.length - 1 && (r -= weights[ki]) > 0) ki++;
        const kind = kinds[ki] || 'pine';
        const [n0] = this.treeNames(kind, Math.floor(R() * 3), b, tr, R);
        const p0 = assetParts(n0);
        if (!p0) continue;
        const s2 = 0.26 + R() * 0.24;
        m4.compose(p.set(sp.x, sp.h - 0.1, sp.z), q.setFromAxisAngle(up, R() * 6.28), sc.set(s2, s2 * (0.9 + R() * 0.3), s2));
        const hs = I.push(n0, p0, m4, false, 'mid');
        cols.push({ t: 's', x: sp.x, y: sp.h + 0.6, z: sp.z, r: 0.35, s: sp.s, brk: 0, slow: 0.035, dmg: 0.08, vis: [hs], kind: 'sapling' });
      }
    }
    // bushes
    const nBush = Math.round(36 * density + 6);
    for (let n = 0; n < nBush; n++) {
      const sp = spot(1, 30, 1.3);
      if (!sp || Math.abs(sp.d) < sp.halfW + 1) continue;
      const s2 = 0.6 + R() * 0.9;
      m4.compose(p.set(sp.x, sp.h - 0.1, sp.z), q.setFromAxisAngle(up, R() * 6.28), sc.set(s2, s2 * 0.9, s2));
      if (useAssets) {
        const leaf = tr.dry ? 'dry' : b.look.warmth > 0.3 && R() < 0.5 ? 'autumn' : 'oak';
        const name = 'bush' + Math.floor(R() * 2) + '_' + leaf;
        const hb = I.push(name, assetParts(name), m4, false, 'mid');
        cols.push({ t: 's', x: sp.x, y: sp.h + 0.4, z: sp.z, r: 0.55 * s2, s: sp.s, brk: 0, slow: 0.01, vis: [hb], kind: 'bush' });
      } else {
        const geo = PR.bushGeometry(Math.floor(R() * 3), { snowy, dry: !!tr.dry });
        I.push(geo.uuid, [{ geometry: geo, material: mats.foliage }], m4, false, 'near');
      }
    }
    // ground cover: grass, flowers, ferns (not on snow, sparse on rock)
    if (useAssets && !snowy && this.quality !== 'low') {
      const forest = (tr.density || 0) > 0.7;
      const nCover = Math.round((this.quality === 'high' ? 300 : 190) * (b.id === 'cliffs' || b.id === 'rocky' ? 0.45 : 1) * (tr.dry ? 0.6 : 1));
      for (let n = 0; n < nCover; n++) {
        const sp = spot(0.3, 55, 1.9);
        if (!sp || Math.abs(sp.d) < sp.halfW + SHOULDER + 0.2) continue;
        if (Math.abs(t.height(sp.x + 0.8, sp.z) - sp.h) > 2.2) continue;
        let name = 'grass' + Math.floor(R() * 3);
        if (forest && R() < 0.35) name = 'fern0';
        else if ((b.id === 'village' || b.id === 'lower' || b.id === 'mesa') && R() < 0.25) name = 'grass1';
        const parts = assetParts(name);
        if (!parts) continue;
        // small clumps read much better than evenly scattered tufts
        const nk = 2 + Math.floor(R() * 4);
        for (let c = 0; c < nk; c++) {
          const cx = sp.x + (R() - 0.5) * 2.6, cz = sp.z + (R() - 0.5) * 2.6;
          t.query(cx, cz, qr);
          if (Math.abs(qr.d) < qr.halfW + SHOULDER) continue;
          const s2 = (name === 'fern0' ? 0.9 : 1.4) + R() * 0.9;
          m4.compose(p.set(cx, qr.h - 0.08, cz), q.setFromAxisAngle(up, R() * 6.28), sc.set(s2, s2 * (0.8 + R() * 0.5), s2));
          I.push(name, parts, m4, false, 'cover');
        }
      }
    }
    I.flush(ch);
    if (cols.length) this.addColliders(ch.k, cols);
  }

  addRock(I, x, y, z, R, snowy, b, size, useAssets) {
    const v = Math.floor(R() * 6);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 0.25, R() * 6.28, R() * 0.25));
    if (useAssets) {
      const name = size > 2.4 && R() < 0.5 ? 'cliffrock' + (v % 2) : 'rock' + v;
      m4.compose(new THREE.Vector3(x, y - size * 0.12, z), q, new THREE.Vector3(size * 0.55, size * (0.4 + R() * 0.3), size * 0.55));
      I.push(name, assetParts(name), m4, size > 1, 'mid');
      return;
    }
    const geo = PR.rockGeometry(v, { snowy, tint: b.look.rock });
    m4.compose(new THREE.Vector3(x, y - size * 0.15, z), q, new THREE.Vector3(size, size * (0.7 + R() * 0.5), size));
    I.push(geo.uuid, [{ geometry: geo, material: mats.rock }], m4, size > 1, 'near');
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
    const useAssets = AS.ready;
    const poleParts = useAssets ? assetParts('pole0') : null, fenceParts = useAssets ? assetParts('fence0') : null;
    const pushParts = (key, list, mm) => {
      const es = [];
      let idx = 0;
      list.forEach((part, i) => {
        let e = inst.get(key + i);
        if (!e) inst.set(key + i, (e = { geo: part.geometry, mat: part.material, list: [], cast: true }));
        e.list.push(mm.clone());
        idx = e.list.length - 1;
        es.push(e);
      });
      // handle in the same shape as the vegetation instancer: { e: { meshes, mats, list }, i }
      const h = { e: { meshes: [], mats: es[0].list, list: list, parts: es }, i: idx };
      return h;
    };
    const fenceCols = [];
    for (const pr of t.props) {
      if (pr.s < s0 || pr.s >= s1) continue;
      if (pr.type === 'house' || pr.type === 'barn' || pr.type === 'chapel' || pr.type === 'shack' || pr.type === 'gasstation') {
        const name = pr.type === 'house' ? 'chalet' + (pr.seed % 4) : pr.type + '0';
        const hp = useAssets ? assetParts(name) : null;
        let g = null;
        if (hp) {
          // Blender assets face +X; the old procedural ones face +Z. Instanced per chunk.
          const yaw = pr.yaw - Math.PI / 2;
          const scl = pr.type === 'house' || pr.type === 'barn' || pr.type === 'chapel' ? pr.size : 1;
          m4.compose(p.set(pr.x, pr.y - 0.05, pr.z), q.setFromAxisAngle(up, yaw), sc.set(scl, scl, scl));
          pushParts(name, hp, m4);
          sc.set(1, 1, 1);
          if (pr.col) fitBox(pr.col, name, { position: p, rotation: { y: yaw } }, scl);
        } else {
          g = pr.type === 'shack' ? PR.buildShack(pr.seed) : pr.type === 'gasstation' ? PR.buildGasStation(pr.seed) : PR.buildHouse(pr.seed, pr.type);
          g.position.set(pr.x, pr.y, pr.z); g.rotation.y = pr.yaw;
          if (pr.type !== 'shack' && pr.type !== 'gasstation') g.scale.setScalar(pr.size);
        }
        if (g) ch.group.add(g);
      } else if (pr.type === 'pole') {
        const rx = Math.cos(pr.yaw), rz = -Math.sin(pr.yaw);
        if (poleParts) {
          m4.compose(p.set(pr.x, pr.y - 0.2, pr.z), q.setFromAxisAngle(up, pr.yaw + Math.PI / 2), sc.set(1, 1, 1));
          pushParts('pole0', poleParts, m4);
          poleTops.push([pr.x, pr.y - 0.2 + 7.85, pr.z, rx, rz]);
        } else {
          m4.compose(p.set(pr.x, pr.y - 0.2, pr.z), q.setFromAxisAngle(up, pr.yaw), sc.set(1, 1, 1));
          push(PR.poleGeometry(), mats.foliage, m4);
          poleTops.push([pr.x, pr.y + 7.45, pr.z, rx, rz]);
        }
      } else if (pr.type === 'snowpole') {
        m4.compose(p.set(pr.x, pr.y - 0.1, pr.z), q.identity(), sc.set(1, 1, 1));
        push(PR.snowPoleGeometry(), mats.foliage, m4, false);
      } else if (pr.type === 'fence' && fenceParts) {
        for (let u = 0; u + 2.6 <= pr.len + 0.5; u += 2.6) {
          const a = t.posAt(pr.s + u, pr.d), bq = t.posAt(pr.s + u + 2.6, pr.d);
          const yaw = Math.atan2(-(bq.z - a.z), bq.x - a.x);
          m4.compose(p.set(a.x, Math.min(a.y, bq.y) - 0.08, a.z), q.setFromAxisAngle(up, yaw), sc.set(1, 1, 1));
          const h = pushParts('fence0', fenceParts, m4);
          const mx = (a.x + bq.x) / 2, mz = (a.z + bq.z) / 2;
          fenceCols.push({ t: 'b', x: mx, y: a.y + 0.55, z: mz, hx: 1.3, hy: 0.6, hz: 0.1, yaw, s: pr.s + u, brk: 0, slow: 0.015, vis: [h], kind: 'fence' });
        }
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
      } else if (pr.type === 'logs' && useAssets && assetParts('logpile0')) {
        m4.compose(p.set(pr.x, pr.y - 0.1, pr.z), q.setFromAxisAngle(up, pr.yaw), sc.set(1, 1, 1));
        pushParts('logpile0', assetParts('logpile0'), m4);
      } else if (pr.type === 'logs') {
        m4.compose(p.set(pr.x, pr.y - 0.1, pr.z), q.setFromAxisAngle(up, pr.yaw), sc.set(1, 1, 1));
        push(PR.logsGeometry(), mats.foliage, m4);
      } else if (pr.type === 'farm' && fenceParts) {
        // pasture fence around the rectangle (segments follow the ground)
        const { fx, fz, rx, rz, w, dpt } = pr;
        const P = (a2, b2) => { const x = pr.x + fx * a2 + rx * b2, z = pr.z + fz * a2 + rz * b2; return { x, z, y: t.height(x, z) }; };
        const edges = [[[-w / 2, -dpt / 2], [w / 2, -dpt / 2]], [[w / 2, -dpt / 2], [w / 2, dpt / 2]], [[w / 2, dpt / 2], [-w / 2, dpt / 2]], [[-w / 2, dpt / 2], [-w / 2, -dpt / 2]]];
        for (const [A0, B0] of edges) {
          const len = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]);
          const n = Math.max(1, Math.round(len / 2.6));
          for (let k = 0; k < n; k++) {
            if (k === Math.floor(n / 2) && A0[1] === -pr.dpt / 2 && A0[0] < 0) continue; // a gate gap facing the road
            const a = P(lerp(A0[0], B0[0], k / n), lerp(A0[1], B0[1], k / n)), bq = P(lerp(A0[0], B0[0], (k + 1) / n), lerp(A0[1], B0[1], (k + 1) / n));
            const yaw = Math.atan2(-(bq.z - a.z), bq.x - a.x);
            const sl = Math.hypot(bq.x - a.x, bq.z - a.z) / 2.6;
            m4.compose(p.set(a.x, Math.min(a.y, bq.y) - 0.08, a.z), q.setFromAxisAngle(up, yaw), sc.set(sl, 1, 1));
            const h = pushParts('fence0', fenceParts, m4);
            fenceCols.push({ t: 'b', x: (a.x + bq.x) / 2, y: a.y + 0.55, z: (a.z + bq.z) / 2, hx: 1.3 * sl, hy: 0.6, hz: 0.1, yaw, s: pr.s + lerp(A0[0], B0[0], k / n), brk: 0, slow: 0.015, vis: [h], kind: 'fence' });
          }
        }
        // hay bales and a log pile by the barn
        const hay = mats.hay || (mats.hay = new THREE.MeshStandardMaterial({ color: 0xc8a356, roughness: 1 }));
        const bale = hayGeo || (hayGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14));
        for (let k = 0; k < 4; k++) {
          const c = P(-w * 0.5 + 2 + k * 1.7, pr.dpt / 2 + 3.5);
          const m = new THREE.Mesh(bale, hay); m.userData.sharedGeo = true;
          m.position.set(c.x, c.y + 0.7, c.z); m.rotation.set(0, Math.atan2(fx, fz), Math.PI / 2); m.castShadow = true; m.receiveShadow = true;
          ch.group.add(m);
        }
        const lp = useAssets && assetParts('logpile0');
        if (lp) { const c = P(w * 0.5 - 3, pr.dpt / 2 + 4); m4.compose(p.set(c.x, c.y - 0.1, c.z), q.setFromAxisAngle(up, pr.hd), sc.set(1, 1, 1)); pushParts('logpile0', lp, m4); }
      } else if (pr.type === 'waterfall') {
        this.buildWaterfall(ch, pr);
      } else if (pr.type === 'finish') {
        this.buildFinish(ch, pr);
      } else if (pr.type === 'gantry') {
        this.buildGantry(ch, pr);
      } else if (pr.type === 'grandstand') {
        m4.compose(p.set(pr.x, pr.y, pr.z), q.setFromAxisAngle(up, pr.yaw), sc.set(1, 1, 1));
        pushParts('stand', CIR.grandstandParts(), m4);
      } else if (pr.type === 'tyres') {
        // a short row of tyre stacks along the corner
        for (let k = -1; k <= 1; k++) {
          const fx = Math.sin(pr.yaw), fz = Math.cos(pr.yaw);
          m4.compose(p.set(pr.x + fx * k * 0.85, pr.y - 0.05, pr.z + fz * k * 0.85), q.setFromAxisAngle(up, k), sc.set(1, 1, 1));
          pushParts('tyres', CIR.tyreParts(), m4);
        }
      } else if (pr.type === 'block') {
        m4.compose(p.set(pr.x, pr.y, pr.z), q.setFromAxisAngle(up, pr.yaw), sc.set(pr.dep, pr.h, pr.w));
        pushParts('block', CIR.blockParts(), m4);
        sc.set(1, 1, 1);
      }
    }
    // wires between consecutive poles
    if (poleTops.length > 1) {
      const pts = [];
      for (let i = 0; i < poleTops.length - 1; i++) {
        const A = poleTops[i], B = poleTops[i + 1];
        if (Math.hypot(A[0] - B[0], A[2] - B[2]) > 60) continue;
        for (const off of [-0.8, 0, 0.8]) {
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
    // red and white kerbs through the corners of the circuits
    if (t.loop && t.m.biomes.some((bb) => bb.circuitDress || bb.props.includes('grandstands') || bb.props.includes('city'))) {
      const kr = CIR.kerbParts(1), kw = CIR.kerbParts(0);
      for (let j = ch.j0; j < ch.j1; j++) {
        if (Math.abs(t.k[j]) < 1 / 160) continue;
        for (let s2 = j * STEP; s2 < (j + 1) * STEP; s2 += 1.6) {
          for (const sd of [-1, 1]) {
            const d = sd * (t.width[j] / 2 + 0.45);
            const a = t.posAt(s2 + 0.8, d);
            m4.compose(p.set(a.x, a.y + 0.02, a.z), q.setFromAxisAngle(up, a.hd), sc.set(1, 1, 1));
            pushParts(Math.floor(s2 / 1.6) % 2 ? 'kerbR' : 'kerbW', Math.floor(s2 / 1.6) % 2 ? kr : kw, m4);
          }
        }
      }
    }
    for (const e of inst.values()) {
      const im = new THREE.InstancedMesh(e.geo, e.mat, e.list.length);
      e.list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.castShadow = e.cast; im.receiveShadow = true; im.userData.sharedGeo = true;
      im.computeBoundingSphere();
      ch.group.add(im);
      e.mesh = im;
    }
    for (const c of fenceCols) c.vis[0].e.meshes = c.vis[0].e.parts.map((e) => e.mesh);
    if (fenceCols.length) this.addColliders(ch.k, fenceCols);
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

  // start / finish gantry over the grid, with a chequered line on the road
  buildGantry(ch, pr) {
    const g = new THREE.Group();
    const W = pr.w + 3;
    const steel = mats.gantry || (mats.gantry = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.45, metalness: 0.7 }));
    for (const sd of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.2, 0.7), steel);
      post.position.set(sd * W / 2, 3.6, 0); post.castShadow = true; g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.7, 1.9, 0.9), steel);
    beam.position.set(0, 6.6, 0); beam.castShadow = true; g.add(beam);
    for (const ry of [0, Math.PI]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 1.5), signMaterialVillage(pr.text || 'FINISH'));
      banner.position.set(0, 6.6, ry ? -0.46 : 0.46); banner.rotation.y = ry; g.add(banner);
    }
    // start lights
    const lamp = mats.startLamp || (mats.startLamp = new THREE.MeshStandardMaterial({ color: 0x220806, emissive: 0xff2010, emissiveIntensity: 0.6, roughness: 0.4 }));
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), lamp);
      l.rotation.x = Math.PI / 2; l.position.set((k - 2) * 0.7, 5.25, -0.4); g.add(l);
    }
    // chequered line
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let jj = 0; jj < 2; jj++) { x.fillStyle = (i + jj) % 2 ? '#111' : '#eee'; x.fillRect(i * 16, jj * 16, 16, 16); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(pr.w, 1.0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.04; line.receiveShadow = true; g.add(line);
    g.position.set(pr.x, pr.y, pr.z); g.rotation.y = pr.yaw;
    ch.group.add(g);
  }

  // ------------------------------------------------------------- obstacles
  buildObstacles(ch, R) {
    const t = this.track;
    const s0 = ch.j0 * STEP, s1 = ch.j1 * STEP;
    for (const o of t.obstacles) {
      if (o.s < s0 || o.s >= s1) continue;
      if (o.type === 'rock' && AS.ready && placeAsset('rock' + (Math.floor(o.s) % 6))) {
        const g = placeAsset('rock' + (Math.floor(o.s) % 6));
        g.position.set(o.x, o.y - o.r * 0.15, o.z); g.scale.set(o.r * 0.6, o.r * 0.5, o.r * 0.55);
        g.rotation.y = o.s;
        ch.group.add(g);
      } else if (o.type === 'rock') {
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

  update2(dt, cam, look) {
    this.time += dt;
    AS.time.value += dt;
    if (look) {
      AS.wind.value += ((look.wind ?? 0.4) - AS.wind.value) * Math.min(1, dt);
      AS.snow.value += ((look.snow ?? 0) - AS.snow.value) * Math.min(1, dt);
    }
    if (cam) {
      // full-detail trees only close by; card trees beyond; rocks/bushes fade out far away
      const nearR = this.quality === 'high' ? 120 : this.quality === 'low' ? 55 : 85;
      const midR = this.quality === 'low' ? 260 : 380;
      const coverR = this.quality === 'high' ? 170 : 120;
      const farR = this.quality === 'high' ? 1400 : this.quality === 'low' ? 600 : 950;
      for (const ch of this.chunks.values()) {
        if (!ch.near) continue;
        const d = Math.hypot(ch.cx - cam.x, ch.cz - cam.z) - 50;
        const isNear = d < nearR;
        ch.near.visible = isNear; ch.far.visible = !isNear && d < farR; ch.mid.visible = d < midR; ch.cover.visible = d < coverR;
      }
    }
    for (const a of this.animated) if (a.type === 'water') a.mat.map.offset.y = -this.time * 0.9;
  }

  // A breakable thing was hit: hide its instances and return loose debris meshes.
  // Put everything that was knocked over back (new run).
  resetBreakables() {
    for (const { o, saved } of this.smashed || []) {
      o.dead = false;
      for (const { im, i, m } of saved) { im.setMatrixAt(i, m); im.instanceMatrix.needsUpdate = true; }
    }
    this.smashed = [];
  }

  smash(o) {
    const out = [];
    const saved = [];
    (this.smashed || (this.smashed = [])).push({ o, saved });
    const m4 = new THREE.Matrix4();
    (o.vis || []).forEach((h, k) => {
      if (!h || !h.e) return;
      for (const im of h.e.meshes) {
        const mm = new THREE.Matrix4(); im.getMatrixAt(h.i, mm); saved.push({ im, i: h.i, m: mm });
        im.setMatrixAt(h.i, ZERO_M4); im.instanceMatrix.needsUpdate = true;
      }
      if (k > 0) return;
      m4.copy(h.e.mats[h.i]);
      const g = new THREE.Group();
      m4.decompose(g.position, g.quaternion, g.scale);
      for (const part of h.e.list) {
        // a one-instance InstancedMesh shares the compiled instanced shader (no hitch on impact)
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, 1);
        mesh.setMatrixAt(0, IDENT_M4); mesh.frustumCulled = false;
        mesh.castShadow = true; mesh.userData.sharedGeo = true;
        g.add(mesh);
      }
      this.root.add(g);
      out.push(g);
    });
    return out;
  }

  nearestWaterfall(pos) {
    let best = 1e9;
    for (const a of this.animated) if (a.type === 'water') best = Math.min(best, a.pos.distanceTo(pos));
    for (const ch of this.chunks.values()) if (ch.stream) best = Math.min(best, ch.stream.distanceTo(pos) * 1.5);
    return best;
  }
}

const ZERO_M4 = new THREE.Matrix4().makeScale(0, 0, 0);
const IDENT_M4 = new THREE.Matrix4();
let hayGeo = null;
const boxCache = new Map();
// Fit a building's collision box (track collider) to the Blender model's real footprint.
function fitBox(col, name, g, scl) {
  let bb = boxCache.get(name);
  if (!bb) {
    const tmp = cloneAsset(name);
    bb = new THREE.Box3().setFromObject(tmp);
    boxCache.set(name, bb);
  }
  const th = g.rotation.y, c = Math.cos(th), sn = Math.sin(th);
  const cx = (bb.min.x + bb.max.x) / 2 * scl, cz = (bb.min.z + bb.max.z) / 2 * scl;
  // local -> world offset for a rotation of th about +y
  col.x = g.position.x + cx * c + cz * sn;
  col.z = g.position.z - cx * sn + cz * c;
  col.hy = (bb.max.y - bb.min.y) / 2 * scl;
  col.y = g.position.y + (bb.min.y + bb.max.y) / 2 * scl;
  // the collider frame uses the old yaw (model x = collider z)
  col.hx = (bb.max.z - bb.min.z) / 2 * scl * 0.96;
  col.hz = (bb.max.x - bb.min.x) / 2 * scl * 0.96;
}

function placeAsset(name) {
  const g = cloneAsset(name);
  if (!g) return null;
  g.traverse((o) => { if (o.isMesh) o.userData.sharedGeo = true; });
  return g;
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
