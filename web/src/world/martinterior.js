// FRESH MART from the inside: tiled floor, a ceiling of light panels, three aisles of
// stocked gondola shelves, a wall of drinks fridges at the back (that's where you shop),
// a checkout counter with a register and a conveyor by the entrance, baskets, signs.
// Everything static is plain meshes with shared materials (batched by Shop.optimize);
// the thousands of products are a handful of InstancedMeshes with per-instance colours.
import * as THREE from 'three';
import { DRINKS, makeDrink } from './storyassets.js';

export const MART = {};   // filled in by buildMartInterior: x0, x1, z0, z1, door, fridges[], counter

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function floorTex() {
  return canvasTex(256, 256, (x, W) => {
    const s = W / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = (i + j) % 2 ? 236 : 222;
      x.fillStyle = `rgb(${v},${v - 2},${v - 8})`; x.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(120,110,100,${Math.random() * 0.08})`; x.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 2, 2); }
    }
    x.strokeStyle = 'rgba(150,140,130,0.6)'; x.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, W); x.stroke(); x.beginPath(); x.moveTo(0, i * s); x.lineTo(W, i * s); x.stroke(); }
  });
}

function signTex(text, bg, fg) {
  return canvasTex(512, 128, (x, W, H) => {
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.fillStyle = fg; x.font = '900 70px "Barlow Condensed", "Arial Narrow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, W / 2, H / 2 + 4);
  });
}

// a printed product face: stripes + a blob, tinted per instance by instanceColor
function productTex() {
  return canvasTex(64, 64, (x) => {
    x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 64, 10); x.fillRect(0, 54, 64, 10);
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.ellipse(32, 30, 16, 11, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(18, 27, 28, 3); x.fillRect(22, 33, 20, 2);
  });
}

const mod = (a, n) => ((a % n) + n) % n;
const PALETTE = ['#c8302b', '#e0a33c', '#2f8a4a', '#24548f', '#f2cf7c', '#7a2a8a', '#e86a50', '#3fb6d8', '#f4efe6', '#1f2228', '#8bc34a', '#ff8a65'];

export function buildMartInterior(g, shop, { x0, x1, z0, z1, door }) {
  Object.assign(MART, { x0, x1, z0, z1, door, fridges: [] });
  const H = 4.0;
  const add = (geo, mat, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.receiveShadow = true; g.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const M = (color, rough = 0.7, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

  // ---- shell
  const ft = floorTex(); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(W / 1.6, D / 1.6);
  add(new THREE.PlaneGeometry(W, D), M('#ffffff', 0.35, 0, { map: ft }), cx, 0.003, cz, 0, -Math.PI / 2);
  const wall = M('#eef0ea', 0.85), trim = M('#2f8a4a', 0.6);
  add(new THREE.PlaneGeometry(D, H), wall, x0 + 0.01, H / 2, cz, Math.PI / 2);
  add(new THREE.PlaneGeometry(D, H), wall, x1 - 0.01, H / 2, cz, -Math.PI / 2);
  add(new THREE.PlaneGeometry(W, H), wall, cx, H / 2, z1 - 0.01, Math.PI);
  // inner face of the front wall above the windows
  add(new THREE.PlaneGeometry(W, H - 3.0), wall, cx, 3.0 + (H - 3.0) / 2, z0 + 0.02, 0);
  // green kick plates + a stripe around the walls
  add(B(0.04, 0.25, D), trim, x0 + 0.03, 0.125, cz); add(B(0.04, 0.25, D), trim, x1 - 0.03, 0.125, cz); add(B(W, 0.25, 0.04), trim, cx, 0.125, z1 - 0.03);
  add(B(0.03, 0.12, D), trim, x0 + 0.02, 3.0, cz); add(B(0.03, 0.12, D), trim, x1 - 0.02, 3.0, cz); add(B(W, 0.12, 0.03), trim, cx, 3.0, z1 - 0.02);
  // ceiling with light panels
  add(new THREE.PlaneGeometry(W, D), M('#f4f4f0', 0.9), cx, H, cz, 0, Math.PI / 2);
  const panel = M('#ffffff', 0.5, 0, { emissive: new THREE.Color('#fffbef'), emissiveIntensity: 1.1 });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) add(B(1.6, 0.04, 0.5), panel, x0 + 1.9 + i * (W - 3.8) / 3, H - 0.03, z0 + 1.6 + j * (D - 3.2) / 2);
  for (const [lx, lz] of [[cx - 3, cz - 1], [cx + 3, cz + 1.5]]) { const L = new THREE.PointLight('#fff6e4', 9, 16, 1.6); L.position.set(lx, H - 0.4, lz); g.add(L); }

  // ---- gondola aisles with products (instanced)
  const shelfM = M('#d8dde0', 0.45, 0.4), edgeM = M('#f2cf7c', 0.5), backM = M('#c9d1d6', 0.6, 0.2);
  const tex = productTex();
  const kinds = [
    { geo: B(0.17, 0.26, 0.07), y: 0.13, step: 0.19, n: 0 },                 // cereal boxes
    { geo: new THREE.CylinderGeometry(0.038, 0.038, 0.12, 10), y: 0.06, step: 0.085, n: 0 },   // cans
    { geo: new THREE.CylinderGeometry(0.032, 0.036, 0.22, 10), y: 0.11, step: 0.08, n: 0 },    // bottles
    { geo: B(0.14, 0.09, 0.14), y: 0.045, step: 0.16, n: 0 },                // snacks
  ];
  const places = kinds.map(() => []);
  const gondola = (gx, gz0, gz1) => {
    const len = gz1 - gz0, gzc = (gz0 + gz1) / 2;
    add(B(0.9, 1.75, len), backM, gx, 0.875, gzc).scale.set(0.12 / 0.9, 1, 1);
    add(B(0.92, 0.12, len), shelfM, gx, 0.06, gzc);
    add(B(0.95, 0.06, len + 0.06), M('#2f8a4a', 0.6), gx, 1.78, gzc);
    for (let s = 0; s < 4; s++) {
      const y = 0.22 + s * 0.42;
      add(B(0.86, 0.025, len), shelfM, gx, y, gzc);
      for (const side of [-1, 1]) add(B(0.012, 0.035, len), edgeM, gx + side * 0.44, y + 0.005, gzc);
      for (const side of [-1, 1]) {
        const kind = mod(s + (side > 0 ? 1 : 0) + Math.round(gx), kinds.length);
        const k = kinds[kind];
        const color = PALETTE[mod(s * 3 + Math.round(gx * 7) + (side > 0 ? 5 : 0), PALETTE.length)];
        for (let z = gz0 + 0.1; z < gz1 - 0.08; z += k.step) {
          if (Math.random() < 0.06) continue;      // a few gaps, shops are never perfect
          for (let d = 0; d < 2; d++) places[kind].push([gx + side * (0.12 + d * 0.15), y + 0.013, z, color, side]);
        }
      }
    }
    shop.colliders.push({ x0: gx - 0.5, x1: gx + 0.5, z0: gz0 - 0.05, z1: gz1 + 0.05, outside: true });
  };
  const aisleZ0 = z0 + 3.2, aisleZ1 = z1 - 2.6;
  for (const gx of [x0 + 2.0, x0 + 4.4]) gondola(gx, aisleZ0, aisleZ1);
  gondola(x1 - 2.6, aisleZ0 + 1.6, aisleZ1);
  // wall shelving along the left wall
  for (let s = 0; s < 4; s++) add(B(0.45, 0.025, D - 4.5), shelfM, x0 + 0.25, 0.25 + s * 0.42, cz + 0.8);
  shop.colliders.push({ x0: x0, x1: x0 + 0.55, z0: z0 + 2.3, z1: z1, outside: true });
  { // left wall stock
    const k = 0, kd = kinds[k];
    for (let s = 0; s < 4; s++) for (let z = z0 + 2.6; z < z1 - 0.3; z += kd.step) places[k].push([x0 + 0.25, 0.265 + s * 0.42, z, PALETTE[mod(s * 5 + Math.floor(z), PALETTE.length)], 1]);
  }
  const prodMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  const col = new THREE.Color();
  kinds.forEach((k, i) => {
    const list = places[i];
    if (!list.length) return;
    const im = new THREE.InstancedMesh(k.geo, prodMat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, y, z, c, side], j) => {
      e.set(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, y + k.y, z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(j, m4);
      im.setColorAt(j, col.set(c).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
    });
    im.receiveShadow = true;
    g.add(im);
  });

  // ---- aisle signs hanging from the ceiling
  const signs = [['SNACKS & CEREAL', x0 + 2.0], ['CANS & PANTRY', x0 + 4.4], ['HOUSEHOLD', x1 - 2.6]];
  for (const [t, sx] of signs) {
    const m = M('#ffffff', 0.6, 0, { map: signTex(t, '#2f8a4a', '#ffffff') });
    for (const r of [0, Math.PI]) add(new THREE.PlaneGeometry(1.6, 0.4), m, sx, 3.05, cz + 0.3 + (r ? -0.01 : 0.01), r);
    for (const dx of [-0.6, 0.6]) add(B(0.01, 0.9, 0.01), M('#555', 0.5, 0.5), sx + dx, 3.5, cz + 0.3);
  }

  // ---- the drinks wall at the back: one fridge per drink (this is where you take them)
  const ids = Object.keys(DRINKS);
  const fw = 1.15, fx0 = cx - (ids.length * fw) / 2 + fw / 2;
  const fbody = M('#e8eaec', 0.4, 0.3), glow = M('#eaf4ff', 0.6, 0, { emissive: new THREE.Color('#d8ecff'), emissiveIntensity: 0.7 });
  const glassM = new THREE.MeshStandardMaterial({ color: '#cfe0ea', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.16 });
  ids.forEach((id, i) => {
    const fx = fx0 + i * fw, fz = z1 - 0.45;
    // an open-front cabinet: back, sides, top, base (the drinks sit inside, behind glass)
    add(B(fw - 0.04, 2.1, 0.04), fbody, fx, 1.05, fz + 0.38);
    for (const sx of [-1, 1]) add(B(0.05, 2.1, 0.8), fbody, fx + sx * (fw / 2 - 0.045), 1.05, fz);
    add(B(fw - 0.04, 0.16, 0.8), fbody, fx, 2.02, fz);
    add(B(fw - 0.04, 0.2, 0.8), fbody, fx, 0.1, fz);
    add(B(fw - 0.16, 1.7, 0.02), glow, fx, 1.07, fz + 0.35);
    const d = DRINKS[id];
    // header with the drink's colours
    add(new THREE.PlaneGeometry(fw - 0.1, 0.24), M('#fff', 0.6, 0, { map: signTex(d.name.toUpperCase(), d.bg, d.fg), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.15 }), fx, 2.24, fz - 0.41, Math.PI);
    for (let s = 0; s < 4; s++) {
      const y = 0.32 + s * 0.4;
      add(B(fw - 0.2, 0.02, 0.6), shelfM, fx, y, fz);
      for (let k = 0; k < 7; k++) {
        const dr = makeDrink(id);
        dr.position.set(fx - (fw - 0.3) / 2 + k * ((fw - 0.3) / 6), y + 0.01, fz - 0.2);
        dr.rotation.y = Math.PI;
        g.add(dr);
      }
    }
    const gl = add(new THREE.PlaneGeometry(fw - 0.08, 1.95), glassM, fx, 1.05, fz - 0.41, Math.PI);
    gl.userData.keep = true;
    add(B(0.03, 0.9, 0.03), M('#d8dcdf', 0.25, 0.9), fx + (fw / 2 - 0.12), 1.1, fz - 0.44);
    MART.fridges.push({ id, pos: new THREE.Vector3(fx, 1.1, fz - 0.45) });
  });
  shop.colliders.push({ x0: x0, x1: x1, z0: z1 - 0.9, z1: z1 + 1, outside: true });

  // ---- checkout by the entrance (right of the doors): counter, conveyor, register, scanner
  const ck = { x: door + 2.9, z0: z0 + 1.0, z1: z0 + 3.0 };
  const counterM = M('#2f8a4a', 0.5, 0.1), topM = M('#d6d9db', 0.35, 0.6);
  add(B(0.7, 0.88, ck.z1 - ck.z0), counterM, ck.x, 0.44, (ck.z0 + ck.z1) / 2);
  add(B(0.74, 0.04, ck.z1 - ck.z0 + 0.04), topM, ck.x, 0.9, (ck.z0 + ck.z1) / 2);
  const belt = add(B(0.46, 0.02, (ck.z1 - ck.z0) * 0.6), M('#1d1f22', 0.9), ck.x, 0.93, ck.z1 - (ck.z1 - ck.z0) * 0.32);
  belt.name = 'martBelt';
  add(B(0.3, 0.06, 0.3), M('#2b2d30', 0.4, 0.5), ck.x, 0.94, ck.z0 + 0.45);                         // scanner
  const scanGlow = add(new THREE.PlaneGeometry(0.22, 0.22), M('#ff3b30', 0.4, 0, { emissive: new THREE.Color('#ff3b30'), emissiveIntensity: 0.8 }), ck.x, 0.975, ck.z0 + 0.45, 0, -Math.PI / 2);
  scanGlow.userData.keep = true;
  const reg = new THREE.Group();
  const regBody = new THREE.Mesh(B(0.38, 0.14, 0.32), M('#2b2d30', 0.4, 0.4)); regBody.position.y = 0.07; reg.add(regBody);
  const screen = new THREE.Mesh(B(0.3, 0.2, 0.02), M('#1b2a22', 0.3, 0, { emissive: new THREE.Color('#4bd17a'), emissiveIntensity: 0.6 })); screen.position.set(0, 0.28, -0.05); screen.rotation.x = -0.25; reg.add(screen);
  const pole = new THREE.Mesh(B(0.04, 0.14, 0.04), M('#2b2d30')); pole.position.set(0, 0.17, -0.05); reg.add(pole);
  reg.position.set(ck.x + 0.12, 0.92, ck.z0 + 0.95); reg.rotation.y = -Math.PI / 2;
  g.add(reg);
  // a little lit number over the till
  add(B(0.05, 0.6, 0.05), M('#555', 0.4, 0.6), ck.x + 0.3, 2.05, ck.z0 + 0.5);
  add(new THREE.PlaneGeometry(0.5, 0.3), M('#fff', 0.6, 0, { map: signTex('1', '#2f8a4a', '#fff'), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.3 }), ck.x + 0.3, 2.45, ck.z0 + 0.5, -Math.PI / 2);
  // candy rack at the till (the evil kind)
  add(B(0.25, 1.1, 0.8), shelfM, ck.x - 0.55, 0.55, ck.z1 + 0.1);
  for (let s = 0; s < 4; s++) for (let k = 0; k < 5; k++) add(B(0.1, 0.14, 0.12), M(PALETTE[(s * 4 + k) % PALETTE.length], 0.5), ck.x - 0.55, 0.15 + s * 0.27, ck.z1 - 0.18 + k * 0.15);
  shop.colliders.push({ x0: ck.x - 0.7, x1: ck.x + 0.4, z0: ck.z0, z1: ck.z1 + 0.5, outside: true });
  // the cashier's side is closed off: a low gate between counter and wall
  add(B(x1 - ck.x - 0.4, 0.9, 0.05), counterM, (ck.x + 0.35 + x1) / 2, 0.45, ck.z1);
  shop.colliders.push({ x0: ck.x, x1: x1, z0: ck.z1 - 0.1, z1: ck.z1 + 0.1, outside: true });
  MART.counter = ck;

  // baskets stacked by the door, a welcome mat, a security gate pair
  const basketM = M('#c8302b', 0.5);
  for (let i = 0; i < 4; i++) add(B(0.42, 0.22, 0.3), basketM, door - 1.6, 0.11 + i * 0.07, z0 + 0.9);
  add(new THREE.PlaneGeometry(2.4, 1.2), M('#2a2c2e', 0.95), door, 0.006, z0 + 0.8, 0, -Math.PI / 2);
  for (const sx of [-1.25, 1.25]) {
    add(B(0.06, 1.5, 0.45), M('#cfd3d6', 0.3, 0.6), door + sx, 0.75, z0 + 1.6);
    shop.colliders.push({ x0: door + sx - 0.06, x1: door + sx + 0.06, z0: z0 + 1.35, z1: z0 + 1.85, outside: true });
  }
  // the shell: walls you can't walk through
  shop.colliders.push(
    { x0: x0 - 2, x1: x0 + 0.2, z0: z0, z1: z1 + 2, outside: true },
    { x0: x1 - 0.2, x1: x1 + 2, z0: z0, z1: z1 + 2, outside: true },
    { x0: x0 - 2, x1: x1 + 2, z0: z1 - 0.2, z1: z1 + 2, outside: true },
  );
  return MART;
}
