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
  { id: 'ronin', name: 'Ronin', unlock: { type: 'coins', cost: 1200 }, c: { body: 0x2a2630, trim: 0xb8322a, head: 0xe2c9a6, eyes: 0x1b1d22, blade: 0xf0f0f0, trail: 0xe8584a }, acc: 'hat' },
  { id: 'warlord', name: 'Warlord', unlock: { type: 'coins', cost: 2200 }, c: { body: 0x3a3f48, trim: 0x8a2a22, head: 0x50565f, eyes: 0xff6a3a, blade: 0xffd0b0, trail: 0xff6a3a }, acc: 'horns' },
  { id: 'ember', name: 'Ember', unlock: { type: 'mastery', ability: 'fire', label: 'Fireball mastery 20' }, c: { body: 0x2a1a16, trim: 0xff7a2a, head: 0x3a2620, eyes: 0xffc06a, blade: 0xffb05a, trail: 0xff7a2a }, acc: 'flame' },
  { id: 'storm', name: 'Stormcaller', unlock: { type: 'mastery', ability: 'lightning', label: 'Lightning mastery 20' }, c: { body: 0x1e2534, trim: 0x9fd4ff, head: 0x2c3548, eyes: 0xd8f0ff, blade: 0xd8f0ff, trail: 0x9fd4ff }, acc: 'halo' },
  { id: 'stone', name: 'Stoneborn', unlock: { type: 'mastery', ability: 'earth', label: 'Earth Throw mastery 20' }, c: { body: 0x5a4a3a, trim: 0xc9a06a, head: 0x7a6a58, eyes: 0xffd36b, blade: 0xe0c8a0, trail: 0xc9a06a }, acc: 'rocks' },
  { id: 'frostguard', name: 'Frostguard', unlock: { type: 'mastery', ability: 'frost', label: 'Frost Nova mastery 20' }, c: { body: 0xd8e6ee, trim: 0x5fb4e8, head: 0xa8c8dc, eyes: 0x1b3a5a, blade: 0xd8f6ff, trail: 0x9feaff }, acc: 'icehorns' },
  { id: 'zephyr', name: 'Zephyr', unlock: { type: 'mastery', ability: 'wind', label: 'Wind Blades mastery 20' }, c: { body: 0x2a3a34, trim: 0xc8ffd8, head: 0xd8e8dc, eyes: 0x1b2a22, blade: 0xe8fff0, trail: 0xc8ffd8 }, acc: 'longscarf' },
];
export const SKIN_RARITY = { default: 'common', street: 'common', cyber: 'rare', knight: 'rare', ronin: 'rare', shadow: 'epic', warlord: 'epic', golden: 'legendary', ember: 'legendary', storm: 'legendary', stone: 'legendary', frostguard: 'legendary', zephyr: 'legendary' };

// The Register: every monster in the tower.
export const BESTIARY = [
  { id: 'dummy', name: 'Training Dummy', where: 'Training floor', lore: 'Straw, rope and a painted target. The only thing in this tower that never hits back.' },
  { id: 'runner', name: 'Runner', where: 'From floor 1', lore: 'Fast and stupid. It crouches for a split second before it bites. That crouch is your window.' },
  { id: 'shooter', name: 'Shooter', where: 'From floor 2', lore: 'Keeps its distance and spits glowing orbs. Its core flares up right before it fires. Your swing can cut the shots apart.' },
  { id: 'splitter', name: 'Splitter', where: 'From floor 3', lore: 'A lump of green slime that splits in two when it dies. Kill it near a wall and the halves have nowhere to go.' },
  { id: 'splitling', name: 'Splitling', where: 'Born from Splitters', lore: 'Small, quick and weak. One hit is usually enough.' },
  { id: 'dasher', name: 'Dasher', where: 'From floor 5', lore: 'Paints a red line on the floor, then charges along it. Step off the line and it slams into whatever is behind you.' },
  { id: 'tank', name: 'Tank', where: 'From floor 6', lore: 'A walking wall. It raises its fists before every slam. Keep moving and it never lands a hit.' },
  { id: 'warden', name: 'The Warden', where: 'Floor 10, 40, 70…', boss: true, lore: 'The jailer of the lower floors. Its lantern burns brighter before every ring of fire. The gaps are the way through.' },
  { id: 'crusher', name: 'The Crusher', where: 'Floor 20, 50, 80…', boss: true, lore: 'All weight and no patience. It charges blindly and stuns itself on the walls. Make it miss.' },
  { id: 'hunter', name: 'The Hunter', where: 'Floor 30, 60, 90…', boss: true, lore: 'It disappears, then lands where you stood. Every dash it makes is drawn on the floor first.' },
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
    if ((u.type === 'floor' && save.bestFloor >= u.floor) || (u.type === 'kills' && save.totalKills >= u.kills) || (u.type === 'mastery' && save.abilities[u.ability] && save.abilities[u.ability].claimed >= 20)) {
      save.skins.push(s.id); fresh.push(s);
    }
  }
  return fresh;
}
