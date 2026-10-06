// Weapons: bought in the shop with coins, gated by player level. Every weapon has its own model.
import * as THREE from '../lib/three.module.min.js';

export const WEAPONS = [
  { id: 'stick', name: 'Training Stick', level: 1, cost: 0, dmg: 6, rate: 2.5, range: 2.05, kb: 0.8,
    desc: 'A practice stick wrapped in tape. It barely stings.' },
  { id: 'club', name: 'Spiked Club', level: 4, cost: 150, dmg: 9, rate: 2.2, range: 2.15, kb: 1.5,
    desc: 'Slow and heavy. Sends small things flying.' },
  { id: 'rusty', name: 'Rusty Sword', level: 9, cost: 400, dmg: 11, rate: 2.7, range: 2.35, kb: 1,
    desc: 'Notched and orange with rust, but it still cuts.' },
  { id: 'broken', name: 'Broken Steel Sword', level: 20, cost: 1200, dmg: 15, rate: 2.9, range: 2.25, kb: 1,
    desc: 'Snapped halfway down. What is left is real steel.' },
  { id: 'steel', name: 'Steel Longsword', level: 30, cost: 2600, dmg: 19, rate: 2.8, range: 2.65, kb: 1.1,
    desc: 'A proper blade with reach. Climbers kill for these.' },
  { id: 'ember', name: 'Ember Blade', level: 40, cost: 4800, dmg: 23, rate: 3.0, range: 2.6, kb: 1, burn: true, trail: 0xff7a2a,
    desc: 'Forged in the Foundry. Every hit sets enemies alight.' },
  { id: 'crown', name: 'Crown Edge', level: 50, cost: 8500, dmg: 28, rate: 3.1, range: 2.8, kb: 1.2, crit: 0.1, trail: 0xffd36b,
    desc: 'Taken from a Warden. +10% critical chance.' },
  // Chest exclusives: never sold, only found in chests.
  { id: 'cleaver', name: 'Bone Cleaver', chest: true, rarity: 'rare', level: 1, cost: 0, dmg: 13, rate: 2.5, range: 2.4, kb: 1.8, trail: 0xe8dcc4,
    desc: 'Chest exclusive. A butcher blade carved from a giant\'s jaw. Sends enemies flying.' },
  { id: 'frostfang', name: 'Frostfang', chest: true, rarity: 'superrare', level: 1, cost: 0, dmg: 17, rate: 2.9, range: 2.55, kb: 1, frost: 1, trail: 0x9feaff,
    desc: 'Chest exclusive. Ice that never melts. Every hit slows the target.' },
  { id: 'reaper', name: 'Soul Reaper', chest: true, rarity: 'epic', level: 1, cost: 0, dmg: 20, rate: 2.6, range: 3.0, kb: 1.1, ls: 1, trail: 0x7affc8,
    desc: 'Chest exclusive. A scythe with enormous reach. Every kill heals 1 HP.' },
  { id: 'dragonfang', name: 'Dragonfang', chest: true, rarity: 'legendary', level: 1, cost: 0, dmg: 26, rate: 3.1, range: 2.8, kb: 1.2, burn: true, crit: 0.08, trail: 0xc05aff,
    desc: 'Chest exclusive. A dragon tooth in black gold. Burns everything it touches. +8% crit.' },
  { id: 'starfall', name: 'Starfall', chest: true, rarity: 'legendary', level: 1, cost: 0, dmg: 30, rate: 3.2, range: 2.9, kb: 1.1, crit: 0.12, chain: 0.25, trail: 0x9fd4ff,
    desc: 'Chest exclusive. Forged from a fallen star. Hits arc lightning. +12% crit.' },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

const L = (c, e = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...e });
const B = c => new THREE.MeshBasicMaterial({ color: c });

// Returns a group pointing along +z from the hand.
export function buildWeapon(id) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const grip = L(0x3b2a1e), guard = L(0x6b6f78), steel = L(0xc9ced6), dark = L(0x2b2d33);
  switch (id) {
    case 'stick': {
      const c = new THREE.CylinderGeometry(0.035, 0.045, 0.85, 6); c.rotateX(Math.PI / 2);
      add(c, L(0x9a7448), 0, 0, 0.42);
      add(box(0.1, 0.1, 0.12), L(0xd9d2c4), 0, 0, 0.12);
      add(box(0.1, 0.1, 0.06), L(0xd9d2c4), 0, 0, 0.62);
      break;
    }
    case 'club': {
      const c = new THREE.CylinderGeometry(0.11, 0.05, 0.8, 7); c.rotateX(Math.PI / 2);
      add(c, L(0x7a5532), 0, 0, 0.42);
      const sp = new THREE.ConeGeometry(0.04, 0.14, 4);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; add(sp, L(0x9aa0a8), Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.62 + (k % 2) * 0.12, 0, 0, a - Math.PI / 2).rotation.x = 0; }
      break;
    }
    case 'rusty': {
      add(box(0.06, 0.06, 0.2), grip, 0, 0, 0.02);
      add(box(0.28, 0.06, 0.06), L(0x5a3a22), 0, 0, 0.14);
      add(box(0.1, 0.03, 0.7), L(0xa0623a), 0, 0, 0.52);
      add(box(0.04, 0.035, 0.08), dark, 0.04, 0, 0.42); add(box(0.04, 0.035, 0.06), dark, -0.045, 0, 0.66);
      add(new THREE.ConeGeometry(0.05, 0.14, 4).rotateX(Math.PI / 2), L(0xa0623a), 0, 0, 0.93);
      break;
    }
    case 'broken': {
      add(box(0.06, 0.06, 0.2), grip, 0, 0, 0.02);
      add(box(0.32, 0.07, 0.07), guard, 0, 0, 0.14);
      add(box(0.11, 0.03, 0.42), steel, 0, 0, 0.38);
      const tip = new THREE.TetrahedronGeometry(0.08, 0); add(tip, steel, 0.02, 0, 0.6, 0.4, 0.3, 0.8);
      break;
    }
    case 'steel': {
      add(box(0.06, 0.06, 0.24), grip, 0, 0, 0.02);
      add(new THREE.OctahedronGeometry(0.05, 0), guard, 0, 0, -0.12);
      add(box(0.36, 0.07, 0.07), guard, 0, 0, 0.16);
      add(box(0.1, 0.03, 0.9), steel, 0, 0, 0.64);
      add(box(0.02, 0.035, 0.8), L(0x8e949c), 0, 0, 0.6);
      add(new THREE.ConeGeometry(0.05, 0.16, 4).rotateX(Math.PI / 2), steel, 0, 0, 1.17);
      break;
    }
    case 'ember': {
      add(box(0.06, 0.06, 0.24), L(0x1c1412), 0, 0, 0.02);
      add(box(0.36, 0.08, 0.08), L(0x3a2218), 0, 0, 0.16);
      add(box(0.11, 0.035, 0.88), L(0x2a1e1a), 0, 0, 0.62);
      add(box(0.13, 0.02, 0.84), B(0xff7a2a), 0, 0, 0.62);
      add(new THREE.ConeGeometry(0.06, 0.18, 4).rotateX(Math.PI / 2), B(0xffb05a), 0, 0, 1.15);
      break;
    }
    case 'crown': {
      const gold = L(0xd9a83a, { emissive: 0x4a3000, emissiveIntensity: 0.6 });
      add(box(0.06, 0.06, 0.24), L(0x3a1e2a), 0, 0, 0.02);
      add(new THREE.OctahedronGeometry(0.06, 0), B(0x7fe0ff), 0, 0, -0.13);
      const gd = add(box(0.44, 0.08, 0.08), gold, 0, 0, 0.16);
      add(new THREE.ConeGeometry(0.05, 0.14, 4), gold, 0.24, 0, 0.16, 0, 0, -Math.PI / 2);
      add(new THREE.ConeGeometry(0.05, 0.14, 4), gold, -0.24, 0, 0.16, 0, 0, Math.PI / 2);
      add(box(0.12, 0.035, 0.98), L(0xfff0c8, { emissive: 0x6b5520, emissiveIntensity: 0.4 }), 0, 0, 0.68);
      add(new THREE.OctahedronGeometry(0.045, 0), B(0x7fe0ff), 0, 0.03, 0.22);
      add(new THREE.ConeGeometry(0.06, 0.2, 4).rotateX(Math.PI / 2), gold, 0, 0, 1.27);
      gd.userData.k = 1;
      break;
    }
    case 'cleaver': {
      const bone = L(0xe8dcc4), boneD = L(0xb8a888);
      add(box(0.07, 0.07, 0.26), L(0x4a2a1e), 0, 0, 0.02);
      add(new THREE.SphereGeometry(0.06, 6, 4), boneD, 0, 0, -0.14);
      add(box(0.2, 0.08, 0.08), boneD, 0, 0, 0.17);
      add(box(0.3, 0.035, 0.66), bone, 0.06, 0, 0.55);
      for (let k = 0; k < 4; k++) add(new THREE.ConeGeometry(0.03, 0.08, 4), boneD, -0.1, 0, 0.32 + k * 0.14, 0, 0, Math.PI / 2);
      add(box(0.06, 0.04, 0.2), L(0x8a2a22), 0.14, 0, 0.7);
      break;
    }
    case 'frostfang': {
      const ice = L(0xcff4ff, { emissive: 0x3a8aaa, emissiveIntensity: 0.6 });
      add(box(0.06, 0.06, 0.24), L(0x2a3a4a), 0, 0, 0.02);
      add(new THREE.OctahedronGeometry(0.07, 0), ice, -0.17, 0, 0.16, 0, 0, 0.5);
      add(new THREE.OctahedronGeometry(0.07, 0), ice, 0.17, 0, 0.16, 0, 0, -0.5);
      add(box(0.16, 0.08, 0.08), L(0x5fb4e8), 0, 0, 0.16);
      const bl = new THREE.OctahedronGeometry(0.1, 0); bl.scale(0.9, 0.35, 5.2);
      add(bl, ice, 0, 0, 0.7);
      add(box(0.02, 0.02, 0.8), B(0xe8fbff), 0, 0.02, 0.66);
      break;
    }
    case 'reaper': {
      add(new THREE.CylinderGeometry(0.03, 0.035, 1.25, 6).rotateX(Math.PI / 2), L(0x2a2230), 0, 0, 0.5);
      add(box(0.08, 0.08, 0.08), L(0x7affc8, { emissive: 0x1a8a5a, emissiveIntensity: 0.8 }), 0, 0, 1.12);
      const blade = new THREE.TorusGeometry(0.42, 0.04, 4, 16, Math.PI * 0.7);
      const bm = add(blade, L(0xb8c8c0, { emissive: 0x1a4a3a, emissiveIntensity: 0.5 }), 0.42, 0, 1.12, Math.PI / 2, 0, Math.PI * 0.95);
      bm.scale.set(1, 1, 2.2);
      add(new THREE.TorusGeometry(0.42, 0.012, 3, 16, Math.PI * 0.7), B(0x7affc8), 0.42, 0.02, 1.12, Math.PI / 2, 0, Math.PI * 0.95);
      break;
    }
    case 'dragonfang': {
      const blackgold = L(0x2a1e2a), gold = L(0xd9a83a, { emissive: 0x4a3000, emissiveIntensity: 0.6 });
      add(box(0.06, 0.06, 0.26), L(0x1a1218), 0, 0, 0.02);
      add(new THREE.OctahedronGeometry(0.06, 0), B(0xc05aff), 0, 0, -0.14);
      for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.05, 0.3, 4), gold, sx * 0.17, 0, 0.12, 0.5, 0, -sx * 1.9);
      add(box(0.2, 0.09, 0.09), gold, 0, 0, 0.16);
      const fang = new THREE.ConeGeometry(0.1, 1.05, 5); fang.rotateX(Math.PI / 2); fang.scale(1, 0.35, 1);
      add(fang, blackgold, 0, 0, 0.72);
      const edge = new THREE.ConeGeometry(0.11, 1.0, 5); edge.rotateX(Math.PI / 2); edge.scale(1, 0.12, 1);
      add(edge, B(0xc05aff), 0, 0, 0.72);
      break;
    }
    case 'starfall': {
      const star = L(0xe8f4ff, { emissive: 0x4a7aaa, emissiveIntensity: 0.7 });
      add(box(0.06, 0.06, 0.24), L(0x1e2534), 0, 0, 0.02);
      add(new THREE.OctahedronGeometry(0.08, 0), B(0xfff4c0), 0, 0, -0.14);
      add(box(0.42, 0.06, 0.06), L(0x3a4a68), 0, 0, 0.16);
      for (const sx of [-1, 1]) add(new THREE.OctahedronGeometry(0.06, 0), B(0x9fd4ff), sx * 0.24, 0, 0.16);
      add(box(0.12, 0.035, 1.0), star, 0, 0, 0.7);
      add(box(0.03, 0.045, 0.94), B(0x9fd4ff), 0, 0, 0.68);
      add(new THREE.ConeGeometry(0.065, 0.22, 4).rotateX(Math.PI / 2), star, 0, 0, 1.31);
      const st = add(new THREE.OctahedronGeometry(0.07, 0), B(0xfff4c0), 0, 0, 0.26); st.scale.set(1, 1, 0.4);
      break;
    }
  }
  return g;
}
