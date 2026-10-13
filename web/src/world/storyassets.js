// Story-mode assets, all built in code: drinks (cans, bottles, a coffee cup) with printed
// labels, a glowing drinks cooler, a delivery pallet with taped boxes, a stolen bread bag,
// a chef's toque, a thief's beanie and eye mask, and the floating quest markers.
import * as THREE from 'three';

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ drinks
export const DRINKS = {
  cola: { name: 'Fizz Cola', price: 3, kind: 'can', bg: '#c3201c', fg: '#ffffff', accent: '#ffffff', text: 'FIZZ', sub: 'COLA', patience: 0.45, mood: 0.05, line: 'Ooh, a cold one! Thanks!' },
  water: { name: 'Aqua Still', price: 1, kind: 'bottle', bg: '#bfe3f2', fg: '#1f5f8c', accent: '#3fa0d8', text: 'AQUA', sub: 'still water', patience: 0.3, mood: 0.025, line: 'Water. Classy. Thank you.' },
  juice: { name: 'Sunny Orange', price: 3, kind: 'bottle', bg: '#f39a1e', fg: '#ffffff', accent: '#ffd23c', text: 'SUNNY', sub: 'orange juice', patience: 0.4, mood: 0.045, line: 'Vitamins! You’re a good man.' },
  tea: { name: 'Iced Tea Peach', price: 2, kind: 'can', bg: '#e6b25a', fg: '#5a2e12', accent: '#f6d38a', text: 'ICED', sub: 'TEA · PEACH', patience: 0.4, mood: 0.04, line: 'Peach iced tea? Perfect.' },
  energy: { name: 'VOLT Energy', price: 4, kind: 'can', bg: '#141516', fg: '#b6ff3a', accent: '#b6ff3a', text: 'VOLT', sub: 'ENERGY', patience: 0.6, mood: 0.06, line: 'LET’S GOOO. I can feel my hair growing.' },
  coffee: { name: 'Coffee To Go', price: 3, kind: 'cup', bg: '#f4efe6', fg: '#4a2d1c', accent: '#8a5a36', text: 'JOE', sub: 'to go', patience: 0.5, mood: 0.05, line: 'Coffee. You read my mind.' },
};

function labelTexture(id) {
  return once('lbl:' + id, () => {
    const d = DRINKS[id];
    return canvasTex(256, 128, (x, W, H) => {
      x.fillStyle = d.bg; x.fillRect(0, 0, W, H);
      // a swoosh wrapping around the can
      x.strokeStyle = d.accent; x.lineWidth = 9; x.globalAlpha = 0.85;
      x.beginPath(); x.moveTo(0, H * 0.72); x.bezierCurveTo(W * 0.3, H * 0.45, W * 0.6, H * 0.95, W, H * 0.62); x.stroke();
      x.globalAlpha = 1;
      x.fillStyle = d.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '900 46px "Barlow Condensed", "Arial Narrow", sans-serif';
      x.fillText(d.text, W * 0.27, H * 0.38); x.fillText(d.text, W * 0.77, H * 0.38);
      x.font = '700 15px "Barlow Condensed", "Arial Narrow", sans-serif';
      x.fillText(d.sub.toUpperCase(), W * 0.27, H * 0.7); x.fillText(d.sub.toUpperCase(), W * 0.77, H * 0.7);
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, 6, W, 4);
    });
  });
}

const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

export function makeDrink(id) {
  const d = DRINKS[id] || DRINKS.cola;
  const g = new THREE.Group();
  g.name = 'drink_' + id;
  const label = new THREE.MeshStandardMaterial({ map: labelTexture(id), roughness: 0.35, metalness: d.kind === 'can' ? 0.45 : 0.05 });
  const alu = once('alu', () => new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.3, metalness: 0.9 }));
  if (d.kind === 'can') {
    const body = new THREE.Mesh(once('canBody', () => new THREE.CylinderGeometry(0.033, 0.033, 0.1, 20, 1, true)), label);
    body.position.y = 0.061; g.add(body);
    const top = new THREE.Mesh(once('canTop', () => lathe([[0.0, 0.122], [0.026, 0.122], [0.028, 0.124], [0.03, 0.118], [0.033, 0.111]])), alu);
    const bot = new THREE.Mesh(once('canBot', () => lathe([[0.033, 0.011], [0.03, 0.003], [0.02, 0.0], [0.0, 0.004]])), alu);
    g.add(top, bot);
    const tab = new THREE.Mesh(once('canTab', () => new THREE.BoxGeometry(0.014, 0.002, 0.02)), alu); tab.position.set(0, 0.124, 0.006); g.add(tab);
  } else if (d.kind === 'bottle') {
    const glass = new THREE.MeshStandardMaterial({ color: id === 'water' ? '#d8eef7' : d.bg, roughness: 0.08, metalness: 0.1, transparent: true, opacity: id === 'water' ? 0.55 : 0.9 });
    const body = new THREE.Mesh(once('btlBody', () => lathe([[0.0, 0.0], [0.03, 0.0], [0.032, 0.01], [0.032, 0.13], [0.026, 0.16], [0.013, 0.185], [0.012, 0.2], [0.0, 0.2]])), glass);
    g.add(body);
    const band = new THREE.Mesh(once('btlBand', () => new THREE.CylinderGeometry(0.0325, 0.0325, 0.07, 20, 1, true)), label); band.position.y = 0.07; g.add(band);
    const cap = new THREE.Mesh(once('btlCap', () => new THREE.CylinderGeometry(0.0135, 0.0135, 0.018, 12)), new THREE.MeshStandardMaterial({ color: d.accent, roughness: 0.4 }));
    cap.position.y = 0.208; g.add(cap);
  } else {
    const paper = new THREE.Mesh(once('cupBody', () => new THREE.CylinderGeometry(0.042, 0.032, 0.13, 20, 1, true)), new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.7, side: THREE.DoubleSide }));
    paper.position.y = 0.065; g.add(paper);
    const sleeve = new THREE.Mesh(once('cupSleeve', () => new THREE.CylinderGeometry(0.0395, 0.035, 0.06, 20, 1, true)), label); sleeve.position.y = 0.06; g.add(sleeve);
    const lid = new THREE.Mesh(once('cupLid', () => lathe([[0.0, 0.142], [0.03, 0.142], [0.036, 0.138], [0.044, 0.131], [0.044, 0.127]])), new THREE.MeshStandardMaterial({ color: '#2b211b', roughness: 0.5 }));
    g.add(lid);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// an SVG icon for the shop UI (same palette as the 3D label)
export function drinkSVG(id) {
  const d = DRINKS[id];
  if (d.kind === 'can') return `<svg viewBox="0 0 60 100"><defs><linearGradient id="g${id}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".35" stop-color="#fff" stop-opacity=".25"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient></defs>
    <path d="M12 12h36l4 8v68l-4 6H12l-4-6V20z" fill="${d.bg}"/><path d="M8 66c14-10 28 8 44-4" stroke="${d.accent}" stroke-width="4" fill="none" opacity=".85"/>
    <text x="30" y="52" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="900" font-size="17" fill="${d.fg}">${d.text}</text>
    <path d="M12 12h36l4 8v68l-4 6H12l-4-6V20z" fill="url(#g${id})"/><path d="M14 6h32l2 6H12z" fill="#cfd3d6"/><path d="M12 94h36l-2 3H14z" fill="#b5b9bc"/></svg>`;
  if (d.kind === 'bottle') return `<svg viewBox="0 0 60 100"><path d="M24 4h12v10l6 10v68a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V24l6-10z" fill="${d.kind === 'bottle' && d.text === 'AQUA' ? '#d8eef7' : d.bg}" opacity=".95"/>
    <rect x="18" y="44" width="24" height="30" fill="${d.bg}"/><rect x="18" y="44" width="24" height="30" fill="#fff" opacity="${d.text === 'AQUA' ? 0 : 0.12}"/>
    <text x="30" y="63" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="900" font-size="11" fill="${d.fg}">${d.text}</text>
    <rect x="23" y="1" width="14" height="6" rx="1.5" fill="${d.accent}"/><path d="M22 24v64" stroke="#fff" stroke-width="3" opacity=".35"/></svg>`;
  return `<svg viewBox="0 0 60 100"><path d="M12 22h36l-5 72H17z" fill="#f4efe6"/><path d="M14 46h32l-2 26H16z" fill="${d.accent}"/>
    <text x="30" y="64" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="900" font-size="12" fill="#fff">${d.text}</text>
    <path d="M9 22h42l-2-8H11z" fill="#2b211b"/><path d="M22 14h16l-1-4H23z" fill="#2b211b"/></svg>`;
}

// ------------------------------------------------------------------ the cooler outside Fresh Mart
export function makeFridge() {
  const g = new THREE.Group();
  g.name = 'drinkFridge';
  const body = new THREE.MeshStandardMaterial({ color: '#c3201c', roughness: 0.45, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.6 });
  const inside = new THREE.MeshStandardMaterial({ color: '#eaf4ff', emissive: new THREE.Color('#cfe6ff'), emissiveIntensity: 0.55, roughness: 0.6 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  box(1.0, 1.95, 0.7, body, 0, 0.975, 0);
  box(0.86, 1.5, 0.02, inside, 0, 1.0, 0.33);          // lit back of the display
  // crown sign
  const sign = canvasTex(256, 64, (x, W, H) => {
    x.fillStyle = '#c3201c'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#fff'; x.font = '900 40px "Barlow Condensed", "Arial Narrow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('ICE COLD DRINKS', W / 2, H / 2 + 2);
  });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.24), new THREE.MeshStandardMaterial({ map: sign, emissive: new THREE.Color('#ffffff'), emissiveMap: sign, emissiveIntensity: 0.5 }));
  sm.position.set(0, 1.83, 0.351); g.add(sm);
  // shelves with rows of drinks
  const ids = ['cola', 'water', 'juice', 'tea', 'energy', 'cola'];
  for (let s = 0; s < 4; s++) {
    const y = 0.32 + s * 0.36;
    box(0.86, 0.02, 0.5, dark, 0, y, 0.1);
    const id = ids[s % ids.length], id2 = ids[(s + 2) % ids.length];
    for (let i = 0; i < 9; i++) {
      const dr = makeDrink(i < 5 ? id : id2);
      dr.position.set(-0.36 + i * 0.09, y + 0.01, 0.22);
      dr.scale.setScalar(DRINKS[i < 5 ? id : id2].kind === 'bottle' ? 0.95 : 1.1);
      g.add(dr);
    }
  }
  // glass door with a chrome handle
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.56), new THREE.MeshStandardMaterial({ color: '#cfe0ea', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.18 }));
  glass.position.set(0, 1.0, 0.352); glass.userData.keep = true; g.add(glass);
  box(0.04, 0.5, 0.04, new THREE.MeshStandardMaterial({ color: '#d8dcdf', metalness: 0.9, roughness: 0.25 }), 0.38, 1.05, 0.38);
  box(1.0, 0.12, 0.72, dark, 0, 0.06, 0);
  for (const o of g.children) o.userData.keep = o.userData.keep || o.material?.transparent;
  const light = new THREE.PointLight('#d8ecff', 0.8, 2.2, 2); light.position.set(0, 1.1, 0.7); g.add(light);
  return g;
}

// ------------------------------------------------------------------ delivery: pallet + boxes
function boxTex() {
  return once('boxTex', () => canvasTex(128, 128, (x, W, H) => {
    x.fillStyle = '#b8895a'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(90,60,30,${Math.random() * 0.08})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 6); }
    x.fillStyle = '#d9c39a'; x.fillRect(W / 2 - 9, 0, 18, H);
    x.strokeStyle = '#6d4c2c'; x.lineWidth = 2; x.strokeRect(14, 74, 48, 34);
    x.fillStyle = '#3a2a1e'; x.font = '700 13px "Barlow Condensed", sans-serif'; x.fillText('FRESH MART', 17, 90); x.fillText('THIS SIDE UP', 17, 104);
  }));
}
export function makeBox(s = 0.42) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.75, s * 0.8), new THREE.MeshStandardMaterial({ map: boxTex(), roughness: 0.85 }));
  m.castShadow = true;
  return m;
}
export function makePallet() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#a8875e', roughness: 0.9 });
  for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.025, 0.14), wood); s.position.set(0, 0.135, -0.4 + i * 0.2); g.add(s); }
  for (const x of [-0.55, 0, 0.55]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), wood); b.position.set(x, 0.07, 0); g.add(b); }
  return g;
}

// ------------------------------------------------------------------ the stolen bread bag
export function makeBreadBag() {
  const g = new THREE.Group();
  g.name = 'breadBag';
  const paper = new THREE.MeshStandardMaterial({ color: '#c9a877', roughness: 0.95 });
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.12), paper); bag.position.y = 0.13; g.add(bag);
  const fold = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.125), new THREE.MeshStandardMaterial({ color: '#b8935e', roughness: 0.95 })); fold.position.y = 0.27; g.add(fold);
  const crust = new THREE.MeshStandardMaterial({ color: '#c7843a', roughness: 0.75 });
  for (const [x, r] of [[-0.04, 0.12], [0.045, -0.15]]) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.26, 4, 10), crust);
    b.position.set(x, 0.3, 0); b.rotation.z = r; g.add(b);
  }
  // a little logo
  const lt = canvasTex(64, 64, (x) => { x.fillStyle = '#c9a877'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#7a2a26'; x.font = '900 15px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('BAKERY', 32, 30); x.beginPath(); x.arc(32, 44, 7, 0, 7); x.fill(); });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 }));
  logo.position.set(0, 0.13, 0.061); g.add(logo);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ------------------------------------------------------------------ headwear for the cast
export function makeChefHat() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f7f4ee', roughness: 0.85 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.104, 0.07, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#f7f4ee', roughness: 0.85, side: THREE.DoubleSide }));
  band.position.y = 0.035; g.add(band);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), white);
    p.position.set(Math.cos(a) * 0.058, 0.115, Math.sin(a) * 0.058); g.add(p);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), white); top.position.y = 0.14; g.add(top);
  g.position.set(0, 0.105, 0.0);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeBeanie(color = '#1b1b1d') {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.108, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m);
  crown.scale.set(0.98, 1.05, 1.06); g.add(crown);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.109, 0.11, 0.045, 24, 1, true), new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
  cuff.scale.set(0.99, 1, 1.07); cuff.position.y = -0.01; g.add(cuff);
  g.position.set(0, 0.105, 0.0);
  return g;
}

export function makeEyeMask() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 26, 1, true, -1.25, 2.5), new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.8, side: THREE.DoubleSide }));
  m.scale.set(1.0, 1, 1.12);
  m.rotation.y = Math.PI / 2;
  m.position.set(0, 0.062, 0.004);
  return m;
}

// ------------------------------------------------------------------ quest markers
export function makeMarker(kind = '!') {
  const tex = once('mk' + kind, () => canvasTex(64, 96, (x) => {
    const gold = kind === '!' ? '#f2cf7c' : '#9fd7ff';
    x.fillStyle = gold; x.strokeStyle = '#2a1a0c'; x.lineWidth = 6; x.lineJoin = 'round';
    if (kind === '!') {
      x.beginPath(); x.moveTo(20, 6); x.lineTo(44, 6); x.lineTo(38, 62); x.lineTo(26, 62); x.closePath(); x.stroke(); x.fill();
      x.beginPath(); x.arc(32, 80, 10, 0, Math.PI * 2); x.stroke(); x.fill();
    } else {
      x.font = '900 78px "Barlow Condensed", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.strokeText('?', 32, 48); x.fillText('?', 32, 48);
    }
  }));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  s.renderOrder = 30;
  s.scale.set(0.18, 0.27, 1);
  return s;
}
