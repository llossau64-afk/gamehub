// The other shops on the street: painted shop windows (an interior you can see into, a door,
// a reflection) and name boards. You can't go in, but they should look open for business.
import * as THREE from 'three';

export const SHOPS = [
  { name: 'BAKERY', sub: 'fresh every morning', wall: '#e9d2a6', sign: '#7a2a26', ink: '#f3e2b5', kind: 'bakery' },
  { name: 'CAFÉ LUNA', sub: 'espresso · cake', wall: '#c99a6b', sign: '#24344d', ink: '#f0d9a8', kind: 'cafe' },
  { name: 'BOOKS', sub: 'new & used', wall: '#b9a27f', sign: '#2f4a3a', ink: '#e8dcc0', kind: 'books' },
  { name: 'FLOWERS', sub: 'bouquets to go', wall: '#dfe4d2', sign: '#3e6b4a', ink: '#ffffff', kind: 'flowers' },
  { name: 'KEBAB HOUSE', sub: 'open late', wall: '#e8c48a', sign: '#b8302b', ink: '#ffe9a8', kind: 'kebab' },
  { name: 'PHONE FIX', sub: 'screens · batteries', wall: '#d9dde2', sign: '#1c1c1e', ink: '#6fd3ff', kind: 'phone' },
  { name: 'GROCER', sub: 'fruit & veg', wall: '#e6d9b8', sign: '#c9922e', ink: '#2a1c10', kind: 'grocer' },
  { name: 'TAILOR', sub: 'alterations', wall: '#cbb9a0', sign: '#3a2a1e', ink: '#e9c983', kind: 'tailor' },
  { name: 'PIZZERIA ROMA', sub: 'wood-fired since 1987', wall: '#e8c9a0', sign: '#2f6b3a', ink: '#fff3d0', kind: 'pizza' },
  { name: 'PHARMACY', sub: 'open 8 – 20', wall: '#e9f0ec', sign: '#2f8a4a', ink: '#ffffff', kind: 'pharmacy' },
  { name: 'LAUNDRETTE', sub: 'wash · dry · fold', wall: '#dfe8f0', sign: '#24447a', ink: '#bfe3ff', kind: 'laundry' },
  { name: 'GOLD & CO', sub: 'jewellers', wall: '#2a2420', sign: '#141210', ink: '#e9c46f', kind: 'jeweller' },
];

export const SUPERMARKET = { name: 'FRESH MART', sub: 'supermarket · open 7 – 22', wall: '#f3f1ea', sign: '#c8302b', ink: '#ffffff', kind: 'super' };

function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

export function shopWindowTexture(shop, aspect = 2, seed = 1) {
  const H = 256, W = Math.round(H * aspect);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const r = rng(seed);
  // interior: back wall with warm light falling off, floor
  const gr = x.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, shop.wall); gr.addColorStop(0.75, shade(shop.wall, -0.25)); gr.addColorStop(1, shade(shop.wall, -0.5));
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  const lg = x.createRadialGradient(W * 0.5, H * 0.1, 10, W * 0.5, H * 0.3, W * 0.6);
  lg.addColorStop(0, 'rgba(255,230,180,0.45)'); lg.addColorStop(1, 'rgba(255,230,180,0)');
  x.fillStyle = lg; x.fillRect(0, 0, W, H);
  // pendant lamps
  for (let i = 0; i < 3; i++) {
    const lx = W * (0.2 + i * 0.3);
    x.strokeStyle = '#2a2420'; x.lineWidth = 2; x.beginPath(); x.moveTo(lx, 0); x.lineTo(lx, 30); x.stroke();
    x.fillStyle = '#ffe2a0'; x.beginPath(); x.arc(lx, 36, 9, Math.PI, 0); x.fill();
  }
  const doorW = H * 0.42, doorX = W - doorW - 14;
  const room = W - doorW - 30;
  const shelf = (y) => { x.fillStyle = '#5a3b22'; x.fillRect(14, y, room - 10, 6); };
  const k = shop.kind;
  if (k === 'books') {
    for (const y of [70, 130, 190]) {
      shelf(y);
      for (let bx = 18; bx < room - 6;) {
        const bw = 6 + r() * 9, bh = 34 + r() * 20;
        x.fillStyle = ['#7a2a26', '#24344d', '#2f4a3a', '#c9922e', '#e8dcc0', '#3a2a1e', '#8c5a9a'][Math.floor(r() * 7)];
        x.fillRect(bx, y - bh, bw, bh); bx += bw + 1;
      }
    }
  } else if (k === 'bakery') {
    for (const y of [100, 170]) {
      shelf(y);
      for (let i = 0; i < 9; i++) {
        x.fillStyle = ['#c98a45', '#a8692e', '#e0b070'][i % 3];
        x.beginPath(); x.ellipse(30 + i * (room - 40) / 9, y - 12, 14 + r() * 5, 10, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(80,40,10,0.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(22 + i * (room - 40) / 9, y - 14); x.lineTo(38 + i * (room - 40) / 9, y - 10); x.stroke();
      }
    }
    counter(x, 14, 200, room - 10, shade(shop.wall, -0.35));
  } else if (k === 'cafe') {
    x.fillStyle = '#1d1a18'; x.fillRect(20, 50, 120, 70);
    x.fillStyle = '#f0e6d0'; x.font = 'bold 16px sans-serif'; x.fillText('MENU', 50, 75);
    x.font = '11px sans-serif'; x.fillText('espresso 2.5', 30, 95); x.fillText('cake 4.0', 30, 110);
    for (let i = 0; i < 3; i++) table(x, 60 + i * (room - 80) / 3, 200, r);
  } else if (k === 'flowers') {
    for (let i = 0; i < 26; i++) {
      const fx = 20 + r() * (room - 30), fy = 120 + r() * 110;
      x.fillStyle = '#3e6b4a'; x.fillRect(fx - 1, fy, 2, 30);
      x.fillStyle = ['#e0455a', '#f2cf7c', '#ffffff', '#c985d6', '#ff8a5c'][Math.floor(r() * 5)];
      x.beginPath(); x.arc(fx, fy, 6 + r() * 6, 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < 5; i++) { x.fillStyle = '#8a5a3a'; x.fillRect(20 + i * (room - 40) / 5, 225, 34, 30); }
  } else if (k === 'kebab') {
    x.fillStyle = '#1d1a18'; x.fillRect(20, 40, room - 30, 50);
    x.fillStyle = '#ffe9a8'; x.font = 'bold 18px sans-serif';
    x.fillText('DÖNER 6 · FALAFEL 5 · FRIES 3', 30, 72);
    x.fillStyle = '#a8692e'; x.beginPath(); x.ellipse(room * 0.3, 160, 24, 50, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#8a8a8a'; x.fillRect(room * 0.3 - 2, 100, 4, 120);
    counter(x, 14, 200, room - 10, '#c9ccd0');
  } else if (k === 'phone') {
    for (const y of [90, 160]) {
      shelf(y);
      for (let i = 0; i < 8; i++) { x.fillStyle = '#111'; x.fillRect(24 + i * (room - 40) / 8, y - 40, 20, 38); x.fillStyle = ['#6fd3ff', '#ff6fb5', '#9cff6f'][i % 3]; x.fillRect(27 + i * (room - 40) / 8, y - 36, 14, 28); }
    }
    counter(x, 14, 205, room - 10, '#ffffff');
  } else if (k === 'grocer') {
    for (let i = 0; i < 5; i++) {
      const bx = 20 + i * (room - 30) / 5;
      x.fillStyle = '#8a5a3a'; x.fillRect(bx, 175, (room - 30) / 5 - 8, 60);
      const col = ['#e0455a', '#f2a03c', '#9cc94a', '#f2cf7c', '#7a3b8a'][i];
      for (let j = 0; j < 9; j++) { x.fillStyle = col; x.beginPath(); x.arc(bx + 10 + (j % 3) * 14 + r() * 4, 168 + Math.floor(j / 3) * 10, 7, 0, Math.PI * 2); x.fill(); }
    }
  } else if (k === 'tailor') {
    for (let i = 0; i < 3; i++) {
      const mx = 50 + i * (room - 80) / 2.5;
      x.fillStyle = ['#24344d', '#7a2a26', '#2f4a3a'][i];
      x.beginPath(); x.moveTo(mx - 26, 90); x.lineTo(mx + 26, 90); x.lineTo(mx + 20, 190); x.lineTo(mx - 20, 190); x.fill();
      x.fillStyle = '#d8cfb4'; x.fillRect(mx - 3, 190, 6, 50); x.beginPath(); x.ellipse(mx, 80, 12, 14, 0, 0, Math.PI * 2); x.fill();
    }
  } else if (k === 'pizza') {
    x.fillStyle = '#7a3b22'; x.beginPath(); x.arc(room * 0.25, 150, 56, Math.PI, 0); x.fill();
    x.fillStyle = '#ff9a3c'; x.beginPath(); x.arc(room * 0.25, 150, 26, Math.PI, 0); x.fill();
    counter(x, 14, 200, room - 10, '#d8cfb4');
    for (let i = 0; i < 3; i++) { const cx = room * 0.55 + i * 60; x.fillStyle = '#e9b44c'; x.beginPath(); x.arc(cx, 190, 24, 0, Math.PI * 2); x.fill(); x.fillStyle = '#c0392b'; for (let j = 0; j < 6; j++) { x.beginPath(); x.arc(cx + Math.cos(j) * 12, 190 + Math.sin(j * 2) * 10, 4, 0, Math.PI * 2); x.fill(); } }
  } else if (k === 'pharmacy') {
    x.fillStyle = '#2f8a4a'; x.fillRect(room * 0.5 - 30, 30, 60, 20); x.fillRect(room * 0.5 - 10, 10, 20, 60);
    for (const y of [120, 175, 230]) { shelf(y); for (let i = 0; i < 14; i++) { x.fillStyle = ['#ffffff', '#cfe8ff', '#ffd6d6', '#e8f5d0'][i % 4]; x.fillRect(22 + i * (room - 40) / 14, y - 26, (room - 40) / 14 - 4, 24); } }
  } else if (k === 'laundry') {
    for (let i = 0; i < 5; i++) { const cx = 40 + i * (room - 60) / 4.5; x.fillStyle = '#f2f4f6'; x.fillRect(cx - 26, 140, 52, 70); x.fillStyle = '#3a4a5a'; x.beginPath(); x.arc(cx, 180, 18, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(160,210,255,.7)'; x.beginPath(); x.arc(cx, 180, 13, 0, Math.PI * 2); x.fill(); }
  } else if (k === 'jeweller') {
    for (let i = 0; i < 3; i++) { const cx = 30 + i * (room - 40) / 3; x.fillStyle = '#141210'; x.fillRect(cx, 150, (room - 40) / 3 - 14, 60); x.fillStyle = 'rgba(255,240,200,.25)'; x.fillRect(cx, 120, (room - 40) / 3 - 14, 30); for (let j = 0; j < 5; j++) { x.fillStyle = '#f2cf7c'; x.beginPath(); x.arc(cx + 14 + j * 18, 168, 4, 0, Math.PI * 2); x.fill(); } }
  } else if (k === 'super') {
    // aisles of colourful products and a checkout
    for (const y of [80, 125, 170, 215]) {
      x.fillStyle = '#b9bcc2'; x.fillRect(10, y, W - 20, 4);
      for (let bx = 14; bx < W - 14;) { const bw = 8 + r() * 10, bh = 16 + r() * 20; x.fillStyle = ['#e0455a', '#f2a03c', '#9cc94a', '#4aa3df', '#f2cf7c', '#ffffff', '#7a3b8a', '#2f8a4a'][Math.floor(r() * 8)]; x.fillRect(bx, y - bh, bw, bh); bx += bw + 2; }
    }
    x.fillStyle = '#c8302b'; x.fillRect(W * 0.08, 6, W * 0.2, 22); x.fillStyle = '#fff'; x.font = 'bold 16px sans-serif'; x.fillText('-30% FRUIT', W * 0.09, 23);
    x.fillStyle = '#2f8a4a'; x.fillRect(W * 0.62, 6, W * 0.26, 22); x.fillStyle = '#fff'; x.fillText('FRESH BREAD DAILY', W * 0.63, 23);
  }
  if (shop.noDoor) { glass(x, W, H); const t0 = new THREE.CanvasTexture(c); t0.colorSpace = THREE.SRGBColorSpace; t0.anisotropy = 4; return t0; }
  // the door with its glass and handle
  x.fillStyle = shade(shop.sign, -0.1); x.fillRect(doorX - 6, 6, doorW + 12, H - 6);
  x.fillStyle = 'rgba(40,52,64,0.85)'; x.fillRect(doorX + 8, 18, doorW - 16, H * 0.6);
  x.fillStyle = '#fff'; x.font = 'bold 13px sans-serif'; x.textAlign = 'center';
  x.fillText('OPEN', doorX + doorW / 2, 40); x.textAlign = 'left';
  x.fillStyle = '#d1a956'; x.fillRect(doorX + doorW - 22, H * 0.6, 6, 26);
  // mullion between window and door
  x.fillStyle = '#2a2420'; x.fillRect(doorX - 16, 0, 10, H);
  glass(x, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function shopSignTexture(shop) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = shop.sign; x.fillRect(0, 0, 512, 96);
  x.strokeStyle = shop.ink; x.globalAlpha = 0.6; x.lineWidth = 3; x.strokeRect(8, 8, 496, 80); x.globalAlpha = 1;
  x.fillStyle = shop.ink; x.textAlign = 'center';
  x.font = 'bold 44px Georgia, serif'; x.fillText(shop.name, 256, 56);
  x.font = 'italic 16px Georgia, serif'; x.globalAlpha = 0.85; x.fillText(shop.sub, 256, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// glass: tint and a diagonal reflection
function glass(x, W, H) {
  x.fillStyle = 'rgba(120,150,170,0.12)'; x.fillRect(0, 0, W, H);
  x.save(); x.globalAlpha = 0.18; x.fillStyle = '#ffffff';
  x.beginPath(); x.moveTo(W * 0.1, 0); x.lineTo(W * 0.22, 0); x.lineTo(W * 0.02, H); x.lineTo(-W * 0.1, H); x.fill();
  x.beginPath(); x.moveTo(W * 0.3, 0); x.lineTo(W * 0.34, 0); x.lineTo(W * 0.18, H); x.lineTo(W * 0.14, H); x.fill();
  x.restore();
}

function counter(x, x0, y, w, col) {
  x.fillStyle = col; x.fillRect(x0, y, w, 60);
  x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(x0, y, w, 5);
}
function table(x, cx, y, r) {
  x.fillStyle = '#3a2a1e'; x.fillRect(cx - 22, y - 4, 44, 5); x.fillRect(cx - 2, y, 4, 40);
  x.fillStyle = '#f3efe4'; x.fillRect(cx - 6 + r() * 6, y - 12, 8, 8);
  x.fillStyle = '#2a2420'; x.fillRect(cx - 34, y - 10, 6, 50); x.fillRect(cx + 28, y - 10, 6, 50);
}
function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k); else c.lerp(new THREE.Color('#ffffff'), k);
  return '#' + c.getHexString();
}
