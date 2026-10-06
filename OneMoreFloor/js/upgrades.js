// Run upgrades (the card pool), rarity rules and stat building.

export const RARITY = {
  common: { label: 'COMMON', weight: 62, color: '#b9b4a8' },
  rare: { label: 'RARE', weight: 27, color: '#5fb4e8' },
  epic: { label: 'EPIC', weight: 9, color: '#b07cf0' },
  legendary: { label: 'LEGENDARY', weight: 2.4, color: '#f2b24a' },
};

// 24x24 stroke icons. Kept to the same line weight so they read as one family.
const I = {
  damage: '<path d="M5 19 L16 8 M14 5 L19 10 M8 13 L11 16 M4 20 L6 18"/>',
  speed: '<path d="M5 6 L11 12 L5 18 M12 6 L18 12 L12 18"/>',
  range: '<path d="M4 16 A10 10 0 0 1 20 16"/><path d="M12 16 L12 9 M9 12 L12 9 L15 12"/>',
  move: '<path d="M4 8 H10 M2 12 H9 M4 16 H10"/><path d="M13 6 L19 12 L13 18"/>',
  heart: '<path d="M12 19 L5 12 A3.6 3.6 0 0 1 12 7 A3.6 3.6 0 0 1 19 12 Z"/>',
  plus: '<path d="M12 5 V19 M5 12 H19"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
  magnet: '<path d="M7 4 V12 A5 5 0 0 0 17 12 V4"/><path d="M7 7 H10 M14 7 H17"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7 V12 L15 14"/>',
  dash2: '<path d="M3 8 H12 L9 5 M12 8 L9 11"/><path d="M8 16 H19 L16 13 M19 16 L16 19"/>',
  crit: '<circle cx="12" cy="12" r="6"/><path d="M12 2 V7 M12 17 V22 M2 12 H7 M17 12 H22"/>',
  drop: '<path d="M12 4 C8 10 6 12 6 15 A6 6 0 0 0 18 15 C18 12 16 10 12 4 Z"/>',
  wave: '<path d="M6 4 A10 10 0 0 1 6 20 A7 7 0 0 0 6 4 Z"/><path d="M14 9 H20 M14 15 H20"/>',
  bounce: '<path d="M3 18 L8 8 L13 18 L18 8 L21 14"/>',
  pierce: '<path d="M3 12 H19 M15 8 L19 12 L15 16"/><path d="M10 5 V19"/>',
  razor: '<path d="M4 15 H14 L11 12 M14 15 L11 18"/><path d="M14 5 L20 11 M17 5 L20 8"/>',
  five: '<circle cx="6" cy="7" r="1.6"/><circle cx="12" cy="7" r="1.6"/><circle cx="18" cy="7" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="17" r="3.2"/>',
  bolt: '<path d="M13 2 L5 13 H11 L10 22 L19 10 H13 Z"/>',
  thorns: '<circle cx="12" cy="12" r="4"/><path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22 M5 5 L8 8 M16 16 L19 19 M19 5 L16 8 M8 16 L5 19"/>',
  frost: '<path d="M12 3 V21 M4.2 7.5 L19.8 16.5 M4.2 16.5 L19.8 7.5"/><path d="M10 5 L12 7 L14 5 M10 19 L12 17 L14 19"/>',
  heavy: '<rect x="5" y="9" width="14" height="10" rx="1"/><path d="M9 9 V5 H15 V9"/>',
  burst: '<path d="M12 3 L14 9 L20 7 L16 12 L21 16 L14.5 15.5 L12 21 L9.5 15.5 L3 16 L8 12 L4 7 L10 9 Z"/>',
  skull: '<path d="M6 14 A6 6 0 1 1 18 14 V17 H6 Z"/><circle cx="9.5" cy="12" r="1.3"/><circle cx="14.5" cy="12" r="1.3"/><path d="M10 17 V20 M14 17 V20"/>',
  drone: '<path d="M12 8 L15 12 L12 16 L9 12 Z"/><ellipse cx="12" cy="12" rx="9" ry="4.5"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5"/><path d="M19 7 L22 4 M5 17 L2 20"/>',
  crit2: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22"/>',
  shock: '<path d="M4 12 H12 L9 9 M12 12 L9 15"/><path d="M16 5 A9 9 0 0 1 16 19 M19 8 A6 6 0 0 1 19 16"/>',
  glass: '<path d="M7 3 H17 L15 13 A3 3 0 0 1 9 13 Z"/><path d="M12 16 V21 M8 21 H16 M10 8 L13 6"/>',
  echo: '<path d="M4 18 A11 11 0 0 1 14 4"/><path d="M9 20 A11 11 0 0 1 19 6" opacity=".55"/>',
  crown: '<path d="M4 18 L3 7 L8 11 L12 5 L16 11 L21 7 L20 18 Z"/><path d="M13 9 L10.5 13 H13.5 L11 17"/>',
  phoenix: '<path d="M12 21 C6 18 5 12 8 7 C9 10 10 11 12 11 C11 8 12 5 15 3 C15 7 19 9 19 14 C19 18 16 20 12 21 Z"/>',
  berserk: '<path d="M4 7 L10 10 M20 7 L14 10"/><path d="M6 17 Q12 12 18 17"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/>',
  coins: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7 V12 A7 3 0 0 0 19 12 V7 M5 12 V17 A7 3 0 0 0 19 17 V12"/>',
  split: '<path d="M12 3 V10 M12 10 L5 20 M12 10 L19 20"/><circle cx="12" cy="3" r="1"/>',
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[name] || ''}</svg>`;
}

// tags help the card UI hint synergies with what the player already owns.
export const UPGRADES = [
  // ---------- COMMON ----------
  { id: 'edge', name: 'Sharpened Edge', icon: 'damage', rarity: 'common', max: 8, desc: '+15% attack damage.', apply: s => { s.damageMul += 0.15; } },
  { id: 'hands', name: 'Quick Hands', icon: 'speed', rarity: 'common', max: 6, desc: '+15% attack speed.', apply: s => { s.attackRate *= 1.15; } },
  { id: 'reach', name: 'Long Reach', icon: 'range', rarity: 'common', max: 4, desc: '+20% attack range and a wider swing.', apply: s => { s.range *= 1.2; s.arc = Math.min(Math.PI * 1.6, s.arc * 1.12); } },
  { id: 'feet', name: 'Light Feet', icon: 'move', rarity: 'common', max: 4, desc: '+10% movement speed.', apply: s => { s.moveSpeed *= 1.1; } },
  { id: 'skin', name: 'Thick Skin', icon: 'heart', rarity: 'common', max: 6, desc: '+5 max HP and heal 5.', apply: (s, run) => { s.maxHp += 5; run && run.heal(5); } },
  { id: 'patch', name: 'Patch Up', icon: 'plus', rarity: 'common', max: 99, desc: 'Heal 40% of your max HP.', apply: (s, run) => { run && run.heal(Math.ceil(s.maxHp * 0.4)); } },
  { id: 'magnet', name: 'Magnet Core', icon: 'magnet', rarity: 'common', max: 3, desc: 'Pick up coins from 60% further away.', apply: s => { s.pickup *= 1.6; } },
  { id: 'momentum', name: 'Momentum', icon: 'clock', rarity: 'common', max: 4, desc: 'Dash recharges 20% faster.', apply: s => { s.dashCooldown *= 0.8; } },
  { id: 'gold', name: 'Gold Rush', icon: 'coins', rarity: 'common', max: 3, desc: 'Enemies drop 30% more coins.', apply: s => { s.coinMul += 0.3; } },
  // ---------- RARE ----------
  { id: 'dash2', name: 'Extra Dash', icon: 'dash2', rarity: 'rare', max: 3, desc: '+1 dash charge.', apply: s => { s.dashCharges += 1; } },
  { id: 'crit', name: 'Critical Eye', icon: 'crit', rarity: 'rare', max: 5, desc: '+10% chance to land a critical hit (2× damage).', tags: ['crit'], apply: s => { s.critChance += 0.1; } },
  { id: 'blood', name: 'Bloodthirst', icon: 'drop', rarity: 'rare', max: 3, desc: 'Kills heal 1 HP.', apply: s => { s.lifesteal += 1; } },
  { id: 'wave', name: 'Blade Wave', icon: 'wave', rarity: 'rare', max: 4, desc: 'Every swing also fires a blade wave. More stacks fire more waves.', tags: ['proj'], syn: ['bounce', 'pierce', 'detonate', 'crit', 'echo'], apply: s => { s.waves += 1; } },
  { id: 'bounce', name: 'Ricochet', icon: 'bounce', rarity: 'rare', max: 3, desc: 'Projectiles bounce off walls and enemies one more time.', needs: 'proj', syn: ['wave', 'drone'], apply: s => { s.bounce += 1; } },
  { id: 'pierce', name: 'Piercing', icon: 'pierce', rarity: 'rare', max: 3, desc: 'Projectiles pass through +1 enemy.', needs: 'proj', syn: ['wave', 'drone'], apply: s => { s.pierce += 1; } },
  { id: 'razor', name: 'Razor Dash', icon: 'razor', rarity: 'rare', max: 3, desc: 'Dashing through enemies deals 120% damage.', tags: ['dash'], syn: ['dash2', 'momentum', 'shockdash'], apply: s => { s.dashDamage += 1.2; } },
  { id: 'fifth', name: 'Fifth Beat', icon: 'five', rarity: 'rare', max: 3, desc: 'Every 5th swing deals double damage and always crits.', syn: ['crit', 'storm', 'lethal'], apply: s => { s.fifth += 1; } },
  { id: 'static', name: 'Static Charge', icon: 'bolt', rarity: 'rare', max: 4, desc: 'Hits have a 20% chance to arc lightning to 2 nearby enemies.', tags: ['chain'], apply: s => { s.chain += 0.2; } },
  { id: 'thorns', name: 'Thorns', icon: 'thorns', rarity: 'rare', max: 3, desc: 'Getting hit releases a damaging nova.', apply: s => { s.thorns += 1; } },
  { id: 'frost', name: 'Frost Edge', icon: 'frost', rarity: 'rare', max: 2, desc: 'Hits slow enemies by 40% for 1.5 s.', apply: s => { s.frost += 1; } },
  { id: 'heavy', name: 'Heavy Blows', icon: 'heavy', rarity: 'rare', max: 3, desc: '+10% damage and much stronger knockback.', apply: s => { s.damageMul += 0.1; s.knockback += 0.6; } },
  { id: 'berserk', name: 'Berserker', icon: 'berserk', rarity: 'rare', max: 2, desc: 'Below 50% HP: +40% damage, +20% attack speed.', apply: s => { s.berserk += 1; } },
  // ---------- EPIC ----------
  { id: 'detonate', name: 'Detonator', icon: 'burst', rarity: 'epic', max: 3, desc: 'Hits cause a small explosion. Projectiles explode on impact.', tags: ['explode'], syn: ['wave', 'crit', 'echo', 'corpse'], apply: s => { s.explode += 1; } },
  { id: 'corpse', name: 'Corpse Blast', icon: 'skull', rarity: 'epic', max: 3, desc: 'Enemies explode when they die, damaging others nearby.', tags: ['explode'], syn: ['detonate', 'blood'], apply: s => { s.corpse += 1; } },
  { id: 'drone', name: 'Drone Buddy', icon: 'drone', rarity: 'epic', max: 3, desc: 'A small drone follows you and shoots enemies.', tags: ['proj'], syn: ['bounce', 'pierce', 'detonate'], apply: s => { s.drones += 1; } },
  { id: 'orbit', name: 'Orbit Blades', icon: 'orbit', rarity: 'epic', max: 3, desc: 'Two blades circle you and cut anything they touch.', apply: s => { s.orbit += 2; } },
  { id: 'lethal', name: 'Lethal Precision', icon: 'crit2', rarity: 'epic', max: 3, desc: 'Critical hits deal +100% damage. +5% crit chance.', needs: 'crit', syn: ['crit', 'fifth', 'storm'], apply: s => { s.critMult += 1; s.critChance += 0.05; } },
  { id: 'shockdash', name: 'Shockwave Dash', icon: 'shock', rarity: 'epic', max: 2, desc: 'The end of every dash releases a shockwave.', tags: ['dash'], syn: ['dash2', 'momentum', 'razor'], apply: s => { s.dashShock += 1; } },
  { id: 'glass', name: 'Glass Cannon', icon: 'glass', rarity: 'epic', max: 1, desc: '+60% damage, but your max HP is cut by 30%.', apply: (s, run) => { s.damageMul += 0.6; s.maxHpMul *= 0.7; } },
  // ---------- LEGENDARY ----------
  { id: 'echo', name: 'Echo Strike', icon: 'echo', rarity: 'legendary', max: 2, desc: 'Every swing repeats itself a moment later at 60% damage.', syn: ['detonate', 'static', 'wave'], apply: s => { s.echo += 1; } },
  { id: 'storm', name: 'Storm Crown', icon: 'crown', rarity: 'legendary', max: 1, desc: 'Every critical hit calls lightning down on 3 nearby enemies.', needs: 'crit', syn: ['crit', 'lethal', 'fifth'], apply: s => { s.storm += 1; } },
  { id: 'phoenix', name: 'Phoenix Heart', icon: 'phoenix', rarity: 'legendary', max: 1, desc: 'Once per run, return from death with 60% HP.', apply: s => { s.phoenix += 1; } },
  { id: 'hydra', name: 'Hydra', icon: 'split', rarity: 'legendary', max: 1, desc: 'Projectiles split into 2 smaller ones when they hit an enemy.', needs: 'proj', syn: ['wave', 'drone', 'bounce'], apply: s => { s.hydra += 1; } },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

export function baseStats(perm) {
  return {
    damage: 10 * (1 + 0.08 * perm.power),
    damageMul: 1,
    attackRate: 2.7,
    range: 2.35,
    arc: Math.PI * 0.72,
    moveSpeed: 6.4,
    maxHp: 20 + 4 * perm.vitality,
    maxHpMul: 1,
    dashCharges: 1,
    dashCooldown: 1.0 * (1 - 0.08 * perm.reflex),
    critChance: 0.05,
    critMult: 2,
    knockback: 1,
    pickup: 2.3,
    coinMul: 1 + 0.12 * perm.greed,
    waves: 0, bounce: 0, pierce: 0, explode: 0, corpse: 0, drones: 0, orbit: 0, lifesteal: 0,
    fifth: 0, dashDamage: 0, dashShock: 0, chain: 0, thorns: 0, frost: 0, echo: 0, storm: 0,
    phoenix: 0, berserk: 0, hydra: 0,
  };
}

function hasTag(owned, tag) {
  for (const id in owned) { const u = UPGRADE_BY_ID[id]; if (u.tags && u.tags.includes(tag)) return true; }
  return false;
}

// Choose 3 distinct cards. `luck` (0..1) shifts weight towards rarer cards on high floors.
export function rollCards(rng, owned, luck, guaranteeEpic) {
  const pool = UPGRADES.filter(u => (owned[u.id] || 0) < u.max && (!u.needs || hasTag(owned, u.needs)));
  const weightOf = u => {
    let w = RARITY[u.rarity].weight;
    if (u.rarity === 'rare') w *= 1 + luck * 0.5;
    if (u.rarity === 'epic') w *= 1 + luck * 1.5;
    if (u.rarity === 'legendary') w *= 1 + luck * 2.5;
    if (u.id === 'patch') w *= 0.5;
    // Gently favour cards that build on what you have: builds should snowball.
    if (u.syn && u.syn.some(id => owned[id])) w *= 1.6;
    if (owned[u.id]) w *= 1.25;
    return w / (u.rarity === 'common' ? 9 : u.rarity === 'rare' ? 13 : u.rarity === 'epic' ? 7 : 4);
  };
  const out = [];
  const tries = guaranteeEpic ? pool.filter(u => u.rarity === 'epic' || u.rarity === 'legendary') : null;
  if (tries && tries.length) out.push(weightedPick(rng, tries, weightOf));
  while (out.length < 3) {
    const cand = pool.filter(u => !out.includes(u));
    if (!cand.length) break;
    out.push(weightedPick(rng, cand, weightOf));
  }
  return rng.shuffle(out);
}

function weightedPick(rng, list, wf) {
  let total = 0;
  for (const u of list) total += wf(u);
  let r = rng.next() * total;
  for (const u of list) { r -= wf(u); if (r <= 0) return u; }
  return list[list.length - 1];
}

export function synergyWith(u, owned) {
  if (!u.syn) return null;
  const hit = u.syn.find(id => owned[id]);
  return hit ? UPGRADE_BY_ID[hit].name : null;
}
