// Powers (special attacks) and their 20-level mastery passes.
// You pick one of the first three after the tutorial; the others are bought in the shop.

export const ABILITIES = [
  { id: 'fire', name: 'Fireball', color: 0xff7a2a, css: '#ff8a3d', icon: 'fire', cd: 2.4, dmg: 7,
    desc: 'Hurl a fireball that explodes on impact.',
    perks: { 3: 'Burn: targets keep burning', 7: 'Explosions are 50% bigger', 10: 'Throws two fireballs', 14: 'Leaves burning ground', 20: 'Inferno: three huge fireballs' },
    skin: 'ember' },
  { id: 'lightning', name: 'Lightning Strike', color: 0x9fd4ff, css: '#a8d8ff', icon: 'bolt', cd: 2.8, dmg: 8,
    desc: 'Call lightning down on the closest enemy.',
    perks: { 3: 'Chains to 2 more enemies', 7: 'Stuns what it hits', 10: 'Two strikes per cast', 14: 'Chains to 4 enemies', 20: 'Thunderstorm: five strikes' },
    skin: 'storm' },
  { id: 'earth', name: 'Earth Throw', color: 0xb08a5a, css: '#c9a06a', icon: 'rock', cd: 3.0, dmg: 10,
    desc: 'Rip a boulder out of the floor and throw it.',
    perks: { 3: 'Impact stuns', 7: 'Wider shockwave', 10: 'Shatters into 3 shards', 14: 'Thrown faster, hits harder', 20: 'Meteor: a giant boulder' },
    skin: 'stone' },
  { id: 'frost', name: 'Frost Nova', color: 0x9feaff, css: '#a8eeff', icon: 'frost', cd: 4.0, dmg: 6, shop: { level: 12, cost: 900 },
    desc: 'A ring of frost that slows everything around you.',
    perks: { 3: 'Slow lasts twice as long', 7: 'Radius +40%', 10: 'Freezes enemies solid', 14: 'Pulses twice', 20: 'Absolute Zero: huge frozen field' },
    skin: 'frostguard' },
  { id: 'wind', name: 'Wind Blades', color: 0xc8ffd8, css: '#c8ffd8', icon: 'wind', cd: 2.2, dmg: 5, shop: { level: 18, cost: 1600 },
    desc: 'Three blades of wind that cut through enemies.',
    perks: { 3: '+1 blade', 7: 'Blades pierce everything', 10: 'Blades fly back to you', 14: '+2 blades', 20: 'Cyclone: a full ring of blades' },
    skin: 'zephyr' },
];
export const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map(a => [a.id, a]));

// The pass track shared by every power. Perk levels come from each power's own list.
export const TRACK = {
  1: { t: 'unlock' }, 2: { t: 'dmg', v: 0.15 }, 3: { t: 'perk' }, 4: { t: 'coins', v: 100 }, 5: { t: 'cd', v: 0.12 },
  6: { t: 'dmg', v: 0.15 }, 7: { t: 'perk' }, 8: { t: 'coins', v: 200 }, 9: { t: 'dmg', v: 0.15 }, 10: { t: 'perk' },
  11: { t: 'cd', v: 0.1 }, 12: { t: 'coins', v: 300 }, 13: { t: 'dmg', v: 0.2 }, 14: { t: 'perk' }, 15: { t: 'coins', v: 400 },
  16: { t: 'dmg', v: 0.2 }, 17: { t: 'cd', v: 0.1 }, 18: { t: 'coins', v: 500 }, 19: { t: 'dmg', v: 0.25 }, 20: { t: 'perk', skin: true },
};
export const MAX_MASTERY = 20;

export function rewardLabel(a, lvl) {
  const r = TRACK[lvl];
  if (r.t === 'unlock') return `${a.name} unlocked`;
  if (r.t === 'dmg') return `+${Math.round(r.v * 100)}% damage`;
  if (r.t === 'cd') return `−${Math.round(r.v * 100)}% cooldown`;
  if (r.t === 'coins') return `${r.v} coins`;
  return a.perks[lvl] + (r.skin ? ' + exclusive skin' : '');
}

// XP needed to go from level n to n+1.
export const masteryNeed = n => 150 + 90 * (n - 1);
export function masteryFromXp(xp) {
  let lvl = 1;
  while (lvl < MAX_MASTERY && xp >= masteryNeed(lvl)) { xp -= masteryNeed(lvl); lvl++; }
  return { level: lvl, into: xp, need: lvl >= MAX_MASTERY ? 0 : masteryNeed(lvl) };
}

export function abilityPower(id, lvl) {
  const a = ABILITY_BY_ID[id];
  let dmg = 1, cd = 1;
  for (let k = 1; k <= lvl; k++) { const r = TRACK[k]; if (r.t === 'dmg') dmg += r.v; if (r.t === 'cd') cd *= 1 - r.v; }
  const has = n => lvl >= n;
  return { a, dmg: a.dmg * dmg, cd: a.cd * cd, has, lvl };
}
