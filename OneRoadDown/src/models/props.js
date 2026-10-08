// Procedural environment props. Each builder returns merged geometry (vertex coloured
// where possible) so the world can draw many of them with a handful of draw calls.

import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { mats, signMaterial } from '../gfx/materials.js';
import { rng, Noise, lerp } from '../core/util.js';
import { roundedBox, beam } from './carModel.js';

const noise = new Noise(99);
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

function colorize(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(col, p.getX(i), p.getY(i), p.getZ(i), i);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function jitter(g, amt, seed, vertical = 0.3) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = noise.n2(x * 3.1 + seed, z * 3.1 + y * 1.7);
    const m = noise.n2(z * 2.3 - seed, x * 2.9 + y);
    p.setXYZ(i, x + n * amt, y + m * amt * vertical, z + noise.n2(y * 2.1 + seed, x) * amt);
  }
  g.computeVertexNormals();
  return g;
}
const strip = (g) => { // keep position/normal/uv/color only
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
};

// ---------------------------------------------------------------- trees
// variants: pine, spruce, birch, oak; `snowy` adds white on top surfaces, `autumn` warm leaves
export function treeGeometry(kind, variant = 0, opt = {}) {
  return memo(`tree_${kind}_${variant}_${opt.snowy ? 1 : 0}_${opt.autumn ? 1 : 0}_${opt.dry ? 1 : 0}`, () => {
    const r = rng(variant * 13 + kind.length * 101 + 1);
    const parts = [];
    const bark = new THREE.Color(0x4a3a2c), barkB = new THREE.Color(0xd8d4c8);
    if (kind === 'pine' || kind === 'spruce') {
      const H = kind === 'spruce' ? 13 + r() * 5 : 10 + r() * 5;
      const trunk = new THREE.CylinderGeometry(0.12, 0.32, H * 0.55, 6, 1); trunk.translate(0, H * 0.27, 0);
      colorize(trunk, (c) => c.copy(bark));
      parts.push(strip(ni(trunk)));
      const layers = kind === 'spruce' ? 8 : 6;
      const base = new THREE.Color(kind === 'spruce' ? 0x1f3322 : 0x2b4026);
      const tip = new THREE.Color(kind === 'spruce' ? 0x35523a : 0x4d6a38);
      if (opt.dry) { base.setHex(0x4a4a2a); tip.setHex(0x7a7240); }
      for (let l = 0; l < layers; l++) {
        const t = l / (layers - 1);
        const y0 = H * (kind === 'spruce' ? 0.16 : 0.3) + t * H * (kind === 'spruce' ? 0.72 : 0.6);
        const rad = (1 - t * 0.85) * (kind === 'spruce' ? 2.3 : 3.0) * (0.85 + r() * 0.3);
        const h = H * (kind === 'spruce' ? 0.22 : 0.26);
        const cone = new THREE.ConeGeometry(rad, h, 9, 2, true);
        cone.rotateY(r() * 6);
        cone.translate(0, y0 + h * 0.5, 0);
        // droop the rim
        const p = cone.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const d = Math.hypot(x, z) / rad;
          p.setY(i, y - d * d * 0.35 * h + noise.n2(x * 2 + l, z * 2) * 0.25);
          p.setX(i, x * (1 + noise.n2(z * 1.5 + l * 3, y) * 0.25)); p.setZ(i, z * (1 + noise.n2(x * 1.5 - l * 3, y) * 0.25));
        }
        cone.computeVertexNormals();
        colorize(cone, (c, x, y, z) => {
          const d = Math.hypot(x, z) / rad;
          c.copy(base).lerp(tip, d * 0.7 + t * 0.3);
          c.multiplyScalar(0.8 + noise.n2(x * 4, z * 4 + y) * 0.2);
          if (opt.snowy && d < 0.95 && noise.n2(x * 3, z * 3 + l) > -0.35) c.lerp(new THREE.Color(0xe8edf2), 0.75);
        });
        parts.push(strip(ni(cone)));
      }
    } else if (kind === 'birch' || kind === 'oak') {
      const oak = kind === 'oak';
      const H = oak ? 8 + r() * 4 : 11 + r() * 4;
      const trunk = new THREE.CylinderGeometry(oak ? 0.25 : 0.12, oak ? 0.5 : 0.2, H * 0.62, 7, 3); trunk.translate(0, H * 0.31, 0);
      jitter(trunk, 0.08, variant);
      colorize(trunk, (c, x, y) => { c.copy(oak ? bark : barkB); if (!oak && Math.sin(y * 7 + x * 30) > 0.7) c.setHex(0x2a2522); });
      parts.push(strip(ni(trunk)));
      const blobs = oak ? 5 : 4;
      const autumn = [0xa35a1c, 0xc28a2a, 0x8a3c1a, 0x6a7a2a];
      const leaf = new THREE.Color(opt.dry ? 0x7a7038 : opt.autumn ? autumn[variant % 4] : oak ? 0x3d5a24 : 0x5a7a30);
      for (let b = 0; b < blobs; b++) {
        const rad = (oak ? 2.6 : 1.8) * (0.7 + r() * 0.5);
        const s = new THREE.IcosahedronGeometry(rad, 1);
        jitter(s, rad * 0.25, b + variant * 7, 1);
        const a = r() * 6.28, rr = b === 0 ? 0 : (oak ? 1.8 : 1.1) * (0.6 + r() * 0.5);
        s.translate(Math.cos(a) * rr, H * (oak ? 0.68 : 0.62) + (b === 0 ? H * 0.12 : r() * H * 0.18), Math.sin(a) * rr);
        s.scale(1, oak ? 0.75 : 1.2, 1);
        colorize(s, (c, x, y, z) => { c.copy(leaf).multiplyScalar(0.75 + noise.n2(x * 2, z * 2 + y) * 0.25 + (y - H * 0.6) * 0.02); });
        parts.push(strip(ni(s)));
      }
    }
    const g = mergeGeometries(parts);
    g.computeBoundingSphere();
    return g;
  });
}

// Dead / dry tree for the canyon and broken forest sections
export function deadTreeGeometry(v = 0) {
  return memo('deadtree_' + v, () => {
    const r = rng(v + 500);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.1, 0.28, 7, 6); trunk.translate(0, 3.5, 0); parts.push(trunk);
    for (let k = 0; k < 5; k++) {
      const y = 3 + r() * 3.5, a = r() * 6.28, len = 1 + r() * 2;
      parts.push(beam([0, y, 0], [Math.cos(a) * len, y + len * 0.6, Math.sin(a) * len], 0.05, 4));
    }
    const g = mergeGeometries(parts.map((p) => strip(ni(p))));
    colorize(g, (c) => c.setHex(0x5a4c3e));
    return g;
  });
}

export function bushGeometry(v = 0, opt = {}) {
  return memo('bush_' + v + (opt.snowy ? 's' : '') + (opt.dry ? 'd' : ''), () => {
    const s = new THREE.IcosahedronGeometry(1, 1);
    jitter(s, 0.3, v * 3, 1);
    s.scale(1.3, 0.7, 1.2); s.translate(0, 0.4, 0);
    const col = new THREE.Color(opt.dry ? 0x7a6a3a : 0x3e5226);
    colorize(s, (c, x, y, z) => { c.copy(col).multiplyScalar(0.7 + noise.n2(x * 3, z * 3) * 0.3 + y * 0.2); if (opt.snowy && y > 0.6) c.lerp(new THREE.Color(0xe6ebef), 0.7); });
    return strip(ni(s));
  });
}

// ---------------------------------------------------------------- rocks
export function rockGeometry(v = 0, opt = {}) {
  return memo('rock_' + v + (opt.snowy ? 's' : '') + (opt.tint || ''), () => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    const sx = 1 + (v % 3) * 0.25, sy = 0.55 + ((v * 7) % 5) * 0.08, sz = 0.9 + ((v * 3) % 4) * 0.15;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = noise.fbm(x * 1.3 + v * 10, z * 1.3 + y * 1.1, 3) * 0.35 + noise.n2(x * 4 + v, y * 4 - z) * 0.08;
      // flat facets
      const k = 1 + n;
      x *= k * sx; y *= k * sy; z *= k * sz;
      if (y < -0.2) y = -0.2 + (y + 0.2) * 0.2;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    const base = new THREE.Color(opt.tint || 0x8a8780);
    colorize(g, (c, x, y, z) => {
      c.copy(base).multiplyScalar(0.72 + noise.n2(x * 2.5, z * 2.5 + y) * 0.2 + y * 0.1);
      if (y < 0) c.lerp(new THREE.Color(0x4a4636), 0.35);
      if (opt.snowy && y > 0.2) c.lerp(new THREE.Color(0xeef2f5), 0.8);
    });
    // world-ish uvs for the rock texture
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.5 + p.getZ(i) * 0.3; uv[i * 2 + 1] = p.getY(i) * 0.5; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return strip(ni(g));
  });
}

// ---------------------------------------------------------------- signs
export function buildSign(type, text, broken) {
  const g = new THREE.Group();
  const poleH = type === 'region' || type === 'village' ? 2.2 : type.startsWith('chev') ? 1.1 : 2.1;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, poleH, 6), mats.galv);
  pole.position.y = poleH / 2; pole.castShadow = true;
  g.add(pole);
  if (type === 'region' || type === 'village') {
    const p2 = pole.clone(); p2.position.x = 1.6; g.add(p2); pole.position.x = -1.6;
  }
  const size = type === 'region' || type === 'village' ? 3.6 : type.startsWith('chev') ? 0.9 : type === 'km' ? 0.7 : 1.0;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(size, size), signMaterial(type, text));
  face.position.set(0, poleH + (type.startsWith('chev') ? 0.2 : size * 0.38), 0.03);
  face.castShadow = true;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.92, size * (type === 'region' ? 0.5 : 0.88)), mats.signBack);
  back.rotation.y = Math.PI; back.position.copy(face.position); back.position.z = 0.02;
  g.add(face, back);
  if (broken) { g.rotation.z = 0.35 + Math.random() * 0.3; g.rotation.x = -0.1; }
  return g;
}

// ---------------------------------------------------------------- buildings
export function buildHouse(seed, kind = 'house') {
  const r = rng(seed);
  const g = new THREE.Group();
  const w = kind === 'barn' ? 9 : kind === 'chapel' ? 6.5 : 6.5 + r() * 2.5;
  const d = kind === 'barn' ? 12 : kind === 'chapel' ? 11 : 7 + r() * 3;
  const h = kind === 'barn' ? 5 : kind === 'chapel' ? 6 : 3 + r() * 2.5;
  const wallMat = kind === 'barn' ? mats.woodDark : r() < 0.5 ? mats.plaster : mats.wood;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  walls.position.y = h / 2 - 0.3; walls.castShadow = walls.receiveShadow = true;
  g.add(walls);
  // stone plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.9, d + 0.2), mats.concreteDark);
  plinth.position.y = 0.1; g.add(plinth);
  // gable roof
  const rh = kind === 'barn' ? 3.5 : 2.4 + r();
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.6, 0); shape.lineTo(0, rh); shape.lineTo(w / 2 + 0.6, 0); shape.lineTo(w / 2 + 0.45, -0.15); shape.lineTo(0, rh - 0.2); shape.lineTo(-w / 2 - 0.45, -0.15);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 1.2, bevelEnabled: false });
  roofGeo.translate(0, 0, -(d + 1.2) / 2);
  const roof = new THREE.Mesh(roofGeo, r() < 0.5 ? mats.roofTile : mats.roofSlate);
  roof.position.y = h - 0.3; roof.castShadow = true; g.add(roof);
  // gable infill
  const gs = new THREE.Shape(); gs.moveTo(-w / 2, 0); gs.lineTo(0, rh - 0.25); gs.lineTo(w / 2, 0);
  for (const zz of [d / 2, -d / 2]) {
    const gm = new THREE.Mesh(new THREE.ShapeGeometry(gs), wallMat === mats.plaster ? mats.wood : wallMat);
    gm.position.set(0, h - 0.3, zz); if (zz < 0) gm.rotation.y = Math.PI; g.add(gm);
  }
  // windows + door on the road-facing long side (+x local faces the road after yaw)
  const lit = r() < 0.3;
  const wins = [];
  const nW = Math.max(2, Math.floor(d / 2.6));
  for (let i = 0; i < nW; i++) {
    const z = -d / 2 + (i + 0.5) * (d / nW);
    for (const sx of [1, -1]) {
      if (kind === 'barn' && i % 2) continue;
      const win = new THREE.PlaneGeometry(0.9, 1.1); win.rotateY(sx * Math.PI / 2); win.translate(sx * (w / 2 + 0.01), h * 0.55, z); wins.push(win);
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(wins), lit ? mats.windowLit : mats.windowDark));
  const frames = [];
  for (const wg of wins) { const bb = new THREE.Box3().setFromBufferAttribute(wg.attributes.position); const c = bb.getCenter(new THREE.Vector3()); const s = bb.getSize(new THREE.Vector3()); const f = new THREE.BoxGeometry(Math.max(0.06, s.x + 0.1), s.y + 0.16, Math.max(0.06, s.z + 0.16)); f.translate(c.x, c.y, c.z); frames.push(f); }
  g.add(new THREE.Mesh(mergeGeometries(frames), mats.woodDark));
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, kind === 'barn' ? 3.2 : 1.0), mats.woodDark);
  door.position.set(w / 2 + 0.02, 0.85, kind === 'barn' ? 0 : d * 0.15); g.add(door);
  if (kind === 'house' && r() < 0.7) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), mats.concreteDark);
    ch.position.set(w * 0.2, h + rh * 0.6, -d * 0.25); ch.castShadow = true; g.add(ch);
  }
  if (kind === 'chapel') {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9, 2.4), mats.plaster);
    tower.position.set(0, 4.2, -d / 2 - 1.2); tower.castShadow = true; g.add(tower);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.5, 4), mats.roofSlate);
    spire.rotation.y = Math.PI / 4; spire.position.set(0, 10.9, -d / 2 - 1.2); spire.castShadow = true; g.add(spire);
  }
  // firewood stack
  if (r() < 0.5) {
    const logs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 2.4), mats.woodDark);
    logs.position.set(-w / 2 - 0.4, 0.3, d * 0.2); g.add(logs);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildShack(seed) {
  const r = rng(seed);
  const g = new THREE.Group();
  const w = 4 + r() * 2, d = 5 + r() * 2, h = 2.6;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.woodDark); walls.position.y = h / 2 - 0.2; g.add(walls);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.08, d + 0.8), mats.rusty);
  roof.position.y = h; roof.rotation.z = 0.12; roof.rotation.x = r() * 0.15; g.add(roof);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), mats.windowDark); hole.rotation.y = Math.PI / 2; hole.position.set(w / 2 + 0.01, 1.4, 0); g.add(hole);
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6 + r(), 0.15), mats.rusty); b.position.set(-w / 2 - 1 - r() * 2, 0.3, (r() - 0.5) * d); b.rotation.z = r() - 0.5; g.add(b); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildGasStation(seed) {
  const r = rng(seed);
  const g = new THREE.Group();
  const shop = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 7), mats.plaster); shop.position.set(-4, 1.4, 0); g.add(shop);
  const sroof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.25, 7.6), mats.concreteDark); sroof.position.set(-4, 3.1, 0); g.add(sroof);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.5), mats.windowDark); win.rotation.y = Math.PI / 2; win.position.set(-1.49, 1.5, 0); g.add(win);
  // canopy on posts, one corner collapsed
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 8), mats.rusty);
  canopy.position.set(2.5, 4.1, 0); canopy.rotation.z = -0.12; canopy.rotation.x = 0.05; g.add(canopy);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.05, 0.15, 8.05), mats.orange); stripe.position.copy(canopy.position); stripe.position.y -= 0.12; stripe.rotation.copy(canopy.rotation); g.add(stripe);
  for (const [x, z, hh] of [[0.2, 3.5, 4.2], [0.2, -3.5, 4.2], [4.8, 3.5, 3.4]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, hh, 0.3), mats.galv); p.position.set(x, hh / 2, z); g.add(p);
  }
  for (const z of [-1.5, 1.5]) {
    const pump = new THREE.Mesh(roundedBox(0.6, 1.5, 0.9, 0.06), mats.orange); pump.position.set(2.5, 0.75, z); g.add(pump);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), mats.windowDark); screen.rotation.y = Math.PI / 2; screen.position.set(2.81, 1.15, z); g.add(screen);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 2.4), mats.orange); sign.position.set(6, 4.5, 4); sign.rotation.z = 0.2; g.add(sign);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), mats.galv); pole.position.set(6, 2, 4); g.add(pole);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- road furniture
export function poleGeometry() {
  return memo('pole', () => {
    const p = new THREE.CylinderGeometry(0.11, 0.15, 8, 7); p.translate(0, 4, 0);
    const bar = new THREE.BoxGeometry(1.8, 0.12, 0.12); bar.translate(0, 7.4, 0);
    const ins = [];
    for (const x of [-0.75, 0, 0.75]) { const i = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6); i.translate(x, 7.54, 0); ins.push(i); }
    const g = mergeGeometries([p, bar, ...ins].map((q) => strip(ni(q))));
    colorize(g, (c, x, y) => c.setHex(y > 7.47 && Math.abs(x) > 0.02 && y < 7.65 ? 0xcfd2cc : 0x5a4636));
    return g;
  });
}
export function snowPoleGeometry() {
  return memo('snowpole', () => {
    const p = new THREE.CylinderGeometry(0.035, 0.035, 2.2, 5); p.translate(0, 1.1, 0);
    const g = strip(ni(p));
    colorize(g, (c, x, y) => c.setHex(Math.floor(y / 0.25) % 2 && y > 1.2 ? 0x1a1a1a : y > 1.2 ? 0xd2621e : 0xd2621e));
    return g;
  });
}
export function fencePostGeometry() {
  return memo('fencepost', () => {
    const p = new THREE.BoxGeometry(0.12, 1.2, 0.12); p.translate(0, 0.6, 0);
    const g = strip(ni(p));
    colorize(g, (c) => c.setHex(0x6a5440));
    return g;
  });
}
export function logsGeometry() {
  return memo('logs', () => {
    const parts = [];
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
      const c = new THREE.CylinderGeometry(0.25, 0.25, 5, 8); c.rotateX(Math.PI / 2); c.translate((k - (3 - row) / 2) * 0.5, 0.25 + row * 0.43, 0); parts.push(c);
    }
    const g = mergeGeometries(parts.map((q) => strip(ni(q))));
    colorize(g, (c, x, y, z) => c.setHex(Math.abs(z) > 2.45 ? 0xb89a70 : 0x5a4636));
    return g;
  });
}

export function barrierGeometry() {
  return memo('barrier', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.08); s.lineTo(0.12, 0.3); s.lineTo(0.08, 0.82); s.lineTo(-0.08, 0.82); s.lineTo(-0.12, 0.3); s.lineTo(-0.3, 0.08);
    const g = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false }); g.translate(0, 0, -1);
    return g;
  });
}
export function barrelGeometry() {
  return memo('barrel', () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.3 + Math.sin(t * Math.PI) * 0.04, t * 0.95)); }
    const g = new THREE.LatheGeometry(pts, 14);
    colorize(g, (c, x, y) => c.setHex(Math.floor(y / 0.19) % 2 ? 0xe2ddd0 : 0xd2501e));
    return g;
  });
}

// ---------------------------------------------------------------- pickups
export function buildPickup(type) {
  const g = new THREE.Group();
  if (type === 'fuel') {
    const body = new THREE.Mesh(roundedBox(0.38, 0.5, 0.18, 0.03), mats.fuelCan);
    body.position.y = 0.3;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 5, 10, Math.PI), mats.fuelCan); handle.position.set(-0.08, 0.57, 0);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.14, 8), mats.darkSteel); spout.position.set(0.13, 0.6, 0); spout.rotation.z = -0.5;
    g.add(body, handle, spout);
  } else if (type === 'cash') {
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.16), mats.cash); b.position.set((k - 1) * 0.05, 0.2 + k * 0.065, (k % 2) * 0.03); b.rotation.y = k * 0.3;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.065, 0.165), mats.redWhite); band.position.copy(b.position); band.rotation.copy(b.rotation);
      g.add(b, band);
    }
  } else if (type === 'repair' || type === 'repairL') {
    const big = type === 'repairL';
    const box = new THREE.Mesh(roundedBox(big ? 0.8 : 0.5, big ? 0.42 : 0.26, big ? 0.45 : 0.24, 0.03), mats.repair); box.position.y = big ? 0.25 : 0.16;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.4 : 0.26, 0.04, 0.04), mats.darkSteel); handle.position.y = big ? 0.5 : 0.32;
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), mats.chrome); latch.position.set(0, box.position.y + 0.04, (big ? 0.23 : 0.125));
    g.add(box, handle, latch);
    if (big) {
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.005), mats.redWhite); cross1.position.set(0.15, 0.3, 0.232);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.005), mats.redWhite); cross2.position.set(0.15, 0.3, 0.232);
      g.add(cross1, cross2);
    }
  } else if (type === 'rare') {
    const box = new THREE.Mesh(roundedBox(0.7, 0.4, 0.45, 0.04), mats.rare); box.position.y = 0.22;
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.47), mats.rareTrim); t1.position.y = 0.3;
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.47), mats.rareTrim); t2.position.set(0.2, 0.22, 0);
    g.add(box, t1, t2);
  } else if (type === 'crate') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.6, 0.75), mats.crate); box.position.y = 0.3;
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.08, 0.77), mats.woodDark); st.position.y = 0.45;
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), mats.cash); lbl.position.set(0, 0.3, 0.378);
    g.add(box, st, lbl);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Collectible marker: a soft vertical light pillar so pickups read at distance.
export function pickupBeacon(color) {
  const geo = new THREE.CylinderGeometry(0.18, 0.5, 4, 10, 1, true);
  geo.translate(0, 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }));
  return m;
}

export function fallenTreeGeometry(len, r) {
  const parts = [];
  const t = new THREE.CylinderGeometry(r * 0.7, r, len, 8); t.rotateZ(Math.PI / 2); t.translate(len / 2, r, 0);
  parts.push(strip(ni(t)));
  const rr = rng(Math.round(len * 100));
  for (let k = 0; k < 6; k++) {
    const x = len * (0.35 + rr() * 0.6), a = rr() * 6.28;
    parts.push(strip(ni(beam([x, r, 0], [x + 0.6, r + Math.sin(a) * 1.2 + 0.4, Math.cos(a) * 1.4], 0.05, 4))));
  }
  const root = new THREE.IcosahedronGeometry(r * 2.2, 0); root.scale(0.4, 1, 1); root.translate(-0.1, r * 1.2, 0); parts.push(strip(ni(root)));
  const g = mergeGeometries(parts);
  colorize(g, (c, x) => c.setHex(x < 0.2 ? 0x3a2e22 : 0x4e3e2e));
  return g;
}

export const beamGeo = (a, b, r) => strip(ni(beam(a, b, r, 5)));
