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

const TYPE = {
  hatch: { belt: 0.5, nose: 0.4, tail: 0.5, ws: 0.71, roofF: 0.56, roofR: 0.1, back: 0.015, tumble: 0.8, cr: 0.3 },
  wagon: { belt: 0.5, nose: 0.4, tail: 0.5, ws: 0.73, roofF: 0.6, roofR: 0.035, back: 0.005, tumble: 0.84, cr: 0.28 },
  sedan: { belt: 0.53, nose: 0.43, tail: 0.54, ws: 0.69, roofF: 0.57, roofR: 0.32, back: 0.21, tumble: 0.8, cr: 0.3 },
  coupe: { belt: 0.53, nose: 0.42, tail: 0.53, ws: 0.65, roofF: 0.52, roofR: 0.31, back: 0.15, tumble: 0.78, cr: 0.3 },
  pickup: { belt: 0.55, nose: 0.5, tail: 0.55, ws: 0.73, roofF: 0.64, roofR: 0.47, back: 0.44, tumble: 0.86, cr: 0.22, bed: 1 },
  suv: { belt: 0.53, nose: 0.47, tail: 0.53, ws: 0.75, roofF: 0.65, roofR: 0.04, back: 0.01, tumble: 0.88, cr: 0.22 },
  muscle: { belt: 0.55, nose: 0.46, tail: 0.56, ws: 0.63, roofF: 0.5, roofR: 0.31, back: 0.15, tumble: 0.78, cr: 0.26 },
  sports: { belt: 0.5, nose: 0.36, tail: 0.53, ws: 0.67, roofF: 0.51, roofR: 0.29, back: 0.1, tumble: 0.72, cr: 0.34 },
  baja: { belt: 0.55, nose: 0.5, tail: 0.5, ws: 0.73, roofF: 0.64, roofR: 0.5, back: 0.47, tumble: 0.84, cr: 0.25, bed: 1 },
  beast: { belt: 0.55, nose: 0.55, tail: 0.55, ws: 0.76, roofF: 0.68, roofR: 0.03, back: 0.01, tumble: 0.92, cr: 0.16 },
  super: { belt: 0.5, nose: 0.24, tail: 0.54, ws: 0.73, roofF: 0.57, roofR: 0.4, back: 0.15, tumble: 0.7, cr: 0.36 },
  hyper: { belt: 0.48, nose: 0.2, tail: 0.5, ws: 0.75, roofF: 0.59, roofR: 0.42, back: 0.18, tumble: 0.66, cr: 0.4 },
  monster: { belt: 0.55, nose: 0.5, tail: 0.55, ws: 0.73, roofF: 0.64, roofR: 0.47, back: 0.44, tumble: 0.86, cr: 0.22, bed: 1 },
};

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
    parts = { tire, barrel, face, disc, caliper, rr };
    wheelCache.set(key, parts);
  }
  const tireMat = new THREE.MeshStandardMaterial({ map: TX.tireTexture(tireKind), roughness: 0.9, bumpMap: TX.tireTexture(tireKind), bumpScale: 2 });
  const rimMat = new THREE.MeshStandardMaterial({ map: TX.rimTexture(rimStyle), alphaTest: 0.4, roughness: rimStyle === 'hubcap' || rimStyle === 'dish' ? 0.18 : 0.35, metalness: 0.85, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const spin = new THREE.Group();
  const tire = new THREE.Mesh(parts.tire, tireMat); tire.castShadow = true;
  const barrel = new THREE.Mesh(parts.barrel, mats.darkSteel);
  const face = new THREE.Mesh(parts.face, rimMat);
  spin.add(tire, barrel, face);
  const disc = new THREE.Mesh(parts.disc, mats.brakeDisc);
  spin.add(disc);
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.5 });
  const caliper = new THREE.Mesh(parts.caliper, caliperMat);
  g.add(spin, caliper);
  g.userData = { spin, face, caliper, caliperMat, tireMat, rimMat, tire };
  return g;
}

// ---------------------------------------------------------------- the car
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

    const L = md.len, W = md.wid;
    const a = ph.wb * (1 - ph.weightFront), b = ph.wb * ph.weightFront;
    const oh = L - ph.wb;
    const ohF = oh * (car.drive === 'FWD' ? 0.56 : md.type === 'super' || md.type === 'hyper' ? 0.45 : 0.5);
    const zF = a + ohF, zR = zF - L;
    const yG = -ph.cg;
    const lift = md.lift || 0;
    const bottom = yG + Math.max(ph.ground, 0.1) + (md.type === 'monster' ? 0 : 0);
    const roof = yG + md.hgt + (md.type === 'monster' ? lift * 0.6 : lift);
    const H = roof - bottom;
    const r = ph.r;
    const wcY = yG + r;
    const archR = r * 1.12 + (lift > 0.3 ? 0.08 : 0);
    const axles = [a, -b];
    const yBelt = bottom + H * T.belt, yNose = bottom + H * T.nose, yTail = bottom + H * T.tail;
    const half = W / 2;
    const cr = T.cr;
    this.dims = { L, W, zF, zR, yG, bottom, roof, H, yBelt, yNose, yTail, a, b, half, r, archR, wcY };

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
    // exhaust
    this.exhaustGroup = new THREE.Group();
    this.group.add(this.exhaustGroup);
    this.exhaustPos = [-half * 0.55, bottom + 0.08, zR - 0.05];

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
    if (md.livery || md.stripes) {
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
    const tips = eng >= 10 || md.type === 'muscle' || md.type === 'super' || md.type === 'hyper' ? [-1, 1] : [-1];
    for (const sgn of tips) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(exR, exR * 0.9, 0.28, 12, 1, true), eng >= 4 ? mats.chrome : mats.rusty);
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

  // Dent the panels around a local impact point.
  dent(lx, ly, lz, amount) {
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

function plateText(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const L = 'ACDEFHKLMNPRSTVWX';
  return `${L[h % 17]}${L[(h >> 5) % 17]} ${100 + (h % 900)}`;
}
