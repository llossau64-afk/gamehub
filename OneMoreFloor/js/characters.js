// Player character and skin outfits. Smooth, rounded shapes with cel (toon) shading and an ink
// outline, so the hero reads like a small hand-made 3D figure rather than a stack of primitives.
import * as THREE from '../lib/three.module.min.js';
import { buildWeapon } from './weapons.js';

// 3-step light ramp for the toon look.
let _ramp = null;
export function toonRamp() {
  if (_ramp) return _ramp;
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  _ramp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter; _ramp.needsUpdate = true;
  return _ramp;
}
export const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.opacity, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide });
const glow = c => new THREE.MeshBasicMaterial({ color: c });
const INK = new THREE.MeshBasicMaterial({ color: 0x0d0c10, side: THREE.BackSide });

const gcache = new Map();
const G = (k, f) => { if (!gcache.has(k)) gcache.set(k, f()); return gcache.get(k); };
const sphere = (r, w = 16, h = 12) => G('s' + r + w, () => new THREE.SphereGeometry(r, w, h));
const capsule = (r, l) => G('c' + r + l, () => new THREE.CapsuleGeometry(r, l, 6, 14));
const cyl = (a, b, h, s = 14, open = false) => G(`y${a}${b}${h}${s}${open}`, () => new THREE.CylinderGeometry(a, b, h, s, 1, open));
const cone = (r, h, s = 10) => G(`o${r}${h}${s}`, () => new THREE.ConeGeometry(r, h, s));
const torus = (r, t, s = 18) => G(`t${r}${t}${s}`, () => new THREE.TorusGeometry(r, t, 8, s));
const rbox = (w, h, d) => G(`b${w}${h}${d}`, () => { const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2); const p = g.attributes.position; const v = new THREE.Vector3(); // soften corners
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(); v.lerp(n.multiplyScalar(Math.max(w, h, d) * 0.5), 0.18); p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; });

function mesh(geo, mat, parent, x = 0, y = 0, z = 0, ink = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m);
  if (ink) { const o = new THREE.Mesh(geo, INK); o.scale.setScalar(1 + ink); m.add(o); }
  return m;
}

// Cloth chain: segments bent with lag by the game (scarves, capes, tails).
function chain(parent, x, y, z, w, n, len, mat, thick = 0.045) {
  const segs = []; let p = parent;
  const g = G(`ch${w}${len}${thick}`, () => { const g = new THREE.BoxGeometry(w, thick, len); g.translate(0, 0, -len / 2); return g; });
  for (let k = 0; k < n; k++) {
    const s = new THREE.Group(); s.position.set(k ? 0 : x, k ? 0 : y, k ? -len : z); p.add(s);
    const m = new THREE.Mesh(g, mat); s.add(m); segs.push(s); p = s;
    m.scale.x = 1 - k * 0.06;
  }
  return segs;
}

export function buildPlayer(skin, weaponId = 'stick') {
  const c = skin.c;
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);
  const mBody = toon(c.body), mTrim = toon(c.trim), mHead = toon(c.head), mDark = toon(new THREE.Color(c.body).multiplyScalar(0.55).getHex());
  const mats = [mBody, mTrim, mHead, mDark];
  const mEyes = glow(c.eyes);

  // body, feet, head
  const body = mesh(capsule(0.24, 0.24), mBody, rig, 0, 0.46, 0, 0.05);
  const belt = mesh(cyl(0.255, 0.255, 0.07, 18), mDark, body, 0, -0.13, 0);
  const footG = G('foot', () => { const g = new THREE.SphereGeometry(0.11, 12, 8); g.scale(1, 0.62, 1.35); return g; });
  const footL = mesh(footG, mDark, rig, -0.12, 0.06, 0.02, 0.08);
  const footR = mesh(footG, mDark, rig, 0.12, 0.06, 0.02, 0.08);
  const head = new THREE.Group(); head.position.set(0, 0.98, 0); rig.add(head);
  const skull = mesh(sphere(0.3, 20, 16), mHead, head, 0, 0, 0, 0.045);
  // eyes: dark ellipses with a small highlight
  const eyeG = G('eye', () => { const g = new THREE.SphereGeometry(0.052, 12, 10); g.scale(1, 1.4, 0.5); return g; });
  const eyes = new THREE.Group(); eyes.position.set(0, 0.0, 0.265); head.add(eyes);
  const eyeL = mesh(eyeG, mEyes, eyes, -0.1, 0, 0), eyeR = mesh(eyeG, mEyes, eyes, 0.1, 0, 0);
  const hl = glow(0xffffff);
  mesh(sphere(0.016, 8, 6), hl, eyeL, 0.018, 0.03, 0.022); mesh(sphere(0.016, 8, 6), hl, eyeR, 0.018, 0.03, 0.022);
  mesh(sphere(0.035, 8, 6), toon(0xf09a8a, { opacity: 0.55 }), head, -0.17, -0.08, 0.22).scale.set(1, 0.6, 0.4);
  mesh(sphere(0.035, 8, 6), toon(0xf09a8a, { opacity: 0.55 }), head, 0.17, -0.08, 0.22).scale.set(1, 0.6, 0.4);

  // left arm (free) pivoted at the shoulder
  const armL = new THREE.Group(); armL.position.set(-0.29, 0.62, 0); rig.add(armL);
  const upper = G('arm', () => { const g = new THREE.CapsuleGeometry(0.068, 0.17, 4, 10); g.translate(0, -0.12, 0); return g; });
  mesh(upper, mBody, armL, 0, 0, 0, 0.08);
  mesh(sphere(0.085, 12, 10), mHead, armL, 0, -0.29, 0, 0.08);
  // right arm on the weapon pivot
  const pivot = new THREE.Group(); pivot.position.set(0, 0.56, 0); rig.add(pivot);
  const armR = mesh(G('armR', () => { const g = new THREE.CapsuleGeometry(0.068, 0.2, 4, 10); g.rotateZ(Math.PI / 2); g.translate(0.18, 0, 0.04); return g; }), mBody, pivot, 0, 0, 0, 0.08);
  const hand = mesh(sphere(0.085, 12, 10), mHead, pivot, 0.33, 0, 0.12, 0.08);
  const blade = buildWeapon(weaponId);
  hand.add(blade);
  const bb = new THREE.Box3().setFromObject(blade);
  const bladeLen = Math.max(0.5, bb.max.z);

  const acc = new THREE.Group(); rig.add(acc);
  const P = { root, rig, head, body, acc, eyes, eyeL, eyeR, skull, mBody, mTrim, mHead, mDark, mats, c, armL, footL, footR };
  OUTFITS[skin.id] ? OUTFITS[skin.id](P) : OUTFITS.default(P);

  root.userData.eyesRef = eyes;
  return { root, rig, body, head, footL, footR, pivot, hand, blade, bladeLen, bladeMat: mTrim, mats, mEyes, armL, armR, eyes };
}

// ---------------------------------------------------------------- outfits
const OUTFITS = {
  default(P) { // beanie with pompom, scarf, backpack
    const { head, acc, mTrim, mDark, mBody, root } = P;
    const hat = mesh(G('beanie', () => new THREE.SphereGeometry(0.315, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), mTrim, head, 0, 0.04, -0.01, 0.04);
    hat.rotation.x = -0.12;
    mesh(torus(0.3, 0.05, 22), mDark, head, 0, 0.06, -0.01).rotation.x = Math.PI / 2 - 0.12;
    mesh(sphere(0.07, 10, 8), mDark, head, 0, 0.36, -0.05, 0.1);
    mesh(torus(0.2, 0.06, 18), mTrim, acc, 0, 0.72, 0).rotation.x = Math.PI / 2;
    root.userData.chain = chain(acc, 0.1, 0.7, -0.17, 0.12, 4, 0.12, mTrim);
    const bag = mesh(rbox(0.34, 0.36, 0.18), mDark, acc, 0, 0.5, -0.26, 0.05);
    mesh(rbox(0.26, 0.12, 0.08), mBody, bag, 0, -0.06, -0.1);
  },
  street(P) { // backwards cap, hoodie hood, bright sneakers
    const { head, acc, mTrim, mBody, footL, footR, root } = P;
    mesh(G('cap', () => new THREE.SphereGeometry(0.31, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), mTrim, head, 0, 0.05, 0, 0.04);
    const brim = mesh(cyl(0.19, 0.19, 0.03, 16), mTrim, head, 0, 0.1, -0.3); brim.scale.z = 0.7;
    mesh(torus(0.22, 0.09, 18), mBody, acc, 0, 0.72, -0.08).rotation.x = Math.PI / 2 + 0.5;
    footL.material = footR.material = toon(0xf4f1ea);
    mesh(cyl(0.02, 0.02, 0.22, 6), mTrim, acc, 0.07, 0.6, 0.24).rotation.x = 0.2;
    mesh(cyl(0.02, 0.02, 0.22, 6), mTrim, acc, -0.07, 0.6, 0.24).rotation.x = 0.2;
    root.userData.chain = null;
  },
  scout(P) { // forest hood, quiver with arrows, pouch
    const { head, acc, mTrim, mDark, root } = P;
    mesh(G('hood', () => new THREE.SphereGeometry(0.34, 18, 12, Math.PI * 0.2, Math.PI * 1.6, 0, Math.PI * 0.62)), mTrim, head, 0, 0.02, -0.02, 0.04).rotation.y = Math.PI;
    mesh(cone(0.12, 0.22, 10), mTrim, head, 0, 0.12, -0.3).rotation.x = -1.9;
    const q = mesh(cyl(0.08, 0.07, 0.42, 10), toon(0x6b4a2e), acc, 0.12, 0.6, -0.26, 0.08); q.rotation.z = -0.4;
    for (let k = 0; k < 3; k++) { const a = mesh(cyl(0.012, 0.012, 0.24, 5), toon(0xd8c8a0), q, -0.03 + k * 0.03, 0.3, 0); mesh(cone(0.03, 0.08, 4), toon(0xe8584a), a, 0, 0.13, 0); }
    mesh(rbox(0.14, 0.12, 0.08), mDark, acc, 0.2, 0.36, 0.18, 0.06);
    root.userData.chain = chain(acc, 0, 0.72, -0.22, 0.32, 3, 0.14, mTrim);
  },
  cyber(P) { // visor helmet, glowing strips, shoulder pads, antenna
    const { head, acc, eyes, mTrim, mDark, root, c } = P;
    eyes.visible = false;
    mesh(G('helm', () => new THREE.SphereGeometry(0.325, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6)), mDark, head, 0, 0.02, 0, 0.04);
    const vis = mesh(G('visor', () => new THREE.CylinderGeometry(0.31, 0.31, 0.1, 22, 1, true, -1.1, 2.2)), glow(c.eyes), head, 0, 0.0, 0.0);
    vis.material.side = THREE.DoubleSide;
    mesh(cyl(0.012, 0.012, 0.28, 6), mDark, head, 0.2, 0.3, -0.05).rotation.z = -0.3;
    mesh(sphere(0.03, 8, 6), glow(c.trim), head, 0.25, 0.43, -0.05);
    for (const sx of [-1, 1]) { const sp = mesh(rbox(0.2, 0.1, 0.22), mDark, acc, sx * 0.27, 0.7, 0, 0.06); sp.rotation.z = sx * -0.3; mesh(rbox(0.16, 0.02, 0.18), glow(c.trim), sp, 0, 0.05, 0); }
    mesh(rbox(0.04, 0.24, 0.02), glow(c.trim), acc, 0.08, 0.45, 0.245); mesh(rbox(0.04, 0.24, 0.02), glow(c.trim), acc, -0.08, 0.45, 0.245);
    root.userData.chain = null;
  },
  knight(P) { // great helm with slit and plume, pauldrons, chest plate, cape
    const { head, acc, eyes, mBody, mTrim, mDark, root } = P;
    eyes.visible = false;
    const steel = toon(0xb9c1ca);
    mesh(sphere(0.33, 20, 16), steel, head, 0, 0.02, 0, 0.04);
    mesh(rbox(0.36, 0.05, 0.06), toon(0x14161a), head, 0, 0.0, 0.3);
    mesh(rbox(0.04, 0.2, 0.05), steel, head, 0, -0.1, 0.32);
    const pl = mesh(G('plume', () => { const g = new THREE.SphereGeometry(0.1, 10, 8); g.scale(0.7, 1.6, 2); return g; }), mTrim, head, 0, 0.38, -0.08, 0.06);
    pl.rotation.x = 0.4;
    for (const sx of [-1, 1]) { const p2 = mesh(G('paul', () => new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), steel, acc, sx * 0.27, 0.68, 0, 0.06); p2.rotation.z = sx * -0.45; }
    mesh(G('chest', () => { const g = new THREE.SphereGeometry(0.25, 16, 12, -Math.PI / 2, Math.PI, 0.3, 1.8); return g; }), steel, acc, 0, 0.5, 0.03).scale.set(1, 1, 1.06);
    mesh(rbox(0.06, 0.18, 0.02), mTrim, acc, 0, 0.5, 0.29);
    root.userData.chain = chain(acc, 0, 0.7, -0.23, 0.42, 4, 0.13, mTrim, 0.035);
  },
  ronin(P) { // kasa straw hat, cloth mask, sash
    const { head, acc, mTrim, mBody, root } = P;
    const straw = toon(0xd6b46e);
    mesh(cone(0.6, 0.24, 18), straw, head, 0, 0.27, 0, 0.03);
    mesh(cyl(0.2, 0.22, 0.05, 16), toon(0x8a6a3a), head, 0, 0.17, 0);
    mesh(G('mask', () => new THREE.CylinderGeometry(0.305, 0.3, 0.16, 20, 1, true, -1.3, 2.6)), toon(0x2a2630, { side: THREE.DoubleSide }), head, 0, -0.12, 0);
    const sash = mesh(torus(0.26, 0.04, 20), mTrim, acc, 0, 0.42, 0); sash.rotation.set(Math.PI / 2, 0.35, 0);
    root.userData.chain = chain(acc, 0.18, 0.4, -0.15, 0.08, 4, 0.11, mTrim);
  },
  pirate(P) { // tricorn, eyepatch, long coat, parrot on the shoulder
    const { head, acc, eyeR, mTrim, mBody, mDark, root } = P;
    const hatM = toon(0x1c1a20);
    const brim = mesh(cyl(0.42, 0.42, 0.05, 3), hatM, head, 0, 0.2, 0, 0.04); brim.rotation.y = Math.PI;
    mesh(sphere(0.25, 16, 10), hatM, head, 0, 0.24, 0).scale.y = 0.65;
    mesh(torus(0.4, 0.02, 3), toon(0xd8a83a), head, 0, 0.22, 0).rotation.set(Math.PI / 2, 0, Math.PI);
    mesh(sphere(0.06, 10, 8), toon(0xe8e2d6), head, 0, 0.32, 0.15);
    eyeR.visible = false;
    mesh(cyl(0.06, 0.06, 0.02, 12), toon(0x0d0c10), head, 0.1, 0.0, 0.29).rotation.x = Math.PI / 2;
    mesh(torus(0.3, 0.008, 24), toon(0x0d0c10), head, 0, 0.04, 0).rotation.set(Math.PI / 2 + 0.25, 0, 0);
    mesh(cyl(0.27, 0.33, 0.34, 18, true), toon(0x7a1e22, { side: THREE.DoubleSide }), acc, 0, 0.3, -0.01);
    for (let k = 0; k < 3; k++) mesh(sphere(0.022, 8, 6), toon(0xd8a83a), acc, 0.1, 0.56 - k * 0.09, 0.24);
    // parrot
    const par = new THREE.Group(); par.position.set(-0.3, 0.8, -0.02); acc.add(par);
    mesh(G('pbody', () => { const g = new THREE.SphereGeometry(0.08, 10, 8); g.scale(0.9, 1.3, 1); return g; }), toon(0x2fa84f), par, 0, 0, 0, 0.1);
    mesh(sphere(0.06, 10, 8), toon(0xe8402a), par, 0, 0.11, 0.02, 0.1);
    mesh(cone(0.025, 0.07, 6), toon(0xf2c94a), par, 0, 0.1, 0.09).rotation.x = Math.PI / 2;
    mesh(cone(0.04, 0.14, 6), toon(0x2a6ad8), par, 0, -0.1, -0.06).rotation.x = -2.6;
    root.userData.parrot = par;
    root.userData.chain = null;
  },
  astro(P) { // glass bubble helmet, backpack tanks, stripes
    const { head, acc, mTrim, mBody, root } = P;
    const glass = new THREE.MeshPhongMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.28, shininess: 120, specular: 0xffffff, depthWrite: false });
    const bub = new THREE.Mesh(sphere(0.4, 24, 18), glass); bub.position.y = 0.0; head.add(bub);
    mesh(torus(0.3, 0.05, 22), toon(0xe8e8ee), head, 0, -0.24, 0).rotation.x = Math.PI / 2;
    const pack = mesh(rbox(0.36, 0.4, 0.2), toon(0xe8e8ee), acc, 0, 0.52, -0.26, 0.05);
    mesh(cyl(0.06, 0.06, 0.4, 12), mTrim, pack, -0.1, 0.02, -0.08); mesh(cyl(0.06, 0.06, 0.4, 12), mTrim, pack, 0.1, 0.02, -0.08);
    mesh(cyl(0.252, 0.252, 0.05, 20), mTrim, acc, 0, 0.58, 0);
    mesh(cyl(0.008, 0.008, 0.22, 6), toon(0xc8c8d0), head, 0.15, 0.42, -0.1);
    mesh(sphere(0.025, 8, 6), glow(0xe8584a), head, 0.15, 0.53, -0.1);
    root.userData.chain = null;
  },
  shadow(P) { // ninja hood + mask, glowing eyes, tattered scarf, shuriken on the back
    const { head, acc, eyes, mBody, mTrim, root, c } = P;
    mesh(sphere(0.32, 20, 14), mBody, head, 0, 0.01, -0.005, 0.04);
    eyes.visible = false;
    const slit = mesh(rbox(0.36, 0.07, 0.06), toon(0xe2d8c8), head, 0, 0.0, 0.28);
    const eyG = G('ey', () => { const g = new THREE.SphereGeometry(0.03, 8, 6); g.scale(1.8, 0.7, 0.5); return g; });
    mesh(eyG, glow(c.eyes), slit, -0.09, 0, 0.03); mesh(eyG, glow(c.eyes), slit, 0.09, 0, 0.03);
    root.userData.chain = chain(acc, 0.06, 0.74, -0.18, 0.13, 7, 0.12, mTrim);
    const sh = new THREE.Group(); sh.position.set(0, 0.55, -0.27); acc.add(sh);
    for (let k = 0; k < 4; k++) { const b = mesh(cone(0.05, 0.22, 4), toon(0x9aa0aa), sh, 0, 0, 0); b.rotation.z = k * Math.PI / 2; b.position.set(Math.sin(k * Math.PI / 2) * 0.09, Math.cos(k * Math.PI / 2) * 0.09, 0); }
    root.userData.spin = sh;
  },
  warlord(P) { // horned helm, spiked pauldrons, fur collar, cape
    const { head, acc, mBody, mTrim, mDark, root } = P;
    const iron = toon(0x5a606a);
    mesh(G('wh', () => new THREE.SphereGeometry(0.33, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62)), iron, head, 0, 0.03, 0, 0.04);
    mesh(rbox(0.05, 0.22, 0.06), iron, head, 0, -0.05, 0.31);
    const hornM = toon(0xe8dcc4);
    for (const sx of [-1, 1]) {
      const h1 = new THREE.Group(); h1.position.set(sx * 0.27, 0.12, 0); h1.rotation.z = sx * -1.1; head.add(h1);
      mesh(cyl(0.035, 0.075, 0.24, 10), hornM, h1, 0, 0.12, 0, 0.08);
      const h2 = new THREE.Group(); h2.position.y = 0.24; h2.rotation.z = sx * 0.8; h1.add(h2);
      mesh(cone(0.035, 0.2, 10), hornM, h2, 0, 0.1, 0, 0.08);
      const pa = mesh(G('wp', () => new THREE.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), iron, acc, sx * 0.28, 0.68, 0, 0.06); pa.rotation.z = sx * -0.45;
      for (let k = 0; k < 2; k++) mesh(cone(0.035, 0.16, 8), hornM, pa, sx * 0.04 * k, 0.16, -0.05 + k * 0.1).rotation.z = sx * -0.3;
    }
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; mesh(sphere(0.07, 8, 6), toon(0x5a4a40), acc, Math.sin(a) * 0.22, 0.74, Math.cos(a) * 0.2); }
    root.userData.chain = chain(acc, 0, 0.72, -0.24, 0.46, 4, 0.14, mTrim, 0.035);
  },
  golden(P) { // golden armour, crown, royal cape, sparkle aura
    const { head, acc, mTrim, root } = P;
    const gold = toon(0xe0b04a, { emissive: 0x5a3a00, ei: 0.5 });
    mesh(G('gh', () => new THREE.SphereGeometry(0.325, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45)), gold, head, 0, 0.03, 0, 0.04);
    const crown = new THREE.Group(); crown.position.y = 0.28; head.add(crown);
    mesh(cyl(0.2, 0.18, 0.1, 16, true), toon(0xf2c96a, { emissive: 0x6a4a00, ei: 0.6, side: THREE.DoubleSide }), crown, 0, 0, 0);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; mesh(cone(0.04, 0.12, 6), gold, crown, Math.sin(a) * 0.19, 0.09, Math.cos(a) * 0.19); }
    mesh(G('gem', () => new THREE.OctahedronGeometry(0.045, 0)), glow(0xe8402a), crown, 0, 0.02, 0.2);
    for (const sx of [-1, 1]) { const p2 = mesh(G('paul', () => new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), gold, acc, sx * 0.27, 0.68, 0, 0.06); p2.rotation.z = sx * -0.45; }
    root.userData.chain = chain(acc, 0, 0.72, -0.24, 0.44, 4, 0.14, toon(0x9a1e2a), 0.035);
    root.userData.aura = { color: 0xffd36b, kind: 'sparkle' };
  },
  ember(P) { // dark armour with lava glow and a crown of living flames
    const { head, acc, mBody, root } = P;
    const lava = glow(0xff7a2a);
    mesh(G('eh', () => new THREE.SphereGeometry(0.325, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5)), toon(0x2a1a16), head, 0, 0.03, 0, 0.04);
    mesh(torus(0.31, 0.02, 24), lava, head, 0, 0.05, 0).rotation.x = Math.PI / 2;
    const fl = new THREE.Group(); fl.position.y = 0.3; head.add(fl);
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const f = mesh(cone(0.06, 0.26, 8), toon(k % 2 ? 0xffb05a : 0xff6a1a, { emissive: 0xff4a00, ei: 0.8 }), fl, Math.sin(a) * 0.16, 0.08, Math.cos(a) * 0.16); f.userData.base = 0.8 + (k % 3) * 0.25; }
    root.userData.flames = fl;
    mesh(rbox(0.03, 0.2, 0.02), lava, acc, 0.06, 0.48, 0.25); mesh(rbox(0.03, 0.14, 0.02), lava, acc, -0.08, 0.42, 0.25).rotation.z = 0.5;
    root.userData.chain = chain(acc, 0, 0.72, -0.24, 0.42, 4, 0.13, toon(0x3a1a12), 0.035);
    root.userData.aura = { color: 0xff7a2a, kind: 'fire' };
  },
  storm(P) { // halo of lightning, storm-blue armour, crackling sparks
    const { head, acc, mTrim, root } = P;
    mesh(G('sh2', () => new THREE.SphereGeometry(0.325, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5)), toon(0x2c3548), head, 0, 0.03, 0, 0.04);
    const halo = mesh(torus(0.32, 0.025, 28), glow(0xbfe4ff), head, 0, 0.42, -0.04); halo.rotation.x = Math.PI / 2 - 0.25;
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; mesh(G('hs', () => new THREE.OctahedronGeometry(0.04, 0)), glow(0xe8f4ff), halo, Math.sin(a) * 0.32, Math.cos(a) * 0.32, 0); }
    root.userData.halo = halo;
    for (const sx of [-1, 1]) { const p2 = mesh(G('paul', () => new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), toon(0x3a4a68), acc, sx * 0.27, 0.68, 0, 0.06); p2.rotation.z = sx * -0.45; mesh(rbox(0.04, 0.02, 0.2), glow(0x9fd4ff), p2, 0, 0.12, 0); }
    root.userData.chain = chain(acc, 0, 0.72, -0.24, 0.42, 4, 0.13, toon(0x1e2534), 0.035);
    root.userData.aura = { color: 0x9fd4ff, kind: 'spark' };
  },
  stone(P) { // rock pauldrons, glowing crystal, orbiting stones
    const { head, acc, root } = P;
    const rock = toon(0x8a7a62), rockD = toon(0x5a4a3a);
    const rg = G('rock', () => { const g = new THREE.DodecahedronGeometry(0.16, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + Math.sin(i * 12.9) * 0.15), p.getY(i) * (0.85 + Math.cos(i * 7.1) * 0.15), p.getZ(i)); g.computeVertexNormals(); return g; });
    mesh(rg, rock, acc, -0.3, 0.7, 0, 0.06).scale.set(1.2, 0.9, 1.1); mesh(rg, rockD, acc, 0.3, 0.7, 0, 0.06).scale.set(1.2, 0.9, 1.1);
    mesh(rg, rock, head, 0, 0.26, -0.04, 0.06).scale.set(1.6, 0.6, 1.6);
    mesh(G('crys', () => new THREE.OctahedronGeometry(0.07, 0)), glow(0xffd36b), head, 0, 0.18, 0.27).scale.y = 1.5;
    const orb = new THREE.Group(); orb.position.y = 0.6; acc.add(orb);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; mesh(rg, rockD, orb, Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55, 0.08).scale.setScalar(0.45); }
    root.userData.orbit = orb;
    root.userData.chain = null;
    root.userData.aura = { color: 0xc9a06a, kind: 'dust' };
  },
  frostguard(P) { // crown of ice, crystal shoulders, frosted cape, snow
    const { head, acc, root } = P;
    const ice = toon(0xcff4ff, { emissive: 0x3a8aaa, ei: 0.45 });
    const cr = G('icecr', () => new THREE.OctahedronGeometry(0.06, 0));
    for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.38; const m = mesh(cr, ice, head, Math.sin(a) * 0.27, 0.27 + (k === 3 ? 0.08 : 0), Math.cos(a) * 0.2 - 0.05, 0.08); m.scale.set(0.8, 3 - Math.abs(k - 3) * 0.5, 0.8); m.rotation.z = -Math.sin(a) * 0.4; }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const m = mesh(cr, ice, acc, sx * (0.27 + k * 0.03), 0.72 + k * 0.03, -0.06 + k * 0.06, 0.08); m.scale.set(0.8, 2.2, 0.8); m.rotation.z = sx * -(0.4 + k * 0.25); }
    root.userData.chain = chain(acc, 0, 0.72, -0.24, 0.44, 4, 0.14, toon(0x9fd8f0), 0.035);
    root.userData.aura = { color: 0xdff6ff, kind: 'snow' };
  },
  zephyr(P) { // feathered hat and a very long scarf that rides the wind
    const { head, acc, mTrim, root } = P;
    mesh(G('zh', () => new THREE.SphereGeometry(0.315, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45)), toon(0x2a3a34), head, 0, 0.05, 0, 0.04);
    for (let k = 0; k < 3; k++) { const f = mesh(G('feather', () => { const g = new THREE.SphereGeometry(0.06, 8, 6); g.scale(0.5, 3.5, 1); return g; }), toon(k === 1 ? 0xc8ffd8 : 0x8ad8a8), head, 0.12 + k * 0.04, 0.32, -0.06 - k * 0.04, 0.1); f.rotation.set(-0.5 - k * 0.2, 0, -0.6); }
    mesh(torus(0.2, 0.06, 18), mTrim, acc, 0, 0.72, 0).rotation.x = Math.PI / 2;
    root.userData.chain = chain(acc, 0.08, 0.7, -0.18, 0.15, 8, 0.13, mTrim);
    root.userData.aura = { color: 0xc8ffd8, kind: 'wind' };
  },
};

// Per-frame idle motion for the decorative parts; used in game and in the shop preview.
export function animateOutfit(root, t) {
  const u = root.userData;
  if (u.flames) u.flames.children.forEach((f, k) => { f.scale.y = (f.userData.base || 1) * (0.8 + Math.sin(t * 14 + k * 1.7) * 0.25); });
  if (u.halo) u.halo.rotation.z = t * 1.6;
  if (u.orbit) u.orbit.rotation.y = t * 1.8;
  if (u.spin) u.spin.rotation.z = t * 0.6;
  if (u.parrot) { u.parrot.rotation.y = Math.sin(t * 1.3) * 0.5; u.parrot.position.y = 0.8 + Math.abs(Math.sin(t * 4)) * 0.015; }
}

// ---------------------------------------------------------------- power showcase models (shop)
let _soft = null;
function softTex() {
  if (_soft) return _soft;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _soft = new THREE.CanvasTexture(c); _soft.colorSpace = THREE.SRGBColorSpace; return _soft;
}
const sprite = (color, s, opacity = 1) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })); m.scale.set(s, s, 1); return m; };
function noisyRock(r, detail = 1, seed = 1) {
  const g = new THREE.DodecahedronGeometry(r, detail), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 0.82 + 0.18 * Math.sin(v.x * 9 * seed + v.y * 7) * Math.cos(v.z * 8 + v.x * 3 * seed); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}

export function buildPowerModel(id) {
  const g = new THREE.Group(); let animate = () => { };
  const Y = 0.85;
  if (id === 'fire') {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), glow(0xfff2c0)); core.position.y = Y; g.add(core);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); shell.position.y = Y; g.add(shell);
    const halo = sprite(0xff6a10, 2.2, 0.7); halo.position.y = Y; g.add(halo);
    const flames = [];
    for (let k = 0; k < 26; k++) { const s = sprite(k % 3 ? 0xff8a2a : 0xffd27a, 0.4); g.add(s); flames.push({ s, o: k / 26, a: k * 2.4 }); }
    animate = t => {
      shell.scale.setScalar(1 + Math.sin(t * 9) * 0.06); core.scale.setScalar(1 + Math.sin(t * 13) * 0.05);
      for (const f of flames) { const q = (t * 0.9 + f.o) % 1; const r = 0.28 * (1 - q * 0.6); f.s.position.set(Math.sin(f.a + t * 2) * r, Y + q * 0.9, Math.cos(f.a + t * 2) * r); f.s.material.opacity = (1 - q) * 0.9; f.s.material.color.setHSL(0.09 - q * 0.08, 1, 0.55 - q * 0.2); const sc = 0.45 * (1 - q * 0.7); f.s.scale.set(sc, sc, 1); }
    };
  } else if (id === 'lightning') {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), glow(0xe8f6ff)); orb.position.y = Y; g.add(orb);
    const halo = sprite(0x6ab8ff, 2.2, 0.8); halo.position.y = Y; g.add(halo);
    const mat = new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, blending: THREE.AdditiveBlending });
    const bolts = Array.from({ length: 6 }, () => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3)); const l = new THREE.Line(geo, mat); g.add(l); return l; });
    let last = 0;
    animate = t => {
      orb.scale.setScalar(1 + Math.sin(t * 20) * 0.06);
      if (t - last < 0.07) return; last = t;
      for (const b of bolts) {
        const a = Math.random() * Math.PI * 2, el = (Math.random() - 0.3) * 1.2, arr = b.geometry.attributes.position.array;
        for (let k = 0; k < 8; k++) { const r = 0.22 + k * 0.1, j = k ? 0.06 : 0; arr[k * 3] = Math.cos(a) * Math.cos(el) * r + (Math.random() - 0.5) * j; arr[k * 3 + 1] = Y + Math.sin(el) * r + (Math.random() - 0.5) * j; arr[k * 3 + 2] = Math.sin(a) * Math.cos(el) * r + (Math.random() - 0.5) * j; }
        b.geometry.attributes.position.needsUpdate = true; b.visible = Math.random() < 0.8;
      }
    };
  } else if (id === 'earth') {
    const rock = new THREE.Mesh(noisyRock(0.36, 1, 1.3), toon(0x8a7258)); rock.position.y = Y; g.add(rock);
    const crack = new THREE.Mesh(noisyRock(0.37, 1, 1.3), new THREE.MeshBasicMaterial({ color: 0xffb347, wireframe: true, transparent: true, opacity: 0.25 })); rock.add(crack);
    const pebbles = new THREE.Group(); pebbles.position.y = Y; g.add(pebbles);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const pb = new THREE.Mesh(noisyRock(0.08, 0, k + 1), toon(k % 2 ? 0x6a5a48 : 0x9a8468)); pb.position.set(Math.sin(a) * 0.62, Math.sin(k) * 0.12, Math.cos(a) * 0.62); pebbles.add(pb); }
    const dust = sprite(0xc9a06a, 1.6, 0.25); dust.position.y = 0.15; g.add(dust);
    animate = t => { rock.rotation.set(t * 0.4, t * 0.7, 0); rock.position.y = Y + Math.sin(t * 2) * 0.05; pebbles.rotation.y = t * 1.2; pebbles.children.forEach((c, k) => c.rotation.set(t * (1 + k * 0.2), t, 0)); };
  } else if (id === 'frost') {
    const ice = toon(0xcff4ff, { emissive: 0x2a7a9a, ei: 0.5 });
    const cl = new THREE.Group(); cl.position.y = Y - 0.25; g.add(cl);
    const og = new THREE.OctahedronGeometry(0.12, 0);
    [[0, 0, 0, 3.2], [0.16, -0.05, 0.05, 2.2], [-0.15, -0.06, 0.02, 2.4], [0.05, -0.08, -0.15, 1.9], [-0.05, -0.08, 0.16, 1.7]].forEach(([x, y, z, h], k) => { const m = new THREE.Mesh(og, ice); m.position.set(x, y + h * 0.1, z); m.scale.set(1, h, 1); m.rotation.set(z * 2, 0, -x * 2); const o = new THREE.Mesh(og, INK); o.scale.setScalar(1.08); m.add(o); cl.add(m); });
    const halo = sprite(0x9feaff, 1.8, 0.5); halo.position.y = Y; g.add(halo);
    const flakes = Array.from({ length: 14 }, (_, k) => { const s = sprite(0xffffff, 0.12); g.add(s); return { s, a: k * 0.9, o: k / 14 }; });
    animate = t => { cl.rotation.y = t * 0.5; for (const f of flakes) { const q = (t * 0.25 + f.o) % 1; f.s.position.set(Math.sin(f.a + t) * 0.65, 1.5 - q * 1.4, Math.cos(f.a + t) * 0.65); f.s.material.opacity = Math.sin(q * Math.PI); } };
  } else {
    const ring = new THREE.Group(); ring.position.y = Y; g.add(ring);
    for (let k = 0; k < 3; k++) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.35 + k * 0.12, 0.035 - k * 0.008, 6, 30, Math.PI * 1.1), new THREE.MeshBasicMaterial({ color: 0xc8ffd8, transparent: true, opacity: 0.8 - k * 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
      arc.rotation.x = Math.PI / 2; arc.rotation.z = k * 2.1; ring.add(arc);
    }
    const halo = sprite(0x8affb8, 1.6, 0.35); halo.position.y = Y; g.add(halo);
    animate = t => { ring.rotation.y = -t * 4; ring.children.forEach((a, k) => { a.rotation.z = k * 2.1 + t * (2 + k); }); };
  }
  return { group: g, animate };
}
