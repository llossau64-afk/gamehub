// Dirk Reck's Box Club at the east end: a brick front with an open doorway, and inside a
// raised ring with ropes, two heavy bags, benches, lockers and old fight posters.
import * as THREE from 'three';
import { propMaterial } from '../render/materials.js';
import * as T from '../render/textures.js';

export const BOX = {
  x0: 68, x1: 78,                 // the building along the street
  door: { x0: 75.1, x1: 76.6, h: 2.6 },
  in: { x0: 68.6, x1: 77.4, depth: 9 },
  ring: { x: 72.2, dz: -5.0, size: 4.6, h: 0.45 },
  bags: [{ x: 76.4, dz: -2.4 }, { x: 76.4, dz: -4.6 }],
  dirk: { x: 74.2, dz: 0.95 },    // leaning by the door outside (fz-relative)
};

function label(lines, bg, fg, w = 512, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.textAlign = 'center'; x.fillStyle = fg;
  lines.forEach(([text, size, y, col]) => { x.font = `900 ${size}px Impact, "Arial Black", sans-serif`; x.fillStyle = col || fg; x.fillText(text, w / 2, y); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildBoxClub(shop, g, fz) {
  const B = BOX, D = B.door, I = B.in;
  const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const add = (geo, mat, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.y = ry; o.receiveShadow = true; g.add(o); return o; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const plane = (w, h, mat, x, y, z, ry = 0) => add(new THREE.PlaneGeometry(w, h), mat, x, y, z, ry);
  const solid = (x0, x1, z0, z1) => shop.colliders.push({ x0, x1, z0, z1, outside: true });
  const H = 7.6, zf = fz + 0.02;

  // ------------------------------------------------------------ the front
  const ft = T.facadeTexture(101, [132, 70, 58], true);
  ft.repeat.set((B.x1 - B.x0) / 6, H / 6);
  const fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.9 });
  const piece = (x0, x1, y0, y1) => { const m = fm.clone(); m.map = ft.clone(); m.map.needsUpdate = true; m.map.repeat.set((x1 - x0) / 6, (y1 - y0) / 6); m.map.offset.set((x0 - B.x0) / 6, y0 / 6); plane(x1 - x0, y1 - y0, m, (x0 + x1) / 2, (y0 + y1) / 2, zf); };
  piece(B.x0, D.x0, 0, H); piece(D.x1, B.x1 + 2, 0, H); piece(D.x0, D.x1, D.h, H);
  // door frame and a rubber strip curtain
  const frame = propMaterial('MetalDark');
  for (const x of [D.x0, D.x1]) add(box(0.12, D.h, 0.16), frame, x, D.h / 2, zf + 0.04);
  add(box(D.x1 - D.x0 + 0.12, 0.14, 0.16), frame, (D.x0 + D.x1) / 2, D.h + 0.05, zf + 0.04);
  const strip = new THREE.MeshStandardMaterial({ color: '#2a2a30', roughness: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) { const s = plane(0.22, D.h - 0.3, strip, D.x0 + 0.16 + i * 0.245, (D.h - 0.3) / 2 + 0.3, zf - 0.02); s.userData.keep = true; s.name = 'glass'; }
  // the sign: red with a glove
  const sign = new THREE.Mesh(box(5.2, 1.1, 0.12), M('#8a1d17', 0.5));
  sign.position.set((B.x0 + D.x0) / 2 + 0.6, 3.5, zf + 0.08); g.add(sign);
  const st = label([['DIRK’S BOX CLUB', 76, 110, '#ffe9a8'], ['est. 1994 · Dirk “The Wreck” Reck', 30, 175, '#f3efe4']], '#8a1d17', '#ffe9a8', 1024, 220);
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 1.05), new THREE.MeshStandardMaterial({ map: st, roughness: 0.6 }));
  sf.position.set(sign.position.x, 3.5, zf + 0.145); g.add(sf);
  // two big fight posters by the door
  const poster = (t1, t2, x) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshStandardMaterial({ map: label([[t1, 52, 70, '#f2c230'], ['VS', 40, 130, '#ffffff'], [t2, 52, 195, '#e0455a'], ['SAT 8PM', 32, 240, '#ffffff']], '#141418', '#fff', 352, 480), roughness: 0.7 })); p.position.set(x, 1.55, zf + 0.03); g.add(p); };
  poster('RECK', 'KOWALSKI', 69.2); poster('MARCO', 'YOU?', 73.9);

  // ------------------------------------------------------------ inside
  const z0 = fz - I.depth, z1 = fz - 0.06, cx = (I.x0 + I.x1) / 2, cz = (z0 + z1) / 2, W = I.x1 - I.x0, Dd = z1 - z0, RH = 3.6;
  const floorT = T.sidewalkTexture(); floorT.repeat.set(W / 3, Dd / 3);
  const fl = plane(W, Dd, new THREE.MeshStandardMaterial({ map: floorT, color: '#5a5650', roughness: 0.95 }), cx, 0.004, cz); fl.rotation.x = -Math.PI / 2;
  const ce = plane(W, Dd, M('#2a2826', 0.9), cx, RH, cz); ce.rotation.x = Math.PI / 2;
  const bt = T.facadeTexture(103, [120, 64, 52], true); bt.repeat.set(W / 4, RH / 4);
  const wm = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.95 });
  plane(W, RH, wm, cx, RH / 2, z0);                                  // back
  plane(Dd, RH, wm, I.x0, RH / 2, cz, Math.PI / 2);                  // left
  plane(Dd, RH, wm, I.x1, RH / 2, cz, -Math.PI / 2);                 // right
  const fw = (x0, x1, y0, y1) => plane(x1 - x0, y1 - y0, wm, (x0 + x1) / 2, (y0 + y1) / 2, z1, Math.PI);
  fw(I.x0, D.x0, 0, RH); fw(D.x1, I.x1, 0, RH); fw(D.x0, D.x1, D.h, RH);
  // the ring: platform, apron, corner posts, three ropes
  const R = B.ring, rz = fz + R.dz, s = R.size, hs = s / 2;
  add(box(s + 0.5, R.h, s + 0.5), M('#1f2a44', 0.8), R.x, R.h / 2, rz);
  add(box(s, 0.04, s), M('#d9d2c2', 0.9), R.x, R.h + 0.02, rz);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshStandardMaterial({ map: label([['DBC', 120, 165, '#8a1d17']], '#d9d2c2', '#8a1d17', 256, 256), roughness: 0.9 }));
  logo.rotation.x = -Math.PI / 2; logo.position.set(R.x, R.h + 0.045, rz); g.add(logo);
  const cols = ['#c8302b', '#2f62c8', '#f3efe4', '#f3efe4'];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => add(new THREE.CylinderGeometry(0.06, 0.06, 1.35, 10), M(cols[i], 0.4), R.x + a * hs, R.h + 0.67, rz + b * hs));
  const rope = M('#e8e2d6', 0.6);
  for (const y of [0.45, 0.8, 1.15]) {
    add(box(s, 0.035, 0.035), rope, R.x, R.h + y, rz - hs); add(box(s, 0.035, 0.035), rope, R.x, R.h + y, rz + hs);
    add(box(0.035, 0.035, s), rope, R.x - hs, R.h + y, rz); add(box(0.035, 0.035, s), rope, R.x + hs, R.h + y, rz);
  }
  // steps up to the ring
  add(box(0.6, 0.22, 0.4), M('#3a3a3e', 0.8), R.x - hs - 0.3, 0.11, rz + hs - 0.4);
  solid(R.x - hs - 0.25, R.x + hs + 0.25, rz - hs - 0.25, rz + hs + 0.25);
  // heavy bags on chains
  const bags = [];
  for (const b of B.bags) {
    const piv = new THREE.Group(); piv.position.set(b.x, RH - 0.05, fz + b.dz); piv.name = 'pivot'; g.add(piv);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), M('#8a8a90', 0.4, 0.8)); chain.position.y = -0.55; piv.add(chain);
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.15, 16), M('#7a1d17', 0.5)); bag.position.y = -1.7; bag.castShadow = true; piv.add(bag);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.12, 16), M('#1c1c1e', 0.5)); band.position.y = -1.3; piv.add(band);
    bags.push({ piv, x: b.x, z: fz + b.dz, a: 0, v: 0 });
    solid(b.x - 0.25, b.x + 0.25, fz + b.dz - 0.25, fz + b.dz + 0.25);
  }
  // benches, lockers, a speed bag, fight posters, a trophy shelf
  add(box(1.8, 0.45, 0.4), propMaterial('WoodDark'), 69.6, 0.22, fz - 1.0);
  solid(68.7, 70.5, fz - 1.2, fz - 0.8);
  for (let i = 0; i < 5; i++) { add(box(0.5, 1.9, 0.45), M(['#3e6b4a', '#2f4a3a'][i % 2], 0.45, 0.5), 68.9 + i * 0.52, 0.95, z0 + 0.25); }
  solid(68.6, 71.4, z0, z0 + 0.5);
  for (const [t1, t2, x] of [['THE WRECK', 'RETURNS', 73.4], ['1994', 'CHAMPION', 75.2]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.35), new THREE.MeshStandardMaterial({ map: label([[t1, 54, 100, '#f2c230'], [t2, 54, 190, '#ffffff']], '#2a1a12', '#fff', 352, 480), roughness: 0.7 }));
    p.position.set(x, 2.0, z0 + 0.02); g.add(p);
  }
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.06, 0.09, 0.28, 12), M('#d1a956', 0.25, 0.9), 76.6 + i * 0.25 - 0.25, 1.62, z0 + 0.2);
  add(box(1.0, 0.04, 0.3), propMaterial('WoodDark'), 76.6, 1.47, z0 + 0.18);
  // lights: hanging lamps over the ring (emissive) + one real light
  for (const dx of [-1.2, 1.2]) {
    add(new THREE.CylinderGeometry(0.18, 0.36, 0.22, 16, 1, true), M('#2a2a2e', 0.4, 0.6), R.x + dx, RH - 0.5, rz).material.side = THREE.DoubleSide;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshStandardMaterial({ color: '#fff2cc', emissive: new THREE.Color('#fff2cc'), emissiveIntensity: 1.5 }));
    bulb.position.set(R.x + dx, RH - 0.58, rz); bulb.name = 'bulb'; g.add(bulb);
  }
  const L = new THREE.PointLight('#ffe6c0', 5, 11, 1.4); L.position.set(R.x, RH - 0.7, rz + 0.5); g.add(L);
  // walls of the room
  solid(I.x0 - 0.5, I.x0 + 0.12, z0, fz); solid(I.x1 - 0.12, I.x1 + 0.5, z0, fz); solid(I.x0, I.x1, z0 - 0.5, z0 + 0.12);
  return { bags };
}
