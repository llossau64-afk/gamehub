// Chests: three tiers bought in the shop, opened in a full-screen reveal.
// Wooden = coins, Silver = 1 key, Gold = 5 keys. Keys drop in the tower from floor 20 on.
import * as THREE from '../lib/three.module.min.js';
import { toonRamp } from './characters.js';
import { WEAPONS } from './weapons.js';
import { SKINS, SKIN_RARITY } from './meta.js';

export const CHESTS = [
  { id: 'wood', name: 'Wooden Chest', price: { coins: 1200 }, css: '#c08a52',
    odds: { common: 55, rare: 33, superrare: 10, epic: 2, legendary: 0 },
    desc: 'Coins, keys and the odd rare find. Bought with coins.' },
  { id: 'silver', name: 'Silver Chest', price: { keys: 1 }, css: '#b8c8dc',
    odds: { common: 20, rare: 35, superrare: 27, epic: 14, legendary: 4 },
    desc: 'Opens with one key. Good odds for exclusive skins and weapons.' },
  { id: 'gold', name: 'Gold Chest', price: { keys: 5 }, css: '#f2c94a',
    odds: { common: 0, rare: 0, superrare: 42, epic: 36, legendary: 22 },
    desc: 'Opens with five keys. Always Super Rare or better.' },
];
export const CHEST_BY_ID = Object.fromEntries(CHESTS.map(c => [c.id, c]));
export const RARITY_ORDER = ['common', 'rare', 'superrare', 'epic', 'legendary'];
export const RARITY_COLOR = { common: '#b9b4a8', rare: '#5fb4e8', superrare: '#3fd0a0', epic: '#b07cf0', legendary: '#f2b24a' };
export const RARITY_LABEL = { common: 'COMMON', rare: 'RARE', superrare: 'SUPER RARE', epic: 'EPIC', legendary: 'LEGENDARY' };

// Real-money key packs. Prices are shown; the purchase goes through payments.js.
export const KEY_PACKS = [
  { id: 'keys1', keys: 1, price: '0,99 €' },
  { id: 'keys6', keys: 6, price: '4,99 €', tag: '+1 FREE' },
  { id: 'keys15', keys: 15, price: '9,99 €', tag: 'BEST VALUE' },
];

// Exclusive items per rarity (only found in chests).
export function exclusivePool() {
  const pool = { common: [], rare: [], superrare: [], epic: [], legendary: [] };
  for (const w of WEAPONS) if (w.chest) pool[w.rarity].push({ kind: 'weapon', id: w.id, name: w.name });
  for (const s of SKINS) if (s.unlock.type === 'chest') pool[SKIN_RARITY[s.id]].push({ kind: 'skin', id: s.id, name: s.name });
  return pool;
}
const DUPE_COINS = { common: 300, rare: 700, superrare: 1300, epic: 2200, legendary: 3500 };

// Rolls one chest. Returns { rarity, kind: 'coins'|'keys'|'weapon'|'skin', id?, name, amount?, dupe? }.
export function rollChest(chestId, data, rnd = Math.random) {
  const c = CHEST_BY_ID[chestId];
  let total = 0; for (const r of RARITY_ORDER) total += c.odds[r];
  let x = rnd() * total, rarity = 'common';
  for (const r of RARITY_ORDER) { x -= c.odds[r]; if (x <= 0 && c.odds[r] > 0) { rarity = r; break; } }
  if (rarity === 'common') {
    // coins, sometimes a key
    if (chestId !== 'gold' && rnd() < (chestId === 'wood' ? 0.22 : 0.35)) return { rarity, kind: 'keys', amount: chestId === 'wood' ? 1 : 2, name: chestId === 'wood' ? '1 Key' : '2 Keys' };
    const amount = chestId === 'wood' ? 500 + Math.round(rnd() * 8) * 100 : 1200 + Math.round(rnd() * 10) * 100;
    return { rarity, kind: 'coins', amount, name: `${amount.toLocaleString('en-US')} Coins` };
  }
  const pool = exclusivePool()[rarity];
  const fresh = pool.filter(it => it.kind === 'weapon' ? !data.weapons.includes(it.id) : !data.skins.includes(it.id));
  if (fresh.length) { const it = fresh[Math.floor(rnd() * fresh.length)]; return { rarity, ...it }; }
  // everything of this rarity is owned: coins instead (and a key on the higher tiers)
  const amount = DUPE_COINS[rarity];
  return { rarity, kind: 'coins', amount, name: `${amount.toLocaleString('en-US')} Coins`, dupe: true, bonusKey: rarity === 'epic' || rarity === 'legendary' };
}

export function grantLoot(loot, data) {
  if (loot.kind === 'coins') { data.coins += loot.amount; data.totalCoins += loot.amount; if (loot.bonusKey) data.keys++; }
  else if (loot.kind === 'keys') data.keys += loot.amount;
  else if (loot.kind === 'weapon') { if (!data.weapons.includes(loot.id)) data.weapons.push(loot.id); }
  else if (loot.kind === 'skin') { if (!data.skins.includes(loot.id)) data.skins.push(loot.id); }
  data.chestsOpened = (data.chestsOpened || 0) + 1;
}

// ------------------------------------------------------------------ models
const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide });
const INK = new THREE.MeshBasicMaterial({ color: 0x0d0c10, side: THREE.BackSide });
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, ink = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m);
  if (ink) { const o = new THREE.Mesh(geo, INK); o.scale.setScalar(1 + ink); m.add(o); }
  return m;
}
let _soft = null;
export function softTex() {
  if (_soft) return _soft;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _soft = new THREE.CanvasTexture(c); _soft.colorSpace = THREE.SRGBColorSpace; return _soft;
}

const PAL = {
  wood: { body: 0x8a5a32, plank: 0x6e4424, band: 0x4a4c54, trim: 0x2e3036, lock: 0x9aa0aa, gem: null, glow: 0xffc070 },
  silver: { body: 0x9aa8b8, plank: 0x7a8898, band: 0xdfe8f2, trim: 0x4a5568, lock: 0xeef4ff, gem: 0x5fb4e8, glow: 0x9fd8ff },
  gold: { body: 0xd9a83a, plank: 0xb8862a, band: 0xfff0c0, trim: 0x7a1e2a, lock: 0xfff4d0, gem: 0xe8402a, glow: 0xffe08a },
};

// Returns { root, lid, glow, inner, kind }. The lid pivots at the back edge (lid.rotation.x < 0 opens it).
export function buildChest(kind) {
  const P = PAL[kind];
  const root = new THREE.Group();
  const body = toon(P.body), plank = toon(P.plank), band = toon(P.band, kind === 'gold' ? { emissive: 0x4a3000, ei: 0.35 } : {}), trim = toon(P.trim), lockM = toon(P.lock);
  const W = 1.2, H = 0.62, D = 0.78;
  // base: planks with gaps
  const base = new THREE.Group(); root.add(base);
  mesh(new THREE.BoxGeometry(W, H, D), body, base, 0, H / 2, 0, 0.03);
  for (let k = 0; k < 3; k++) mesh(new THREE.BoxGeometry(W + 0.01, 0.025, D + 0.01), plank, base, 0, 0.14 + k * 0.17, 0);
  for (const sx of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.1, H + 0.04, D + 0.06), band, base, sx * (W / 2 - 0.16), H / 2, 0, 0.04);
    for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.12, H + 0.06, 0.12), trim, base, sx * (W / 2), H / 2, sz * (D / 2), 0.04);
  }
  // inner glow plane (seen when the lid opens)
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, D - 0.12), new THREE.MeshBasicMaterial({ color: P.glow, transparent: true, opacity: 0 }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = H - 0.02; root.add(inner);
  // lid: half cylinder, pivot at the back top edge
  const lid = new THREE.Group(); lid.position.set(0, H, -D / 2); root.add(lid);
  const lg = new THREE.CylinderGeometry(D / 2, D / 2, W, 16, 1, false, 0, Math.PI); lg.rotateZ(Math.PI / 2);
  // the arch spans z in [-D/2, D/2]; shift it so its back edge sits on the pivot
  const lidMesh = mesh(lg, body, lid, 0, 0, D / 2, 0.03);
  for (const sx of [-1, 1]) {
    const bg = new THREE.CylinderGeometry(D / 2 + 0.025, D / 2 + 0.025, 0.1, 16, 1, false, 0, Math.PI); bg.rotateZ(Math.PI / 2);
    mesh(bg, band, lid, sx * (W / 2 - 0.16), 0, D / 2, 0.03);
  }
  const eg = new THREE.CylinderGeometry(D / 2 + 0.03, D / 2 + 0.03, 0.06, 16, 1, false, 0, Math.PI); eg.rotateZ(Math.PI / 2);
  mesh(eg, trim, lid, -W / 2 + 0.03, 0, D / 2); mesh(eg, trim, lid, W / 2 - 0.03, 0, D / 2);
  // lock plate on the front, hanging from the lid
  const lock = new THREE.Group(); lock.position.set(0, -0.02, D + 0.02); lid.add(lock);
  mesh(new THREE.BoxGeometry(0.22, 0.26, 0.06), lockM, lock, 0, -0.06, 0, 0.05);
  mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12), trim, lock, 0, -0.08, 0.04);
  if (P.gem) {
    const gem = new THREE.MeshBasicMaterial({ color: P.gem });
    mesh(new THREE.OctahedronGeometry(0.06, 0), gem, lock, 0, 0.04, 0.05).scale.set(1, 1.3, 0.6);
    for (const sx of [-1, 1]) mesh(new THREE.OctahedronGeometry(0.05, 0), gem, base, sx * (W / 2 - 0.16), H * 0.5, D / 2 + 0.05).scale.set(1, 1.2, 0.5);
  }
  if (kind === 'gold') {
    // crown ornaments on the lid
    const cg = new THREE.ConeGeometry(0.04, 0.14, 5);
    for (let k = 0; k < 5; k++) mesh(cg, band, lid, (k - 2) * 0.2, D / 2 + 0.05, D / 2);
    // little feet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.SphereGeometry(0.07, 8, 6), band, base, sx * (W / 2 - 0.02), 0.02, sz * (D / 2 - 0.02));
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: P.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = H + 0.2; glow.scale.set(2.4, 2.4, 1); root.add(glow);
  return { root, lid, glow, inner, kind, H };
}

// Golden key for drops and the HUD.
export function buildKey(scale = 1) {
  const g = new THREE.Group();
  const gold = toon(0xf2c94a, { emissive: 0x6a4a00, ei: 0.5 });
  mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 18), gold, g, 0, 0.3, 0, 0.08);
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), gold, g, 0, 0.0, 0, 0.08);
  mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), gold, g, 0.06, -0.14, 0, 0.08);
  mesh(new THREE.BoxGeometry(0.09, 0.05, 0.05), gold, g, 0.045, -0.05, 0, 0.08);
  mesh(new THREE.OctahedronGeometry(0.045, 0), new THREE.MeshBasicMaterial({ color: 0x7fe0ff }), g, 0, 0.3, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xffd36b, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(1.1, 1.1, 1); g.add(halo);
  g.scale.setScalar(scale);
  return g;
}
