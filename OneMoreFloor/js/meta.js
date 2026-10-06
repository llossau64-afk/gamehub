// Between-run progression: permanent upgrades, skins and achievements.

export const PERMS = [
  { id: 'power', name: 'Power', desc: '+8% starting damage', max: 5, costs: [40, 90, 170, 300, 480], icon: 'damage' },
  { id: 'vitality', name: 'Vitality', desc: '+4 max HP', max: 5, costs: [40, 90, 170, 300, 480], icon: 'heart' },
  { id: 'reflex', name: 'Reflex', desc: '−8% dash cooldown', max: 5, costs: [50, 110, 200, 340, 520], icon: 'clock' },
  { id: 'greed', name: 'Greed', desc: '+12% coins found', max: 5, costs: [60, 130, 240, 400, 620], icon: 'coins' },
  { id: 'fortune', name: 'Fortune', desc: '+1 card reroll per run', max: 3, costs: [120, 300, 600], icon: 'crit' },
];

// Skin palettes are applied to the player's low-poly parts.
// body, trim, skin (head), eyes, blade, trail, accessory
export const SKINS = [
  { id: 'default', name: 'Climber', unlock: { type: 'free' }, c: { body: 0x2f3a4a, trim: 0xf2b24a, head: 0xe9d9c2, eyes: 0x1b1d22, blade: 0xffe2a8, trail: 0xf2b24a }, acc: 'scarf' },
  { id: 'street', name: 'Street', unlock: { type: 'coins', cost: 250 }, c: { body: 0xeeeae2, trim: 0xd8402f, head: 0xe0c3a0, eyes: 0x1b1d22, blade: 0xfff1e0, trail: 0xff6a4d }, acc: 'band' },
  { id: 'cyber', name: 'Cyber', unlock: { type: 'coins', cost: 700 }, c: { body: 0x1d2330, trim: 0x46d8e8, head: 0x2a3140, eyes: 0x66f0ff, blade: 0xa8f6ff, trail: 0x46d8e8 }, acc: 'visor' },
  { id: 'knight', name: 'Knight', unlock: { type: 'floor', floor: 11, label: 'Defeat The Warden' }, c: { body: 0x9aa3ad, trim: 0x3d5a9e, head: 0xb5bdc6, eyes: 0x1b1d22, blade: 0xe8eef6, trail: 0xcfe0ff }, acc: 'plume' },
  { id: 'shadow', name: 'Shadow', unlock: { type: 'kills', kills: 1500, label: 'Defeat 1,500 enemies' }, c: { body: 0x17161c, trim: 0x8b5cf6, head: 0x232129, eyes: 0xc4a6ff, blade: 0xc9b2ff, trail: 0x8b5cf6 }, acc: 'hood' },
  { id: 'golden', name: 'Golden', unlock: { type: 'floor', floor: 30, label: 'Reach floor 30' }, c: { body: 0xc9962e, trim: 0xfff0c0, head: 0xe8c66a, eyes: 0x3a2a0a, blade: 0xfff4d0, trail: 0xffd36b }, acc: 'crown' },
];

export const ACHIEVEMENTS = [
  { id: 'f5', name: 'Warming Up', desc: 'Reach floor 5' },
  { id: 'warden', name: 'Jailbreak', desc: 'Defeat The Warden' },
  { id: 'crusher', name: 'Unbroken', desc: 'Defeat The Crusher' },
  { id: 'hunter', name: 'Outfoxed', desc: 'Defeat The Hunter' },
  { id: 'f40', name: 'Thin Air', desc: 'Reach floor 40' },
  { id: 'coins1k', name: 'Pocket Change', desc: 'Collect 1,000 coins in total' },
  { id: 'coins10k', name: 'Tower Tycoon', desc: 'Collect 10,000 coins in total' },
  { id: 'kills500', name: 'Exterminator', desc: 'Defeat 500 enemies in total' },
  { id: 'untouched', name: 'Untouchable', desc: 'Clear floor 8 or higher without taking damage' },
  { id: 'chain', name: 'Chain Reaction', desc: 'Defeat 8 enemies within one second' },
  { id: 'broken', name: 'This Is Broken', desc: 'Hold 15 upgrades in a single run' },
  { id: 'legend', name: 'Legendary', desc: 'Pick a legendary upgrade' },
];

export function skinUnlocked(save, skin) {
  return save.skins.includes(skin.id);
}

// Returns skins that just became unlockable by progress (not coin purchases).
export function checkSkinProgress(save) {
  const fresh = [];
  for (const s of SKINS) {
    if (save.skins.includes(s.id)) continue;
    const u = s.unlock;
    if ((u.type === 'floor' && save.bestFloor >= u.floor) || (u.type === 'kills' && save.totalKills >= u.kills)) {
      save.skins.push(s.id); fresh.push(s);
    }
  }
  return fresh;
}
