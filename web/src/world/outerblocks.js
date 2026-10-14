// The outer blocks past the 3rd and 4th cross streets: Willi's little square with his
// snack stand and a fountain out west; Ralf's kiosk, Mr. Dörk's antiques, a gym and a bus
// stop out east; and a proper end to the street at both ends instead of fog.
import * as THREE from 'three';
import { spawnProp } from './props.js';
import { propMaterial } from '../render/materials.js';
import * as T from '../render/textures.js';

export const OUTER = {
  willi: { x: -59.2, z: 0.4 },            // behind his counter (fz-relative z is added below)
  fountain: { x: -63, z: -0.9 },
  ralf: { x: 55.6, z: 0.75 },
  dork: { x: 63.4, z: 0.85 },
  busStop: { x: 71.5, z: 2.35 },
  ticket: { x: -61.2, z: 0.9 },           // Ralf's lost lucky ticket, by the fountain
};

function label(text, bg, fg, sub = '', w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.textAlign = 'center';
  x.font = `900 ${sub ? 58 : 70}px "Arial Black", Impact, sans-serif`;
  x.fillText(text, w / 2, sub ? 70 : 88);
  if (sub) { x.font = '700 30px Arial, sans-serif'; x.globalAlpha = 0.85; x.fillText(sub, w / 2, 112); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildOuterBlocks(shop, g, fz, STREET, PLAZA) {
  const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const add = (geo, mat, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
  const solid = (x, z, hw, hd) => shop.colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, outside: true });

  // ------------------------------------------------------------ Willi's square
  const P = PLAZA, pw = P.x1 - P.x0, pd = fz - P.z0, pcx = (P.x0 + P.x1) / 2;
  const paving = new THREE.MeshStandardMaterial({ map: (() => { const t = T.sidewalkTexture(); t.repeat.set(pw / 2, pd / 2); return t; })(), roughness: 0.92 });
  const pv = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), paving); pv.rotation.x = -Math.PI / 2; pv.position.set(pcx, 0.003, (P.z0 + fz) / 2); pv.receiveShadow = true; g.add(pv);
  // the back wall: a tall brick house with windows
  const bt = T.facadeTexture(95, [150, 104, 82], true); bt.repeat.set(pw / 6, 9 / 6);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(pw, 9), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9 })); back.position.set(pcx, 4.5, P.z0); g.add(back);
  // fountain
  const F = OUTER.fountain, fzz = fz + F.z;
  const stone = propMaterial('Concrete');
  const ring = add(C(1.5, 1.6, 0.5, 28), stone, F.x, 0.25, fzz);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.38, 28), new THREE.MeshStandardMaterial({ color: '#4f8fb0', roughness: 0.08, metalness: 0.2, emissive: new THREE.Color('#1c3a4a'), emissiveIntensity: 0.4 }));
  water.rotation.x = -Math.PI / 2; water.position.set(F.x, 0.46, fzz); g.add(water);
  add(C(0.18, 0.24, 1.3, 12), stone, F.x, 0.9, fzz);
  add(C(0.55, 0.2, 0.18, 20), stone, F.x, 1.55, fzz);
  const jet = new THREE.Mesh(C(0.03, 0.06, 0.5, 8), new THREE.MeshStandardMaterial({ color: '#cfe8f5', transparent: true, opacity: 0.55, roughness: 0.1 }));
  jet.position.set(F.x, 1.85, fzz); g.add(jet);
  void ring;
  solid(F.x, fzz, 1.6, 1.6);
  // benches and trees around it
  for (const [x, z, ry] of [[P.x0 + 0.8, fz - 1.4, Math.PI / 2], [P.x1 - 4.6, fz - 2.5, 0]]) {
    const b = spawnProp('Bench'); b.position.set(x, 0, z); b.rotation.y = ry; g.add(b);
    solid(x, z, ry ? 0.28 : 0.8, ry ? 0.8 : 0.28);
  }
  for (const [x, z, s] of [[P.x0 + 1.2, P.z0 + 1.2, 1.1], [P.x1 - 1.0, P.z0 + 1.0, 0.95]]) {
    const t = shop.makeTree(); t.position.set(x, 0, z); t.scale.setScalar(s); g.add(t); solid(x, z, 0.2, 0.2);
  }
  // Willi's snack stand (Imbiss): a little hut with a counter facing the square
  const W = OUTER.willi, wx = W.x, wz = fz - 1.4;
  const hutWall = M('#e9dcc0', 0.8), red = M('#c8302b', 0.6), wood = propMaterial('WoodDark');
  add(B(2.8, 2.5, 0.1), hutWall, wx, 1.25, wz - 1.0);                 // back
  for (const s of [-1, 1]) add(B(0.1, 2.5, 2.1), hutWall, wx + s * 1.4, 1.25, wz);
  add(B(2.8, 1.05, 0.1), hutWall, wx, 0.52, wz + 1.0);                 // front under the counter
  add(B(3.0, 0.08, 0.5), wood, wx, 1.08, wz + 1.12);                   // counter top
  add(B(3.1, 0.12, 2.4), red, wx, 2.56, wz + 0.1);                     // roof
  const aw = add(B(3.1, 0.04, 0.9), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 16; const x = c.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f3efe4' : '#c8302b'; x.fillRect(i * 16, 0, 16, 16); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.8 }), wx, 2.3, wz + 1.5);
  aw.rotation.x = 0.35;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.62), new THREE.MeshStandardMaterial({ map: label('WILLI’S IMBISS', '#c8302b', '#ffe9a8', 'currywurst · pommes · since 1979'), roughness: 0.6 }));
  sign.position.set(wx, 2.95, wz + 1.0); g.add(sign);
  const signBox = add(B(2.7, 0.7, 0.08), red, wx, 2.95, wz + 0.95); void signBox;
  // a grill, a sausage tray and ketchup/mustard on the counter
  add(B(0.9, 0.12, 0.45), M('#2a2a2c', 0.4, 0.6), wx - 0.5, 0.96, wz + 0.4);
  for (let i = 0; i < 5; i++) add(C(0.025, 0.025, 0.3, 8), M('#a8502a', 0.5), wx - 0.8 + i * 0.14, 1.04, wz + 0.4).rotation.z = Math.PI / 2;
  add(C(0.04, 0.045, 0.2, 10), M('#c8302b', 0.4), wx + 0.6, 1.22, wz + 1.12);
  add(C(0.04, 0.045, 0.2, 10), M('#e0b02c', 0.4), wx + 0.72, 1.22, wz + 1.12);
  // stools at the counter
  for (const dx of [-0.8, 0, 0.8]) { add(C(0.18, 0.18, 0.06, 14), red, wx + dx, 0.72, wz + 1.65); add(C(0.03, 0.03, 0.7, 8), M('#c9ccd0', 0.3, 0.8), wx + dx, 0.36, wz + 1.65); }
  const lamp = new THREE.PointLight('#ffd08a', 1.6, 6, 2); lamp.position.set(wx, 2.2, wz + 0.4); g.add(lamp);
  solid(wx, wz, 1.5, 1.15);

  // ------------------------------------------------------------ the east block
  // Ralf's newspaper stand and lottery board in front of his kiosk
  const R = OUTER.ralf, rz = fz + R.z;
  add(B(1.3, 1.0, 0.5), M('#1f5fa8', 0.6), R.x + 1.3, 0.5, rz + 0.1);
  for (let i = 0; i < 4; i++) add(B(0.28, 0.02, 0.4), M(['#f3efe4', '#e8d9b0', '#f3efe4', '#dfe8f0'][i]), R.x + 0.85 + i * 0.3, 1.02, rz + 0.1);
  const lotto = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), new THREE.MeshStandardMaterial({ map: label('LOTTO', '#ffe066', '#1f5fa8', 'jackpot $5,000', 256, 352), roughness: 0.6 }));
  lotto.position.set(R.x - 1.4, 1.0, fz + 0.06); g.add(lotto);
  solid(R.x + 1.3, rz + 0.1, 0.7, 0.3);
  // Mr. Dörk's chair and an old gramophone outside his shop
  const D = OUTER.dork, dz = fz + D.z;
  add(B(0.5, 0.06, 0.5), wood, D.x, 0.45, dz); add(B(0.5, 0.6, 0.06), wood, D.x, 0.75, dz - 0.24);
  for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) add(B(0.05, 0.45, 0.05), wood, D.x + a, 0.22, dz + b);
  add(B(0.5, 0.5, 0.5), wood, D.x + 1.2, 0.25, dz);
  const horn = add(new THREE.ConeGeometry(0.22, 0.5, 16, 1, true), M('#c9a24a', 0.3, 0.8), D.x + 1.2, 0.85, dz + 0.1); horn.rotation.x = -1.0;
  solid(D.x, dz, 0.3, 0.3); solid(D.x + 1.2, dz, 0.3, 0.3);
  // bus stop: a glass shelter, a bench and a timetable
  const S = OUTER.busStop, sz = fz + S.z;
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide });
  const metal = M('#3a4048', 0.4, 0.7);
  add(B(3.2, 0.08, 1.4), metal, S.x, 2.4, sz - 0.2);
  for (const dx of [-1.55, 1.55]) add(B(0.06, 2.4, 0.06), metal, S.x + dx, 1.2, sz - 0.85);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.9), glass); gl.position.set(S.x, 1.3, sz - 0.88); g.add(gl);
  const bb = spawnProp('Bench'); bb.position.set(S.x, 0, sz - 0.55); g.add(bb);
  const bs = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: label('BUS', '#f2c230', '#1f2a44', 'line 12', 256, 256), roughness: 0.6 }));
  bs.position.set(S.x + 1.9, 2.4, sz + 0.25); g.add(bs);
  add(C(0.04, 0.04, 2.6, 8), metal, S.x + 1.9, 1.3, sz + 0.2);
  solid(S.x, sz - 0.6, 1.6, 0.35); solid(S.x + 1.9, sz + 0.2, 0.08, 0.08);

  // ------------------------------------------------------------ the ends of the street
  // a house across the end of the road at each side, so the street turns a corner
  for (const sgn of [-1, 1]) {
    const x = sgn * (STREET.x1 + 2 + 3);
    const t = T.facadeTexture(sgn > 0 ? 97 : 99, sgn > 0 ? [118, 108, 100] : [140, 120, 100], true);
    t.repeat.set(28 / 6, 10 / 6);
    const blk = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 30), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    blk.position.set(x, 5, fz + 6); g.add(blk);
  }
}
