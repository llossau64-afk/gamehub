// Shell-rendered hair driven by a length map on the scalp.
// Every cut writes into the map, so the hair visibly gets shorter exactly where the tool was.
import * as THREE from 'three';
import { hairNoise } from '../render/textures.js';
import { clamp, lerp, rand } from '../core/util.js';

export const MAX_LEN = 0.06;          // metres at length 1.0
export const TEX_W = 128, TEX_H = 64;
export const THETA_MAX = 2.45;        // scalp coverage from the crown (rad)
// cranium ellipsoid in head-bone space (three: x left, y up, z forward)
export const HEAD_C = new THREE.Vector3(0, 0.125, -0.005);
export const HEAD_R = new THREE.Vector3(0.089 * 1.025, 0.104 * 1.025, 0.102 * 1.025);

export const REGIONS = ['top', 'front', 'left', 'right', 'back', 'edges'];
export const REGION_ID = { top: 1, front: 2, left: 3, right: 4, back: 5, edges: 6 };
export const REGION_LABEL = { top: 'Top', front: 'Front', left: 'Left side', right: 'Right side', back: 'Back', edges: 'Edges',
  chin: 'Chin', cheeks: 'Cheeks', moustache: 'Moustache', neck: 'Neckline' };
// regions scored by how clean they are rather than by length
export const EDGE_REGIONS = new Set(['edges', 'neck']);

// hairline polar angle by |azimuth| (deg): forehead, temples, sideburns, over the ears, nape
const HAIRLINE = [[0, 0.82], [28, 0.86], [42, 1.06], [56, 1.5], [66, 1.92], [74, 1.92], [80, 1.58], [104, 1.58], [118, 1.82], [145, 2.22], [180, 2.32]];
export function hairline(phi) {
  const a = Math.abs(phi) * 180 / Math.PI;
  for (let i = 1; i < HAIRLINE.length; i++) {
    if (a <= HAIRLINE[i][0]) {
      const [a0, v0] = HAIRLINE[i - 1], [a1, v1] = HAIRLINE[i];
      return lerp(v0, v1, (a - a0) / (a1 - a0));
    }
  }
  return HAIRLINE[HAIRLINE.length - 1][1];
}

export function regionOf(phi, theta) {
  const a = Math.abs(phi) * 180 / Math.PI;
  if (theta > hairline(phi)) return REGION_ID.edges;
  if (a < 42 && theta > 0.5) return REGION_ID.front;
  if (theta < 0.95) return REGION_ID.top;
  if (a > 132) return REGION_ID.back;
  return phi > 0 ? REGION_ID.left : REGION_ID.right;
}

function dirOf(phi, theta, out) {
  const s = Math.sin(theta);
  return out.set(s * Math.sin(phi), Math.cos(theta), s * Math.cos(phi));
}

let noiseTex = null;
let g_layerIdx = 0;
const geoCache = new Map();

function buildGeometry(layers) {
  if (geoCache.has(layers)) return geoCache.get(layers);
  const NU = 52, NV = 28;
  const pos = [], nrm = [], tdn = [], uvs = [], lay = [];
  const idx = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), p2 = new THREE.Vector3();
  const vertsPerLayer = (NU + 1) * (NV + 1);
  for (let L = 0; L < layers; L++) {
    const h = layers === 1 ? 0 : L / (layers - 1);
    for (let j = 0; j <= NV; j++) {
      const theta = Math.max(0.001, (j / NV) * THETA_MAX);
      for (let i = 0; i <= NU; i++) {
        const phi = (i / NU) * Math.PI * 2 - Math.PI;
        dirOf(phi, theta, d);
        p.set(HEAD_C.x + d.x * HEAD_R.x, HEAD_C.y + d.y * HEAD_R.y, HEAD_C.z + d.z * HEAD_R.z);
        n.set(d.x / HEAD_R.x, d.y / HEAD_R.y, d.z / HEAD_R.z).normalize();
        dirOf(phi, theta + 0.01, d);
        p2.set(HEAD_C.x + d.x * HEAD_R.x, HEAD_C.y + d.y * HEAD_R.y, HEAD_C.z + d.z * HEAD_R.z).sub(p).normalize();
        pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); tdn.push(p2.x, p2.y, p2.z);
        uvs.push(i / NU, j / NV * (THETA_MAX / THETA_MAX));
        lay.push(h);
      }
    }
    const base = L * vertsPerLayer;
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      // skip the face: quads well below the hairline never carry hair
      const phi = ((i + 0.5) / NU) * Math.PI * 2 - Math.PI;
      const theta = (j / NV) * THETA_MAX;
      if (theta > hairline(phi) + 0.3) continue;
      const a = base + j * (NU + 1) + i, b = a + 1, c = a + NU + 1, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
    if (L === 0) g_layerIdx = idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('tdown', new THREE.Float32BufferAttribute(tdn, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('layer', new THREE.Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  g.userData.idxPerLayer = g_layerIdx;
  g.userData.layers = layers;
  g.boundingSphere = new THREE.Sphere(HEAD_C.clone(), 0.25);
  geoCache.set(layers, g);
  return g;
}

export const hairLight = {
  keyDir: { value: new THREE.Vector3(0.2, 1, 0.3).normalize() },
  keyColor: { value: new THREE.Color(1.0, 0.9, 0.75) },
  ambTop: { value: new THREE.Color(0.45, 0.42, 0.38) },
  ambBot: { value: new THREE.Color(0.16, 0.13, 0.11) },
  time: { value: 0 },
};

export function makeMaterial(sys) {
  noiseTex ||= hairNoise();
  return new THREE.ShaderMaterial({
    uniforms: {
      uLen: { value: sys.texture },
      uNoise: { value: noiseTex },
      uMaxLen: { value: MAX_LEN },
      uColor: { value: new THREE.Color(sys.color) },
      uTip: { value: new THREE.Color(sys.color).offsetHSL(0, -0.05, 0.08) },
      uSkin: { value: new THREE.Color(sys.skin) },
      uGrav: { value: new THREE.Vector3(0, -1, 0) },
      uHl: { value: 0 },
      uHlRegion: { value: -1 },
      uCurl: { value: sys.curl || 0 },
      uHeadC: { value: HEAD_C },
      uPart: { value: 9 },
      uDirA: { value: new THREE.Vector3(0, -0.6, -1).normalize() },
      uDirB: { value: new THREE.Vector3(0, -0.6, -1).normalize() },
      uKeyDir: hairLight.keyDir, uKeyColor: hairLight.keyColor, uAmbTop: hairLight.ambTop, uAmbBot: hairLight.ambBot, uTime: hairLight.time,
    },
    vertexShader: /* glsl */`
      attribute float layer; attribute vec3 tdown;
      uniform sampler2D uLen; uniform float uMaxLen; uniform vec3 uGrav; uniform float uCurl;
      uniform vec3 uHeadC; uniform float uPart; uniform vec3 uDirA; uniform vec3 uDirB;
      varying vec2 vUv; varying float vH; varying vec3 vN; varying vec3 vT; varying vec3 vWPos; varying float vLen; varying float vPart; varying float vStyled;
      void main(){
        vUv = uv; vH = layer;
        vec4 tx = texture2D(uLen, uv);
        float len = tx.r * uMaxLen;
        vLen = tx.r;
        // combed hair (alpha channel) lies flat along the style direction
        float st = tx.a * (1.0 - uCurl * 0.6);
        vStyled = st;
        vec3 rel = position - uHeadC;
        vPart = rel.x - uPart;
        vec3 D = vPart > 0.0 ? uDirA : uDirB;
        vec3 sd = D - normal * dot(D, normal);
        sd = sd / max(length(sd), 1e-4);
        vec3 p = position + normal * (0.0011 + layer * len * 0.5 * (1.0 - 0.62 * st));
        float drape = layer * layer * max(len - 0.006, 0.0);
        p += tdown * drape * (0.75 - uCurl * 0.5) * (1.0 - st * 0.8);
        p += uGrav * drape * (0.45 - uCurl * 0.3) * (1.0 - st * 0.5);
        p += sd * layer * len * st * 0.95;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vT = normalize(mat3(modelMatrix) * mix(tdown + normal * 0.2, sd + normal * 0.1, st));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uLen; uniform sampler2D uNoise; uniform float uMaxLen;
      uniform vec3 uColor; uniform vec3 uTip; uniform vec3 uSkin;
      uniform float uHl; uniform float uHlRegion; uniform float uTime; uniform float uCurl;
      uniform vec3 uKeyDir; uniform vec3 uKeyColor; uniform vec3 uAmbTop; uniform vec3 uAmbBot;
      varying vec2 vUv; varying float vH; varying vec3 vN; varying vec3 vT; varying vec3 vWPos; varying float vLen; varying float vPart; varying float vStyled;
      void main(){
        vec4 tx = texture2D(uLen, vUv);
        // a combed side part shows as a thin line of scalp
        if (vH > 0.001 && vStyled > 0.35 && abs(vPart) < 0.0028 * (0.6 + vH)) discard;
        float L = tx.r;
        float wet = tx.g;
        vec3 col;
        float ao;
        float strandShade = 1.0;
        if (vH < 0.001) {
          if (L < 0.005) discard;
          float cov = smoothstep(0.0, 0.06, L);
          float n = texture2D(uNoise, vUv * vec2(512.0, 256.0)).r;
          col = mix(uSkin * 0.86, uColor * 0.8, cov * (0.55 + 0.45 * n));
          ao = mix(1.0, 0.4, smoothstep(0.08, 0.5, L));
        } else {
          if (L * uMaxLen < 0.0022) discard;
          vec2 st = vUv * vec2(300.0, 150.0);
          st.x += sin(vUv.y * 40.0 + vH * 6.0) * uCurl * 0.8;
          vec2 cell = floor(st);
          vec2 f = fract(st);
          vec4 nz = texture2D(uNoise, (cell + 0.5) / 256.0);
          float sl = 0.5 + 0.5 * nz.r;
          if (vH > sl) discard;
          float rad = (1.0 - vH / sl) * 0.5 + 0.08;
          vec2 c = vec2(0.25 + 0.5 * nz.b, 0.25 + 0.5 * nz.a);
          if (length(f - c) > rad) discard;
          col = mix(uColor, uTip, vH * vH) * (0.82 + 0.36 * nz.g);
          ao = mix(0.38, 1.0, pow(vH, 0.8));
          strandShade = 0.85 + 0.3 * nz.r;
        }
        vec3 N = normalize(vN);
        vec3 Ld = normalize(uKeyDir);
        float diff = clamp((dot(N, Ld) + 0.45) / 1.45, 0.0, 1.0);
        vec3 V = normalize(cameraPosition - vWPos);
        vec3 H = normalize(Ld + V);
        vec3 T = normalize(vT);
        float th = dot(T, H);
        float spec = pow(sqrt(max(0.0, 1.0 - th * th)), 80.0 - vStyled * 30.0) * 0.22 * (1.0 + wet * 2.0 + vStyled * 1.4);
        vec3 amb = mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5);
        col *= (1.0 - wet * 0.4);
        vec3 lit = col * (amb + uKeyColor * diff) * ao * strandShade + uKeyColor * spec * ao;
        float rid = floor(tx.b * 255.0 / 20.0 + 0.5);
        if (uHl > 0.0 && abs(rid - uHlRegion) < 0.5) {
          float pulse = 0.55 + 0.45 * sin(uTime * 4.0);
          lit += vec3(1.0, 0.72, 0.35) * 0.22 * pulse * uHl;
        }
        gl_FragColor = vec4(lit, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export class HairSystem {
  constructor(opts) {
    this.color = opts.color || '#3b2a1e';
    this.skin = opts.skin || '#c99a7c';
    this.curl = opts.curl || 0;
    this.len = new Float32Array(TEX_W * TEX_H);
    this.wet = new Float32Array(TEX_W * TEX_H);
    this.styled = new Float32Array(TEX_W * TEX_H);
    this.region = new Uint8Array(TEX_W * TEX_H);
    this.area = new Float32Array(TEX_W * TEX_H);
    this.data = new Uint8Array(TEX_W * TEX_H * 4);
    this.texture = new THREE.DataTexture(this.data, TEX_W, TEX_H, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    for (let j = 0; j < TEX_H; j++) {
      const theta = (j + 0.5) / TEX_H * THETA_MAX;
      for (let i = 0; i < TEX_W; i++) {
        const phi = (i + 0.5) / TEX_W * Math.PI * 2 - Math.PI;
        const k = j * TEX_W + i;
        this.region[k] = regionOf(phi, theta);
        this.area[k] = Math.sin(theta);
      }
    }
    const layers = opts.layers || 16;
    this.layers = layers;
    this.mesh = new THREE.Mesh(buildGeometry(layers), makeMaterial(this));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.dirty = true;
    this.highlight = 0;
    this.highlightRegion = -1;
    this.highlightTarget = 0;
  }

  attach(headBone) {
    headBone.add(this.mesh);
    this.head = headBone;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.material.dispose();
    this.texture.dispose();
  }

  setColor(c) { this.color = c; this.mesh.material.uniforms.uColor.value.set(c); this.mesh.material.uniforms.uTip.value.set(c).offsetHSL(0, -0.05, 0.08); }

  // ------------------------------------------------------------------ styles
  // spec: { top, front, left, right, back, fuzz, noise, bald } lengths in 0..1
  setStyle(spec, seed = Math.random()) {
    let s = seed * 1000;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const offs = [r() * 10, r() * 10];
    for (let j = 0; j < TEX_H; j++) {
      const theta = (j + 0.5) / TEX_H * THETA_MAX;
      for (let i = 0; i < TEX_W; i++) {
        const phi = (i + 0.5) / TEX_W * Math.PI * 2 - Math.PI;
        const k = j * TEX_W + i;
        const hl = hairline(phi);
        let v;
        if (theta > hl) {
          // stray growth below the hairline: what edge work cleans up
          const dz = theta - hl;
          const fuzz = (spec.fuzz ?? 0.06) * Math.max(0, 1 - dz / 0.22) * (Math.abs(phi) > 0.9 ? 1 : 0.15);
          v = fuzz * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + j * 2.3 + offs[0])));
        } else {
          // blend region lengths smoothly by position
          const a = Math.abs(phi);
          const side = phi > 0 ? spec.left : spec.right;
          const sideBack = lerp(side, spec.back, clamp((a - 1.9) / 0.6, 0, 1));
          const topW = clamp((1.05 - theta) / 0.35, 0, 1);
          const frontW = clamp((0.75 - a) / 0.25, 0, 1) * clamp((theta - 0.45) / 0.2, 0, 1);
          v = lerp(sideBack, spec.top, topW);
          v = lerp(v, spec.front, frontW * (1 - topW * 0.5));
          // taper into the hairline
          const edge = clamp((hl - theta) / 0.12, 0, 1);
          v *= 0.55 + 0.45 * edge;
          if (spec.bald && theta < spec.bald) v *= clamp((theta - spec.bald * 0.6) / (spec.bald * 0.4), 0, 1) * 0.3;
          if (spec.fade) {
            // pre-existing fade: shorter near the hairline on sides/back
            const fz = clamp((hl - theta) / spec.fade, 0, 1);
            if (theta > 1.0) v *= fz;
          }
        }
        const n = 1 + (Math.sin(i * 0.9 + offs[0]) * Math.cos(j * 0.7 + offs[1]) * 0.5 + (r() - 0.5) * 0.4) * (spec.noise ?? 0.12);
        this.len[k] = clamp(v * n, 0, 1);
        this.wet[k] = 0;
        this.styled[k] = 0;
      }
    }
    this.dirty = true;
    this.upload();
  }

  upload() {
    if (!this.dirty) return;
    const d = this.data;
    for (let k = 0; k < this.len.length; k++) {
      d[k * 4] = Math.round(clamp(this.len[k], 0, 1) * 255);
      d[k * 4 + 1] = Math.round(clamp(this.wet[k], 0, 1) * 255);
      d[k * 4 + 2] = this.region[k] * 20;
      d[k * 4 + 3] = Math.round(clamp(this.styled[k], 0, 1) * 255);
    }
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  // fewer shells when the head is small on screen
  setLOD(dist) {
    const L = this.layers;
    const want = dist > 4 ? Math.max(5, Math.ceil(L * 0.35)) : dist > 2.2 ? Math.ceil(L * 0.6) : L;
    if (want !== this._lod) { this._lod = want; this.mesh.geometry = buildGeometry(want); }
  }

  update(dt) {
    // gravity in head space so long hair falls correctly when the head tilts
    if (this.head) {
      const q = this.head.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.mesh.material.uniforms.uGrav.value.set(0, -1, 0).applyQuaternion(q);
    }
    this.highlight = lerp(this.highlight, this.highlightTarget, Math.min(1, dt * 6));
    this.mesh.material.uniforms.uHl.value = this.highlight;
    this.mesh.material.uniforms.uHlRegion.value = this.highlightRegion;
    // damp hair dries slowly
    this.dryT = (this.dryT || 0) + dt;
    if (this.dryT > 1) {
      let any = false;
      for (let k = 0; k < this.wet.length; k++) if (this.wet[k] > 0) { this.wet[k] = Math.max(0, this.wet[k] - this.dryT * 0.006); any = true; }
      if (any) this.dirty = true;
      this.dryT = 0;
    }
    this.upload();
  }

  setHighlight(regionName) {
    if (!regionName) { this.highlightTarget = 0; return; }
    this.highlightRegion = REGION_ID[regionName];
    this.highlightTarget = 1;
  }

  // ------------------------------------------------------------------ picking
  // ray in world space -> {phi, theta, point(world), normal(world)} or null
  pick(ray, inflate = 0.012) {
    const inv = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const o = ray.origin.clone().applyMatrix4(inv).sub(HEAD_C);
    const dir = ray.direction.clone().transformDirection(inv);
    const R = HEAD_R.clone().addScalar(inflate);
    const os = new THREE.Vector3(o.x / R.x, o.y / R.y, o.z / R.z);
    const ds = new THREE.Vector3(dir.x / R.x, dir.y / R.y, dir.z / R.z);
    const a = ds.dot(ds), b = 2 * os.dot(ds), c = os.dot(os) - 1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0) return null;
    const pl = o.clone().addScaledVector(dir, t);              // head-local relative to centre
    const n = new THREE.Vector3(pl.x / R.x, pl.y / R.y, pl.z / R.z).normalize();
    const theta = Math.acos(clamp(n.y, -1, 1));
    const phi = Math.atan2(n.x, n.z);
    if (theta > THETA_MAX || theta > hairline(phi) + 0.3) return null;   // no scalp hair down there
    const pw = pl.clone().add(HEAD_C).applyMatrix4(this.mesh.matrixWorld);
    const nw = new THREE.Vector3(pl.x / (R.x * R.x), pl.y / (R.y * R.y), pl.z / (R.z * R.z)).normalize().transformDirection(this.mesh.matrixWorld);
    return { phi, theta, point: pw, normal: nw, region: regionOf(phi, theta) };
  }

  // world position of a scalp point (plus hair height)
  surfacePoint(phi, theta, extra = 0, out = new THREE.Vector3()) {
    const d = dirOf(phi, theta, new THREE.Vector3());
    out.set(HEAD_C.x + d.x * (HEAD_R.x + extra), HEAD_C.y + d.y * (HEAD_R.y + extra), HEAD_C.z + d.z * (HEAD_R.z + extra));
    return out.applyMatrix4(this.mesh.matrixWorld);
  }

  lengthAt(phi, theta) {
    const i = Math.floor(((phi + Math.PI) / (Math.PI * 2)) * TEX_W) % TEX_W;
    const j = clamp(Math.floor(theta / THETA_MAX * TEX_H), 0, TEX_H - 1);
    return this.len[j * TEX_W + i];
  }

  // ------------------------------------------------------------------ cutting
  // Apply fn(k, w) to texels within radius (metres) of (phi, theta). Returns total removed length*area.
  brush(phi, theta, radius, fn) {
    const ci = ((phi + Math.PI) / (Math.PI * 2)) * TEX_W - 0.5;
    const cj = theta / THETA_MAX * TEX_H - 0.5;
    const rAvg = (HEAD_R.x + HEAD_R.z) * 0.5;
    const metersPerI = (Math.PI * 2 * rAvg * Math.max(0.15, Math.sin(theta))) / TEX_W;
    const metersPerJ = (THETA_MAX * HEAD_R.y * 1.05) / TEX_H;
    const ri = Math.ceil(radius / metersPerI), rj = Math.ceil(radius / metersPerJ);
    let removed = 0;
    for (let dj = -rj; dj <= rj; dj++) {
      const j = Math.round(cj) + dj;
      if (j < 0 || j >= TEX_H) continue;
      for (let di = -ri; di <= ri; di++) {
        const i0 = Math.round(ci) + di;
        const i = ((i0 % TEX_W) + TEX_W) % TEX_W;
        const dx = (i0 - ci) * metersPerI, dy = (j - cj) * metersPerJ;
        const d = Math.sqrt(dx * dx + dy * dy) / radius;
        if (d > 1) continue;
        const w = 1 - d * d;
        const k = j * TEX_W + i;
        const before = this.len[k];
        fn(k, w);
        removed += Math.max(0, before - this.len[k]) * this.area[k];
      }
    }
    if (removed > 0) this.dirty = true;
    return removed;
  }

  clip(phi, theta, guardLen, rate, dt, radius = 0.022) {
    return this.brush(phi, theta, radius, (k, w) => {
      const cur = this.len[k];
      if (cur > guardLen) { this.len[k] = Math.max(guardLen, cur - rate * dt * (0.3 + 0.7 * w) * (0.4 + cur) * 3.6); this.styled[k] *= 1 - 0.08 * w; }
    });
  }

  snip(phi, theta, amount, floor = 0.1, radius = 0.02) {
    return this.brush(phi, theta, radius, (k, w) => {
      const cur = this.len[k];
      // damp hair lies flat and cuts evenly
      const ww = this.wet[k] > 0.25 ? 0.85 + 0.15 * w : 0.35 + 0.65 * w;
      if (cur > floor) { this.len[k] = Math.max(floor, cur - amount * ww); this.styled[k] *= 1 - 0.25 * w; }
    });
  }

  trim(phi, theta, rate, dt, radius = 0.008) {
    return this.brush(phi, theta, radius, (k, w) => {
      this.len[k] = Math.max(0, this.len[k] - rate * dt * (0.5 + w));
    });
  }

  comb(phi, theta, radius = 0.025) {
    // evens out lengths slightly toward the local average and lays the hair down
    // along the style direction (stored in the alpha channel)
    let sum = 0, n = 0;
    this.brush(phi, theta, radius, (k) => { if (this.region[k] !== REGION_ID.edges) { sum += this.len[k]; n++; } });
    if (!n) return 0;
    const avg = sum / n;
    const r = this.brush(phi, theta, radius * 1.15, (k, w) => {
      if (this.region[k] === REGION_ID.edges) return;
      const c = this.len[k];
      if (c > avg) this.len[k] = c + (avg - c) * 0.04 * w;
      this.styled[k] = Math.min(1, this.styled[k] + (0.06 + this.wet[k] * 0.06) * w);
    });
    this.dirty = true;
    return r;
  }

  // where combed hair goes: 'back' (slick back), 'part' (side part on the customer's left), or the default
  setStyleDir(mode) {
    const u = this.mesh.material.uniforms;
    if (mode === 'back') { u.uPart.value = 9; u.uDirA.value.set(0, -0.25, -1).normalize(); u.uDirB.value.copy(u.uDirA.value); }
    else if (mode === 'center') { u.uPart.value = 0; u.uDirA.value.set(1, -0.55, -0.2).normalize(); u.uDirB.value.set(-1, -0.55, -0.2).normalize(); }
    else if (mode === 'part') { u.uPart.value = 0.032; u.uDirA.value.set(1, -0.7, -0.15).normalize(); u.uDirB.value.set(-1, -0.25, -0.45).normalize(); }
    else { u.uPart.value = 9; u.uDirA.value.set(0, -0.6, -1).normalize(); u.uDirB.value.copy(u.uDirA.value); }
  }

  // share of top + front hair that is combed into place
  styledShare() {
    let s = 0, n = 0;
    for (let k = 0; k < this.len.length; k++) {
      const r = this.region[k];
      if (r !== REGION_ID.top && r !== REGION_ID.front) continue;
      const a = this.area[k];
      s += clamp(this.styled[k] / 0.7, 0, 1) * a; n += a;
    }
    return n ? s / n : 0;
  }

  spray(phi, theta, radius = 0.05) {
    this.brush(phi, theta, radius, (k, w) => { this.wet[k] = Math.min(1, this.wet[k] + 0.5 * w); });
    this.dirty = true;
  }

  // an employee's haircut: lengths move from the start towards the request, with
  // per-texel error that shrinks with skill
  beginService(cut, skill, fadeTargetFn) {
    this._svcStart = this.len.slice();
    this._svcStyle = cut.style ? 0.5 + skill * 0.5 : 0;
    const T = this._svcTarget = new Float32Array(this.len.length);
    const names = [null, 'top', 'front', 'left', 'right', 'back', 'edges'];
    const err = (1 - skill) * 0.45;
    const bias = (Math.random() - 0.5) * err * 0.6;
    for (let j = 0; j < TEX_H; j++) {
      const theta = (j + 0.5) / TEX_H * THETA_MAX;
      for (let i = 0; i < TEX_W; i++) {
        const k = j * TEX_W + i;
        const r = names[this.region[k]];
        let t = cut.target[r];
        if (t === undefined) { T[k] = this.len[k]; continue; }
        if (cut.fade && ['left', 'right', 'back'].includes(r)) t = fadeTargetFn(cut.fade, hairline((i + 0.5) / TEX_W * Math.PI * 2 - Math.PI), theta);
        T[k] = r === 'edges' ? this.len[k] * (Math.random() < skill ? 0 : 0.6) : Math.max(0, t * (1 + bias + (Math.random() - 0.5) * err));
      }
    }
  }

  serviceProgress(p) {
    if (!this._svcStart) return;
    for (let k = 0; k < this.len.length; k++) {
      const a = this._svcStart[k], b = this._svcTarget[k];
      if (b < a) this.len[k] = a + (b - a) * p;
      if (this._svcStyle && p > 0.7) this.styled[k] = Math.max(this.styled[k], (p - 0.7) / 0.3 * this._svcStyle);
    }
    this.dirty = true;
  }

  wetShare() {
    let w = 0, n = 0;
    for (let k = 0; k < this.wet.length; k++) if (this.region[k] !== REGION_ID.edges) { n++; if (this.wet[k] > 0.25) w++; }
    return n ? w / n : 0;
  }

  // ------------------------------------------------------------------ evaluation
  regionStats() {
    const acc = {};
    for (const r of REGIONS) acc[r] = { sum: 0, sq: 0, w: 0, over: 0 };
    const names = [null, 'top', 'front', 'left', 'right', 'back', 'edges'];
    for (let k = 0; k < this.len.length; k++) {
      const r = names[this.region[k]];
      const a = this.area[k];
      const v = this.len[k];
      const s = acc[r];
      s.sum += v * a; s.sq += v * v * a; s.w += a;
      if (r === 'edges' && v > 0.012) s.over += a;
    }
    const out = {};
    for (const r of REGIONS) {
      const s = acc[r];
      const mean = s.w ? s.sum / s.w : 0;
      out[r] = { mean, std: Math.sqrt(Math.max(0, s.sq / (s.w || 1) - mean * mean)), messy: s.w ? s.over / s.w : 0 };
    }
    return out;
  }

  // fraction of texels in a region below a length (bald patches)
  damage(region, below) {
    const id = REGION_ID[region];
    let bad = 0, tot = 0;
    for (let k = 0; k < this.len.length; k++) {
      if (this.region[k] !== id) continue;
      tot += this.area[k];
      if (this.len[k] < below) bad += this.area[k];
    }
    return tot ? bad / tot : 0;
  }
}
