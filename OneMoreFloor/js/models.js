// Procedural low-poly models. Every character is built from a handful of flat-shaded primitives,
// with an inverted-hull outline on the main shapes so everything reads as one consistent style.
import * as THREE from '../lib/three.module.min.js';
import { buildWeapon } from './weapons.js';

const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0b0c10, side: THREE.BackSide });
const geoCache = new Map();
function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }

export function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

function part(g, mat, parent, x = 0, y = 0, z = 0, outline = 0) {
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  parent.add(m);
  if (outline) {
    const o = new THREE.Mesh(g, OUTLINE);
    o.scale.setScalar(1 + outline);
    m.add(o);
  }
  return m;
}

// ---------------- PLAYER ----------------
export function buildPlayer(skin, weaponId = 'stick') {
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);
  const c = skin.c;
  const mBody = lambert(c.body), mTrim = lambert(c.trim), mHead = lambert(c.head), mEyes = new THREE.MeshBasicMaterial({ color: c.eyes });
  const mats = [mBody, mTrim, mHead];

  const body = part(geo('pBody', () => new THREE.CylinderGeometry(0.27, 0.33, 0.52, 7)), mBody, rig, 0, 0.42, 0, 0.09);
  part(geo('pBelt', () => new THREE.CylinderGeometry(0.335, 0.335, 0.09, 7)), mTrim, rig, 0, 0.26, 0);
  const head = part(geo('pHead', () => new THREE.DodecahedronGeometry(0.27, 0)), mHead, rig, 0, 0.9, 0, 0.08);
  const eyeG = geo('pEye', () => new THREE.BoxGeometry(0.055, 0.1, 0.04));
  const eyeL = part(eyeG, mEyes, head, -0.09, 0.02, 0.24);
  const eyeR = part(eyeG, mEyes, head, 0.09, 0.02, 0.24);
  const footG = geo('pFoot', () => new THREE.BoxGeometry(0.13, 0.1, 0.22));
  const footL = part(footG, mBody, rig, -0.13, 0.05, 0, 0.12);
  const footR = part(footG, mBody, rig, 0.13, 0.05, 0, 0.12);

  part(geo('pBuckle', () => new THREE.BoxGeometry(0.12, 0.08, 0.05)), mTrim, rig, 0, 0.26, 0.33);
  // Free (left) arm, pivoted at the shoulder so it can swing while running.
  const armL = new THREE.Group(); armL.position.set(-0.33, 0.62, 0); rig.add(armL);
  part(geo('pArm', () => { const g = new THREE.BoxGeometry(0.11, 0.3, 0.11); g.translate(0, -0.13, 0); return g; }), mBody, armL, 0, 0, 0, 0.1);
  part(geo('pFist', () => new THREE.BoxGeometry(0.12, 0.12, 0.12)), mHead, armL, 0, -0.3, 0);
  // Weapon on a pivot so swings rotate around the body.
  const pivot = new THREE.Group(); pivot.position.set(0, 0.5, 0); rig.add(pivot);
  const hand = part(geo('pHand', () => new THREE.BoxGeometry(0.12, 0.12, 0.12)), mHead, pivot, 0.36, 0, 0.12);
  const bladeMat = new THREE.MeshBasicMaterial({ color: c.blade });
  const blade = buildWeapon(weaponId);
  hand.add(blade);

  // Accessories per skin.
  const acc = new THREE.Group(); rig.add(acc);
  const a = skin.acc;
  // Cloth tails are chains of short segments; the game bends each one with a little lag.
  const chain = (parent, x, y, z, w, n, segLen) => {
    const segs = []; let p = parent;
    const g = geo('chain' + w + segLen, () => { const g = new THREE.BoxGeometry(w, 0.045, segLen); g.translate(0, 0, -segLen / 2); return g; });
    for (let k = 0; k < n; k++) {
      const seg = new THREE.Group(); seg.position.set(k ? 0 : x, k ? 0 : y, k ? -segLen : z); p.add(seg);
      part(g, mTrim, seg, 0, 0, 0); segs.push(seg); p = seg;
    }
    return segs;
  };
  if (a === 'longscarf') {
    root.userData.chain = chain(acc, 0.06, 0.68, -0.22, 0.15, 7, 0.13);
  } else if (a === 'scarf') {
    part(geo('sc1', () => new THREE.CylinderGeometry(0.25, 0.29, 0.1, 7)), mTrim, acc, 0, 0.68, 0);
    root.userData.chain = chain(acc, 0.08, 0.68, -0.22, 0.13, 4, 0.13);
  } else if (a === 'band') {
    part(geo('bd1', () => new THREE.CylinderGeometry(0.255, 0.255, 0.07, 9)), mTrim, head, 0, 0.1, 0);
    root.userData.chain = chain(head, 0.06, 0.1, -0.24, 0.06, 4, 0.1);
  } else if (a === 'visor') {
    eyeL.visible = eyeR.visible = false;
    part(geo('vs', () => new THREE.BoxGeometry(0.4, 0.08, 0.1)), mEyes, head, 0, 0.02, 0.21);
    part(geo('ant', () => new THREE.BoxGeometry(0.03, 0.22, 0.03)), mTrim, head, 0.16, 0.25, -0.05);
  } else if (a === 'plume') {
    part(geo('hl', () => new THREE.CylinderGeometry(0.29, 0.29, 0.2, 8)), mBody, head, 0, 0.07, 0);
    part(geo('pl', () => new THREE.ConeGeometry(0.08, 0.38, 5)), mTrim, head, 0, 0.36, -0.06).rotation.x = -0.4;
  } else if (a === 'hood') {
    part(geo('hd', () => new THREE.ConeGeometry(0.34, 0.5, 6)), mBody, head, 0, 0.14, -0.05, 0.06).rotation.x = -0.25;
  } else if (a === 'crown') {
    const cr = part(geo('cr', () => new THREE.CylinderGeometry(0.2, 0.17, 0.12, 6, 1, true)), mTrim, head, 0, 0.27, 0);
    cr.material = lambert(c.trim, { side: THREE.DoubleSide, emissive: c.trim, emissiveIntensity: 0.25 });
  } else if (a === 'hat') { // wide straw hat + sash
    const hat = part(geo('hat', () => new THREE.ConeGeometry(0.55, 0.24, 10)), lambert(0xc9a86a), head, 0, 0.24, 0, 0.05);
    hat.rotation.x = -0.08;
    part(geo('hatb', () => new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10)), mTrim, head, 0, 0.16, 0);
    part(geo('sash', () => new THREE.BoxGeometry(0.62, 0.09, 0.1)), mTrim, rig, 0, 0.5, 0.05).rotation.z = 0.5;
  } else if (a === 'horns') { // heavy helm with horns and pauldrons
    part(geo('helm', () => new THREE.CylinderGeometry(0.29, 0.3, 0.26, 8)), mBody, head, 0, 0.06, 0, 0.06);
    const hornG = geo('horn', () => { const g = new THREE.ConeGeometry(0.06, 0.34, 5); g.translate(0, 0.17, 0); return g; });
    part(hornG, lambert(0xe8dcc4), head, -0.26, 0.12, 0).rotation.z = 1.0;
    part(hornG, lambert(0xe8dcc4), head, 0.26, 0.12, 0).rotation.z = -1.0;
    const pg = geo('paul', () => new THREE.DodecahedronGeometry(0.17, 0));
    part(pg, mTrim, rig, -0.33, 0.66, 0, 0.08).scale.set(1.1, 0.7, 1); part(pg, mTrim, rig, 0.33, 0.66, 0, 0.08).scale.set(1.1, 0.7, 1);
  } else if (a === 'flame') { // burning crown of flames
    const fg = geo('flm', () => new THREE.ConeGeometry(0.07, 0.3, 4));
    const fm = new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.9 });
    for (let k = 0; k < 5; k++) { const a2 = k * Math.PI * 2 / 5; part(fg, fm, head, Math.sin(a2) * 0.16, 0.3, Math.cos(a2) * 0.16).scale.y = 0.8 + (k % 2) * 0.5; }
    root.userData.flames = true;
  } else if (a === 'halo') {
    const ring = part(geo('halo', () => new THREE.TorusGeometry(0.3, 0.025, 4, 24)), new THREE.MeshBasicMaterial({ color: c.trim }), head, 0, 0.42, 0);
    ring.rotation.x = Math.PI / 2; root.userData.halo = ring;
  } else if (a === 'rocks') {
    const rg = geo('rk', () => new THREE.DodecahedronGeometry(0.15, 0));
    const rm = lambert(0x8a7a62);
    part(rg, rm, rig, -0.36, 0.68, 0, 0.08).scale.set(1.2, 0.9, 1.1); part(rg, rm, rig, 0.36, 0.68, 0, 0.08).scale.set(1.2, 0.9, 1.1);
    part(geo('rkc', () => new THREE.DodecahedronGeometry(0.1, 0)), rm, head, 0.1, 0.25, -0.05, 0.08);
  } else if (a === 'icehorns') {
    const ig = geo('ih', () => { const g = new THREE.ConeGeometry(0.05, 0.4, 4); g.translate(0, 0.2, 0); return g; });
    const im = new THREE.MeshLambertMaterial({ color: 0xbfefff, emissive: 0x3a7a9a, emissiveIntensity: 0.5, flatShading: true });
    part(ig, im, head, -0.18, 0.15, 0).rotation.z = 0.45; part(ig, im, head, 0.18, 0.15, 0).rotation.z = -0.45; part(ig, im, head, 0, 0.22, -0.08).rotation.x = -0.4;
  }
  if (a === 'longscarf') {
    part(geo('sc1', () => new THREE.CylinderGeometry(0.25, 0.29, 0.1, 7)), mTrim, acc, 0, 0.68, 0);
  }

  if (a === 'plume' || a === 'crown' || a === 'hood' || a === 'visor' || a === 'horns' || a === 'flame' || a === 'halo' || a === 'rocks' || a === 'icehorns' || a === 'hat') {
    // short cape for the heavier skins
    root.userData.chain = chain(rig, 0, 0.66, -0.26, 0.34, 3, 0.15);
  }
  return { root, rig, body, head, footL, footR, pivot, hand, blade, bladeMat, mats, mEyes, armL };
}

// ---------------- ENEMIES ----------------
export const ENEMY_COLORS = {
  runner: 0xe8584a, shooter: 0x9b6cff, tank: 0x8c4a3a, dasher: 0x2fb8c8, splitter: 0x8fcf4a, dummy: 0xb48a5c,
};

export function buildEnemy(type) {
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);
  const col = ENEMY_COLORS[type];
  const mMain = lambert(col, { emissive: 0xffffff, emissiveIntensity: 0 });
  const mDark = lambert(new THREE.Color(col).multiplyScalar(0.45).getHex(), { emissive: 0xffffff, emissiveIntensity: 0 });
  const mEye = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
  const mats = [mMain, mDark];
  const m = { root, rig, mats, mEye, type };

  if (type === 'runner') {
    const body = part(geo('rB', () => { const g = new THREE.ConeGeometry(0.34, 0.62, 5); g.rotateX(Math.PI / 2); return g; }), mMain, rig, 0, 0.36, 0, 0.1);
    part(geo('rE', () => new THREE.BoxGeometry(0.16, 0.09, 0.06)), mEye, body, 0, 0.1, 0.1);
    const legG = geo('rL', () => new THREE.BoxGeometry(0.08, 0.2, 0.08));
    m.legL = part(legG, mDark, rig, -0.15, 0.1, -0.05); m.legR = part(legG, mDark, rig, 0.15, 0.1, -0.05);
    const spk = geo('rS', () => new THREE.ConeGeometry(0.06, 0.2, 4));
    part(spk, mDark, body, 0, 0.17, -0.12).rotation.x = -0.5; part(spk, mDark, body, 0, 0.13, -0.24).rotation.x = -0.7;
    m.body = body; m.radius = 0.36; m.height = 0.7;
  } else if (type === 'shooter') {
    const body = part(geo('sB', () => new THREE.OctahedronGeometry(0.38, 0)), mMain, rig, 0, 0.95, 0, 0.09);
    body.scale.y = 1.25;
    m.core = part(geo('sC', () => new THREE.IcosahedronGeometry(0.13, 0)), new THREE.MeshBasicMaterial({ color: 0xffd0ff }), rig, 0, 0.95, 0.3);
    const ring = part(geo('sR', () => new THREE.TorusGeometry(0.55, 0.035, 4, 12)), mDark, rig, 0, 0.95, 0);
    ring.rotation.x = Math.PI / 2;
    m.orbiters = new THREE.Group(); m.orbiters.position.y = 0.95; rig.add(m.orbiters);
    const shardG = geo('sSh', () => new THREE.TetrahedronGeometry(0.09, 0));
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; part(shardG, mMain, m.orbiters, Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62); }
    m.ring = ring; m.body = body; m.radius = 0.42; m.height = 1.4; m.float = true;
  } else if (type === 'tank') {
    const body = part(geo('tB', () => new THREE.BoxGeometry(1.05, 0.8, 0.95)), mMain, rig, 0, 0.5, 0, 0.06);
    part(geo('tP', () => new THREE.BoxGeometry(0.85, 0.16, 0.75)), mDark, body, 0, 0.47, 0);
    part(geo('tE', () => new THREE.BoxGeometry(0.5, 0.07, 0.05)), mEye, body, 0, 0.12, 0.49);
    const armG = geo('tA', () => new THREE.BoxGeometry(0.28, 0.5, 0.38));
    m.armL = part(armG, mDark, rig, -0.68, 0.42, 0.1, 0.08); m.armR = part(armG, mDark, rig, 0.68, 0.42, 0.1, 0.08);
    const horn = geo('tH', () => new THREE.ConeGeometry(0.09, 0.32, 5));
    part(horn, mEye, body, -0.36, 0.6, 0.22).rotation.set(0.5, 0, 0.5); part(horn, mEye, body, 0.36, 0.6, 0.22).rotation.set(0.5, 0, -0.5);
    m.body = body; m.radius = 0.7; m.height = 1.1;
  } else if (type === 'dasher') {
    const body = part(geo('dB', () => { const g = new THREE.OctahedronGeometry(0.4, 0); g.scale(0.65, 0.6, 1.4); return g; }), mMain, rig, 0, 0.5, 0, 0.09);
    const finG = geo('dF', () => { const g = new THREE.ConeGeometry(0.12, 0.45, 3); g.rotateZ(Math.PI / 2); return g; });
    part(finG, mDark, rig, -0.32, 0.55, -0.1).rotation.y = 0.5;
    part(finG, mDark, rig, 0.32, 0.55, -0.1).rotation.set(0, -0.5, Math.PI);
    part(geo('dE', () => new THREE.BoxGeometry(0.2, 0.06, 0.05)), mEye, body, 0, 0.08, 0.42);
    m.thruster = part(geo('dT', () => { const g = new THREE.ConeGeometry(0.13, 0.36, 6); g.rotateX(-Math.PI / 2); return g; }), new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), rig, 0, 0.5, -0.62);
    m.body = body; m.radius = 0.4; m.height = 0.9;
  } else if (type === 'splitter') {
    const body = part(geo('spB', () => new THREE.IcosahedronGeometry(0.46, 0)), mMain, rig, 0, 0.46, 0, 0.08);
    const eG = geo('spE', () => new THREE.BoxGeometry(0.08, 0.12, 0.05));
    part(eG, mEye, body, -0.12, 0.08, 0.4); part(eG, mEye, body, 0.12, 0.08, 0.4);
    const bump = geo('spBu', () => new THREE.IcosahedronGeometry(0.17, 0));
    part(bump, mMain, body, 0.3, 0.25, -0.2, 0.1); part(bump, mDark, body, -0.28, 0.3, -0.15, 0.1); part(bump, mMain, body, 0.05, 0.4, -0.25, 0.1);
    m.body = body; m.radius = 0.46; m.height = 0.95;
  } else if (type === 'dummy') {
    part(geo('duP', () => new THREE.CylinderGeometry(0.06, 0.08, 0.5, 6)), mDark, rig, 0, 0.25, 0);
    const body = part(geo('duB', () => new THREE.CylinderGeometry(0.3, 0.34, 0.62, 8)), mMain, rig, 0, 0.78, 0, 0.08);
    part(geo('duBand', () => new THREE.CylinderGeometry(0.345, 0.345, 0.07, 8)), mDark, body, 0, 0.05, 0);
    part(geo('duH', () => new THREE.DodecahedronGeometry(0.2, 0)), mMain, rig, 0, 1.25, 0, 0.08);
    const ring = part(geo('duT', () => new THREE.TorusGeometry(0.17, 0.035, 4, 16)), new THREE.MeshBasicMaterial({ color: 0xe8584a }), body, 0, 0.02, 0.33);
    part(geo('duTc', () => new THREE.CircleGeometry(0.06, 10)), new THREE.MeshBasicMaterial({ color: 0xe8584a }), body, 0, 0.02, 0.34);
    m.body = body; m.radius = 0.4; m.height = 1.4;
  }
  // Elite trim: a gold band; toggled by the game.
  const band = part(geo('elite', () => new THREE.TorusGeometry(0.62, 0.045, 4, 14)), new THREE.MeshBasicMaterial({ color: 0xf2b24a }), root, 0, 0.06, 0);
  band.rotation.x = Math.PI / 2; band.visible = false; m.eliteBand = band;
  return m;
}

// ---------------- BOSSES ----------------
export function buildBoss(kind) {
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);
  const m = { root, rig, kind };
  const steel = lambert(0x3a3f4b, { emissive: 0xffffff, emissiveIntensity: 0 });
  const dark = lambert(0x23262e, { emissive: 0xffffff, emissiveIntensity: 0 });
  m.mats = [steel, dark];
  if (kind === 'warden') {
    const accent = 0xff4fa3;
    const body = part(new THREE.CylinderGeometry(0.75, 1.0, 1.9, 6), steel, rig, 0, 1.5, 0, 0.05);
    part(new THREE.CylinderGeometry(1.05, 1.05, 0.2, 6), dark, rig, 0, 0.62, 0);
    part(new THREE.CylinderGeometry(0.8, 0.8, 0.18, 6), dark, rig, 0, 2.5, 0);
    const lantern = part(new THREE.CylinderGeometry(0.55, 0.65, 0.7, 6), dark, rig, 0, 2.95, 0, 0.05);
    m.core = part(new THREE.IcosahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: accent }), rig, 0, 2.95, 0);
    part(new THREE.ConeGeometry(0.62, 0.55, 6), steel, rig, 0, 3.55, 0, 0.05);
    const sh = new THREE.BoxGeometry(0.5, 0.5, 0.7);
    m.armL = part(sh, dark, rig, -1.05, 1.9, 0, 0.06); m.armR = part(sh, dark, rig, 1.05, 1.9, 0, 0.06);
    part(new THREE.BoxGeometry(0.9, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: accent }), body, 0, 0.35, 0.82);
    m.lantern = lantern; m.body = body; m.radius = 1.1; m.height = 3.9; m.float = true;
  } else if (kind === 'crusher') {
    const accent = 0xff7a3a;
    const body = part(new THREE.BoxGeometry(2.0, 1.6, 1.6), steel, rig, 0, 1.25, 0, 0.04);
    part(new THREE.BoxGeometry(1.6, 0.3, 1.3), dark, body, 0, 0.9, 0);
    part(new THREE.BoxGeometry(1.2, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: accent }), body, 0, 0.25, 0.81);
    const fist = new THREE.BoxGeometry(0.75, 0.75, 0.85);
    m.armL = part(fist, dark, rig, -1.45, 0.75, 0.35, 0.05); m.armR = part(fist, dark, rig, 1.45, 0.75, 0.35, 0.05);
    const leg = new THREE.BoxGeometry(0.55, 0.5, 0.6);
    part(leg, dark, rig, -0.6, 0.25, 0); part(leg, dark, rig, 0.6, 0.25, 0);
    m.body = body; m.radius = 1.3; m.height = 2.6;
  } else {
    const accent = 0x46d8e8;
    const body = part(new THREE.ConeGeometry(0.7, 2.0, 5), dark, rig, 0, 1.1, 0, 0.05);
    const head = part(new THREE.OctahedronGeometry(0.38, 0), steel, rig, 0, 2.35, 0, 0.06);
    part(new THREE.BoxGeometry(0.42, 0.07, 0.06), new THREE.MeshBasicMaterial({ color: accent }), head, 0, 0.02, 0.3);
    const bladeG = new THREE.BoxGeometry(0.08, 0.06, 1.3); bladeG.translate(0, 0, 0.6);
    const bm = new THREE.MeshBasicMaterial({ color: 0xcff8ff });
    m.armL = part(bladeG, bm, rig, -0.75, 1.3, 0); m.armR = part(bladeG, bm, rig, 0.75, 1.3, 0);
    m.armL.rotation.y = -0.35; m.armR.rotation.y = 0.35;
    part(new THREE.ConeGeometry(0.9, 0.9, 5, 1, true), lambert(0x15171c, { side: THREE.DoubleSide }), rig, 0, 1.75, -0.15).rotation.x = 0.15;
    m.body = body; m.radius = 0.9; m.height = 2.8;
  }
  return m;
}

// ---------------- THE OPERATOR (dialog portrait) ----------------
// Argus, overseer of the tower: a towering armoured figure. Horned great-helm with burning eyes,
// spiked crown, massive pauldrons, fur mantle, cape, and a rune staff held in a gauntlet.
let _glowTex = null;
function glowTex() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c); _glowTex.colorSpace = THREE.SRGBColorSpace; return _glowTex;
}
export function buildOperator() {
  const root = new THREE.Group();
  const steel = lambert(0x2c2f36), steelLite = lambert(0x4b505a), steelDark = lambert(0x1a1c21);
  const gold = lambert(0xc08f34, { emissive: 0x3a2400, emissiveIntensity: 0.45 });
  const cloth = lambert(0x6a1c1c), fur = lambert(0x4a3f38), leather = lambert(0x2a211c), horn = lambert(0x2a2420);
  const glow = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const add = (g, m, p, x, y, z, o = 0) => part(g, m, p, x, y, z, o);
  const body = new THREE.Group(); root.add(body);

  // cape first so it sits behind everything
  const cape = new THREE.Group(); cape.position.set(0, 1.15, -0.32); body.add(cape);
  const capeG = new THREE.CylinderGeometry(0.75, 1.05, 1.9, 10, 1, true, Math.PI * 0.55, Math.PI * 0.9); capeG.translate(0, -0.95, 0);
  add(capeG, new THREE.MeshLambertMaterial({ color: 0x5a1818, side: THREE.DoubleSide, flatShading: true }), cape, 0, 0, 0);

  // torso: tapered breastplate with a rune emblem and belt
  add(new THREE.CylinderGeometry(0.66, 0.5, 1.15, 8), steel, body, 0, 0.55, 0, 0.03);
  const chest = add(new THREE.CylinderGeometry(0.62, 0.46, 0.7, 6, 1, false, -Math.PI / 2, Math.PI), steelLite, body, 0, 0.82, 0.05, 0.03);
  chest.rotation.y = 0;
  const emb = add(new THREE.OctahedronGeometry(0.11, 0), glow, body, 0, 0.88, 0.62); emb.scale.set(0.8, 1.3, 0.5);
  add(new THREE.TorusGeometry(0.17, 0.025, 4, 6), gold, body, 0, 0.88, 0.6);
  add(new THREE.CylinderGeometry(0.53, 0.53, 0.1, 8), leather, body, 0, 0.3, 0);
  add(new THREE.BoxGeometry(0.2, 0.16, 0.06), gold, body, 0, 0.3, 0.52);

  // fur mantle
  const tet = new THREE.TetrahedronGeometry(0.17, 0);
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const m = add(tet, fur, body, Math.sin(a) * 0.56, 1.14 + (k % 2) * 0.04, Math.cos(a) * 0.42); m.rotation.set(a, a * 2, 0.4); }

  // pauldrons: stacked plates with gold trim and spikes
  const plate = new THREE.SphereGeometry(0.4, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const spike = new THREE.ConeGeometry(0.055, 0.36, 5);
  for (const sx of [-1, 1]) {
    const pa = new THREE.Group(); pa.position.set(sx * 0.78, 1.08, 0); pa.rotation.z = sx * -0.4; body.add(pa);
    add(plate, steelLite, pa, 0, 0, 0, 0.04).scale.set(1.15, 0.85, 1.05);
    add(plate, steel, pa, sx * 0.06, -0.12, 0, 0.04).scale.set(1.0, 0.7, 0.95);
    add(new THREE.TorusGeometry(0.44, 0.028, 4, 18), gold, pa, 0, 0.01, 0).rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) { const sp = add(spike, steelDark, pa, sx * (0.05 + k * 0.12), 0.32 - k * 0.06, -0.12 + k * 0.12); sp.rotation.z = sx * -0.35; }
    // arm + gauntlet
    add(new THREE.CylinderGeometry(0.16, 0.14, 0.62, 7), steel, body, sx * 0.86, 0.55, 0.08, 0.04);
    add(new THREE.BoxGeometry(0.26, 0.24, 0.28), steelLite, body, sx * 0.88, 0.2, 0.14, 0.04);
  }

  // helm: dark face plate, glowing eye slit, nose guard, spiked crown, curved horns
  const head = new THREE.Group(); head.position.set(0, 1.5, 0.04); body.add(head);
  add(new THREE.CylinderGeometry(0.3, 0.33, 0.6, 8), steel, head, 0, 0, 0, 0.04);
  add(new THREE.SphereGeometry(0.31, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), steelLite, head, 0, 0.29, 0, 0.04);
  const face = add(new THREE.BoxGeometry(0.46, 0.42, 0.1), steelDark, head, 0, -0.04, 0.27);
  add(new THREE.BoxGeometry(0.05, 0.3, 0.06), gold, head, 0, -0.1, 0.33);
  const visor = new THREE.Group(); visor.position.set(0, 0.06, 0.33); head.add(visor);
  const eyeG = new THREE.BoxGeometry(0.13, 0.035, 0.02);
  add(eyeG, glow, visor, -0.1, 0, 0).rotation.z = -0.18; add(eyeG, glow, visor, 0.1, 0, 0).rotation.z = 0.18;
  const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff9a2a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  eyeGlow.scale.set(0.7, 0.3, 1); eyeGlow.position.set(0, 0.06, 0.38); head.add(eyeGlow);
  // crown of spikes
  const cs = new THREE.ConeGeometry(0.04, 0.22, 4);
  for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.32; const sp = add(cs, gold, head, Math.sin(a) * 0.3, 0.36 + (k === 3 ? 0.06 : 0), Math.cos(a) * 0.3 - 0.05); sp.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.35); if (k === 3) sp.scale.y = 1.5; }
  add(new THREE.TorusGeometry(0.31, 0.03, 4, 16), gold, head, 0, 0.27, 0).rotation.x = Math.PI / 2;
  // curved horns: three segments each
  const hseg = new THREE.ConeGeometry(0.075, 0.32, 6, 1, true); hseg.translate(0, 0.16, 0);
  for (const sx of [-1, 1]) {
    let p = new THREE.Group(); p.position.set(sx * 0.3, 0.14, -0.02); p.rotation.z = sx * -1.35; head.add(p);
    let r = 1;
    for (let k = 0; k < 3; k++) {
      const seg = add(new THREE.CylinderGeometry(0.075 * r * 0.7, 0.075 * r, 0.3, 6), horn, p, 0, 0.15, 0); seg.position.y = 0.15;
      const nx = new THREE.Group(); nx.position.y = 0.28; nx.rotation.z = sx * 0.55; nx.rotation.x = -0.15; p.add(nx); p = nx; r *= 0.7;
    }
    add(new THREE.ConeGeometry(0.035, 0.16, 6), lambert(0xd8ccb4), p, 0, 0.08, 0);
  }

  // rune staff in the right gauntlet
  const staff = new THREE.Group(); staff.position.set(0.95, -0.2, 0.32); staff.rotation.z = -0.08; body.add(staff);
  add(new THREE.CylinderGeometry(0.045, 0.055, 2.8, 6), leather, staff, 0, 1.0, 0);
  add(new THREE.TorusGeometry(0.15, 0.025, 4, 12), gold, staff, 0, 2.38, 0);
  add(new THREE.TorusGeometry(0.15, 0.025, 4, 12), gold, staff, 0, 2.38, 0).rotation.y = Math.PI / 2;
  const crystal = add(new THREE.OctahedronGeometry(0.16, 0), glow, staff, 0, 2.38, 0); crystal.scale.y = 1.7;
  const cGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff9a2a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  cGlow.scale.set(0.9, 0.9, 1); cGlow.position.set(0, 2.38, 0); staff.add(cGlow);
  return { root, body, head, visor, eyeGlow, crystal, cape };
}
