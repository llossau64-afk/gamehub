// Procedural texture library. Everything is painted into canvases at load time so the
// game ships without image files. Textures are tileable where they repeat.

import * as THREE from 'three';
import { rng } from '../core/util.js';

const cache = new Map();
let anisotropy = 4;
export const setAnisotropy = (a) => { anisotropy = a; };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Tileable value noise -------------------------------------------------------
function makeLattice(seed, size) {
  const r = rng(seed);
  const a = new Float32Array(size * size);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}
function vnoise(lat, size, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % size) + size) % size, y0 = ((yi % size) + size) % size;
  const x1 = (x0 + 1) % size, y1 = (y0 + 1) % size;
  const a = lat[y0 * size + x0], b = lat[y0 * size + x1], c = lat[y1 * size + x0], d = lat[y1 * size + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fbm field of w*h with base period `p` cells (tileable)
export function fbmField(w, h, p, oct, seed, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const per = p << o;
    const lat = makeLattice(seed + o * 101, per);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      out[y * w + x] += amp * vnoise(lat, per, (x / w) * per, (y / h) * per);
    }
    norm += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function toTexture(c, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.needsUpdate = true;
  return t;
}

function fieldToImage(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const c = fn(x, y, y * w + x);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] === undefined ? 255 : c[3];
  }
  ctx.putImageData(img, 0, 0);
}

const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

// ---------------------------------------------------------------- road surfaces
// Road textures: u across the full road width, v along 16 metres.
export function roadTexture(kind) {
  return memo('road_' + kind, () => {
    const W = 256, H = 512;
    const c = canvas(W, H), g = c.getContext('2d');
    const r = rng(kind.length * 977 + 13);
    const n = fbmField(W, H, 8, 5, 31 + kind.length);
    const fine = fbmField(W, H, 64, 2, 77);
    const pal = {
      asphalt: [78, 77, 76], damaged: [86, 84, 80], gravel: [118, 108, 94], dirt: [106, 88, 66],
      snow: [208, 212, 218], concrete: [128, 126, 120],
    }[kind];
    fieldToImage(g, W, H, (x, y, i) => {
      const v = (n[i] - 0.5) * 34 + (fine[i] - 0.5) * 30;
      let s = r() < (kind === 'gravel' ? 0.25 : 0.08) ? (r() - 0.5) * 70 : 0;
      if (kind === 'snow') s *= 0.3;
      // wheel tracks: slightly darker / polished bands
      const u = x / W;
      const track = Math.exp(-Math.pow((u - 0.3) / 0.06, 2)) + Math.exp(-Math.pow((u - 0.7) / 0.06, 2));
      const tk = kind === 'snow' ? -38 * track : kind === 'dirt' || kind === 'gravel' ? -16 * track : -6 * track;
      return [pal[0] + v + s + tk, pal[1] + v + s + tk, pal[2] + v * 0.95 + s + tk * 0.9];
    });
    if (kind === 'concrete') {
      g.strokeStyle = 'rgba(40,40,40,0.55)'; g.lineWidth = 2;
      for (let y = 0; y < H; y += H / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
    }
    if (kind === 'damaged' || kind === 'asphalt') {
      // patches and cracks
      const patches = kind === 'damaged' ? 7 : 2;
      for (let p = 0; p < patches; p++) {
        g.fillStyle = `rgba(${30 + r() * 25},${30 + r() * 25},${32 + r() * 25},${0.35 + r() * 0.4})`;
        const x = r() * W, y = r() * H, w = 20 + r() * 80, h = 20 + r() * 90;
        g.fillRect(x, y, w, h);
      }
      const cracks = kind === 'damaged' ? 28 : 6;
      g.strokeStyle = 'rgba(15,15,15,0.75)';
      for (let k = 0; k < cracks; k++) {
        let x = r() * W, y = r() * H;
        g.lineWidth = 0.8 + r() * 1.6;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 8 + r() * 12; s++) { x += (r() - 0.5) * 18; y += (r() - 0.3) * 16; g.lineTo(x, y); }
        g.stroke();
      }
    }
    if (kind === 'asphalt' || kind === 'damaged' || kind === 'concrete') {
      // markings: edge lines + dashed centre line
      const fade = kind === 'damaged' ? 0.45 : kind === 'concrete' ? 0.7 : 0.85;
      g.fillStyle = `rgba(222,218,204,${fade})`;
      g.fillRect(W * 0.035, 0, W * 0.018, H);
      g.fillRect(W * (1 - 0.053), 0, W * 0.018, H);
      g.fillStyle = `rgba(214,170,52,${fade})`;
      for (let y = 0; y < H; y += H / 2) g.fillRect(W * 0.494, y, W * 0.014, H * 0.22);
      // wear the paint
      const wear = fbmField(W, H, 16, 3, 999);
      const img = g.getImageData(0, 0, W, H);
      for (let i = 0; i < W * H; i++) {
        if (wear[i] < (kind === 'damaged' ? 0.52 : 0.38)) {
          const o = i * 4, k = 0.5 + n[i] * 0.3;
          img.data[o] = img.data[o] * k + pal[0] * (1 - k);
          img.data[o + 1] = img.data[o + 1] * k + pal[1] * (1 - k);
          img.data[o + 2] = img.data[o + 2] * k + pal[2] * (1 - k);
        }
      }
      g.putImageData(img, 0, 0);
    }
    if (kind === 'gravel' || kind === 'dirt') {
      for (let k = 0; k < 900; k++) {
        const x = r() * W, y = r() * H, s = 0.6 + r() * 2.2, l = 70 + r() * 90;
        g.fillStyle = `rgba(${l},${l * 0.95},${l * 0.85},0.8)`;
        g.beginPath(); g.ellipse(x, y, s, s * (0.6 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill();
      }
    }
    return toTexture(c);
  });
}

// Height-ish detail texture for terrain (greyscale, multiplied with vertex colour)
export function terrainDetail() {
  return memo('terrainDetail', () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    const a = fbmField(S, S, 8, 5, 5);
    const b = fbmField(S, S, 32, 3, 9);
    const r = rng(4);
    fieldToImage(g, S, S, (x, y, i) => {
      let v = 200 + (a[i] - 0.5) * 100 + (b[i] - 0.5) * 60 + (r() - 0.5) * 26;
      return [v, v, v];
    });
    return toTexture(c);
  });
}

export function rockTexture() {
  return memo('rock', () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    const a = fbmField(S, S, 4, 6, 17, 0.55);
    const b = fbmField(S, S, 16, 3, 23);
    fieldToImage(g, S, S, (x, y, i) => {
      const ridge = 1 - Math.abs(b[i] - 0.5) * 2;
      const v = 185 + (a[i] - 0.5) * 110 - Math.pow(ridge, 6) * 70;
      return [v * 1.02, v, v * 0.95];
    });
    return toTexture(c);
  });
}

export function barkTexture() {
  return memo('bark', () => {
    const W = 128, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const a = fbmField(W, H, 4, 4, 41);
    const r = rng(2);
    fieldToImage(g, W, H, (x, y, i) => {
      const groove = Math.pow(Math.abs(Math.sin((x / W) * Math.PI * 9 + a[i] * 5)), 0.4);
      const v = 40 + groove * 45 + (r() - 0.5) * 12;
      return [v * 1.15, v * 0.92, v * 0.7];
    });
    return toTexture(c);
  });
}

// Car wear mask: R dirt, G rust, B scratches.
export function carMask() {
  return memo('carMask', () => {
    const S = 512;
    const c = canvas(S, S), g = c.getContext('2d');
    const d = fbmField(S, S, 8, 5, 101);
    const rs = fbmField(S, S, 16, 4, 202, 0.6);
    fieldToImage(g, S, S, (x, y, i) => [d[i] * 255, Math.pow(rs[i], 1.6) * 255 * 1.4, 0]);
    // scratches: thin bright strokes in the blue channel
    g.globalCompositeOperation = 'lighter';
    const r = rng(303);
    for (let k = 0; k < 420; k++) {
      const x = r() * S, y = r() * S, len = 6 + r() * 60, a = r() * Math.PI;
      const v = Math.floor(r() * 255);
      g.strokeStyle = `rgb(0,0,${v})`;
      g.lineWidth = 0.6 + r() * 1.4;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 8, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    return toTexture(c, { linear: true });
  });
}

export function crackTexture() {
  return memo('crack', () => {
    const S = 512;
    const c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    const r = rng(77);
    const centers = [[S * 0.3, S * 0.4], [S * 0.72, S * 0.62], [S * 0.5, S * 0.2]];
    for (const [cx, cy] of centers) {
      g.strokeStyle = 'rgba(235,240,245,0.85)';
      for (let k = 0; k < 16; k++) {
        let x = cx, y = cy;
        const a = (k / 16) * Math.PI * 2 + r() * 0.3;
        g.lineWidth = 0.9 + r();
        g.beginPath(); g.moveTo(x, y);
        let len = 30 + r() * 170;
        for (let s = 0; s < 6; s++) { x += Math.cos(a + (r() - 0.5) * 0.6) * len / 6; y += Math.sin(a + (r() - 0.5) * 0.6) * len / 6; g.lineTo(x, y); }
        g.stroke();
      }
      for (let ring = 1; ring < 4; ring++) {
        g.lineWidth = 0.7;
        g.beginPath();
        for (let k = 0; k <= 20; k++) {
          const a = (k / 20) * Math.PI * 2, rr = ring * 22 + r() * 10;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          k ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(230,235,240,0.6)';
      g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill();
    }
    return toTexture(c, { clamp: true });
  });
}

export function tireTexture(kind) {
  return memo('tire_' + kind, () => {
    const W = 64, H = 512;
    const c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#1d1d1e'; g.fillRect(0, 0, W, H);
    const r = rng(kind.length * 7);
    // v runs around the circumference, u across (sidewall - tread - sidewall)
    const tread = (y0) => {
      g.fillStyle = '#0d0d0e';
      if (kind === 'offroad' || kind === 'at') {
        const big = kind === 'offroad';
        for (let y = 0; y < H; y += big ? 32 : 22) {
          g.fillRect(W * 0.28, y, W * 0.18, big ? 14 : 8);
          g.fillRect(W * 0.54, y + (big ? 16 : 11), W * 0.18, big ? 14 : 8);
        }
      } else if (kind === 'snow') {
        for (let y = 0; y < H; y += 10) { g.fillRect(W * 0.3, y, W * 0.4, 2); g.fillRect(W * 0.3 + (y % 20 ? 6 : 0), y + 4, W * 0.3, 1); }
      } else if (kind === 'race' || kind === 'perf') {
        g.fillRect(W * 0.4, 0, 2, H); g.fillRect(W * 0.6, 0, 2, H);
        if (kind === 'perf') for (let y = 0; y < H; y += 18) { g.save(); g.translate(W * 0.3, y); g.rotate(0.6); g.fillRect(0, 0, 10, 2); g.restore(); }
      } else {
        g.fillRect(W * 0.38, 0, 2, H); g.fillRect(W * 0.62, 0, 2, H);
        for (let y = 0; y < H; y += 14) { g.fillRect(W * 0.3, y, W * 0.08, 2); g.fillRect(W * 0.64, y + 7, W * 0.08, 2); }
      }
    };
    tread();
    // sidewalls
    g.fillStyle = '#232324'; g.fillRect(0, 0, W * 0.22, H); g.fillRect(W * 0.78, 0, W * 0.22, H);
    if (kind === 'perf' || kind === 'race') {
      g.fillStyle = 'rgba(200,200,195,0.7)';
      for (let y = 30; y < H; y += 128) { g.fillRect(W * 0.06, y, 3, 40); g.fillRect(W * 0.9, y + 60, 3, 40); }
    }
    // wear grain
    const n = fbmField(W, H, 8, 3, 9);
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) { const v = (n[i] - 0.5) * 18; img.data[i * 4] += v; img.data[i * 4 + 1] += v; img.data[i * 4 + 2] += v; }
    g.putImageData(img, 0, 0);
    return toTexture(c);
  });
}

export function grilleTexture() {
  return memo('grille', () => {
    const W = 256, H = 128;
    const c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#141414'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2a2a2a';
    for (let y = 8; y < H; y += 12) g.fillRect(0, y, W, 4);
    g.fillStyle = '#070707';
    for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 2, H);
    return toTexture(c);
  });
}

export function plateTexture(text) {
  return memo('plate_' + text, () => {
    const c = canvas(256, 64), g = c.getContext('2d');
    g.fillStyle = '#d9d6c8'; g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#222'; g.lineWidth = 4; g.strokeRect(3, 3, 250, 58);
    g.fillStyle = '#1b2a55'; g.fillRect(6, 6, 22, 52);
    g.fillStyle = '#1a1a1a';
    g.font = '600 40px "Barlow Condensed", Arial Narrow, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 142, 34);
    return toTexture(c, { clamp: true });
  });
}

// Soft round particle sprite
export function softSprite() {
  return memo('soft', () => {
    const S = 64;
    const c = canvas(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return toTexture(c, { clamp: true });
  });
}

export function puddleTexture() {
  return memo('puddle', () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    const n = fbmField(S, S, 4, 4, 55);
    fieldToImage(g, S, S, (x, y, i) => {
      const dx = x / S - 0.5, dy = y / S - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2 + (n[i] - 0.5) * 0.6;
      const a = Math.max(0, Math.min(1, (0.9 - d) * 5));
      return [255, 255, 255, a * 255];
    });
    return toTexture(c, { clamp: true });
  });
}

export function mudTexture() {
  return memo('mud', () => {
    const W = 256, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const n = fbmField(W, H, 6, 5, 66);
    const e = fbmField(W, H, 3, 3, 67);
    fieldToImage(g, W, H, (x, y, i) => {
      const u = x / W, v = y / H;
      const edge = Math.min(u, 1 - u, v, 1 - v) * 4 + (e[i] - 0.5) * 1.4;
      const a = Math.max(0, Math.min(1, edge * 2.2));
      const l = 40 + n[i] * 45;
      return [l * 1.05, l * 0.82, l * 0.58, a * 235];
    });
    return toTexture(c, { clamp: true });
  });
}

export function iceTexture() {
  return memo('ice', () => {
    const W = 256, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const n = fbmField(W, H, 8, 4, 88);
    const e = fbmField(W, H, 3, 3, 89);
    fieldToImage(g, W, H, (x, y, i) => {
      const u = x / W, v = y / H;
      const edge = Math.min(u, 1 - u, v, 1 - v) * 4 + (e[i] - 0.5) * 1.6;
      const a = Math.max(0, Math.min(1, edge * 2));
      const l = 190 + n[i] * 50;
      return [l * 0.92, l * 0.97, l, a * 150];
    });
    return toTexture(c, { clamp: true });
  });
}

// Generic wall/floor materials for the garage and buildings -----------------
export function concreteTexture(seed = 1, tone = 1) {
  return memo('concrete_' + seed + '_' + tone, () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    const a = fbmField(S, S, 6, 5, 300 + seed);
    const b = fbmField(S, S, 3, 3, 310 + seed);
    const r = rng(seed);
    fieldToImage(g, S, S, (x, y, i) => {
      const v = (130 + (a[i] - 0.5) * 60 + (r() - 0.5) * 14) * tone;
      const stain = Math.max(0, b[i] - 0.62) * 260;
      return [v - stain * 0.9, v - stain, v - stain * 1.15];
    });
    return toTexture(c);
  });
}

export function oilStains() {
  return memo('oilstains', () => {
    const S = 512;
    const c = canvas(S, S), g = c.getContext('2d');
    const r = rng(12);
    for (let k = 0; k < 14; k++) {
      const x = r() * S, y = r() * S, rad = 10 + r() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(10,8,5,0.75)'); gr.addColorStop(1, 'rgba(10,8,5,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    return toTexture(c, { clamp: true });
  });
}

export function planksTexture(color = [120, 92, 62]) {
  return memo('planks_' + color.join(), () => {
    const W = 256, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const n = fbmField(W, H, 4, 4, 401);
    const r = rng(5);
    fieldToImage(g, W, H, (x, y, i) => {
      const board = Math.floor(x / 32);
      const t = 0.85 + ((board * 7919) % 13) / 60;
      const grain = Math.sin(y * 0.15 + n[i] * 9 + board) * 8;
      const gap = x % 32 < 2 ? 0.35 : 1;
      const v = t * gap;
      return [(color[0] + grain) * v + (r() - 0.5) * 6, (color[1] + grain) * v, (color[2] + grain * 0.7) * v];
    });
    return toTexture(c);
  });
}

export function blockWallTexture(base = [150, 148, 140]) {
  return memo('blocks_' + base.join(), () => {
    const W = 256, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const n = fbmField(W, H, 8, 4, 501);
    fieldToImage(g, W, H, (x, y, i) => {
      const row = Math.floor(y / 32);
      const off = row % 2 ? 32 : 0;
      const joint = y % 32 < 3 || (x + off) % 64 < 3;
      const v = joint ? 0.62 : 0.92 + (n[i] - 0.5) * 0.25;
      return [base[0] * v, base[1] * v, base[2] * v];
    });
    return toTexture(c);
  });
}

export function corrugatedTexture() {
  return memo('corrugated', () => {
    const W = 256, H = 256;
    const c = canvas(W, H), g = c.getContext('2d');
    const n = fbmField(W, H, 4, 4, 601);
    fieldToImage(g, W, H, (x, y, i) => {
      const s = Math.sin((y / H) * Math.PI * 24);
      const rust = Math.max(0, n[i] - 0.55) * 3;
      const v = 120 + s * 30;
      return [v + rust * 60, v - rust * 10, v - rust * 50];
    });
    return toTexture(c);
  });
}

export function pegboardTexture() {
  return memo('pegboard', () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#8a7656'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#2b241a';
    for (let y = 8; y < S; y += 16) for (let x = 8; x < S; x += 16) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
    return toTexture(c);
  });
}

export function carbonTexture() {
  return memo('carbon', () => {
    const S = 128;
    const c = canvas(S, S), g = c.getContext('2d');
    for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) {
      const k = ((x + y) / 8) % 2;
      g.fillStyle = k ? '#1b1c1e' : '#2a2c30';
      g.fillRect(x, y, 8, 8);
    }
    return toTexture(c, { repeat: [6, 6] });
  });
}

// Signs ----------------------------------------------------------------------
export function signTexture(type, text) {
  return memo('sign_' + type + '_' + (text || ''), () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    const tri = (fill = '#e6dfc8') => {
      g.fillStyle = '#b3241c'; g.beginPath(); g.moveTo(S / 2, 12); g.lineTo(S - 10, S - 26); g.lineTo(10, S - 26); g.closePath(); g.fill();
      g.fillStyle = fill; g.beginPath(); g.moveTo(S / 2, 44); g.lineTo(S - 38, S - 42); g.lineTo(38, S - 42); g.closePath(); g.fill();
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (type === 'curveL' || type === 'curveR' || type === 'hairpinL' || type === 'hairpinR') {
      tri();
      g.strokeStyle = '#151515'; g.lineWidth = 14;
      const m = type.endsWith('L') ? -1 : 1;
      g.beginPath();
      if (type.startsWith('hairpin')) {
        g.moveTo(S / 2 - m * 26, S - 64); g.lineTo(S / 2 - m * 26, 128); g.arc(S / 2, 128, 26, Math.PI, 0, m < 0); g.lineTo(S / 2 + m * 26, 150);
      } else { g.moveTo(S / 2 - m * 10, S - 64); g.quadraticCurveTo(S / 2 - m * 10, 120, S / 2 + m * 30, 104); }
      g.stroke();
      g.fillStyle = '#151515'; g.beginPath();
      const ax = type.startsWith('hairpin') ? S / 2 + m * 26 : S / 2 + m * 34, ay = type.startsWith('hairpin') ? 168 : 100;
      if (type.startsWith('hairpin')) { g.moveTo(ax - 16, ay - 18); g.lineTo(ax + 16, ay - 18); g.lineTo(ax, ay + 4); }
      else { g.moveTo(ax + m * 10, ay - 4); g.lineTo(ax - m * 16, ay - 20); g.lineTo(ax - m * 10, ay + 18); }
      g.fill();
    } else if (type === 'chevL' || type === 'chevR') {
      g.fillStyle = '#efe9d4'; g.fillRect(0, 40, S, S - 80);
      g.fillStyle = '#b3241c';
      const m = type === 'chevL' ? -1 : 1;
      for (let k = 0; k < 2; k++) {
        const x = S / 2 + (k - 0.5) * 90;
        g.beginPath(); g.moveTo(x - m * 30, 60); g.lineTo(x + m * 20, S / 2); g.lineTo(x - m * 30, S - 60); g.lineTo(x - m * 5, S - 60); g.lineTo(x + m * 45, S / 2); g.lineTo(x - m * 5, 60); g.closePath(); g.fill();
      }
    } else if (type === 'bump' || type === 'rockfall' || type === 'ice' || type === 'tunnel') {
      tri();
      g.fillStyle = '#151515';
      if (type === 'bump') { g.beginPath(); g.moveTo(66, 178); g.quadraticCurveTo(S / 2, 90, S - 66, 178); g.fill(); }
      if (type === 'rockfall') {
        g.beginPath(); g.moveTo(80, 180); g.lineTo(100, 90); g.lineTo(110, 180); g.fill();
        for (const [x, y, r] of [[140, 120, 10], [160, 150, 13], [130, 165, 8]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
      }
      if (type === 'ice') { g.font = '700 54px Arial'; g.textAlign = 'center'; g.fillText('❄', S / 2, 178); }
      if (type === 'tunnel') { g.beginPath(); g.moveTo(80, 185); g.lineTo(80, 130); g.arc(S / 2, 130, 48, Math.PI, 0); g.lineTo(176, 185); g.closePath(); g.fill(); g.fillStyle = '#e6dfc8'; g.fillRect(S / 2 - 4, 140, 8, 40); }
    } else if (type === 'km') {
      g.fillStyle = '#eae6dc'; g.fillRect(48, 20, S - 96, S - 40);
      g.fillStyle = '#1a1a1a'; g.fillRect(48, 20, S - 96, 40);
      g.fillStyle = '#eae6dc'; g.font = '700 30px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.fillText('KM', S / 2, 52);
      g.fillStyle = '#1a1a1a'; g.font = '700 110px "Barlow Condensed", Arial'; g.fillText(text, S / 2, 190);
    } else if (type === 'region') {
      g.fillStyle = '#2c4a33'; g.fillRect(4, 64, S - 8, S - 128);
      g.strokeStyle = '#e8e4d8'; g.lineWidth = 5; g.strokeRect(12, 72, S - 24, S - 144);
      g.fillStyle = '#e8e4d8'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const words = text.split(' ');
      const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [text];
      g.font = `600 ${lines.length > 1 ? 34 : 38}px "Barlow Condensed", Arial`;
      lines.forEach((l, i) => g.fillText(l, S / 2, S / 2 + (i - (lines.length - 1) / 2) * 38));
    } else if (type === 'shortcut') {
      g.fillStyle = '#6b5233'; g.fillRect(10, 90, S - 20, 80);
      g.fillStyle = '#e8e2d0'; g.font = '700 46px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.fillText('SHORTCUT →', S / 2, 145);
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3; for (let y = 100; y < 170; y += 14) { g.beginPath(); g.moveTo(10, y); g.lineTo(S - 10, y + 3); g.stroke(); }
    } else if (type === 'village') {
      g.fillStyle = '#e6dfc8'; g.fillRect(4, 70, S - 8, S - 140);
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 6; g.strokeRect(10, 76, S - 20, S - 152);
      g.fillStyle = '#1a1a1a'; g.font = '700 42px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, S / 2, S / 2);
    }
    return toTexture(c, { clamp: true });
  });
}

export function noiseTexture() {
  return memo('noiseTex', () => {
    const S = 256;
    const c = canvas(S, S), g = c.getContext('2d');
    const a = fbmField(S, S, 4, 6, 1234, 0.55);
    const b = fbmField(S, S, 8, 5, 4321, 0.5);
    fieldToImage(g, S, S, (x, y, i) => [a[i] * 255, b[i] * 255, 0]);
    return toTexture(c, { linear: true });
  });
}

export function waterTexture() {
  return memo('water', () => {
    const W = 128, H = 512;
    const c = canvas(W, H), g = c.getContext('2d');
    const n = fbmField(W, H, 4, 4, 777);
    fieldToImage(g, W, H, (x, y, i) => {
      const streak = Math.pow(Math.abs(Math.sin(x * 0.4 + n[i] * 8)), 6);
      const v = 170 + streak * 85 + (n[i] - 0.5) * 50;
      return [v * 0.9, v * 0.96, v, 140 + streak * 115];
    });
    return toTexture(c);
  });
}

export function posterTexture(kind) {
  return memo('poster_' + kind, () => {
    const W = 256, H = 360;
    const c = canvas(W, H), g = c.getContext('2d');
    if (kind === 'map') {
      g.fillStyle = '#d9cfb4'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#8a7d60'; g.lineWidth = 1;
      for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(W / 2 + k * 3, 160 + k * 4, 30 + k * 12, 20 + k * 9, 0.3, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = '#7a2a1c'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 70);
      for (let y = 70; y < 330; y += 20) g.lineTo(128 + Math.sin(y * 0.09) * 50, y);
      g.stroke();
      g.fillStyle = '#2b2b2b'; g.font = '700 26px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.fillText('HOLLOW PEAK', W / 2, 40);
      g.font = '500 16px "Barlow Condensed", Arial'; g.fillText('PASS ROAD · 25 KM', W / 2, 350);
    } else if (kind === 'oil') {
      g.fillStyle = '#20343a'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#d6a43a'; g.beginPath(); g.arc(W / 2, 150, 70, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#20343a'; g.font = '700 54px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.fillText('GRADE', W / 2, 168);
      g.fillStyle = '#e8e2d0'; g.font = '600 28px "Barlow Condensed", Arial'; g.fillText('MOTOR OIL · 15W-40', W / 2, 290);
    } else {
      g.fillStyle = '#5a1f17'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#e8e2d0'; g.font = '700 40px "Barlow Condensed", Arial'; g.textAlign = 'center';
      g.fillText('HILL CLIMB', W / 2, 80); g.font = '500 22px "Barlow Condensed", Arial'; g.fillText('SUNDAY · 9:00', W / 2, 115);
      g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(20, 300); g.lineTo(110, 160); g.lineTo(160, 220); g.lineTo(200, 170); g.lineTo(240, 300); g.fill();
    }
    // age it
    const n = fbmField(W, H, 4, 3, 91);
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) { const k = 0.82 + n[i] * 0.25; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k * 0.95; }
    g.putImageData(img, 0, 0);
    return toTexture(c, { clamp: true });
  });
}

export function lightGlowTexture() {
  return memo('glow', () => {
    const S = 128;
    const c = canvas(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.15, 'rgba(255,240,210,0.6)'); gr.addColorStop(1, 'rgba(255,230,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return toTexture(c, { clamp: true });
  });
}

// Rim face patterns (alpha cut-outs show the brake disc behind).
export function rimTexture(style) {
  return memo('rim_' + style, () => {
    const S = 256, c = canvas(S, S), g = c.getContext('2d');
    const C = S / 2;
    g.clearRect(0, 0, S, S);
    const disc = (col, r) => { g.fillStyle = col; g.beginPath(); g.arc(C, C, r, 0, Math.PI * 2); g.fill(); };
    const hole = (r, n, rad, rot = 0, w = 1) => {
      g.save(); g.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * Math.PI * 2;
        g.beginPath(); g.ellipse(C + Math.cos(a) * r, C + Math.sin(a) * r, rad * w, rad, a, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    };
    const spokes = (n, inner, outer, width, col) => {
      g.save(); g.globalCompositeOperation = 'destination-out'; disc('#000', outer); g.restore();
      g.fillStyle = col;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        g.save(); g.translate(C, C); g.rotate(a);
        g.beginPath(); g.moveTo(-width, inner * 0.6); g.lineTo(width, inner * 0.6); g.lineTo(width * 0.6, outer + 4); g.lineTo(-width * 0.6, outer + 4); g.closePath(); g.fill();
        g.restore();
      }
    };
    if (style === 'steel' || style === 'offroad') {
      disc(style === 'steel' ? '#6c6d6a' : '#2b2c2a', C);
      disc(style === 'steel' ? '#7c7d79' : '#383936', C * 0.62);
      hole(C * 0.72, style === 'steel' ? 4 : 8, style === 'steel' ? 14 : 10, 0.3, style === 'steel' ? 1.6 : 1);
      disc('#4a4a48', C * 0.22);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; g.fillStyle = '#9a9a96'; g.beginPath(); g.arc(C + Math.cos(a) * 18, C + Math.sin(a) * 18, 4, 0, Math.PI * 2); g.fill(); }
    } else if (style === 'hubcap') {
      disc('#b9bcbf', C);
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.strokeStyle = k % 2 ? '#8a8d90' : '#d8dbde'; g.lineWidth = 3; g.beginPath(); g.moveTo(C + Math.cos(a) * 34, C + Math.sin(a) * 34); g.lineTo(C + Math.cos(a) * (C - 8), C + Math.sin(a) * (C - 8)); g.stroke(); }
      disc('#e1e4e6', 30);
    } else if (style === 'alloy' || style === 'rally' || style === 'dish') {
      const col = style === 'rally' ? '#d9d6cc' : style === 'dish' ? '#9fa3a7' : '#8d9196';
      disc(col, C);
      const n = style === 'rally' ? 6 : style === 'dish' ? 10 : 5;
      spokes(n, 30, C * 0.86, style === 'dish' ? 7 : 15, col);
      g.strokeStyle = style === 'dish' ? '#e6e9ec' : col; g.lineWidth = C * 0.16; g.beginPath(); g.arc(C, C, C * 0.92, 0, Math.PI * 2); g.stroke();
      disc('#2a2a2a', 26); disc(col, 20);
    } else if (style === 'beadlock') {
      disc('#1c1c1c', C);
      hole(C * 0.55, 6, 22, 0);
      g.fillStyle = '#9a9a96';
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.beginPath(); g.arc(C + Math.cos(a) * C * 0.88, C + Math.sin(a) * C * 0.88, 4, 0, Math.PI * 2); g.fill(); }
      disc('#303030', 30);
    }
    return toTexture(c, { clamp: true });
  });
}
