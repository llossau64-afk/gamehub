// Beard: a second cuttable hair surface that follows the jaw, cheeks and upper lip.
// Same shell renderer and length-map idea as the scalp, different parametrisation:
// u = angle around the face (front = 0), v = height in head space.
import * as THREE from 'three';
import { makeMaterial, MAX_LEN } from './hair.js';
import { clamp, lerp } from '../core/util.js';
import { getTemplate } from '../chars/template.js';

export const BW = 64, BH = 32;
const A = 105 * Math.PI / 180;      // angular half-width covered
const Y0 = -0.03, Y1 = 0.112;       // head-space height range

// head loft rings (from tools/blender/characters.py): y, rx (width), rz (depth), cz (front offset)
const RINGS = [[-0.03, 0.046, 0.048, -0.012], [-0.004, 0.046, 0.052, 0.010], [0.014, 0.056, 0.064, 0.024],
  [0.034, 0.070, 0.080, 0.016], [0.060, 0.081, 0.092, 0.008], [0.090, 0.087, 0.100, 0.002], [0.125, 0.089, 0.102, -0.005]];

export const BEARD_REGIONS = ['chin', 'cheeks', 'moustache', 'neck'];
export const BEARD_ID = { chin: 7, cheeks: 8, moustache: 9, neck: 10 };

function ringAt(y) {
  for (let i = 1; i < RINGS.length; i++) {
    if (y <= RINGS[i][0] || i === RINGS.length - 1) {
      const a = RINGS[i - 1], b = RINGS[i];
      const t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
      return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
    }
  }
  return RINGS[0].slice(1);
}

// The beard sits on the real skin: rays from the head's vertical axis outward hit the
// sculpted head mesh (bind pose, head-joint space); the distances are cached in a table.
const TA = 56, TY = 40;
let SKIN = null;
function skinTable() {
  if (SKIN !== null) return SKIN;
  SKIN = false;
  const T = getTemplate();
  if (!T) return SKIN;
  const hw = T.joints[T.jointIndex.get('Head')].world;
  const parts = T.pieces.filter((p) => /^M_(Head|Neck)(\b|_|$)/.test(p.name));
  if (!parts.length) return SKIN;
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = parts.map((p) => { const g = p.geometry.clone(); g.translate(-hw.x, -hw.y, -hw.z); return new THREE.Mesh(g, mat); });
  meshes.forEach((m) => m.updateMatrixWorld(true));
  const rc = new THREE.Raycaster();
  const tab = new Float32Array(TA * TY);
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  for (let j = 0; j < TY; j++) {
    const y = Y0 - 0.01 + (Y1 - Y0 + 0.02) * j / (TY - 1);
    for (let i = 0; i < TA; i++) {
      const a = -A - 0.1 + (2 * A + 0.2) * i / (TA - 1);
      d.set(Math.sin(a), 0, Math.cos(a));
      o.set(0, y, 0);
      rc.set(o, d); rc.far = 0.3;
      let far = 0;
      for (const m of meshes) for (const h of rc.intersectObject(m)) far = Math.max(far, h.distance);
      if (!far) { const [rx, rz, cz] = ringAt(y); far = Math.hypot(Math.sin(a) * rx, cz + Math.cos(a) * rz); }
      tab[j * TA + i] = far;
    }
  }
  meshes.forEach((m) => m.geometry.dispose());
  SKIN = tab;
  return SKIN;
}

function skinRadius(a, y) {
  const t = SKIN;
  const fi = clamp((a + A + 0.1) / (2 * A + 0.2) * (TA - 1), 0, TA - 1.001);
  const fj = clamp((y - (Y0 - 0.01)) / (Y1 - Y0 + 0.02) * (TY - 1), 0, TY - 1.001);
  const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
  const r00 = t[j * TA + i], r10 = t[j * TA + i + 1], r01 = t[(j + 1) * TA + i], r11 = t[(j + 1) * TA + i + 1];
  return lerp(lerp(r00, r10, u), lerp(r01, r11, u), v);
}

export function beardPoint(a, y, out = new THREE.Vector3(), inflate = 0.0012) {
  if (skinTable()) {
    const r = skinRadius(a, y) + inflate;
    return out.set(Math.sin(a) * r, y, Math.cos(a) * r);
  }
  const [rx, rz, cz] = ringAt(y);
  return out.set(Math.sin(a) * (rx + inflate), y, cz + Math.cos(a) * (rz + inflate));
}

// which zone a point belongs to (0 = bare skin)
export function beardRegion(a, y) {
  const d = Math.abs(a) * 180 / Math.PI;
  if (d > 100) return 0;
  const lips = d < 24 && y > 0.036 && y < 0.053;
  if (lips) return 0;
  if (y < 0.004) return BEARD_ID.neck;
  if (d < 30 && y >= 0.053 && y <= 0.064) return BEARD_ID.moustache;
  if (y > 0.064) return d > 70 && y < 0.106 ? BEARD_ID.cheeks : 0;   // sideburn strip
  if (d < 38 && y < 0.036) return BEARD_ID.chin;
  return BEARD_ID.cheeks;
}

const geoCache = new Map();
function buildGeometry(layers) {
  if (geoCache.has(layers)) return geoCache.get(layers);
  const NU = 40, NV = 24;
  const pos = [], nrm = [], tdn = [], uvs = [], lay = [], idx = [];
  const p = new THREE.Vector3(), pu = new THREE.Vector3(), pv = new THREE.Vector3(), n = new THREE.Vector3();
  const per = (NU + 1) * (NV + 1);
  for (let L = 0; L < layers; L++) {
    const h = layers === 1 ? 0 : L / (layers - 1);
    for (let j = 0; j <= NV; j++) {
      const y = Y0 + (Y1 - Y0) * j / NV;
      for (let i = 0; i <= NU; i++) {
        const a = -A + 2 * A * i / NU;
        beardPoint(a, y, p);
        beardPoint(a + 0.01, y, pu).sub(p);
        beardPoint(a, y + 0.002, pv).sub(p);
        n.crossVectors(pu, pv).normalize();
        if (n.dot(new THREE.Vector3(Math.sin(a), 0, Math.cos(a))) < 0) n.negate();
        pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z);
        pv.normalize().negate();
        tdn.push(pv.x, pv.y, pv.z);
        uvs.push(i / NU, j / NV);
        lay.push(h);
      }
    }
    const base = L * per;
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      // keep quads that touch beard zones
      let any = false;
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const a = -A + 2 * A * (i + di) / NU, y = Y0 + (Y1 - Y0) * (j + dj) / NV;
        if (beardRegion(a, y)) any = true;
      }
      if (!any) continue;
      const a0 = base + j * (NU + 1) + i, b = a0 + 1, c = a0 + NU + 1, e = c + 1;
      idx.push(a0, b, c, b, e, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('tdown', new THREE.Float32BufferAttribute(tdn, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('layer', new THREE.Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.05, 0.05), 0.2);
  geoCache.set(layers, g);
  return g;
}

export class BeardSystem {
  constructor(opts) {
    this.kind = 'beard';
    this.color = opts.color || '#3b2a1e';
    this.skin = opts.skin || '#c99a7c';
    this.curl = 0.15;
    this.len = new Float32Array(BW * BH);
    this.wet = new Float32Array(BW * BH);
    this.region = new Uint8Array(BW * BH);
    this.area = new Float32Array(BW * BH);
    this.data = new Uint8Array(BW * BH * 4);
    this.texture = new THREE.DataTexture(this.data, BW, BH, THREE.RGBAFormat);
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
      const a = -A + 2 * A * (i + 0.5) / BW, y = Y0 + (Y1 - Y0) * (j + 0.5) / BH;
      this.region[j * BW + i] = beardRegion(a, y);
      this.area[j * BW + i] = 1;
    }
    this.layers = Math.max(6, Math.round((opts.layers || 16) * 0.7));
    this.mesh = new THREE.Mesh(buildGeometry(this.layers), makeMaterial(this));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    // invisible base surface for picking
    this.pickMesh = new THREE.Mesh(buildGeometry(1), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    this.highlight = 0; this.highlightTarget = 0; this.highlightRegion = -1;
    this.dirty = true;
  }

  attach(headBone) { headBone.add(this.mesh); headBone.add(this.pickMesh); this.head = headBone; }
  dispose() { this.mesh.parent?.remove(this.mesh); this.pickMesh.parent?.remove(this.pickMesh); this.mesh.material.dispose(); this.texture.dispose(); }

  // spec: { chin, cheeks, moustache, neck, noise }
  setStyle(spec, seed = Math.random()) {
    let s = seed * 1000;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const names = { 7: 'chin', 8: 'cheeks', 9: 'moustache', 10: 'neck' };
    for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
      const k = j * BW + i;
      const reg = this.region[k];
      let v = reg ? (spec[names[reg]] ?? 0) : 0;
      // soft fade into the cheek line and sideburns
      const y = Y0 + (Y1 - Y0) * (j + 0.5) / BH;
      if (reg === BEARD_ID.cheeks && y > 0.05) v *= clamp(1 - (y - 0.05) / 0.07, 0.35, 1);
      if (reg === BEARD_ID.neck) v *= 0.4 + 0.6 * Math.abs(Math.sin(i * 1.3 + j * 2.1));
      v *= 1 + (r() - 0.5) * (spec.noise ?? 0.2);
      this.len[k] = clamp(v, 0, 1);
    }
    this.dirty = true;
    this.upload();
  }

  upload() {
    if (!this.dirty) return;
    for (let k = 0; k < this.len.length; k++) {
      this.data[k * 4] = Math.round(clamp(this.len[k], 0, 1) * 255);
      this.data[k * 4 + 1] = Math.round(clamp(this.wet[k], 0, 1) * 255);
      this.data[k * 4 + 2] = this.region[k] * 20;
      this.data[k * 4 + 3] = 255;
    }
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  setLOD(dist) {
    const want = dist > 4 ? 4 : dist > 2.2 ? Math.ceil(this.layers * 0.6) : this.layers;
    if (want !== this._lod) { this._lod = want; this.mesh.geometry = buildGeometry(want); }
  }

  update(dt) {
    if (this.head) {
      const q = this.head.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.mesh.material.uniforms.uGrav.value.set(0, -1, 0).applyQuaternion(q);
    }
    this.highlight = lerp(this.highlight, this.highlightTarget, Math.min(1, dt * 6));
    this.mesh.material.uniforms.uHl.value = this.highlight;
    this.mesh.material.uniforms.uHlRegion.value = this.highlightRegion;
    this.upload();
  }

  setHighlight(name) {
    if (!name || !BEARD_ID[name]) { this.highlightTarget = 0; return; }
    this.highlightRegion = BEARD_ID[name];
    this.highlightTarget = 1;
  }

  // -------------------------------------------------------------- picking / cutting
  pick(raycaster) {
    this.pickMesh.updateMatrixWorld(true);
    const hits = raycaster.intersectObject(this.pickMesh, false);
    // the nearest hit on a beard zone (the lips are holes in the beard)
    const h = hits.find((x) => x.uv && beardRegion(-A + 2 * A * x.uv.x, Y0 + (Y1 - Y0) * x.uv.y));
    if (!h) return null;
    const a = -A + 2 * A * h.uv.x, y = Y0 + (Y1 - Y0) * h.uv.y;
    const reg = beardRegion(a, y);
    const nw = h.face.normal.clone().transformDirection(this.pickMesh.matrixWorld);
    return { phi: a, theta: y, point: h.point, normal: nw, region: reg, distance: h.distance, sys: this };
  }

  surfacePoint(a, y, extra = 0, out = new THREE.Vector3()) {
    return beardPoint(a, y, out, 0.0012 + extra).applyMatrix4(this.mesh.matrixWorld);
  }

  lengthAt(a, y) {
    const i = clamp(Math.floor((a + A) / (2 * A) * BW), 0, BW - 1);
    const j = clamp(Math.floor((y - Y0) / (Y1 - Y0) * BH), 0, BH - 1);
    return this.len[j * BW + i];
  }

  brush(a, y, radius, fn) {
    const ci = (a + A) / (2 * A) * BW - 0.5, cj = (y - Y0) / (Y1 - Y0) * BH - 0.5;
    const mI = (2 * A * 0.085) / BW, mJ = (Y1 - Y0) / BH;
    const ri = Math.ceil(radius / mI), rj = Math.ceil(radius / mJ);
    let removed = 0;
    for (let dj = -rj; dj <= rj; dj++) {
      const j = Math.round(cj) + dj;
      if (j < 0 || j >= BH) continue;
      for (let di = -ri; di <= ri; di++) {
        const i = Math.round(ci) + di;
        if (i < 0 || i >= BW) continue;
        const d = Math.hypot((i - ci) * mI, (j - cj) * mJ) / radius;
        if (d > 1) continue;
        const k = j * BW + i;
        if (!this.region[k]) continue;
        const before = this.len[k];
        fn(k, 1 - d * d);
        removed += Math.max(0, before - this.len[k]);
      }
    }
    if (removed > 0) this.dirty = true;
    return removed * 0.4;
  }

  clip(a, y, guardLen, rate, dt, radius = 0.016) {
    return this.brush(a, y, radius, (k, w) => { const c = this.len[k]; if (c > guardLen) this.len[k] = Math.max(guardLen, c - rate * dt * w * (0.5 + c)); });
  }
  snip(a, y, amount, floor = 0.05, radius = 0.014) {
    return this.brush(a, y, radius, (k, w) => { const c = this.len[k]; if (c > floor) this.len[k] = Math.max(floor, c - amount * (0.35 + 0.65 * w)); });
  }
  trim(a, y, rate, dt, radius = 0.007) {
    return this.brush(a, y, radius, (k, w) => { this.len[k] = Math.max(0, this.len[k] - rate * dt * (0.5 + w)); });
  }
  spray(a, y, radius = 0.03) { this.brush(a, y, radius, (k, w) => { this.wet[k] = Math.min(1, this.wet[k] + 0.5 * w); }); this.dirty = true; }
  comb(a, y, radius = 0.015) { return this.brush(a, y, radius, () => {}); }

  regionStats() {
    const acc = {};
    const names = { 7: 'chin', 8: 'cheeks', 9: 'moustache', 10: 'neck' };
    for (const r of BEARD_REGIONS) acc[r] = { sum: 0, sq: 0, w: 0, over: 0 };
    for (let k = 0; k < this.len.length; k++) {
      const r = names[this.region[k]];
      if (!r) continue;
      const v = this.len[k], s = acc[r];
      s.sum += v; s.sq += v * v; s.w += 1;
      if (r === 'neck' && v > 0.012) s.over += 1;
    }
    const out = {};
    for (const r of BEARD_REGIONS) {
      const s = acc[r];
      const mean = s.w ? s.sum / s.w : 0;
      out[r] = { mean, std: Math.sqrt(Math.max(0, s.sq / (s.w || 1) - mean * mean)), messy: s.w ? s.over / s.w : 0 };
    }
    return out;
  }

  beginService(cut, skill) {
    this._svcStart = this.len.slice();
    const names = { 7: 'chin', 8: 'cheeks', 9: 'moustache', 10: 'neck' };
    const err = (1 - skill) * 0.45;
    this._svcTarget = this.len.map((v, k) => {
      const t = cut.target[names[this.region[k]]];
      if (t === undefined) return v;
      return names[this.region[k]] === 'neck' ? (Math.random() < skill ? 0 : v * 0.6) : Math.max(0, t * (1 + (Math.random() - 0.5) * err));
    });
  }

  serviceProgress(p) {
    if (!this._svcStart) return;
    for (let k = 0; k < this.len.length; k++) { const a = this._svcStart[k], b = this._svcTarget[k]; if (b < a) this.len[k] = a + (b - a) * p; }
    this.dirty = true;
  }

  damage(region, below) {
    const id = BEARD_ID[region];
    let bad = 0, tot = 0;
    for (let k = 0; k < this.len.length; k++) if (this.region[k] === id) { tot++; if (this.len[k] < below) bad++; }
    return tot ? bad / tot : 0;
  }
}

export const BEARD_STYLES = {
  stubble: { chin: 0.05, cheeks: 0.045, moustache: 0.05, neck: 0.03 },
  short: { chin: 0.14, cheeks: 0.1, moustache: 0.12, neck: 0.05 },
  full: { chin: 0.34, cheeks: 0.24, moustache: 0.26, neck: 0.12 },
  goatee: { chin: 0.22, cheeks: 0.0, moustache: 0.2, neck: 0.02 },
  moustache: { chin: 0.0, cheeks: 0.0, moustache: 0.24, neck: 0.0 },
};
