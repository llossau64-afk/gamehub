import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const easeOutElastic = (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1);

// frame-rate independent exponential damping
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function dampVec(v, target, lambda, dt) {
  const k = 1 - Math.exp(-lambda * dt);
  v.x += (target.x - v.x) * k; v.y += (target.y - v.y) * k; v.z += (target.z - v.z) * k;
  return v;
}
export function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
}
export const wrapAngle = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function chance(p) { return Math.random() < p; }

// 1D smooth noise for idle motion
const _perm = new Float32Array(512);
for (let i = 0; i < 512; i++) _perm[i] = Math.random() * 2 - 1;
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const a = _perm[i & 511], b = _perm[(i + 1) & 511];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

// critically damped spring (for bouncy UI / props)
export class Spring {
  constructor(value = 0, stiffness = 180, damping = 14) {
    this.value = value; this.target = value; this.vel = 0;
    this.k = stiffness; this.d = damping;
  }
  update(dt) {
    const steps = Math.ceil(dt / 0.008);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (this.target - this.value) * this.k - this.vel * this.d;
      this.vel += a * h; this.value += this.vel * h;
    }
    return this.value;
  }
  kick(v) { this.vel += v; }
}

export class Emitter {
  constructor() { this.h = {}; }
  on(e, f) { (this.h[e] ||= []).push(f); return () => this.off(e, f); }
  off(e, f) { this.h[e] = (this.h[e] || []).filter((x) => x !== f); }
  emit(e, ...a) { for (const f of (this.h[e] || []).slice()) f(...a); }
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const tmpV = [...Array(12)].map(() => new THREE.Vector3());
export const tmpQ = [...Array(6)].map(() => new THREE.Quaternion());
export const tmpM = [...Array(4)].map(() => new THREE.Matrix4());

// Catmull-Rom position along points
export function curve(points, t) {
  const c = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return c.getPoint(clamp(t, 0, 1));
}

export function formatMoney(v) {
  return '$' + Math.round(v).toLocaleString('en-US');
}
