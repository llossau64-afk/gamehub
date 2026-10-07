// Procedural textures painted on canvases at startup.
// They replace downloaded bitmaps: small, crisp, and all in one hand-tuned style.
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// tileable value noise
function makeNoise(size, seed) {
  const r = rng(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const m = size - 1;
    const a = g[((yi & m) * size) + (xi & m)];
    const b = g[((yi & m) * size) + ((xi + 1) & m)];
    const c = g[(((yi + 1) & m) * size) + (xi & m)];
    const d = g[(((yi + 1) & m) * size) + ((xi + 1) & m)];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(n, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; f *= 2; a *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ detail
// R: fine grain/grime, G: wood grain streaks, B: leather/crackle, A: scratches
export function detailTexture() {
  const S = 256;
  const c = canvas(S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const n1 = makeNoise(64, 11), n2 = makeNoise(64, 23), n3 = makeNoise(32, 37);
  const r = rng(5);
  // voronoi points for leather
  const pts = [];
  for (let i = 0; i < 90; i++) pts.push([r() * S, r() * S]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S * 16, v = y / S * 16;
      const grain = fbm(n1, u * 2, v * 2, 4);
      const wood = 0.5 + 0.5 * Math.sin((y / S) * 64 + fbm(n2, u * 0.5, v * 4, 3) * 9);
      const woodF = wood * 0.65 + fbm(n2, u * 0.3, v * 6, 3) * 0.35;
      let d1 = 1e9, d2 = 1e9;
      for (const p of pts) {
        let dx = Math.abs(x - p[0]); dx = Math.min(dx, S - dx);
        let dy = Math.abs(y - p[1]); dy = Math.min(dy, S - dy);
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const crack = Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / 3.5);
      const leather = crack * 0.7 + fbm(n3, u * 3, v * 3, 2) * 0.3;
      const i = (y * S + x) * 4;
      img.data[i] = grain * 255;
      img.data[i + 1] = woodF * 255;
      img.data[i + 2] = leather * 255;
      img.data[i + 3] = 255;
    }
  }
  // scratches into alpha
  for (let k = 0; k < 140; k++) {
    let x = r() * S, y = r() * S;
    const a = r() * Math.PI, len = 6 + r() * 30;
    for (let s = 0; s < len; s++) {
      const xi = ((Math.round(x) % S) + S) % S, yi = ((Math.round(y) % S) + S) % S;
      img.data[(yi * S + xi) * 4 + 3] = 150 + r() * 60;
      x += Math.cos(a); y += Math.sin(a);
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

// ------------------------------------------------------------------ floors
export function floorTiles(variant = 'old') {
  const S = 1024, tiles = 8;
  const c = canvas(S), ctx = c.getContext('2d');
  const r = rng(variant === 'old' ? 3 : 9);
  const n = makeNoise(64, 77);
  const ts = S / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const dark = (tx + ty) % 2 === 0;
      let base = dark ? [38, 36, 34] : [214, 204, 182];
      if (variant === 'old') base = dark ? [52, 47, 41] : [178, 162, 132];
      const jitter = (r() - 0.5) * (variant === 'old' ? 22 : 8);
      ctx.fillStyle = `rgb(${base[0] + jitter},${base[1] + jitter},${base[2] + jitter * 0.8})`;
      ctx.fillRect(tx * ts, ty * ts, ts, ts);
      if (variant === 'old' && r() < 0.18) {
        // chipped / cracked tile
        ctx.strokeStyle = 'rgba(20,16,12,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let x = tx * ts + r() * ts, y = ty * ts + r() * ts;
        ctx.moveTo(x, y);
        for (let s = 0; s < 5; s++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
  }
  // grout
  ctx.strokeStyle = variant === 'old' ? 'rgba(40,32,24,0.9)' : 'rgba(120,112,100,0.8)';
  ctx.lineWidth = variant === 'old' ? 3 : 2;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath(); ctx.moveTo(i * ts, 0); ctx.lineTo(i * ts, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * ts); ctx.lineTo(S, i * ts); ctx.stroke();
  }
  // grime layer
  const img = ctx.getImageData(0, 0, S, S);
  const amt = variant === 'old' ? 0.45 : 0.08;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const g = fbm(n, x / S * 12, y / S * 12, 4);
      const k = 1 - amt * Math.max(0, g - 0.35) * 1.6;
      const i = (y * S + x) * 4;
      img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k * 0.96;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (variant === 'old') {
    for (let k = 0; k < 14; k++) {
      const x = r() * S, y = r() * S, rad = 20 + r() * 70;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(60,44,22,0.35)');
      gr.addColorStop(1, 'rgba(60,44,22,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  return tex(c);
}

export function floorWood() {
  const W = 1024, H = 1024;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const r = rng(41);
  const n = makeNoise(64, 5);
  const plankW = W / 8;
  for (let i = 0; i < 8; i++) {
    let y = 0;
    while (y < H) {
      const len = 180 + r() * 340;
      const tone = 0.8 + r() * 0.35;
      const col = [118 * tone, 78 * tone, 48 * tone];
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.fillRect(i * plankW, y, plankW, len);
      // grain
      for (let g = 0; g < 26; g++) {
        const gx = i * plankW + r() * plankW;
        ctx.strokeStyle = `rgba(50,28,14,${0.08 + r() * 0.12})`;
        ctx.lineWidth = 0.6 + r() * 1.5;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.bezierCurveTo(gx + (r() - 0.5) * 8, y + len * 0.3, gx + (r() - 0.5) * 8, y + len * 0.7, gx + (r() - 0.5) * 6, y + len);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,18,10,0.85)';
      ctx.fillRect(i * plankW, y, plankW, 2.5);
      y += len;
    }
    ctx.fillStyle = 'rgba(30,18,10,0.9)';
    ctx.fillRect(i * plankW, 0, 2.5, H);
  }
  const img = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = 0.9 + 0.2 * fbm(n, x / W * 6, y / H * 30, 3);
    const i = (y * W + x) * 4;
    img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

// ------------------------------------------------------------------ walls
export function wallTexture(variant = 'old') {
  const W = 1024, H = 512;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const r = rng(variant === 'old' ? 17 : 19);
  const n = makeNoise(64, 31);
  const base = variant === 'old' ? [176, 160, 128] : [52, 78, 66];
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = fbm(n, x / W * 10, y / H * 5, 5);
    const k = variant === 'old' ? 0.82 + g * 0.3 : 0.93 + g * 0.1;
    const i = (y * W + x) * 4;
    img.data[i] = base[0] * k; img.data[i + 1] = base[1] * k; img.data[i + 2] = base[2] * k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (variant === 'old') {
    // water stains running down from the ceiling
    for (let k = 0; k < 9; k++) {
      const x = r() * W, w = 30 + r() * 90, h = 80 + r() * 260;
      const gr = ctx.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(90,70,40,0.35)');
      gr.addColorStop(1, 'rgba(90,70,40,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(x, 0, w / 2, h, 0, 0, Math.PI);
      ctx.fill();
    }
    // peeling patches: soft irregular blotches of an older green paint
    for (let k = 0; k < 6; k++) {
      const x = r() * W, y = 90 + r() * (H - 220);
      for (let b = 0; b < 14; b++) {
        const bx = x + (r() - 0.5) * 50, by = y + (r() - 0.5) * 34, rad = 6 + r() * 14;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
        g.addColorStop(0, 'rgba(126,140,124,0.5)');
        g.addColorStop(0.7, 'rgba(126,140,124,0.35)');
        g.addColorStop(1, 'rgba(126,140,124,0)');
        ctx.fillStyle = g;
        ctx.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
      }
    }
    // scuffs low on the wall
    for (let k = 0; k < 40; k++) {
      ctx.strokeStyle = `rgba(40,30,20,${0.1 + r() * 0.2})`;
      ctx.lineWidth = 1 + r() * 2;
      const x = r() * W, y = H * 0.75 + r() * H * 0.22;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 6); ctx.stroke();
    }
  }
  return tex(c);
}

export function brickTexture(tint = [150, 74, 52], seed = 4) {
  const S = 512;
  const c = canvas(S), ctx = c.getContext('2d');
  const r = rng(seed);
  ctx.fillStyle = 'rgb(150,140,122)';
  ctx.fillRect(0, 0, S, S);
  const bw = 64, bh = 24;
  for (let row = 0; row < S / bh; row++) {
    const off = (row % 2) * bw / 2;
    for (let col = -1; col < S / bw + 1; col++) {
      const k = 0.78 + r() * 0.35;
      ctx.fillStyle = `rgb(${tint[0] * k},${tint[1] * k},${tint[2] * k})`;
      ctx.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
  const n = makeNoise(64, seed + 9);
  const img = ctx.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = 0.85 + 0.25 * fbm(n, x / S * 16, y / S * 16, 3);
    const i = (y * S + x) * 4;
    img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

export function plasterTexture(base = [226, 218, 200], seed = 8, stains = true) {
  const S = 512;
  const c = canvas(S), ctx = c.getContext('2d');
  const n = makeNoise(64, seed);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const g = fbm(n, x / S * 8, y / S * 8, 5);
    const k = 0.86 + g * 0.2;
    const i = (y * S + x) * 4;
    img.data[i] = base[0] * k; img.data[i + 1] = base[1] * k; img.data[i + 2] = base[2] * k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (stains) {
    const r = rng(seed + 3);
    for (let k = 0; k < 3; k++) {
      const x = r() * S, y = r() * S, rad = 30 + r() * 80;
      const gr = ctx.createRadialGradient(x, y, rad * 0.6, x, y, rad);
      gr.addColorStop(0, 'rgba(150,120,70,0.05)');
      gr.addColorStop(0.9, 'rgba(120,90,50,0.12)');
      gr.addColorStop(1, 'rgba(120,90,50,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  return tex(c);
}

export function asphaltTexture() {
  const S = 512;
  const c = canvas(S), ctx = c.getContext('2d');
  const n = makeNoise(64, 91), r = rng(91);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const g = fbm(n, x / S * 30, y / S * 30, 3) * 0.5 + r() * 0.5;
    const v = 52 + g * 30;
    const i = (y * S + x) * 4;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 1.04; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

export function sidewalkTexture() {
  const S = 512;
  const c = canvas(S), ctx = c.getContext('2d');
  const n = makeNoise(64, 12), r = rng(12);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const g = fbm(n, x / S * 10, y / S * 10, 4) * 0.7 + r() * 0.3;
    const v = 140 + g * 40;
    const i = (y * S + x) * 4;
    img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 0.92; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(70,64,56,0.8)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(i * S / 2, 0); ctx.lineTo(i * S / 2, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * S / 2); ctx.lineTo(S, i * S / 2); ctx.stroke();
  }
  return tex(c);
}

// facade of the building across the street (seen through the window)
export function facadeTexture(seed, tint) {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const r = rng(seed);
  ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  ctx.fillRect(0, 0, W, H);
  const n = makeNoise(64, seed);
  const img = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = 0.88 + 0.22 * fbm(n, x / W * 8, y / H * 8, 4);
    const i = (y * W + x) * 4;
    img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  for (let fl = 0; fl < 3; fl++) {
    for (let k = 0; k < 3; k++) {
      const x = 50 + k * 160, y = 40 + fl * 160;
      ctx.fillStyle = 'rgba(40,36,34,0.9)';
      ctx.fillRect(x - 6, y - 6, 112, 102);
      const lit = r() < 0.35;
      ctx.fillStyle = lit ? 'rgb(206,170,110)' : 'rgb(58,70,80)';
      ctx.fillRect(x, y, 100, 90);
      ctx.fillStyle = lit ? 'rgba(255,220,160,0.3)' : 'rgba(130,150,170,0.25)';
      ctx.fillRect(x, y, 100, 30);
      ctx.fillStyle = 'rgba(40,36,34,1)';
      ctx.fillRect(x + 48, y, 4, 90);
      ctx.fillStyle = 'rgba(200,190,170,0.9)';
      ctx.fillRect(x - 10, y + 92, 120, 8);
      if (r() < 0.5) {
        ctx.fillStyle = ['#7a2a26', '#2f4a3a', '#c9b48a'][Math.floor(r() * 3)];
        ctx.fillRect(x, y, 100, 18 + r() * 20);
      }
    }
  }
  return tex(c);
}

// ------------------------------------------------------------------ signage
export function signTexture(offLetter = -1) {
  const W = 1024, H = 192;
  const c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#1d2433';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#a48451';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  const text = 'BARBER SHOP';
  ctx.font = '700 118px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textBaseline = 'middle';
  const total = ctx.measureText(text).width + (text.length - 1) * 14;
  let x = (W - total) / 2;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = ctx.measureText(ch).width;
    const on = i !== offLetter;
    ctx.fillStyle = on ? '#f1e2bf' : '#5d5547';
    ctx.fillText(ch, x, H / 2 + 6);
    x += w + 14;
  }
  return tex(c, { repeat: false });
}

export function signEmissive(offLetter = -1) {
  const W = 1024, H = 192;
  const c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const text = 'BARBER SHOP';
  ctx.font = '700 118px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textBaseline = 'middle';
  const total = ctx.measureText(text).width + (text.length - 1) * 14;
  let x = (W - total) / 2;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = ctx.measureText(ch).width;
    if (i !== offLetter) { ctx.fillStyle = '#ffd99a'; ctx.fillText(ch, x, H / 2 + 6); }
    x += w + 14;
  }
  return tex(c, { repeat: false });
}

export function windowDirt() {
  const S = 512;
  const c = canvas(S), ctx = c.getContext('2d');
  const n = makeNoise(64, 55);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const g = fbm(n, x / S * 6, y / S * 6, 5);
    const edge = Math.max(Math.abs(x / S - 0.5), Math.abs(y / S - 0.5)) * 2;
    const a = Math.min(1, Math.max(0, g - 0.42) * 1.2 + Math.pow(edge, 6) * 0.6 + (y / S) * 0.12);
    const i = (y * S + x) * 4;
    img.data[i] = 120; img.data[i + 1] = 108; img.data[i + 2] = 88; img.data[i + 3] = a * 200;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { repeat: false });
}

export function crackTexture() {
  const S = 512;
  const c = canvas(S), ctx = c.getContext('2d');
  const r = rng(66);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(230,236,240,0.85)';
  ctx.lineCap = 'round';
  const sx = S * 0.86, sy = S * 0.1;
  for (let b = 0; b < 7; b++) {
    let x = sx, y = sy;
    const a0 = Math.PI * (0.55 + r() * 0.5);
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x, y);
    const len = 4 + Math.floor(r() * 6);
    for (let s = 0; s < len; s++) {
      const a = a0 + (r() - 0.5) * 0.7;
      x += Math.cos(a) * (14 + r() * 26); y += Math.sin(a) * (14 + r() * 26);
      ctx.lineTo(x, y);
      ctx.lineWidth *= 0.85;
    }
    ctx.stroke();
  }
  // grime frame
  const gr = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
  gr.addColorStop(0, 'rgba(90,80,60,0)');
  gr.addColorStop(1, 'rgba(90,80,60,0.55)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, S, S);
  return tex(c, { repeat: false });
}

export function posterTexture(kind = 0) {
  const W = 384, H = 512;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const n = makeNoise(32, 70 + kind);
  ctx.fillStyle = '#e9dcc0';
  ctx.fillRect(0, 0, W, H);
  if (kind === 0) {
    ctx.fillStyle = '#7a2a26';
    ctx.fillRect(18, 18, W - 36, 70);
    ctx.fillStyle = '#efe4cf';
    ctx.font = '700 46px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CLASSIC CUTS', W / 2, 68);
    // 6 head silhouettes with haircut outlines
    for (let i = 0; i < 6; i++) {
      const x = 80 + (i % 3) * 112, y = 170 + Math.floor(i / 3) * 170;
      ctx.fillStyle = '#c9a989';
      ctx.beginPath(); ctx.ellipse(x, y, 34, 42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a211b';
      ctx.beginPath();
      const h = [16, 26, 8, 30, 20, 12][i];
      ctx.ellipse(x, y - 18, 36, h + 10, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 36, y - 20, 6, 18 - i * 2);
      ctx.fillRect(x + 30, y - 20, 6, 18 - i * 2);
      ctx.fillStyle = '#3a2d24';
      ctx.font = '600 20px "Barlow Condensed", sans-serif';
      ctx.fillText(['TRIM', 'POMP', 'BUZZ', 'QUIFF', 'PART', 'CREW'][i], x, y + 70);
    }
  } else {
    ctx.fillStyle = '#22324a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#b58a3c';
    ctx.lineWidth = 6;
    ctx.strokeRect(22, 22, W - 44, H - 44);
    ctx.fillStyle = '#efe4cf';
    ctx.textAlign = 'center';
    ctx.font = '400 54px "DM Serif Display", serif';
    ctx.fillText('Sharp', W / 2, 150);
    ctx.fillText('Since', W / 2, 210);
    ctx.font = '700 120px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#b58a3c';
    ctx.fillText('1962', W / 2, 340);
    // straight razor
    ctx.fillStyle = '#d8d4c8';
    ctx.beginPath(); ctx.moveTo(100, 410); ctx.lineTo(260, 380); ctx.lineTo(270, 396); ctx.lineTo(110, 426); ctx.fill();
    ctx.fillStyle = '#5a3a24';
    ctx.fillRect(250, 382, 60, 14);
  }
  // age
  const img = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = fbm(n, x / W * 6, y / H * 8, 4);
    const k = 0.82 + g * 0.22;
    const i = (y * W + x) * 4;
    img.data[i] *= k; img.data[i + 1] *= k * 0.98; img.data[i + 2] *= k * 0.9;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { repeat: false });
}

export function cashTexture() {
  const W = 256, H = 112;
  const c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#9fb48f';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#4d6447';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.fillStyle = '#c7d3b5';
  ctx.beginPath(); ctx.ellipse(W / 2, H / 2, 30, 38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4d6447';
  ctx.font = '700 34px "Barlow Condensed", sans-serif';
  ctx.fillText('20', 16, 40);
  ctx.fillText('20', W - 50, H - 16);
  ctx.font = '700 20px "Barlow Condensed", sans-serif';
  ctx.fillText('$', W / 2 - 6, H / 2 + 7);
  return tex(c, { repeat: false });
}

// hair strand noise: R = strand id (random per strand cell), G = clump noise
export function hairNoise() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const r = rng(101);
  const n = makeNoise(32, 103);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    data[i] = Math.floor(r() * 255);
    data[i + 1] = Math.floor(fbm(n, x / S * 8, y / S * 8, 3) * 255);
    data[i + 2] = Math.floor(r() * 255);
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function blobShadowTexture() {
  const S = 128;
  const c = canvas(S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return tex(c, { repeat: false, srgb: false });
}

export function labelTexture(text, bg, fg, seed = 1) {
  const W = 256, H = 128;
  const c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg;
  ctx.font = '700 44px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, H / 2 + 14);
  ctx.fillRect(30, 20, W - 60, 4);
  ctx.fillRect(30, H - 24, W - 60, 4);
  return tex(c, { repeat: false });
}

export function doorSignTexture() {
  const W = 256, H = 128;
  const c = canvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#e6dcc4'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#7a2a26'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.fillStyle = '#7a2a26';
  ctx.font = '800 64px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('OPEN', W / 2, H / 2 + 4);
  return tex(c, { repeat: false });
}
