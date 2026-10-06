// Procedural low-poly models. Every character is built from a handful of flat-shaded primitives,
// with an inverted-hull outline on the main shapes so everything reads as one consistent style.
import * as THREE from '../lib/three.module.min.js';

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
export function buildPlayer(skin) {
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

  // Weapon on a pivot so swings rotate around the body.
  const pivot = new THREE.Group(); pivot.position.set(0, 0.5, 0); rig.add(pivot);
  const hand = part(geo('pHand', () => new THREE.BoxGeometry(0.12, 0.12, 0.12)), mHead, pivot, 0.36, 0, 0.12);
  const bladeMat = new THREE.MeshBasicMaterial({ color: c.blade });
  const blade = part(geo('pBlade', () => { const g = new THREE.BoxGeometry(0.07, 0.035, 0.78); g.translate(0, 0, 0.42); return g; }), bladeMat, hand, 0, 0, 0, 0);
  part(geo('pGuard', () => new THREE.BoxGeometry(0.22, 0.05, 0.05)), mTrim, hand, 0, 0, 0.06);

  // Accessories per skin.
  const acc = new THREE.Group(); rig.add(acc);
  const a = skin.acc;
  if (a === 'scarf') {
    part(geo('sc1', () => new THREE.CylinderGeometry(0.25, 0.29, 0.1, 7)), mTrim, acc, 0, 0.68, 0);
    const tail = part(geo('sc2', () => { const g = new THREE.BoxGeometry(0.12, 0.05, 0.4); g.translate(0, 0, -0.2); return g; }), mTrim, acc, 0.08, 0.68, -0.2);
    tail.rotation.x = 0.5; root.userData.tail = tail;
  } else if (a === 'band') {
    part(geo('bd1', () => new THREE.CylinderGeometry(0.255, 0.255, 0.07, 9)), mTrim, head, 0, 0.1, 0);
    const tail = part(geo('bd2', () => { const g = new THREE.BoxGeometry(0.05, 0.05, 0.36); g.translate(0, 0, -0.18); return g; }), mTrim, head, 0.06, 0.1, -0.22);
    tail.rotation.x = 0.4; root.userData.tail = tail;
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
  }

  return { root, rig, body, head, footL, footR, pivot, hand, blade, bladeMat, mats, mEyes };
}

// ---------------- ENEMIES ----------------
export const ENEMY_COLORS = {
  runner: 0xe8584a, shooter: 0x9b6cff, tank: 0x8c4a3a, dasher: 0x2fb8c8, splitter: 0x8fcf4a,
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
    m.body = body; m.radius = 0.36; m.height = 0.7;
  } else if (type === 'shooter') {
    const body = part(geo('sB', () => new THREE.OctahedronGeometry(0.38, 0)), mMain, rig, 0, 0.95, 0, 0.09);
    body.scale.y = 1.25;
    m.core = part(geo('sC', () => new THREE.IcosahedronGeometry(0.13, 0)), new THREE.MeshBasicMaterial({ color: 0xffd0ff }), rig, 0, 0.95, 0.3);
    const ring = part(geo('sR', () => new THREE.TorusGeometry(0.55, 0.035, 4, 12)), mDark, rig, 0, 0.95, 0);
    ring.rotation.x = Math.PI / 2;
    m.ring = ring; m.body = body; m.radius = 0.42; m.height = 1.4; m.float = true;
  } else if (type === 'tank') {
    const body = part(geo('tB', () => new THREE.BoxGeometry(1.05, 0.8, 0.95)), mMain, rig, 0, 0.5, 0, 0.06);
    part(geo('tP', () => new THREE.BoxGeometry(0.85, 0.16, 0.75)), mDark, body, 0, 0.47, 0);
    part(geo('tE', () => new THREE.BoxGeometry(0.5, 0.07, 0.05)), mEye, body, 0, 0.12, 0.49);
    const armG = geo('tA', () => new THREE.BoxGeometry(0.28, 0.5, 0.38));
    m.armL = part(armG, mDark, rig, -0.68, 0.42, 0.1, 0.08); m.armR = part(armG, mDark, rig, 0.68, 0.42, 0.1, 0.08);
    m.body = body; m.radius = 0.7; m.height = 1.1;
  } else if (type === 'dasher') {
    const body = part(geo('dB', () => { const g = new THREE.OctahedronGeometry(0.4, 0); g.scale(0.65, 0.6, 1.4); return g; }), mMain, rig, 0, 0.5, 0, 0.09);
    const finG = geo('dF', () => { const g = new THREE.ConeGeometry(0.12, 0.45, 3); g.rotateZ(Math.PI / 2); return g; });
    part(finG, mDark, rig, -0.32, 0.55, -0.1).rotation.y = 0.5;
    part(finG, mDark, rig, 0.32, 0.55, -0.1).rotation.set(0, -0.5, Math.PI);
    part(geo('dE', () => new THREE.BoxGeometry(0.2, 0.06, 0.05)), mEye, body, 0, 0.08, 0.42);
    m.body = body; m.radius = 0.4; m.height = 0.9;
  } else if (type === 'splitter') {
    const body = part(geo('spB', () => new THREE.IcosahedronGeometry(0.46, 0)), mMain, rig, 0, 0.46, 0, 0.08);
    const eG = geo('spE', () => new THREE.BoxGeometry(0.08, 0.12, 0.05));
    part(eG, mEye, body, -0.12, 0.08, 0.4); part(eG, mEye, body, 0.12, 0.08, 0.4);
    m.body = body; m.radius = 0.46; m.height = 0.95;
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
