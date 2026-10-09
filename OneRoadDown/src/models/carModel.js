// Parametric vehicle builder. Bodies are lofted from cross-sections so every car is
// built from separate, deformable panels (hood, doors, fenders, quarters, trunk, roof,
// bumpers, glass, lights) plus wheels, suspension, engine bay, interior and the
// visual upgrade parts. Origin = centre of mass (matches the physics frame).

import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { mats, makePaint, patchWear, setWear } from '../gfx/materials.js';
import * as TX from '../gfx/textures.js';
import { computeStats } from '../game/stats.js';
import { clamp, lerp, smoothstep, rng } from '../core/util.js';

import { TYPE, carDims } from './carDims.js';
import { carAsset } from '../world/assets.js';

// ---------------------------------------------------------------- geometry helpers
function loft(sections, opts = {}) {
  // sections: array of arrays of [x,y,z]; consecutive sections are joined into quads
  const ns = sections.length, nr = sections[0].length;
  const pos = new Float32Array(ns * nr * 3), uv = new Float32Array(ns * nr * 2);
  let along = 0;
  for (let i = 0; i < ns; i++) {
    if (i > 0) along += Math.abs(sections[i][0][2] - sections[i - 1][0][2]);
    let ring = 0;
    for (let j = 0; j < nr; j++) {
      const p = sections[i][j];
      if (j > 0) { const q = sections[i][j - 1]; ring += Math.hypot(p[0] - q[0], p[1] - q[1]); }
      const o = (i * nr + j) * 3;
      pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
      uv[(i * nr + j) * 2] = ring * 0.5; uv[(i * nr + j) * 2 + 1] = along * 0.5;
    }
  }
  const idx = [];
  for (let i = 0; i < ns - 1; i++) for (let j = 0; j < nr - 1; j++) {
    const a = i * nr + j, b = a + 1, c = a + nr, d = c + 1;
    if (opts.flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const ni = (g) => (g.index ? g.toNonIndexed() : g);

function fan(ring, flip) {
  let cx = 0, cy = 0, cz = 0;
  for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= ring.length; cy /= ring.length; cz /= ring.length;
  const pos = [cx, cy, cz], uv = [0.5, 0.5], idx = [];
  for (let i = 0; i < ring.length; i++) { pos.push(...ring[i]); uv.push(ring[i][0] * 0.5 + 0.5, ring[i][1] * 0.5); }
  for (let i = 1; i < ring.length; i++) flip ? idx.push(0, i + 1, i) : idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the cap faces the requested way (flip = faces -z)
  const nz = g.attributes.normal.getZ(0);
  if ((flip && nz > 0) || (!flip && nz < 0)) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

export function roundedBox(w, h, d, r = 0.04, seg = 2) {
  const shape = new THREE.Shape();
  const x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r;
  shape.moveTo(x, y - r);
  shape.lineTo(x + ww, y - r); shape.quadraticCurveTo(x + ww + r, y - r, x + ww + r, y);
  shape.lineTo(x + ww + r, y + hh); shape.quadraticCurveTo(x + ww + r, y + hh + r, x + ww, y + hh + r);
  shape.lineTo(x, y + hh + r); shape.quadraticCurveTo(x - r, y + hh + r, x - r, y + hh);
  shape.lineTo(x - r, y); shape.quadraticCurveTo(x - r, y - r, x, y - r);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.98, bevelSegments: seg, curveSegments: seg });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}

// Cylinder between two points.
export function beam(a, b, rad, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(rad, rad, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

function swapUV(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setXY(i, uv.getY(i), u); }
  return g;
}

// ---------------------------------------------------------------- wheel
const wheelCache = new Map();
// Modelled rims (the flat textured faces stay for steel wheels and hubcaps).
const RIM_3D = {
  alloy: { spokes: 7, twin: false, dish: 0.0, color: 0xc4c8cc, sportColor: 0x34373c, rough: 0.28, metal: 0.9 },
  dish: { spokes: 6, twin: false, dish: 1.0, color: 0xdcdfe2, rough: 0.14, metal: 0.95 },
  rally: { spokes: 6, twin: false, dish: 0.3, color: 0xe6e6e2, rough: 0.4, metal: 0.25, thick: 1.6 },
  beadlock: { spokes: 8, twin: false, dish: 0.6, color: 0x1e1f22, rough: 0.5, metal: 0.6, thick: 1.4, bolts: 16 },
  offroad: { spokes: 6, twin: false, dish: 0.6, color: 0x2a2b2e, rough: 0.5, metal: 0.6, thick: 1.5 },
};

function rimGeometry(st, rr, w, sport) {
  const parts = [];
  const xFace = w * 0.6;                 // outer face plane (wheel axis is x)
  const dish = st.dish;
  const n = sport && !st.thick ? 5 : st.spokes, twin = sport && !st.thick;
  const r0 = rr * 0.2, r1 = rr * 0.92;
  // one tapered, slightly concave spoke from the hub to the lip
  const spoke = (a, wid0, wid1, th) => {
    const g = new THREE.BoxGeometry(1, 1, 1, 4, 1, 1);
    const p = g.attributes.position;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < p.count; i++) {
      const t = p.getX(i) + 0.5, side = p.getZ(i), up = p.getY(i);
      const rad = r0 + (r1 - r0) * t;
      const wd = (wid0 + (wid1 - wid0) * t) * side;
      // concave face: the hub sits proud, the spoke sinks towards the lip (deep dish: the reverse)
      const x = xFace + (1 - dish) * (0.03 * (1 - t) - 0.035 * t * t) + dish * (-0.07 * (1 - t) + 0.01 * t) + up * th;
      p.setXYZ(i, x, ca * rad - sa * wd, sa * rad + ca * wd);
    }
    g.computeVertexNormals();
    parts.push(g);
  };
  const th = 0.024 * (st.thick || 1);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (twin) { spoke(a - 0.13, rr * 0.07, rr * 0.045, th); spoke(a + 0.13, rr * 0.07, rr * 0.045, th); }
    else spoke(a, rr * 0.16 * (st.thick || 1), rr * 0.09 * (st.thick || 1), th);
  }
  // lip: a polished ring around the face
  const lipX = xFace - 0.035 + dish * 0.02;
  const lp = [[rr * 0.88, -(lipX - 0.03)], [rr * 0.99, -(lipX - 0.02)], [rr * 1.0, -(lipX + 0.005)], [rr * 0.95, -(lipX + 0.012)], [rr * 0.89, -(lipX + 0.004)]].map(([a, b]) => new THREE.Vector2(a, b));
  const lip = new THREE.LatheGeometry(lp, 32); lip.rotateZ(Math.PI / 2);
  parts.push(lip);
  // hub, centre cap and five lug nuts
  const hubX = xFace + (1 - dish) * 0.03 - dish * 0.07;
  const hub = new THREE.CylinderGeometry(r0 * 1.05, r0 * 1.15, 0.05, 20); hub.rotateZ(Math.PI / 2); hub.translate(hubX, 0, 0);
  const cap = new THREE.CylinderGeometry(r0 * 0.45, r0 * 0.5, 0.06, 16); cap.rotateZ(Math.PI / 2); cap.translate(hubX + 0.015, 0, 0);
  parts.push(hub, cap);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const nut = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 6); nut.rotateZ(Math.PI / 2);
    nut.translate(hubX + 0.022, Math.cos(a) * r0 * 0.7, Math.sin(a) * r0 * 0.7);
    parts.push(nut);
  }
  // beadlock ring with bolts
  if (st.bolts) {
    for (let k = 0; k < st.bolts; k++) {
      const a = (k / st.bolts) * Math.PI * 2;
      const b = new THREE.CylinderGeometry(0.009, 0.009, 0.025, 6); b.rotateZ(Math.PI / 2);
      b.translate(lipX + 0.01, Math.cos(a) * rr * 0.95, Math.sin(a) * rr * 0.95);
      parts.push(b);
    }
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }));
}

export function buildWheel(r, width, rimStyle, tireKind, sport) {
  const key = [r.toFixed(3), width.toFixed(3), rimStyle, tireKind, sport].join('|');
  let parts = wheelCache.get(key);
  if (!parts) {
    const rr = r * (rimStyle === 'beadlock' || tireKind === 'offroad' ? 0.56 : sport ? 0.72 : 0.62);
    const w = width / 2;
    const tp = [
      [rr * 0.98, -w * 0.92], [r * 0.9, -w], [r * 0.975, -w * 0.94], [r, -w * 0.78], [r, w * 0.78], [r * 0.975, w * 0.94], [r * 0.9, w], [rr * 0.98, w * 0.92],
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const tire = swapUV(new THREE.LatheGeometry(tp, 28));
    tire.rotateZ(Math.PI / 2);
    // rim barrel
    const bp = [[rr * 0.96, -w * 0.85], [rr, -w * 0.8], [rr, w * 0.75], [rr * 0.94, w * 0.82]].map(([a, b]) => new THREE.Vector2(a, b));
    const barrel = new THREE.LatheGeometry(bp, 24); barrel.rotateZ(Math.PI / 2);
    const face = new THREE.CircleGeometry(rr * 0.97, 24); face.rotateY(Math.PI / 2); face.translate(w * 0.62, 0, 0);
    const disc = new THREE.CylinderGeometry(rr * 0.72, rr * 0.72, 0.03, 20); disc.rotateZ(Math.PI / 2); disc.translate(w * 0.05, 0, 0);
    const caliper = roundedBox(0.06, rr * 0.45, rr * 0.32, 0.015, 1); caliper.translate(w * 0.2, rr * 0.48, -rr * 0.25);
    const rim3d = RIM_3D[rimStyle] ? rimGeometry(RIM_3D[rimStyle], rr, w, sport) : null;
    parts = { tire, barrel, face, disc, caliper, rr, rim3d };
    wheelCache.set(key, parts);
  }
  const tireMat = new THREE.MeshStandardMaterial({ map: TX.tireTexture(tireKind), roughness: 0.9, bumpMap: TX.tireTexture(tireKind), bumpScale: 2 });
  const rimMat = new THREE.MeshStandardMaterial({ map: TX.rimTexture(rimStyle), alphaTest: 0.4, roughness: rimStyle === 'hubcap' || rimStyle === 'dish' ? 0.18 : 0.35, metalness: 0.85, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const spin = new THREE.Group();
  const tire = new THREE.Mesh(parts.tire, tireMat); tire.castShadow = true;
  const barrel = new THREE.Mesh(parts.barrel, mats.darkSteel);
  let face;
  if (parts.rim3d) {
    // modelled rim: spokes, lip, hub and lug nuts; the brake disc shows between the spokes
    const st = RIM_3D[rimStyle];
    const m3 = new THREE.MeshStandardMaterial({ color: sport && st.sportColor ? st.sportColor : st.color, roughness: st.rough, metalness: st.metal });
    face = new THREE.Mesh(parts.rim3d, m3); face.castShadow = true;
    g.userData.rimMat = m3;
  } else face = new THREE.Mesh(parts.face, rimMat);
  spin.add(tire, barrel, face);
  const disc = new THREE.Mesh(parts.disc, mats.brakeDisc);
  spin.add(disc);
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.5 });
  const caliper = new THREE.Mesh(parts.caliper, caliperMat);
  g.add(spin, caliper);
  g.userData = { ...g.userData, spin, face, caliper, caliperMat, tireMat, rimMat: g.userData.rimMat || rimMat, tire };
  return g;
}

// ---------------------------------------------------------------- the car
// Merge all visible meshes under `root` (except the `stops` subtrees) into one mesh per
// material, in root space. Hidden meshes are dropped.
function bakeInto(root, stops) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), drop = [];
  const walk = (o, hidden) => {
    if (stops.has(o)) return;
    hidden = hidden || !o.visible;
    if (o.isMesh) {
      if (!hidden) {
        const g = o.geometry, keep = ['position', 'normal', 'uv'].filter((k) => g.attributes[k]);
        const key = o.material.uuid + '|' + keep.join(',') + '|' + (o.castShadow ? 1 : 0);
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat: o.material, shadow: o.castShadow, geos: [] }));
        const c = new THREE.BufferGeometry();
        for (const k of keep) c.setAttribute(k, g.attributes[k].clone());
        c.setIndex(g.index ? g.index.clone() : [...Array(g.attributes.position.count).keys()]);
        b.geos.push(c.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
      }
      drop.push(o);
    }
    for (const ch of [...o.children]) walk(ch, hidden);
  };
  for (const ch of [...root.children]) walk(ch, false);
  // keep stop subtrees that hang under a dropped mesh
  for (const o of drop) { for (const ch of [...o.children]) if (stops.has(ch)) root.attach(ch); }
  for (const o of drop) { o.parent.remove(o); o.geometry.dispose(); }
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.shadow; m.receiveShadow = true;
    root.add(m);
  }
}

export class CarModel {
  constructor(car, opts = {}) {
    this.car = car;
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.name = car.id;
    this.levels = opts.levels || {};
    this.tireId = opts.tire || 'worn';
    const st = opts.stats || computeStats(car, this.levels, this.tireId);
    this.ph = st.phys;
    this.topKmh = st.top;
    this.build();
    this.setUpgrades(this.levels, this.tireId);
    this.resetDamage();
  }

  build() {
    const car = this.car, md = car.model, ph = this.ph;
    const T = TYPE[md.type] || TYPE.hatch;
    this.T = T;
    const paint = this.opts.paint ?? md.paint;
    const rnd = rng(car.id.length * 31 + 7);
    this.paintMat = makePaint(paint, this.opts.finish || (md.sport ? 'metallic' : 'solid'), {});
    this.trimMat = patchWear(new THREE.MeshStandardMaterial({ color: md.trim, roughness: 0.7, metalness: 0.1 }));
    this.bumperMat = md.chrome ? mats.chrome : this.trimMat;
    // mismatched panel for rusty
    this.oddMat = md.wear > 0.5 ? makePaint(0x6f7a72, 'solid', {}) : this.paintMat;

    const dm = (this.dims = carDims(car, ph));
    const { L, W, zF, zR, yG, bottom, roof, H, yBelt, yNose, yTail, a, b, half, r, archR, wcY } = dm;
    const lift = md.lift || 0;
    const axles = [a, -b];
    const cr = T.cr;

    const uz = (u) => zR + u * L;
    const width = (z) => {
      const dEnd = Math.min(z - zR, zF - z);
      let w = half;
      if (dEnd < cr) w = half - cr + Math.sqrt(Math.max(0, cr * cr - (cr - dEnd) * (cr - dEnd)));
      return w;
    };
    const topY = (u) => {
      let y;
      if (u > T.ws) y = lerp(yBelt, yNose, Math.pow(smoothstep(T.ws, 1, u), 0.85));
      else if (u < T.back && !T.bed) y = lerp(yTail, yBelt, smoothstep(0, T.back + 0.0001, u) * 0.15);
      else y = yBelt;
      y -= 0.07 * smoothstep(0.965, 1, u) + 0.06 * smoothstep(0.035, 0, u);
      return y;
    };
    const botY = (z, u) => {
      let y = bottom + 0.06 * smoothstep(0.9, 1, u) + 0.05 * smoothstep(0.1, 0, u);
      for (const ax of axles) {
        const dz = z - ax;
        if (Math.abs(dz) < archR) y = Math.max(y, wcY + Math.sqrt(archR * archR - dz * dz) * 0.97);
      }
      return Math.min(y, topY(u) - 0.1);
    };
    const sideRing = (u, sgn) => {
      const z = uz(u), w = width(z), y0 = botY(z, u), y1 = topY(u), h = y1 - y0;
      const pts = [[0.93, 0], [0.99, 0.2], [1, 0.5], [0.99, 0.78], [0.955, 0.93], [0.88, 1]];
      return pts.map(([fx, fy]) => [sgn * w * fx, y0 + fy * h, z]);
    };
    const topRing = (u) => {
      const z = uz(u), w = width(z), y1 = topY(u);
      return [[0.88, 0], [0.6, 0.012], [0.25, 0.02], [0, 0.022], [-0.25, 0.02], [-0.6, 0.012], [-0.88, 0]].map(([fx, fy]) => [fx * w, y1 + fy, z]);
    };
    const us = (u0, u1, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(lerp(u0, u1, i / n)); return o; };
    const sideLoft = (u0, u1, sgn, n = 10) => loft(us(u0, u1, n).map((u) => sideRing(u, sgn)), { flip: sgn < 0 });
    const topLoft = (u0, u1, n = 10) => loft(us(u0, u1, n).map((u) => topRing(u)));

    const P = (this.parts = {});
    const add = (name, geo, mat, parent = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.name = name; m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      P[name] = m;
      return m;
    };
    const ws = T.ws;
    this.exhaustGroup = new THREE.Group();
    this.group.add(this.exhaustGroup);
    this.exhaustPos = [-half * 0.55, bottom + 0.08, zR - 0.05];
    const A = this.opts.procedural ? null : carAsset(car.id);
    this.fromAsset = !!A;
    if (A) this.buildAssetBody(A, add);
    else {
    const doorR = T.bed ? T.back + 0.02 : Math.max(T.back + 0.12, ws - (md.type === 'sedan' || md.type === 'wagon' || md.type === 'suv' || md.type === 'beast' ? 0.42 : 0.3));
    const fenderStart = ws - 0.02;
    // sides
    for (const [sgn, sfx] of [[1, 'L'], [-1, 'R']]) {
      add('fenderF' + sfx, sideLoft(fenderStart, 1, sgn, 12), md.wear > 0.5 && sfx === 'R' ? this.oddMat : this.paintMat);
      add('door' + sfx, sideLoft(doorR, fenderStart, sgn, 8), this.paintMat);
      add('quarter' + sfx, sideLoft(0, doorR, sgn, 12), this.paintMat);
    }
    // hood: separate pivot so it can open
    const hoodPivot = new THREE.Group();
    const hz = uz(ws), hy = topY(ws);
    hoodPivot.position.set(0, hy, hz);
    this.group.add(hoodPivot);
    const hoodGeo = topLoft(ws, 0.985, 10); hoodGeo.translate(0, -hy, -hz);
    add('hood', hoodGeo, this.paintMat, hoodPivot);
    this.hoodPivot = hoodPivot;
    // cowl strip between hood and windshield is covered by greenhouse base
    if (!T.bed) {
      if (T.back > 0.05) add('trunk', topLoft(0.015, T.back + 0.01, 8), this.paintMat);
      else add('trunk', topLoft(0.004, 0.06, 3), this.paintMat);
    }
    // nose and tail fascia
    const frontRing = [...sideRing(0.999, 1), ...topRing(0.999).slice(1, -1), ...sideRing(0.999, -1).reverse()];
    add('fascia', fan(frontRing, false), this.paintMat);
    const rearRing = [...sideRing(0.001, 1), ...(T.bed ? [] : topRing(0.001).slice(1, -1)), ...sideRing(0.001, -1).reverse()];
    add('rearPanel', fan(rearRing, true), this.paintMat);

    // greenhouse
    const ghSections = [];
    const roofY = roof;
    const ghBase = T.bed ? T.back : T.back;
    for (const u of us(ghBase, ws, 22)) {
      const z = uz(u), w = width(z);
      const yb = topY(Math.min(Math.max(u, 0.0001), ws)) + 0.005;
      let yt;
      if (u < T.roofR) yt = lerp(yb + 0.02, roofY, T.bed ? smoothstep(ghBase, ghBase + 0.012, u) : Math.pow(smoothstep(ghBase, T.roofR, u), 0.75));
      else if (u > T.roofF) yt = lerp(roofY, yb + 0.02, Math.pow(smoothstep(T.roofF, ws, u), 1.1));
      else yt = roofY;
      const wb = w * 0.9, wr = w * T.tumble;
      const ring = [
        [wb, yb], [lerp(wb, wr, 0.65), lerp(yb, yt, 0.72)], [wr, yt - 0.035], [wr * 0.75, yt - 0.004], [0, yt + 0.008],
        [-wr * 0.75, yt - 0.004], [-wr, yt - 0.035], [-lerp(wb, wr, 0.65), lerp(yb, yt, 0.72)], [-wb, yb],
      ].map(([x, y]) => [x, y, z]);
      ghSections.push(ring);
    }
    this.ghSections = ghSections;
    const ghGeo = loft(ghSections);
    this.glassMat = mats.glass;
    mats.glass.side = THREE.DoubleSide;
    add('glass', ghGeo, this.glassMat).castShadow = false;
    const capB = fan(ghSections[0], true), capF = fan(ghSections[ghSections.length - 1], false);
    add('glassBack', capB, this.glassMat);
    add('glassFront', capF, this.glassMat);
    const crackGeo = ghGeo.clone();
    crackGeo.scale(1.004, 1.004, 1.002);
    this.crackMat = mats.crack.clone();
    add('crack', crackGeo, this.crackMat).castShadow = false;
    // roof panel + pillars
    const roofSecs = ghSections.filter((_, i) => { const u = lerp(ghBase, ws, i / 22); return u >= T.roofR - 0.02 && u <= T.roofF + 0.02; })
      .map((ring) => ring.slice(2, 7).map(([x, y, z]) => [x * 1.01, y + 0.008, z]));
    if (roofSecs.length > 1) add('roof', loft(roofSecs), this.paintMat);
    const pillar = (u0, u1, thick) => {
      const pts = [];
      const i0 = Math.round(((u0 - ghBase) / (ws - ghBase)) * 22), i1 = Math.round(((u1 - ghBase) / (ws - ghBase)) * 22);
      const geos = [];
      for (const sgn of [1, -1]) {
        const A = ghSections[clamp(i0, 0, 22)], B = ghSections[clamp(i1, 0, 22)];
        const pa = sgn > 0 ? A[0] : A[8], pb = sgn > 0 ? B[2] : B[6];
        geos.push(beam([pa[0] * 1.012, pa[1], pa[2]], [pb[0] * 1.012, pb[1], pb[2]], thick, 5));
      }
      return mergeGeometries(geos);
    };
    const pillars = [pillar(ws, T.roofF, 0.045), pillar(T.bed ? ghBase + 0.005 : ghBase + 0.01, T.roofR, T.back < 0.05 ? 0.07 : 0.05)];
    if (T.roofF - T.roofR > 0.18) {
      const um = lerp(T.roofR, T.roofF, 0.42);
      pillars.push(pillar(um, um, 0.04));
      // vertical B pillar: from belt to roof at the same z
      const i = clamp(Math.round(((um - ghBase) / (ws - ghBase)) * 22), 0, 22);
      const R = ghSections[i];
      pillars.push(beam([R[0][0] * 1.01, R[0][1], R[0][2]], [R[2][0] * 1.01, R[2][1], R[2][2]], 0.04, 4));
      pillars.push(beam([R[8][0] * 1.01, R[8][1], R[8][2]], [R[6][0] * 1.01, R[6][1], R[6][2]], 0.04, 4));
    }
    add('pillars', mergeGeometries(pillars.map((g) => g.index ? g.toNonIndexed() : g)), md.type === 'super' || md.type === 'hyper' ? this.trimMat : this.paintMat);

    // pickup bed
    if (T.bed) {
      const zb = uz(T.back), wB = width(zR + 0.3) - 0.07;
      const floorY = bottom + (yBelt - bottom) * 0.35;
      const bedLen = zb - zR - 0.05;
      const g = [];
      const fl = new THREE.BoxGeometry(wB * 2, 0.04, bedLen); fl.translate(0, floorY, zR + 0.05 + bedLen / 2); g.push(fl);
      for (const sgn of [1, -1]) { const s = new THREE.BoxGeometry(0.04, yBelt - floorY, bedLen); s.translate(sgn * wB, (yBelt + floorY) / 2, zR + 0.05 + bedLen / 2); g.push(s); }
      const fw = new THREE.BoxGeometry(wB * 2, yBelt - floorY, 0.04); fw.translate(0, (yBelt + floorY) / 2, zb - 0.02); g.push(fw);
      add('bed', mergeGeometries(g), this.trimMat);
      const rails = [];
      for (const sgn of [1, -1]) { const rl = new THREE.BoxGeometry(0.1, 0.04, bedLen + 0.04); rl.translate(sgn * (wB + 0.02), yBelt + 0.01, zR + 0.05 + bedLen / 2); rails.push(rl); }
      add('bedRails', mergeGeometries(rails), this.paintMat);
    }

    // wheel wells + underbody
    const wells = [];
    for (const ax of axles) for (const sgn of [1, -1]) {
      const c = new THREE.CylinderGeometry(archR * 0.98, archR * 0.98, Math.max(0.3, r * 0.95), 14, 1, true, 0, Math.PI);
      c.rotateZ(Math.PI / 2);
      c.translate(sgn * (half - Math.max(0.3, r * 0.95) / 2 - 0.02), wcY, ax);
      wells.push(c);
    }
    const wellMesh = add('wells', mergeGeometries(wells), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1, side: THREE.DoubleSide }));
    wellMesh.castShadow = false;
    const under = new THREE.BoxGeometry(W * 0.86, 0.03, L * 0.86); under.translate(0, bottom + 0.04, (zF + zR) / 2);
    add('under', under, mats.plastic).castShadow = false;

    // bumpers
    const bh = Math.min(0.17, (yNose - bottom) * 0.5);
    const bf = roundedBox(W * 0.96, bh, 0.16, 0.05, 2);
    bf.translate(0, bottom + bh * 0.62, zF - 0.05);
    add('bumperF', bf, this.bumperMat);
    const br = roundedBox(W * 0.96, bh, 0.16, 0.05, 2);
    br.translate(0, bottom + bh * 0.62, zR + 0.05);
    add('bumperR', br, this.bumperMat);
    // grille
    const gw = W * (md.type === 'super' || md.type === 'hyper' ? 0.5 : 0.42), gh = Math.max(0.08, (yNose - bottom) * (md.type === 'super' || md.type === 'hyper' ? 0.28 : 0.42));
    const grille = new THREE.PlaneGeometry(gw, gh); grille.translate(0, bottom + bh + gh * 0.55, zF + 0.002);
    add('grille', grille, mats.grille).castShadow = false;
    // lights
    const old = !md.sport && (md.type === 'hatch' || md.type === 'wagon' || md.type === 'pickup' || md.type === 'sedan' || md.type === 'coupe' || md.type === 'muscle');
    this.lightMatL = mats.headlight.clone(); this.lightMatR = mats.headlight.clone();
    const ly = Math.max(bottom + bh + 0.1, yNose - 0.12), lx = half - cr * 0.55 - 0.12;
    for (const [sgn, sfx, m] of [[1, 'L', this.lightMatL], [-1, 'R', this.lightMatR]]) {
      let geo;
      if (old) { geo = new THREE.CylinderGeometry(0.085, 0.085, 0.05, 18); geo.rotateX(Math.PI / 2); }
      else { geo = roundedBox(0.3, 0.09, 0.05, 0.02, 1); }
      geo.translate(sgn * lx, ly, zF - 0.01 - (md.type === 'super' || md.type === 'hyper' ? 0.05 : 0));
      add('light' + sfx, geo, m).castShadow = false;
    }
    this.headPos = [lx, ly, zF];
    this.tailMat = mats.taillight.clone();
    const tl = [];
    for (const sgn of [1, -1]) { const t = roundedBox(0.24, 0.1, 0.04, 0.015, 1); t.translate(sgn * (half - cr * 0.5 - 0.1), Math.max(bottom + bh + 0.08, yTail - 0.12), zR + 0.012); tl.push(t); }
    add('tail', mergeGeometries(tl), this.tailMat).castShadow = false;
    // plates
    const plateMat = new THREE.MeshStandardMaterial({ map: TX.plateTexture(plateText(car.id)), roughness: 0.6 });
    const pf = new THREE.PlaneGeometry(0.42, 0.11); pf.translate(0, bottom + bh * 0.62, zF + 0.06);
    add('plateF', pf, plateMat).castShadow = false;
    const pr = new THREE.PlaneGeometry(0.42, 0.11); pr.rotateY(Math.PI); pr.translate(0, bottom + bh + 0.1, zR - 0.004);
    add('plateR', pr, plateMat).castShadow = false;
    // mirrors
    const mg = [];
    for (const sgn of [1, -1]) {
      const m = roundedBox(0.16, 0.1, 0.07, 0.02, 1); m.translate(sgn * (width(uz(ws)) + 0.08), yBelt + 0.1, uz(ws) - 0.12); mg.push(m);
      const st = new THREE.BoxGeometry(0.1, 0.03, 0.03); st.translate(sgn * (width(uz(ws)) + 0.02), yBelt + 0.07, uz(ws) - 0.12); mg.push(st);
    }
    add('mirrors', mergeGeometries(mg.map((g) => g.index ? g.toNonIndexed() : g)), this.trimMat);
    // door handles
    const dh = [];
    for (const sgn of [1, -1]) { const h = new THREE.BoxGeometry(0.02, 0.03, 0.14); h.translate(sgn * (half + 0.005), yBelt - 0.08, uz(lerp(doorR, fenderStart, 0.25))); dh.push(h); }
    add('handles', mergeGeometries(dh), mats.chrome).castShadow = false;

    // interior
    const ig = [];
    const zDash = uz(ws) - 0.25;
    const dash = new THREE.BoxGeometry(W * 0.84, 0.18, 0.35); dash.translate(0, yBelt - 0.02, zDash); ig.push(dash);
    for (const sgn of [1, -1]) {
      const seat = roundedBox(0.46, 0.16, 0.48, 0.05, 1); seat.translate(sgn * W * 0.22, bottom + 0.3 + (yBelt - bottom) * 0.15, zDash - 0.75); ig.push(seat);
      const back = roundedBox(0.44, 0.6, 0.14, 0.05, 1); back.rotateX(-0.25); back.translate(sgn * W * 0.22, bottom + 0.62 + (yBelt - bottom) * 0.15, zDash - 1.02); ig.push(back);
    }
    add('interior', mergeGeometries(ig.map((g) => g.index ? g.toNonIndexed() : g)), mats.seat).castShadow = false;
    const sw = new THREE.TorusGeometry(0.17, 0.02, 6, 20); sw.rotateX(-0.45); sw.translate(W * 0.22, yBelt + 0.06, zDash - 0.24);
    add('steering', sw, mats.plastic).castShadow = false;
    this.eye = [W * 0.22, yBelt + 0.32, zDash - 0.85];
    this.hoodEye = [0, yNose + 0.25, uz(lerp(ws, 1, 0.3))];
    }

    // engine bay (seen when the hood is open in the garage)
    this.engineBay = this.buildEngineBay(uz(ws), zF, yBelt, bottom, half, md);
    this.group.add(this.engineBay);

    // wheels
    const tw = r * (md.type === 'monster' ? 0.95 : md.type === 'beast' || md.type === 'baja' ? 0.75 : 0.66);
    this.wheelWidth = tw;
    this.wheels = [];
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0;
      const wg = buildWheel(r, tw, md.rim, 'street', md.sport);
      if (!left) wg.userData.spin.rotation.y = Math.PI, wg.userData.caliper.scale.x = -1;
      const pivot = new THREE.Group();
      pivot.add(wg);
      pivot.position.set((left ? 1 : -1) * ph.track / 2, wcY, front ? a : -b);
      this.group.add(pivot);
      this.wheels.push({ pivot, wg, front, left });
    }
    // suspension struts (visible on lifted trucks / through wheels)
    const strut = [];
    for (const w of this.wheels) {
      const x = w.pivot.position.x * 0.82, z = w.pivot.position.z;
      strut.push(beam([x, wcY, z], [x * 0.92, Math.min(yBelt, wcY + r + 0.25), z], 0.035, 6));
    }
    add('struts', mergeGeometries(strut), mats.darkSteel.clone()).castShadow = false;
    this.strutMat = P.struts.material;

    // extras from the model definition
    this.extras = new THREE.Group();
    this.group.add(this.extras);
    this.buildExtras(md, uz, width, topY);

    // collect deformables: store original positions
    this.deform = ['hood', 'fenderFL', 'fenderFR', 'doorL', 'doorR', 'quarterL', 'quarterR', 'trunk', 'roof', 'fascia', 'rearPanel', 'bumperF', 'bumperR', 'glass', 'pillars']
      .map((n) => P[n]).filter(Boolean);
    for (const m of this.deform) m.userData.orig = m.geometry.attributes.position.array.slice();
    // smoke / exhaust anchor points (local)
    this.enginePos = new THREE.Vector3(0, yNose + 0.05, lerp(uz(ws), zF, 0.5));
  }

  // Body, glass, lights and interior from the Blender export (assets/models/cars.glb).
  buildAssetBody(A, add) {
    const md = this.car.model;
    const M = assetMats();
    this.lightMatL = mats.headlight.clone(); this.lightMatR = mats.headlight.clone();
    this.tailMat = mats.taillight.clone();
    this.glassMat = mats.glass; mats.glass.side = THREE.DoubleSide;
    this.crackMat = mats.crack.clone();
    const plateTex = TX.plateTexture(plateText(this.car.id)).clone();
    plateTex.flipY = false; plateTex.needsUpdate = true;
    const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.6 });
    const sportBody = md.sport || md.type === 'super' || md.type === 'hyper' || md.type === 'sports';
    this.bumperMat = md.chrome ? mats.chrome : sportBody ? this.paintMat : this.trimMat;
    const matFor = (kind, part) => {
      switch (kind) {
        case 'paint': return md.wear > 0.5 && part === 'fenderFR' ? this.oddMat : this.paintMat;
        case 'bumper': return this.bumperMat;
        case 'trim': return M.trim;
        case 'chrome': return mats.chrome;
        case 'glass': return this.glassMat;
        case 'headlight': return part === 'lightR' ? this.lightMatR : this.lightMatL;
        case 'taillight': return this.tailMat;
        case 'amber': return M.amber;
        case 'grille': return M.grille;
        case 'plate': return plateMat;
        case 'under': case 'wells': return M.under;
        case 'dash': return M.dash;
        case 'cabin': return M.cabin;
        case 'seat': return M.seat;
        case 'gauges': return this.gaugeMaterial();
        case 'mirror': return mats.chrome;
        default: return this.paintMat;
      }
    };
    const hinge = A.nodes.hoodHinge || new THREE.Vector3(0, this.dims.yBelt, 0);
    const hoodPivot = new THREE.Group();
    hoodPivot.position.copy(hinge);
    this.group.add(hoodPivot);
    this.hoodPivot = hoodPivot;
    const noShadow = new Set(['glass', 'lightL', 'lightR', 'tail', 'amber', 'plateF', 'plateR', 'gauges', 'seals', 'mirrorGlass', 'grille', 'under', 'cabin']);
    for (const [name, pt] of Object.entries(A.parts)) {
      const geo = pt.geometry.clone();
      if (name === 'hood') geo.translate(-hinge.x, -hinge.y, -hinge.z);
      const m = add(name, geo, matFor(pt.material, name), name === 'hood' ? hoodPivot : this.group);
      if (noShadow.has(name)) m.castShadow = false;
    }
    const P = this.parts;
    // windscreen crack overlay
    if (P.glass) {
      const cg = P.glass.geometry.clone(); cg.scale(1.004, 1.004, 1.002);
      add('crack', cg, this.crackMat).castShadow = false;
    }
    // weight reduction strips the seats; the dash stays
    P.interior = P.seats || new THREE.Group();
    for (const n of ['dash', 'interiorShell']) if (P[n]) P[n].castShadow = false;
    // steering wheel keeps its hub transform: it turns about its own z axis
    if (A.steering) {
      const sw = new THREE.Mesh(A.steering.geometry.clone(), M.dash);
      A.steering.matrix.decompose(sw.position, sw.quaternion, sw.scale);
      sw.name = 'steering';
      this.group.add(sw);
      P.steering = sw;
      this.steerBase = sw.quaternion.clone();
    }
    const e = A.nodes.eye, he = A.nodes.hoodEye;
    this.eye = e ? [e.x, e.y, e.z] : [this.dims.W * 0.22, this.dims.yBelt + 0.32, 0];
    this.hoodEye = he ? [he.x, he.y, he.z] : [0, this.dims.yNose + 0.25, this.dims.zF - 1];
    const lb = P.lightL ? new THREE.Box3().setFromBufferAttribute(P.lightL.geometry.attributes.position) : null;
    this.headPos = lb ? [(lb.min.x + lb.max.x) / 2, (lb.min.y + lb.max.y) / 2, lb.max.z] : [this.dims.half * 0.6, this.dims.yNose, this.dims.zF];
    // minimal stand-ins so the shared code paths keep working
    if (!P.bumperF) P.bumperF = add('bumperF', new THREE.BufferGeometry(), this.bumperMat);
    if (!P.bumperR) P.bumperR = add('bumperR', new THREE.BufferGeometry(), this.bumperMat);
  }

  // Twin stripes / livery bands lifted off the hood, roof and trunk surfaces.
  buildAssetStripes(md) {
    const mat = new THREE.MeshPhysicalMaterial({ color: md.livery || md.stripes, roughness: 0.35, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    this.liveryMat = mat;
    const sw = md.livery ? 0.24 : 0.13, gap = 0.06;
    for (const name of ['hood', 'roof', 'trunk']) {
      const part = this.parts[name];
      if (!part) continue;
      const g = part.geometry, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
      const out = [];
      const n = idx ? idx.count : pos.count;
      // clip each triangle to the two stripe bands (x in [gap, gap+sw] and mirrored)
      const clip = (poly, k, v, keepAbove) => {
        const res = [];
        for (let i = 0; i < poly.length; i++) {
          const A = poly[i], B = poly[(i + 1) % poly.length];
          const ia = keepAbove ? A[k] >= v : A[k] <= v, ib = keepAbove ? B[k] >= v : B[k] <= v;
          if (ia) res.push(A);
          if (ia !== ib) { const t = (v - A[k]) / (B[k] - A[k]); res.push(A.map((q, j) => q + (B[j] - q) * t)); }
        }
        return res;
      };
      const vtx = (id) => [pos.getX(id), pos.getY(id), pos.getZ(id), nor.getX(id), nor.getY(id), nor.getZ(id)];
      for (let i = 0; i < n; i += 3) {
        const tri = [0, 1, 2].map((k) => vtx(idx ? idx.getX(i + k) : i + k));
        for (const sgn of [1, -1]) {
          const lo = sgn > 0 ? gap : -gap - sw, hi = sgn > 0 ? gap + sw : -gap;
          let poly = clip(clip(tri, 0, lo, true), 0, hi, false);
          for (let k = 1; k + 1 < poly.length; k++) {
            for (const q of [poly[0], poly[k], poly[k + 1]]) out.push(q[0] + q[3] * 0.004, q[1] + q[4] * 0.004, q[2] + q[5] * 0.004);
          }
        }
      }
      if (!out.length) continue;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      sg.computeVertexNormals();
      const m = new THREE.Mesh(sg, mat);
      m.name = 'livery_' + name;
      part.add(m);
    }
  }

  // Instrument cluster drawn on a canvas (only refreshed while the cockpit view is used).
  gaugeMaterial() {
    if (this.gauge) return this.gauge.mat;
    const c = document.createElement('canvas'); c.width = 512; c.height = 208;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.35 });
    this.gauge = { c, g: c.getContext('2d'), tex, mat, t: 0 };
    this.drawGauges(0, 0, 1, 0.4, 1, 0);
    return mat;
  }

  drawGauges(kmh, rpmF, fuelF, heat, gear, redF) {
    const G = this.gauge; if (!G) return;
    const g = G.g, W = 512, H = 208;
    g.fillStyle = '#07080a'; g.fillRect(0, 0, W, H);
    const top = Math.max(120, Math.ceil(((this.topKmh || 160) * 1.12) / 20) * 20);
    const dial = (cx, cy, R, frac, max, step, label, red) => {
      g.save(); g.translate(cx, cy);
      g.fillStyle = '#101216'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2a2d33'; g.lineWidth = 3; g.stroke();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      if (red) { g.strokeStyle = '#c0281c'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, R - 8, a0 + (a1 - a0) * red, a1); g.stroke(); }
      g.fillStyle = '#d8d4c8'; g.strokeStyle = '#d8d4c8'; g.font = '600 17px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = Math.round(max / step);
      for (let i = 0; i <= n * 2; i++) {
        const a = a0 + (a1 - a0) * i / (n * 2), major = i % 2 === 0;
        g.lineWidth = major ? 3 : 1.5;
        g.beginPath(); g.moveTo(Math.cos(a) * (R - 4), Math.sin(a) * (R - 4)); g.lineTo(Math.cos(a) * (R - (major ? 16 : 10)), Math.sin(a) * (R - (major ? 16 : 10))); g.stroke();
        if (major) g.fillText(String(Math.round(i / 2 * step * (max > 30 ? 1 : 1))), Math.cos(a) * (R - 30), Math.sin(a) * (R - 30));
      }
      g.font = '500 13px "Barlow Condensed", Arial'; g.fillStyle = '#8a8780'; g.fillText(label, 0, R * 0.42);
      const a = a0 + (a1 - a0) * Math.min(1.02, frac);
      g.strokeStyle = '#ff5a1e'; g.lineWidth = 4; g.beginPath(); g.moveTo(-Math.cos(a) * 12, -Math.sin(a) * 12); g.lineTo(Math.cos(a) * (R - 12), Math.sin(a) * (R - 12)); g.stroke();
      g.fillStyle = '#1c1e22'; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    const redline = (this.ph.engine && this.ph.engine.redline) || 7000;
    const rmax = Math.ceil(redline / 1000 + 1);
    dial(140, 104, 96, kmh / top, top, top > 260 ? 60 : top > 150 ? 40 : 20, 'KM/H', 0);
    dial(372, 104, 96, rpmF * redline / 1000 / rmax, rmax, 1, 'x1000 RPM', redline / 1000 / rmax);
    g.fillStyle = '#e8e2d0'; g.font = '700 30px "Barlow Condensed", Arial'; g.textAlign = 'center';
    g.fillText(gear === -1 ? 'R' : gear === 0 ? 'N' : String(gear), 372, 150);
    g.font = '600 22px "Barlow Condensed", Arial'; g.fillText(String(Math.round(kmh)), 140, 150);
    // fuel + temperature bars between the dials
    const bar = (x, f, col) => { g.fillStyle = '#1a1c20'; g.fillRect(x, 40, 10, 120); g.fillStyle = col; g.fillRect(x, 40 + 120 * (1 - f), 10, 120 * f); };
    bar(248, Math.max(0, Math.min(1, fuelF)), fuelF < 0.15 ? '#e0402a' : '#d8c890');
    bar(262, Math.max(0, Math.min(1, heat)), heat > 0.85 ? '#e0402a' : '#7fb0d8');
    G.tex.needsUpdate = true;
  }

  buildEngineBay(z0, z1, yBelt, bottom, half, md) {
    const g = new THREE.Group();
    const zc = (z0 + z1) / 2, len = (z1 - z0) * 0.62;
    const eb = new THREE.Group();
    const block = new THREE.Mesh(roundedBox(half * 0.9, (yBelt - bottom) * 0.55, len * 0.7, 0.04, 1), mats.engine);
    block.position.set(0, bottom + (yBelt - bottom) * 0.5, zc - 0.02);
    const cover = new THREE.Mesh(roundedBox(half * 0.7, 0.08, len * 0.6, 0.03, 1), new THREE.MeshStandardMaterial({ color: md.sport ? 0x8a1a14 : 0x2a2b2d, roughness: 0.4, metalness: 0.6 }));
    cover.position.set(0, block.position.y + (yBelt - bottom) * 0.3, zc - 0.02);
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 18), mats.engineDark);
    filter.position.set(half * 0.45, yBelt - 0.12, zc + len * 0.2);
    const battery = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.16), mats.plastic);
    battery.position.set(-half * 0.6, yBelt - 0.2, zc + len * 0.25);
    const radiator = new THREE.Mesh(new THREE.BoxGeometry(half * 1.4, (yBelt - bottom) * 0.5, 0.05), mats.engineDark);
    radiator.position.set(0, bottom + (yBelt - bottom) * 0.5, z1 - 0.22);
    eb.add(block, cover, filter, battery, radiator);
    this.engineParts = { block, cover, filter, radiator };
    g.add(eb);
    g.visible = false;
    return g;
  }

  buildExtras(md, uz, width, topY) {
    const ex = this.extras, d = this.dims;
    if (md.rack) {
      const rg = [];
      const y = d.roof + 0.06;
      const z0 = uz(this.T.roofR + 0.02), z1 = uz(this.T.roofF - 0.03), w = d.half * this.T.tumble * 0.9;
      for (const sgn of [1, -1]) rg.push(beam([sgn * w, y, z0], [sgn * w, y, z1], 0.018, 5));
      for (let k = 0; k <= 3; k++) { const z = lerp(z0, z1, k / 3); rg.push(beam([w, y, z], [-w, y, z], 0.015, 5)); }
      for (const sgn of [1, -1]) for (const z of [z0, z1]) rg.push(beam([sgn * w, y, z], [sgn * w * 0.98, y - 0.06, z], 0.015, 4));
      const m = new THREE.Mesh(mergeGeometries(rg), mats.darkSteel); m.castShadow = true; ex.add(m);
      this.rackY = y; this.rackZ = [z0, z1]; this.rackW = w;
    }
    if (md.spare) {
      const sp = buildWheel(d.r * 0.95, this.wheelWidth * 0.9, md.rim, 'at', false);
      sp.rotation.y = Math.PI / 2; sp.position.set(0, d.bottom + d.H * 0.45, d.zR - 0.12);
      ex.add(sp);
    }
    if (md.wing) {
      const big = md.wing === 2;
      const wg = [];
      const zt = d.zR + (big ? 0.25 : 0.12), yt = (this.T.back > 0.05 ? d.yTail : d.roof - 0.05) + (big ? 0.32 : 0.06);
      const wing = roundedBox(d.W * (big ? 0.95 : 0.9), 0.03, big ? 0.32 : 0.24, 0.012, 1); wing.translate(0, yt, zt);
      wg.push(ni(wing));
      for (const sgn of [1, -1]) {
        const ep = new THREE.BoxGeometry(0.02, big ? 0.16 : 0.12, big ? 0.36 : 0.28); ep.translate(sgn * d.W * (big ? 0.475 : 0.45), yt, zt); wg.push(ni(ep));
        if (big) { const st = new THREE.BoxGeometry(0.03, 0.32, 0.08); st.translate(sgn * d.W * 0.25, yt - 0.16, zt + 0.04); wg.push(ni(st)); }
      }
      const m = new THREE.Mesh(mergeGeometries(wg), big ? mats.carbon : this.paintMat); m.castShadow = true; ex.add(m);
    }
    if (md.flares || md.type === 'baja' || md.type === 'beast') {
      const fg = [];
      for (const ax of [d.a, -d.b]) for (const sgn of [1, -1]) {
        const t = new THREE.TorusGeometry(d.archR * 1.02, 0.045, 5, 12, Math.PI);
        t.scale(1, 1, 1.6);
        t.rotateY(Math.PI / 2);
        t.translate(sgn * (d.half + 0.02), d.wcY, ax);
        fg.push(t);
      }
      const m = new THREE.Mesh(mergeGeometries(fg), mats.plastic); m.castShadow = true; ex.add(m);
    }
    if (md.lightbar) {
      const lb = new THREE.Group();
      const bar = new THREE.Mesh(roundedBox(d.W * 0.7, 0.07, 0.08, 0.02, 1), mats.darkSteel);
      lb.add(bar);
      for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), mats.headlight); l.rotation.x = Math.PI / 2; l.position.set((k - 1.5) * d.W * 0.17, 0, 0.045); lb.add(l); }
      lb.position.set(0, d.roof + 0.07, uz(this.T.roofF) - 0.05);
      ex.add(lb);
    }
    if (md.cage) this.cageForced = true;
    if ((md.livery || md.stripes) && this.fromAsset) this.buildAssetStripes(md);
    else if (md.livery || md.stripes) {
      const col = md.livery || md.stripes;
      const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, clearcoat: 1 });
      // twin stripes over hood and roof
      const segs = [];
      const strip = (u0, u1, x0, x1) => {
        const secs = [];
        for (let i = 0; i <= 8; i++) {
          const u = lerp(u0, u1, i / 8), z = uz(u), y = topY(u) + 0.03;
          secs.push([[x1, y, z], [x0, y, z]]);
        }
        return loft(secs);
      };
      const sw = md.livery ? 0.22 : 0.12;
      for (const sgn of [1, -1]) segs.push(strip(this.T.ws + 0.01, 0.97, sgn * 0.06, sgn * (0.06 + sw)));
      const m = new THREE.Mesh(mergeGeometries(segs), mat);
      m.name = 'livery';
      this.hoodPivot.updateMatrixWorld();
      // attach to hood pivot so it moves with the hood
      m.geometry.translate(-this.hoodPivot.position.x, -this.hoodPivot.position.y, -this.hoodPivot.position.z);
      this.hoodPivot.add(m);
      this.liveryMat = mat;
    }
    if (md.flamesColor) {
      const mat = new THREE.MeshStandardMaterial({ color: md.flamesColor, roughness: 0.4 });
      this.flameMat = mat;
    }
  }

  // --------------------------------------------------------------- upgrades
  setUpgrades(levels, tireId) {
    this.levels = { ...levels };
    this.tireId = tireId || this.tireId;
    const L = this.levels, d = this.dims, md = this.car.model;
    if (this.upg) { this.group.remove(this.upg); this.upg.traverse((o) => o.geometry && o.geometry.dispose()); }
    const g = (this.upg = new THREE.Group());
    this.group.add(g);
    const metal = mats.darkSteel;
    const armor = L.armor || 0, eng = L.engine || 0, fuel = L.fuel || 0, cool = L.cooling || 0, turbo = L.turbo || 0, wgt = L.weight || 0, br = L.brakes || 0;
    const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; g.add(m); return m; };
    // armour
    if (armor >= 1) this.parts.bumperF.material = this.parts.bumperR.material = armor >= 13 ? mats.darkSteel : this.bumperMat === mats.chrome && armor < 3 ? mats.chrome : mats.galv;
    else this.parts.bumperF.material = this.parts.bumperR.material = this.bumperMat;
    if (armor >= 2) { const s = new THREE.BoxGeometry(d.W * 0.7, 0.02, 0.9); s.translate(0, d.bottom + 0.005, d.zF - 0.55); add(s, mats.galv); }
    if (armor >= 4) {
      const bb = [];
      const y0 = d.bottom + 0.1, y1 = d.yNose + 0.05, z = d.zF + 0.16, w = d.half * 0.75;
      for (const sgn of [1, -1]) { bb.push(beam([sgn * w, y0, z - 0.1], [sgn * w, y1, z], 0.03)); bb.push(beam([sgn * w, y1, z], [sgn * w * 0.4, y1 + 0.05, z - 0.02], 0.03)); }
      bb.push(beam([-w, (y0 + y1) / 2, z - 0.05], [w, (y0 + y1) / 2, z - 0.05], 0.03));
      bb.push(beam([-w * 0.4, y1 + 0.05, z - 0.02], [w * 0.4, y1 + 0.05, z - 0.02], 0.03));
      add(mergeGeometries(bb), metal);
    }
    if (armor >= 6 || this.cageForced) {
      const cg = [];
      const zs = [this.ghZ(this.T.roofR + 0.03), this.ghZ(this.T.roofF - 0.02)];
      const yb = d.yBelt - 0.25, yt = d.roof - 0.06, w = d.half * this.T.tumble * 0.85;
      const full = armor >= 8 || this.cageForced;
      for (const z of full ? zs : [zs[0] + 0.15]) { cg.push(beam([w, yb, z], [w, yt, z], 0.022)); cg.push(beam([-w, yb, z], [-w, yt, z], 0.022)); cg.push(beam([w, yt, z], [-w, yt, z], 0.022)); }
      if (full) { for (const sgn of [1, -1]) cg.push(beam([sgn * w, yt, zs[0]], [sgn * w, yt, zs[1]], 0.022)); cg.push(beam([w, yb, zs[0]], [-w, yt, zs[0]], 0.02)); }
      add(mergeGeometries(cg), new THREE.MeshStandardMaterial({ color: md.cage ? 0x1a1a1a : 0x8a1d18, roughness: 0.5, metalness: 0.5 }));
    }
    if (armor >= 12) {
      for (const sgn of [1, -1]) {
        const p = roundedBox(0.02, (d.yBelt - d.bottom) * 0.45, (d.a + d.b) * 0.55, 0.01, 1);
        p.translate(sgn * (d.half + 0.02), d.bottom + (d.yBelt - d.bottom) * 0.42, (d.a - d.b) / 2 - 0.1);
        add(p, mats.darkSteel);
      }
    }
    // exhaust
    while (this.exhaustGroup.children.length) this.exhaustGroup.remove(this.exhaustGroup.children[0]);
    const exR = 0.03 + Math.min(0.03, eng * 0.002) + (md.sport ? 0.012 : 0);
    const tips = eng >= 10 || md.sport || md.type === 'muscle' ? [-1, 1] : [-1];
    for (const sgn of tips) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(exR, exR * 0.9, 0.28, 12, 1, true), eng >= 4 || md.sport ? mats.chrome : mats.rusty);
      t.rotation.x = Math.PI / 2; t.position.set(sgn * d.half * 0.55, d.bottom + 0.08, d.zR - 0.04);
      this.exhaustGroup.add(t);
    }
    this.exhaustTips = tips.map((sgn) => new THREE.Vector3(sgn * d.half * 0.55, d.bottom + 0.08, d.zR - 0.18));
    // hood scoop / vents (on the hood pivot)
    if (this.hoodExtras) this.hoodPivot.remove(this.hoodExtras);
    this.hoodExtras = new THREE.Group();
    this.hoodPivot.add(this.hoodExtras);
    const hp = this.hoodPivot.position;
    const hoodLen = d.zF - hp.z;
    if (eng >= 14 || turbo >= 10) {
      const s = roundedBox(d.W * 0.26, 0.08, hoodLen * 0.4, 0.03, 1);
      s.translate(0, 0.07 - (hoodLen * 0.32) * Math.tan(0.06), hoodLen * 0.4);
      const m = new THREE.Mesh(s, this.paintMat); m.castShadow = true; this.hoodExtras.add(m);
    }
    if (cool >= 5) for (const sgn of [1, -1]) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), mats.grille);
      v.rotation.x = -Math.PI / 2 + 0.05; v.position.set(sgn * d.W * 0.22, 0.03 - 0.02, hoodLen * 0.32);
      this.hoodExtras.add(v);
    }
    // carbon parts from weight reduction
    this.parts.hood.material = wgt >= 8 ? mats.carbon : this.paintMat;
    if (this.parts.roof) this.parts.roof.material = wgt >= 12 ? mats.carbon : this.paintMat;
    if (this.parts.trunk) this.parts.trunk.material = wgt >= 10 ? mats.carbon : this.paintMat;
    this.parts.interior.visible = wgt < 9;
    // fuel: roof cans
    if (fuel >= 4) {
      const cans = fuel >= 10 ? 4 : fuel >= 6 ? 2 : 1;
      const y = (this.rackY || d.roof + 0.04) + 0.14;
      for (let k = 0; k < cans; k++) {
        const c = new THREE.Mesh(roundedBox(0.16, 0.26, 0.34, 0.02, 1), mats.fuelCan);
        c.position.set((k % 2 ? -1 : 1) * 0.22, y, this.ghZ(lerp(this.T.roofR, this.T.roofF, 0.3)) - Math.floor(k / 2) * 0.38);
        c.castShadow = true; g.add(c);
      }
      if (!this.rackY) { const p = new THREE.BoxGeometry(0.8, 0.02, 0.9); p.translate(0, d.roof + 0.03, this.ghZ(lerp(this.T.roofR, this.T.roofF, 0.3)) - 0.2); add(p, mats.darkSteel); }
    }
    // turbo + intercooler
    this.engineParts.filter.visible = turbo === 0;
    if (this.turboMesh) this.engineBay.remove(this.turboMesh);
    if (turbo >= 1 || this.car.sound.turbo) {
      const tm = new THREE.Group();
      const snail = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.04, 8, 14), mats.steel);
      snail.position.set(d.half * 0.45, d.yBelt - 0.15, this.engineParts.block.position.z + 0.1);
      const pipe = new THREE.Mesh(beam([d.half * 0.45, d.yBelt - 0.15, this.engineParts.block.position.z + 0.1], [0, d.yBelt - 0.1, d.zF - 0.3], 0.035), mats.steel);
      tm.add(snail, pipe);
      this.turboMesh = tm;
      this.engineBay.add(tm);
      if (turbo >= 3) {
        const ic = new THREE.Mesh(new THREE.BoxGeometry(d.W * 0.5, 0.14, 0.04), mats.steel);
        ic.position.set(0, d.bottom + 0.3, d.zF - 0.06);
        g.add(ic);
      }
    }
    // brakes: calipers colour up with level
    const calCol = br >= 15 ? 0xd0a020 : br >= 8 ? 0xb31d17 : br >= 3 ? 0x5a5a5a : 0x3a3a3a;
    for (const w of this.wheels) { w.wg.userData.caliperMat.color.setHex(calCol); w.wg.userData.caliper.scale.setScalar(1 + Math.min(0.4, br * 0.025)); }
    // tyres
    const tk = { worn: 'street', street: 'street', perf: 'perf', at: 'at', offroad: 'offroad', snow: 'snow', race: 'race' }[this.tireId] || 'street';
    for (const w of this.wheels) {
      const m = w.wg.userData.tireMat;
      m.map = TX.tireTexture(tk); m.bumpMap = m.map;
      m.color.setHex(this.tireId === 'worn' ? 0xb0aca4 : 0xffffff);
      m.needsUpdate = true;
      w.wg.userData.tire.scale.set(tk === 'offroad' ? 1.12 : tk === 'perf' || tk === 'race' ? 1.06 : 1, 1, 1);
    }
    // suspension colour
    this.strutMat.color.setHex((L.suspension || 0) >= 10 ? 0xc9a227 : (L.suspension || 0) >= 7 ? 0x2a5aa0 : 0x2c2e30);
  }

  ghZ(u) { return this.dims.zR + u * this.dims.L; }

  setPaint(color, finish) {
    const md = this.car.model;
    const c = color ?? md.paint;
    const fresh = makePaint(c, finish || (md.sport ? 'metallic' : 'solid'), {});
    fresh.userData.wear = this.paintMat.userData.wear;
    const old = this.paintMat;
    this.group.traverse((o) => { if (o.isMesh && o.material === old) o.material = fresh; });
    if (this.oddMat === old) this.oddMat = fresh;
    this.paintMat = fresh;
    old.dispose();
  }

  // --------------------------------------------------------------- damage
  resetDamage() {
    for (const m of this.deform || []) {
      const p = m.geometry.attributes.position;
      p.array.set(m.userData.orig);
      p.needsUpdate = true;
      m.geometry.computeVertexNormals();
      m.visible = true;
      if (m.userData.detached) { m.userData.detached = false; }
    }
    if (this.parts.bumperF.parent !== this.group) this.group.add(this.parts.bumperF);
    if (this.parts.bumperR.parent !== this.group) this.group.add(this.parts.bumperR);
    this.parts.bumperF.position.set(0, 0, 0); this.parts.bumperF.rotation.set(0, 0, 0);
    this.parts.bumperR.position.set(0, 0, 0); this.parts.bumperR.rotation.set(0, 0, 0);
    this.parts.lightL.material = this.lightMatL; this.parts.lightR.material = this.lightMatR;
    this.crackMat.opacity = 0;
    const md = this.car.model;
    this.wear = { dirt: md.wear * 0.25, rust: md.rust || 0, scratch: md.wear * 0.35 };
    this.applyWear();
    this.hood = 0;
  }

  applyWear() {
    for (const m of [this.paintMat, this.oddMat, this.trimMat]) {
      setWear(m, 'uDirt', this.wear.dirt); setWear(m, 'uRust', m === this.trimMat ? 0 : this.wear.rust); setWear(m, 'uScratch', this.wear.scratch * (m === this.trimMat ? 0.4 : 1));
    }
  }

  // Bots: fold every static body part into one mesh per material (≈70 → ≈20 draw calls),
  // drop hidden parts and give up dents / falling parts, which only the player needs.
  bake() {
    if (this.baked) return;
    this.baked = true;
    this.group.updateMatrixWorld(true);
    const lights = [this.parts.lightL, this.parts.lightR].filter(Boolean);
    const stops = new Set([...this.wheels.map((w) => w.pivot), ...lights]);
    bakeInto(this.group, stops);
    for (const l of lights) if (l.parent !== this.group) this.group.attach(l);
    for (const w of this.wheels) {
      const spin = w.wg.userData.spin;
      bakeInto(w.wg, new Set([spin]));
      bakeInto(spin, new Set());
      w.wg.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    }
    this.deform = [];
    this.engineBay.visible = false;
  }

  // Dent the panels around a local impact point.
  dent(lx, ly, lz, amount) {
    if (this.baked) return;
    const radius = 0.35 + Math.min(1.1, amount * 3);
    const depth = Math.min(0.2, amount * 0.55);
    const r2 = radius * radius;
    const hp = this.hoodPivot.position;
    for (const m of this.deform) {
      if (!m.visible) continue;
      const off = m.parent === this.hoodPivot ? hp : null;
      const px = lx - (off ? off.x : 0), py = ly - (off ? off.y : 0), pz = lz - (off ? off.z : 0);
      const pos = m.geometry.attributes.position, a = pos.array, o = m.userData.orig;
      let touched = false;
      for (let i = 0; i < a.length; i += 3) {
        const dx = a[i] - px, dy = a[i + 1] - py, dz = a[i + 2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const f = 1 - Math.sqrt(d2) / radius;
        // push towards the car's centre line (and a little noise for crumple)
        const cx = -(a[i] + (off ? off.x : 0)), cy = -(a[i + 1] + (off ? off.y : 0)) * 0.3, cz = -(a[i + 2] + (off ? off.z : 0));
        const cl = Math.hypot(cx, cy, cz) || 1;
        const n = Math.sin(a[i] * 37 + a[i + 2] * 23) * 0.35 + 0.8;
        const k = depth * f * f * n;
        a[i] += (cx / cl) * k; a[i + 1] += (cy / cl) * k - k * 0.15; a[i + 2] += (cz / cl) * k;
        // cap total deformation
        const ox = a[i] - o[i], oy = a[i + 1] - o[i + 1], oz = a[i + 2] - o[i + 2];
        const ol = Math.hypot(ox, oy, oz);
        if (ol > 0.28) { const s = 0.28 / ol; a[i] = o[i] + ox * s; a[i + 1] = o[i + 1] + oy * s; a[i + 2] = o[i + 2] + oz * s; }
        touched = true;
      }
      if (touched) { pos.needsUpdate = true; m.geometry.computeVertexNormals(); }
    }
  }

  // Visual damage state from the physics damage model.
  syncDamage(dmg) {
    if (this.baked) {
      this.parts.lightL.material = dmg.lightL < 0.4 ? mats.headlightBroken : this.lightMatL;
      this.parts.lightR.material = dmg.lightR < 0.4 ? mats.headlightBroken : this.lightMatR;
      this.crackMat.opacity = [0, 0.45, 0.75, 1][Math.min(3, dmg.glass)];
      return;
    }
    this.parts.lightL.material = dmg.lightL < 0.4 ? mats.headlightBroken : this.lightMatL;
    this.parts.lightR.material = dmg.lightR < 0.4 ? mats.headlightBroken : this.lightMatR;
    this.crackMat.opacity = [0, 0.45, 0.75, 1][Math.min(3, dmg.glass)];
    const avg = (dmg.front + dmg.rear + dmg.left + dmg.right) / 4;
    this.wear.scratch = Math.max(this.wear.scratch, (1 - avg) * 1.4);
    // hanging bumper
    if (dmg.bumperF < 0.6 && dmg.bumperF > 0 && this.parts.bumperF.parent === this.group) {
      this.parts.bumperF.rotation.z = (0.6 - dmg.bumperF) * 0.35;
      this.parts.bumperF.position.y = -(0.6 - dmg.bumperF) * 0.12;
    }
    if (dmg.bumperR < 0.6 && dmg.bumperR > 0 && this.parts.bumperR.parent === this.group) {
      this.parts.bumperR.rotation.z = -(0.6 - dmg.bumperR) * 0.3;
      this.parts.bumperR.position.y = -(0.6 - dmg.bumperR) * 0.1;
    }
    this.applyWear();
  }

  // Detach a part and hand it to the caller (as a world-space mesh for debris physics).
  detach(name) {
    if (this.baked) return null;
    const m = this.parts[name];
    if (!m || m.parent !== this.group) return null;
    m.updateMatrixWorld();
    const clone = new THREE.Mesh(m.geometry.clone(), m.material);
    clone.castShadow = true;
    m.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    this.group.remove(m);
    return clone;
  }

  // --------------------------------------------------------------- per-frame
  // `v` is the physics Vehicle; this maps wheel travel, steer and spin.
  updateFromVehicle(v, dt) {
    for (let i = 0; i < 4; i++) {
      const w = v.wheels[i], mw = this.wheels[i];
      mw.pivot.position.y = w.my - (w.rest - w.comp);
      mw.pivot.rotation.y = w.steer + w.toe * 4;
      mw.pivot.rotation.z = (1 - w.health) * 0.12 * (w.left ? 1 : -1);
      mw.wg.userData.spin.rotation.x = w.angle;
    }
    // steering wheel + instruments
    if (this.parts.steering && this.steerBase) {
      const sw = this.parts.steering;
      sw.quaternion.copy(this.steerBase);
      sw.rotateZ(-(v.wheels[0].steer + v.wheels[1].steer) * 0.5 * 9);
    }
    if (this.cockpit && this.gauge) {
      this.gauge.t += dt;
      if (this.gauge.t > 0.066) {
        this.gauge.t = 0;
        const red = (this.ph.engine && this.ph.engine.redline) || 7000;
        this.drawGauges(Math.abs(v.kmh || 0), v.rpm / red, v.fuel / Math.max(1, v.p.fuel), v.heat, v.gear);
      }
    }
    // brake & reverse lights
    const braking = v.input.brake > 0.1 && v.gear !== -1;
    this.tailMat.emissiveIntensity = lerp(this.tailMat.emissiveIntensity, braking ? 2.2 : 0.35, 1 - Math.exp(-dt * 20));
    const lightsOn = this.lightsOn ? 2.5 : 0.18;
    this.lightMatL.emissiveIntensity = lightsOn; this.lightMatR.emissiveIntensity = lightsOn;
  }

  setStaticWheels(steer = 0) {
    for (const mw of this.wheels) { mw.pivot.position.y = this.dims.wcY; mw.pivot.rotation.y = mw.front ? steer : 0; }
  }

  openHood(t) {
    this.hood = t;
    this.hoodPivot.rotation.x = -t * 1.05;
    this.engineBay.visible = t > 0.01;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
      }
    });
    this.paintMat.dispose();
  }
}

let AM = null;
function assetMats() {
  if (AM) return AM;
  const ds = THREE.DoubleSide;
  AM = {
    trim: new THREE.MeshStandardMaterial({ color: 0x141415, roughness: 0.6, metalness: 0.1 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xc8720e, emissive: 0x7a3a00, emissiveIntensity: 0.3, roughness: 0.2 }),
    grille: mats.grille.clone(),
    under: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 1, side: ds }),
    // a little emissive stands in for the light bouncing around the cabin
    dash: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.7, side: ds, emissive: 0x1c1d20, emissiveIntensity: 0.9 }),
    cabin: new THREE.MeshStandardMaterial({ color: 0x3a3732, roughness: 0.95, side: ds, emissive: 0x3a3732, emissiveIntensity: 0.55 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x3a322b, roughness: 0.95, side: ds, emissive: 0x3a322b, emissiveIntensity: 0.5 }),
  };
  AM.grille.side = ds;
  return AM;
}

function plateText(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const L = 'ACDEFHKLMNPRSTVWX';
  return `${L[h % 17]}${L[(h >>> 5) % 17]} ${100 + (h % 900)}`;
}
