// Collectibles: hair dyes and tool skins. Some come with the Colour Bar, the rest only
// from crates. Rarity drives the odds, the glow on the card and what a duplicate pays back.
import * as THREE from 'three';

export const RARITY = {
  common: { label: 'Common', color: '#9aa3ad', weight: 60, refund: 10 },
  rare: { label: 'Rare', color: '#4c8fe0', weight: 26, refund: 30 },
  epic: { label: 'Epic', color: '#9b5de5', weight: 11, refund: 70 },
  legendary: { label: 'Legendary', color: '#f2b33c', weight: 3, refund: 180 },
};

// dyes: colour, how much extra a customer pays for it, and whether the Colour Bar has it
export const DYES = {
  jetBlack: { name: 'Jet Black', color: '#141010', rarity: 'common', bonus: 12, base: true },
  honey: { name: 'Honey Blonde', color: '#c99a52', rarity: 'common', bonus: 12, base: true },
  copper: { name: 'Copper Red', color: '#a8462a', rarity: 'common', bonus: 14, base: true },
  platinum: { name: 'Platinum', color: '#e8e2d4', rarity: 'rare', bonus: 22 },
  iceBlue: { name: 'Ice Blue', color: '#7cc4f0', rarity: 'rare', bonus: 24 },
  rose: { name: 'Rose Pink', color: '#e58aa8', rarity: 'rare', bonus: 24 },
  toxic: { name: 'Toxic Green', color: '#62d64a', rarity: 'epic', bonus: 34 },
  purple: { name: 'Purple Haze', color: '#7d4fd6', rarity: 'epic', bonus: 34 },
  silverFox: { name: 'Silver Fox', color: '#a9adb3', rarity: 'epic', bonus: 30 },
  goldRush: { name: 'Gold Rush', color: '#e3b23c', rarity: 'legendary', bonus: 60, sheen: true },
  midnight: { name: 'Midnight Galaxy', color: '#25307a', rarity: 'legendary', bonus: 60, sheen: true },
};

// skins per tool: a material description (colour, metal, pattern drawn on a canvas)
export const SKINS = {
  clipper: {
    carbon: { name: 'Carbon Fibre', rarity: 'rare', base: '#1b1d20', pattern: 'carbon', metal: 0.3, rough: 0.35 },
    tiger: { name: 'Tiger Stripe', rarity: 'rare', base: '#e08a2a', pattern: 'tiger', metal: 0, rough: 0.4 },
    neon: { name: 'Neon Pink', rarity: 'epic', base: '#ff3d9a', pattern: 'none', metal: 0, rough: 0.25, glow: 0.35 },
    camo: { name: 'Urban Camo', rarity: 'common', base: '#6b6f66', pattern: 'camo', metal: 0, rough: 0.6 },
    gold: { name: '24k Gold', rarity: 'legendary', base: '#e3b23c', pattern: 'none', metal: 1, rough: 0.18 },
    galaxy: { name: 'Galaxy', rarity: 'legendary', base: '#1a1440', pattern: 'galaxy', metal: 0.2, rough: 0.3, glow: 0.25 },
  },
  scissors: {
    rose: { name: 'Rose Gold', rarity: 'rare', base: '#d99a86', pattern: 'none', metal: 1, rough: 0.2 },
    obsidian: { name: 'Obsidian', rarity: 'epic', base: '#141414', pattern: 'none', metal: 0.8, rough: 0.12 },
    mint: { name: 'Mint Grip', rarity: 'common', base: '#7fd1b9', pattern: 'none', metal: 0, rough: 0.45 },
    damascus: { name: 'Damascus', rarity: 'legendary', base: '#8a8f96', pattern: 'damascus', metal: 1, rough: 0.25 },
  },
  spray: {
    graffiti: { name: 'Graffiti', rarity: 'rare', base: '#f2f2f2', pattern: 'graffiti', metal: 0, rough: 0.5 },
    chrome: { name: 'Chrome', rarity: 'epic', base: '#d8d8d8', pattern: 'none', metal: 1, rough: 0.08 },
    pole: { name: 'Barber Pole', rarity: 'common', base: '#ffffff', pattern: 'pole', metal: 0, rough: 0.4 },
    lava: { name: 'Lava Lamp', rarity: 'legendary', base: '#ff5a1f', pattern: 'lava', metal: 0, rough: 0.3, glow: 0.4 },
  },
};

export const TOOL_LABEL = { clipper: 'Clipper', scissors: 'Scissors', spray: 'Spray bottle' };

export const CRATES = {
  basic: { name: 'Street Crate', price: 120, color: '#8a5e2c', odds: { common: 66, rare: 27, epic: 6, legendary: 1 } },
  premium: { name: 'Gold Crate', price: 340, color: '#c9922e', odds: { common: 30, rare: 45, epic: 20, legendary: 5 } },
  legend: { name: 'Legend Crate', price: 880, color: '#4b2a7a', odds: { common: 0, rare: 35, epic: 45, legendary: 20 } },
};

// every collectible as a flat list: { key, kind, tool?, id, name, rarity, color }
export function allItems() {
  const out = [];
  for (const [id, d] of Object.entries(DYES)) if (!d.base) out.push({ key: 'dye:' + id, kind: 'dye', id, name: d.name, rarity: d.rarity, color: d.color });
  for (const [tool, list] of Object.entries(SKINS)) for (const [id, s] of Object.entries(list)) out.push({ key: `skin:${tool}:${id}`, kind: 'skin', tool, id, name: s.name, rarity: s.rarity, color: s.base });
  return out;
}

export function rollItem(crateId, rnd = Math.random) {
  const odds = CRATES[crateId].odds;
  const tot = Object.values(odds).reduce((a, b) => a + b, 0);
  let r = rnd() * tot, rarity = 'common';
  for (const [k, v] of Object.entries(odds)) { r -= v; if (r <= 0) { rarity = k; break; } }
  const pool = allItems().filter((i) => i.rarity === rarity);
  return pool[Math.floor(rnd() * pool.length)];
}

// save.inv helpers
export function inventory(save) {
  save.inv ||= {};
  const inv = save.inv;
  inv.dyes ||= [];
  inv.skins ||= {};
  inv.equip ||= {};
  inv.pending ||= [];
  return inv;
}

export function ownsItem(save, item) {
  const inv = inventory(save);
  return item.kind === 'dye' ? inv.dyes.includes(item.id) : (inv.skins[item.tool] || []).includes(item.id);
}

export function grantItem(save, item) {
  const inv = inventory(save);
  if (ownsItem(save, item)) return false;
  if (item.kind === 'dye') inv.dyes.push(item.id);
  else { (inv.skins[item.tool] ||= []).push(item.id); inv.equip[item.tool] = item.id; }
  return true;
}

// dyes the customers can ask for right now
export function availableDyes(save, owned) {
  const inv = inventory(save);
  if (!owned.includes('dyeStation')) return [];
  return [...Object.keys(DYES).filter((k) => DYES[k].base), ...inv.dyes];
}

// skin materials, drawn once
const matCache = new Map();
function patternTexture(kind, base) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  if (kind === 'carbon') {
    for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { g.fillStyle = (x + y) % 16 ? '#2a2d31' : '#121315'; g.fillRect(x, y, 8, 4); g.fillStyle = (x + y) % 16 ? '#121315' : '#2a2d31'; g.fillRect(x, y + 4, 8, 4); }
  } else if (kind === 'tiger') {
    g.fillStyle = '#1a1208';
    for (let i = 0; i < 9; i++) { const y = i * 15 + rnd() * 6; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(40, y - 8, 70, y + 10, 128, y - 4); g.lineTo(128, y + 4); g.bezierCurveTo(70, y + 16, 40, y, 0, y + 6); g.fill(); }
  } else if (kind === 'camo') {
    for (const col of ['#4c5048', '#8e9188', '#3a3c36']) { g.fillStyle = col; for (let i = 0; i < 12; i++) { g.beginPath(); g.ellipse(rnd() * 128, rnd() * 128, 8 + rnd() * 14, 6 + rnd() * 10, rnd() * 3, 0, 7); g.fill(); } }
  } else if (kind === 'galaxy') {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 90); gr.addColorStop(0, '#6a3fb8'); gr.addColorStop(0.5, '#23205e'); gr.addColorStop(1, '#0b0a1e');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
  } else if (kind === 'damascus') {
    for (let y = 0; y < 128; y += 2) { g.strokeStyle = y % 6 ? '#6d7279' : '#b6bbc2'; g.beginPath(); for (let x = 0; x <= 128; x += 4) g.lineTo(x, y + Math.sin(x * 0.12 + y * 0.2) * 5); g.stroke(); }
  } else if (kind === 'graffiti') {
    for (const col of ['#e0455a', '#4cc3ff', '#f2cf7c', '#62d64a', '#9b5de5']) { g.strokeStyle = col; g.lineWidth = 6 + rnd() * 6; g.beginPath(); g.moveTo(rnd() * 128, rnd() * 128); for (let k = 0; k < 4; k++) g.quadraticCurveTo(rnd() * 128, rnd() * 128, rnd() * 128, rnd() * 128); g.stroke(); }
  } else if (kind === 'pole') {
    for (let i = -8; i < 16; i++) { g.fillStyle = i % 2 ? '#7a2a26' : '#24344d'; g.beginPath(); g.moveTo(0, i * 16); g.lineTo(128, i * 16 - 64); g.lineTo(128, i * 16 - 56); g.lineTo(0, i * 16 + 8); g.fill(); }
  } else if (kind === 'lava') {
    g.fillStyle = '#ffd23f';
    for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(rnd() * 128, rnd() * 128, 10 + rnd() * 14, 14 + rnd() * 20, 0, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function skinMaterial(tool, id) {
  const key = tool + ':' + id;
  if (matCache.has(key)) return matCache.get(key);
  const s = SKINS[tool]?.[id];
  if (!s) return null;
  const m = new THREE.MeshStandardMaterial({ color: s.pattern === 'none' ? s.base : '#ffffff', metalness: s.metal, roughness: s.rough });
  if (s.pattern !== 'none') m.map = patternTexture(s.pattern, s.base);
  if (s.glow) { m.emissive = new THREE.Color(s.base); m.emissiveIntensity = s.glow; if (m.map) m.emissiveMap = m.map; }
  // tool meshes have no UVs: project the pattern in object space
  if (m.map) {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
        .replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D(map, vOP.xz * 14.0 + vOP.y * 6.0); diffuseColor *= sampledDiffuseColor;')
        .replace('#include <emissivemap_fragment>', '');
    };
    m.customProgramCacheKey = () => 'skin:' + key;
  }
  matCache.set(key, m);
  return m;
}

// which meshes of each tool take the skin
export const SKIN_TARGETS = { clipper: ['Plastic', 'PlasticBlack', 'PlasticRed'], scissors: ['PlasticRed', 'PlasticBlack'], spray: ['Bottle', 'Spray'] };

export function applySkin(obj, tool, id) {
  const m = id && skinMaterial(tool, id);
  if (!m) return;
  const names = SKIN_TARGETS[tool];
  obj.traverse((o) => { if (o.isMesh && names.includes(o.userData.materialName)) o.material = m; });
}
