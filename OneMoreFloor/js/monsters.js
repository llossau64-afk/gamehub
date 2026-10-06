// The tower's bestiary: 40 monsters built from a creature kit (bipeds, beasts, flyers, fish, blobs,
// spirits, serpents, spiders, crabs, mimics). Every one is cel-shaded with an ink outline, glowing
// eyes and its own animation, and has a voice profile for its sounds.
import * as THREE from '../lib/three.module.min.js';
import { toon } from './characters.js';

// ---------------------------------------------------------------- definitions
// ai: runner | shooter | tank | dasher | splitter | flyer | bomber
// traits: swim (fast in water), fire (immune to lava)
// voice: growl | screech | bark | hiss | gurgle | roar | chitter | moan | clank | bubble | sizzle | zap | chime | caw | chomp | croak
export const BIOMES = [
  { id: 'dungeon', name: 'Dungeon', monsters: ['runner', 'shooter', 'splitter', 'dasher', 'tank'] },
  { id: 'sewers', name: 'Flooded Sewers', hazard: 'water', monsters: ['rat', 'piranha', 'jelly', 'croc', 'toad'] },
  { id: 'crypt', name: 'Haunted Crypt', monsters: ['skeleton', 'bat', 'watchman', 'hellhound', 'wraith'] },
  { id: 'forge', name: 'Lava Forge', hazard: 'lava', monsters: ['hellcat', 'cinder', 'lavaslug', 'salamander', 'magma'] },
  { id: 'abyss', name: 'The Abyss', hazard: 'water', monsters: ['eel', 'angler', 'puffer', 'shark', 'crab'] },
  { id: 'frozen', name: 'Frozen Spire', hazard: 'ice', monsters: ['icewolf', 'frostwisp', 'frostraven', 'icespider', 'yeti'] },
  { id: 'garden', name: 'Shadow Garden', monsters: ['shadowcat', 'raven', 'mandrake', 'puppet', 'thorn'] },
  { id: 'sky', name: 'Sky Sanctum', monsters: ['mimic', 'harpy', 'stormsprite', 'gargoyle', 'clockwork'] },
];

const M = (o) => o;
export const MONSTERS = {
  // ----- Dungeon
  runner: M({ name: 'Ghoul', ai: 'runner', plan: 'biped', hp: 18, speed: 4.1, r: 0.36, dmg: 2, coins: 1, cost: 1, weight: 3, voice: 'moan', pitch: 1,
    lore: 'A climber who never made it up. Fast, hungry and stupid. It crouches for a split second before it bites. That crouch is your window.',
    look: { skin: 0x7a9a6a, cloth: 0x4a3a40, eyes: 0xffe24a, hunch: 0.5, horns: 'nub', torso: [0.3, 0.32, 0.24], legs: 0.24, arms: 0.3, claws: true, rags: true } }),
  shooter: M({ name: 'Spitter', ai: 'shooter', plan: 'floater', hp: 20, speed: 2.6, r: 0.42, dmg: 2, coins: 2, cost: 2, weight: 2, voice: 'gurgle', pitch: 1.1,
    shot: { color: 0x9aff4a, n: 1 },
    lore: 'A floating eye wrapped in horns and tendrils. Its pupil flares before it spits acid. Your swing can cut the shots apart.',
    look: { core: 0xf4ead8, iris: 0x9aff4a, shell: 0x5a2a5a, horns: 'curl', tentacles: 5, eye: true } }),
  splitter: M({ name: 'Slime', ai: 'splitter', plan: 'blob', hp: 34, speed: 2.4, r: 0.46, dmg: 2, coins: 1, cost: 2, weight: 2, voice: 'bubble', pitch: 1,
    lore: 'Green ooze with a skull floating inside. Kill it and it splits in two. Kill it near a wall and the halves have nowhere to go.',
    look: { body: 0x7ad04a, inner: 0xe8e0c8, eyes: 0x1a2a0a, skull: true, horns: 'nub' } }),
  dasher: M({ name: 'Imp', ai: 'dasher', plan: 'biped', hp: 30, speed: 3.2, r: 0.4, dmg: 3, coins: 2, cost: 2.5, weight: 1.6, voice: 'screech', pitch: 1.2,
    lore: 'A red devil the size of a dog. It paints a line on the floor with its eyes, then charges along it. Step off the line.',
    look: { skin: 0xc8302a, cloth: 0x2a1418, eyes: 0xffe24a, horns: 'long', torso: [0.26, 0.26, 0.22], legs: 0.22, arms: 0.24, claws: true, wings: 'small', tail: true, hunch: 0.3 } }),
  tank: M({ name: 'Brute', ai: 'tank', plan: 'biped', hp: 85, speed: 1.75, r: 0.7, dmg: 4, coins: 4, cost: 4, weight: 1, voice: 'roar', pitch: 0.75,
    lore: 'An ogre in scrap armour. It raises both fists before every slam. Keep moving and it never lands a hit.',
    look: { skin: 0x8a6a5a, cloth: 0x3a3f48, eyes: 0xff6a2a, horns: 'big', torso: [0.62, 0.55, 0.5], legs: 0.3, arms: 0.5, fists: true, armor: true, hunch: 0.25 } }),
  // ----- Flooded Sewers
  rat: M({ name: 'Sewer Rat', ai: 'runner', plan: 'quad', hp: 12, speed: 5, r: 0.3, dmg: 1, coins: 1, cost: 0.6, weight: 3, voice: 'chitter', pitch: 1.5, traits: ['swim'],
    lore: 'Rats the size of cats, with tiny horns and red eyes. Never alone. Never quiet.',
    look: { body: 0x5a5048, belly: 0x8a7a6a, eyes: 0xff3a2a, horns: 'nub', ears: 'round', tail: 'thin', len: 0.5, legs: 0.14, snout: 0.6 } }),
  piranha: M({ name: 'Piranha', ai: 'runner', plan: 'fish', hp: 14, speed: 4.6, r: 0.3, dmg: 2, coins: 1, cost: 1, weight: 2.5, voice: 'chomp', pitch: 1.3, traits: ['swim'],
    lore: 'Swims through the air as easily as the water. All teeth. It lunges in short, vicious bursts.',
    look: { body: 0x4a6a8a, belly: 0xe8584a, eyes: 0xfff0a0, teeth: true, fins: 0x3a4a6a, len: 0.6 } }),
  jelly: M({ name: 'Volt Jelly', ai: 'shooter', plan: 'blob', hp: 24, speed: 2.2, r: 0.42, dmg: 2, coins: 2, cost: 2, weight: 2, voice: 'zap', pitch: 1, traits: ['swim'],
    shot: { color: 0x6ad8ff, n: 3, pattern: 'spread' },
    lore: 'A drifting bell of light. It hums louder and louder, then spits a spray of electric sparks.',
    look: { body: 0x6ad8ff, inner: 0xe0f8ff, eyes: 0x0a2a3a, jelly: true, tentacles: 6 } }),
  croc: M({ name: 'Sewer Croc', ai: 'dasher', plan: 'quad', hp: 40, speed: 2.8, r: 0.5, dmg: 3, coins: 3, cost: 3, weight: 1.5, voice: 'growl', pitch: 0.8, traits: ['swim'],
    lore: 'Low, armoured and patient. It lines up, marks its path and lunges with its jaws wide open.',
    look: { body: 0x4a6a3a, belly: 0xc8c08a, eyes: 0xffd24a, spikes: 6, tail: 'thick', len: 0.95, legs: 0.12, snout: 1.4, jaw: true, wide: 1.2 } }),
  toad: M({ name: 'Bog Toad', ai: 'tank', plan: 'blob', hp: 80, speed: 1.9, r: 0.62, dmg: 4, coins: 4, cost: 3.5, weight: 1, voice: 'croak', pitch: 0.8, traits: ['swim'],
    lore: 'A fat toad with horns and a hide like wet leather. It jumps and lands on whatever was standing there.',
    look: { body: 0x6a7a3a, inner: 0xc8b06a, eyes: 0xffb03a, toad: true, horns: 'big' } }),
  // ----- Haunted Crypt
  skeleton: M({ name: 'Skeleton', ai: 'runner', plan: 'biped', hp: 20, speed: 3.9, r: 0.36, dmg: 2, coins: 1, cost: 1, weight: 3, voice: 'clank', pitch: 1.3,
    lore: 'Bones held together by spite. It rattles as it runs and never stops until it is a pile on the floor.',
    look: { skin: 0xe8e0c8, cloth: 0x3a3440, eyes: 0x6ad8ff, bones: true, torso: [0.24, 0.3, 0.18], legs: 0.26, arms: 0.3, claws: true, helmet: 'broken', hunch: 0.15 } }),
  bat: M({ name: 'Crypt Bat', ai: 'flyer', plan: 'flyer', hp: 18, speed: 4.4, r: 0.36, dmg: 2, coins: 1, cost: 1.4, weight: 2.5, voice: 'screech', pitch: 1.8,
    lore: 'Circles overhead, shrieking, then dives along a marked line. Swing when it comes down.',
    look: { body: 0x3a2a3a, wing: 0x5a2a3a, eyes: 0xff3a3a, ears: 'bat', horns: 'nub', span: 0.9 } }),
  watchman: M({ name: 'Night Watchman', ai: 'shooter', plan: 'biped', hp: 34, speed: 2.4, r: 0.44, dmg: 2, coins: 3, cost: 2.5, weight: 1.6, voice: 'moan', pitch: 0.7,
    shot: { color: 0xffb347, n: 3, pattern: 'burst' },
    lore: 'A dead guard still walking his round. His lantern burns brighter before he throws its fire at you.',
    look: { skin: 0x9ab0b8, cloth: 0x2a3040, eyes: 0x8affd8, ghost: true, torso: [0.34, 0.4, 0.28], legs: 0.28, arms: 0.32, hat: true, lantern: true, cape: true, hunch: 0.1 } }),
  hellhound: M({ name: 'Hellhound', ai: 'dasher', plan: 'quad', hp: 34, speed: 3.6, r: 0.44, dmg: 3, coins: 2, cost: 2.5, weight: 2, voice: 'bark', pitch: 0.9,
    lore: 'A black dog with ram horns and a mane of embers. It barks once, marks its path and charges.',
    look: { body: 0x1e1a1e, belly: 0x3a2a2a, eyes: 0xff5a1a, horns: 'ram', ears: 'pointy', tail: 'thin', mane: 0xff6a1a, len: 0.75, legs: 0.24, snout: 0.9, jaw: true } }),
  wraith: M({ name: 'Wraith', ai: 'flyer', plan: 'floater', hp: 26, speed: 3.6, r: 0.42, dmg: 3, coins: 2, cost: 2, weight: 1.6, voice: 'moan', pitch: 1.4,
    lore: 'An empty hood that drifts through the crypt. It glides around you, then rushes straight through.',
    look: { shell: 0x2a2a40, core: 0x8affd8, hood: true, eyes: 0x8affd8 } }),
  // ----- Lava Forge
  hellcat: M({ name: 'Hellcat', ai: 'runner', plan: 'quad', hp: 22, speed: 4.6, r: 0.38, dmg: 2, coins: 2, cost: 1.2, weight: 3, voice: 'hiss', pitch: 1.2, traits: ['fire'],
    lore: 'A horned cat with burning paws. It hisses, crouches and pounces faster than you expect.',
    look: { body: 0x2a1a1a, belly: 0x5a2a1a, eyes: 0xffd24a, horns: 'long', ears: 'pointy', tail: 'thin', mane: 0xff7a2a, len: 0.6, legs: 0.2, snout: 0.5 } }),
  cinder: M({ name: 'Cinder Wisp', ai: 'shooter', plan: 'floater', hp: 22, speed: 2.8, r: 0.4, dmg: 2, coins: 2, cost: 2, weight: 2, voice: 'sizzle', pitch: 1, traits: ['fire'],
    shot: { color: 0xff7a2a, n: 1 },
    lore: 'A living ember in a cage of black rock. It spits fireballs and never stops burning.',
    look: { core: 0xffb347, shell: 0x2a1a16, iris: 0xffffff, flame: true, horns: 'curl' } }),
  lavaslug: M({ name: 'Lava Slug', ai: 'splitter', plan: 'blob', hp: 36, speed: 2.2, r: 0.46, dmg: 2, coins: 2, cost: 2, weight: 2, voice: 'sizzle', pitch: 0.7, traits: ['fire'],
    lore: 'Molten rock with a crust on top. Break it and two smaller, angrier slugs crawl out.',
    look: { body: 0x3a2018, inner: 0xff7a2a, eyes: 0xffe24a, lava: true, horns: 'nub' } }),
  salamander: M({ name: 'Salamander', ai: 'dasher', plan: 'quad', hp: 34, speed: 3.4, r: 0.42, dmg: 3, coins: 2, cost: 2.5, weight: 1.6, voice: 'hiss', pitch: 0.8, traits: ['fire'],
    lore: 'A fire lizard with a burning crest. It lines up and darts across the room in a straight line.',
    look: { body: 0xd8502a, belly: 0xffc04a, eyes: 0x1a0a0a, spikes: 7, mane: 0xffb347, tail: 'thick', len: 0.85, legs: 0.13, snout: 0.9, wide: 1 } }),
  magma: M({ name: 'Magma Golem', ai: 'tank', plan: 'biped', hp: 95, speed: 1.6, r: 0.72, dmg: 4, coins: 5, cost: 4.5, weight: 1, voice: 'roar', pitch: 0.6, traits: ['fire'],
    lore: 'Cooled rock around a molten heart. When it raises its fists, the cracks glow. Then the floor shakes.',
    look: { skin: 0x3a2a26, cloth: 0x2a1a16, eyes: 0xffb347, rock: true, lava: true, torso: [0.66, 0.58, 0.52], legs: 0.3, arms: 0.52, fists: true, horns: 'big', hunch: 0.2 } }),
  // ----- Abyss
  eel: M({ name: 'Volt Eel', ai: 'runner', plan: 'serpent', hp: 24, speed: 4.2, r: 0.36, dmg: 2, coins: 2, cost: 1.4, weight: 2.5, voice: 'zap', pitch: 1.3, traits: ['swim'],
    lore: 'A glowing ribbon of muscle. It slithers through the air and bites with a jolt.',
    look: { body: 0x2a3a5a, belly: 0x6ad8ff, eyes: 0xfff0a0, segs: 9 } }),
  angler: M({ name: 'Angler', ai: 'shooter', plan: 'fish', hp: 28, speed: 2.4, r: 0.46, dmg: 2, coins: 3, cost: 2.5, weight: 2, voice: 'gurgle', pitch: 0.7, traits: ['swim'],
    shot: { color: 0x8affd8, n: 1, pattern: 'aimed' },
    lore: 'A deep-sea horror with a glowing lure. Look at the light too long and it bites. Or shoots.',
    look: { body: 0x2a2a3a, belly: 0x4a3a4a, eyes: 0xd8ffea, teeth: true, lure: 0x8affd8, fins: 0x3a2a4a, len: 0.85, fat: 1.3 } }),
  puffer: M({ name: 'Bomb Puffer', ai: 'bomber', plan: 'fish', hp: 20, speed: 3, r: 0.4, dmg: 4, coins: 2, cost: 1.8, weight: 2, voice: 'bubble', pitch: 1.4, traits: ['swim'],
    lore: 'Swims up close, puffs up and explodes. Kill it before it gets there, or dash away when it swells.',
    look: { body: 0xd8c04a, belly: 0xf4e8b8, eyes: 0x1a1a1a, puffer: true, fins: 0xb8902a, len: 0.6, fat: 1.6 } }),
  shark: M({ name: 'Tower Shark', ai: 'dasher', plan: 'fish', hp: 44, speed: 3.2, r: 0.52, dmg: 4, coins: 3, cost: 3, weight: 1.5, voice: 'growl', pitch: 0.7, traits: ['swim'], fat: 0.8,
    lore: 'A shark that learned to swim through stone corridors. It circles, marks a line and rams.',
    look: { body: 0x5a6a7a, belly: 0xe8e8ea, eyes: 0xffffff, teeth: true, fins: 0x4a5a6a, len: 1.6, dorsal: true, fat: 0.85, scars: true } }),
  crab: M({ name: 'Iron Crab', ai: 'tank', plan: 'crab', hp: 90, speed: 1.9, r: 0.66, dmg: 4, coins: 5, cost: 4, weight: 1, voice: 'chitter', pitch: 0.7, traits: ['swim'],
    lore: 'A crab with a shell like a cooking pot and claws like anvils. It raises them, then brings them down.',
    look: { body: 0xb8402a, belly: 0xe8a07a, eyes: 0x1a1a1a } }),
  // ----- Frozen Spire
  icewolf: M({ name: 'Ice Wolf', ai: 'runner', plan: 'quad', hp: 22, speed: 4.8, r: 0.4, dmg: 2, coins: 2, cost: 1.2, weight: 3, voice: 'growl', pitch: 1.1,
    lore: 'Hunts in packs. White fur, frozen breath and horns of ice. Never let three of them reach you at once.',
    look: { body: 0xd8e6ee, belly: 0xa8c0d0, eyes: 0x6ad8ff, horns: 'ice', ears: 'pointy', tail: 'bushy', len: 0.75, legs: 0.24, snout: 0.9, jaw: true } }),
  frostwisp: M({ name: 'Frost Wisp', ai: 'shooter', plan: 'floater', hp: 24, speed: 2.6, r: 0.4, dmg: 2, coins: 2, cost: 2, weight: 2, voice: 'chime', pitch: 1,
    shot: { color: 0xbff3ff, n: 6, pattern: 'ring' },
    lore: 'A crystal heart wrapped in snow. It chimes, then bursts into a ring of icicles.',
    look: { core: 0xdff8ff, shell: 0x6ab8d8, crystal: true, iris: 0x2a7a9a } }),
  frostraven: M({ name: 'Frost Raven', ai: 'flyer', plan: 'flyer', hp: 22, speed: 4.4, r: 0.38, dmg: 2, coins: 2, cost: 1.6, weight: 2, voice: 'caw', pitch: 1,
    lore: 'Its feathers are ice. It circles high, calls once and dives.',
    look: { body: 0x6a8aa8, wing: 0xbfe4ff, eyes: 0xffffff, beak: 0xd8e0e8, feather: true, span: 1 } }),
  icespider: M({ name: 'Ice Spider', ai: 'dasher', plan: 'spider', hp: 30, speed: 3.6, r: 0.44, dmg: 3, coins: 2, cost: 2.3, weight: 1.6, voice: 'chitter', pitch: 1.1,
    lore: 'Eight legs of glass. It skitters sideways, marks a line and shoots across the floor.',
    look: { body: 0x9ad8f0, belly: 0xdff8ff, eyes: 0x2a5aff } }),
  yeti: M({ name: 'Yeti', ai: 'tank', plan: 'biped', hp: 100, speed: 1.8, r: 0.72, dmg: 4, coins: 5, cost: 4.5, weight: 1, voice: 'roar', pitch: 0.65,
    lore: 'A mountain of white fur with horns like a ram. It beats its chest, then crushes the ground.',
    look: { skin: 0x5a6a8a, cloth: 0xe8eef2, eyes: 0x6ad8ff, fur: true, horns: 'ram', torso: [0.66, 0.6, 0.52], legs: 0.3, arms: 0.55, fists: true, hunch: 0.35 } }),
  // ----- Shadow Garden
  shadowcat: M({ name: 'Shadow Cat', ai: 'runner', plan: 'quad', hp: 24, speed: 4.8, r: 0.38, dmg: 2, coins: 2, cost: 1.3, weight: 3, voice: 'hiss', pitch: 1.4,
    lore: 'Pure black with violet eyes and a forked tail. You only see it when it is already pouncing.',
    look: { body: 0x141218, belly: 0x2a2234, eyes: 0xc87aff, horns: 'long', ears: 'pointy', tail: 'fork', len: 0.6, legs: 0.2, snout: 0.5 } }),
  raven: M({ name: 'Grave Raven', ai: 'flyer', plan: 'flyer', hp: 22, speed: 4.6, r: 0.38, dmg: 2, coins: 2, cost: 1.6, weight: 2.5, voice: 'caw', pitch: 0.85,
    lore: 'A raven with a crown of horns. It caws before every dive.',
    look: { body: 0x1a1820, wing: 0x2a2434, eyes: 0xff3a6a, beak: 0x3a3440, horns: 'nub', feather: true, span: 1 } }),
  mandrake: M({ name: 'Mandrake', ai: 'splitter', plan: 'blob', hp: 34, speed: 2.5, r: 0.44, dmg: 2, coins: 2, cost: 2, weight: 2, voice: 'screech', pitch: 1.6,
    lore: 'A root with a screaming face. Cut it and two seedlings scream instead.',
    look: { body: 0xb08a5a, inner: 0x6a8a3a, eyes: 0x1a0a0a, leaves: 0x5aa04a, mouth: true } }),
  puppet: M({ name: 'Bomb Puppet', ai: 'bomber', plan: 'biped', hp: 22, speed: 3.4, r: 0.38, dmg: 4, coins: 2, cost: 2, weight: 2, voice: 'clank', pitch: 1.6,
    lore: 'A wooden marionette with a fuse in its head. It runs at you laughing and blows itself up.',
    look: { skin: 0xc89a6a, cloth: 0x8a2a3a, eyes: 0x1a1a1a, puppet: true, torso: [0.26, 0.3, 0.2], legs: 0.24, arms: 0.26, fuse: true, hunch: 0 } }),
  thorn: M({ name: 'Thorn Beast', ai: 'tank', plan: 'quad', hp: 95, speed: 1.8, r: 0.7, dmg: 4, coins: 5, cost: 4.5, weight: 1, voice: 'roar', pitch: 0.8,
    lore: 'Half boar, half bramble. Its back is a forest of thorns. It rears up, then stamps the ground flat.',
    look: { body: 0x3a2a24, belly: 0x5a4a3a, eyes: 0xd8ff4a, horns: 'tusk', spikes: 10, thorns: 0x5aa04a, tail: 'thin', len: 0.95, legs: 0.26, snout: 0.8, wide: 1.35, big: 1.4 } }),
  // ----- Sky Sanctum
  mimic: M({ name: 'Mimic', ai: 'runner', plan: 'mimic', hp: 30, speed: 3.8, r: 0.42, dmg: 3, coins: 6, cost: 1.8, weight: 1.5, voice: 'chomp', pitch: 1,
    lore: 'Looks like a treasure chest until it grows legs and teeth. Drops a lot of coins, if you survive it.',
    look: { body: 0x8a5a32, trim: 0xd8a83a, eyes: 0xffe24a } }),
  harpy: M({ name: 'Harpy', ai: 'flyer', plan: 'flyer', hp: 26, speed: 4.4, r: 0.4, dmg: 3, coins: 2, cost: 2, weight: 2, voice: 'screech', pitch: 1.1,
    lore: 'Half woman, half hawk, all claws. She screams before she dives.',
    look: { body: 0xb8906a, wing: 0x8a5a3a, eyes: 0xffd24a, beak: 0xd8b06a, feather: true, horns: 'long', span: 1.2, hair: 0x5a2a3a } }),
  stormsprite: M({ name: 'Storm Sprite', ai: 'shooter', plan: 'floater', hp: 26, speed: 3, r: 0.4, dmg: 2, coins: 2, cost: 2, weight: 2, voice: 'zap', pitch: 1.2,
    shot: { color: 0xe8f0ff, n: 2, pattern: 'spread' },
    lore: 'A tiny thundercloud with a temper. It crackles, then throws twin bolts.',
    look: { core: 0xe8f6ff, shell: 0x5a6a8a, cloud: true, iris: 0x3a5aff } }),
  gargoyle: M({ name: 'Gargoyle', ai: 'flyer', plan: 'flyer', hp: 50, speed: 3.4, r: 0.52, dmg: 4, coins: 4, cost: 3, weight: 1.2, voice: 'roar', pitch: 0.9,
    lore: 'A statue that woke up. Heavy stone wings, heavy stone fists. When it dives, the floor cracks.',
    look: { body: 0x7a7a80, wing: 0x5a5a62, eyes: 0xff6a2a, horns: 'big', ears: 'bat', span: 1.4, stone: true } }),
  clockwork: M({ name: 'Clockwork Knight', ai: 'tank', plan: 'biped', hp: 100, speed: 1.9, r: 0.7, dmg: 4, coins: 5, cost: 4.5, weight: 1, voice: 'clank', pitch: 0.7,
    lore: 'Brass, gears and a key turning in its back. It winds up, then hammers the floor.',
    look: { skin: 0xc8902a, cloth: 0x5a4a3a, eyes: 0x6ad8ff, metal: true, key: true, torso: [0.6, 0.6, 0.5], legs: 0.3, arms: 0.52, fists: true, helmet: 'knight', hunch: 0.05 } }),
};
// Splitter babies keep their parent's look, smaller.
MONSTERS.splitling = { ...MONSTERS.splitter, name: 'Slimeling', mini: true, lore: 'Small, quick and weak. One hit is usually enough.' };
for (const id in MONSTERS) MONSTERS[id].id = id;
export const biomeOf = id => BIOMES.find(b => b.monsters.includes(id));

// ---------------------------------------------------------------- kit
const INK = new THREE.MeshBasicMaterial({ color: 0x0b0a0e, side: THREE.BackSide });
const gc = new Map();
const G = (k, f) => { if (!gc.has(k)) gc.set(k, f()); return gc.get(k); };
const sph = (r, w = 14, h = 10) => G(`s${r}${w}`, () => new THREE.SphereGeometry(r, w, h));
const cap = (r, l) => G(`c${r}${l}`, () => new THREE.CapsuleGeometry(r, l, 5, 12));
const cone = (r, h, s = 8) => G(`o${r}${h}${s}`, () => new THREE.ConeGeometry(r, h, s));
const cyl = (a, b, h, s = 12) => G(`y${a}${b}${h}${s}`, () => new THREE.CylinderGeometry(a, b, h, s));
let _soft;
function softTex() {
  if (_soft) return _soft;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  _soft = new THREE.CanvasTexture(c); _soft.colorSpace = THREE.SRGBColorSpace; return _soft;
}

class Kit {
  constructor() { this.mats = []; this.eyeGroups = []; }
  mat(c, o = {}) { const m = toon(c, { emissive: 0xffffff, ei: 0, ...o }); m.userData.baseEm = o.emissive; this.mats.push(m); return m; }
  glow(c) { return new THREE.MeshBasicMaterial({ color: c }); }
  part(geo, mat, parent, x = 0, y = 0, z = 0, ink = 0.06) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m);
    if (ink) { const o = new THREE.Mesh(geo, INK); o.scale.setScalar(1 + ink); m.add(o); }
    return m;
  }
  group(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  // glowing eyes with a soft halo: the signature of every monster in the tower
  eyes(parent, x, y, z, gap, size, color, slant = 0.25, halo = 1) {
    const g = this.group(parent, x, y, z);
    const geo = G(`eye${size}`, () => { const e = new THREE.SphereGeometry(size, 10, 8); e.scale(1.3, 0.75, 0.6); return e; });
    const mat = this.glow(color);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(geo, mat); e.position.set(s * gap, 0, 0); e.rotation.z = -s * slant; g.add(e);
      if (halo) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(size * 6 * halo); sp.position.set(s * gap, 0, size * 0.6); g.add(sp); }
    }
    this.eyeGroups.push(g);
    return g;
  }
  // curved horns built from tapering segments (same technique as Argus' horns)
  horns(parent, x, y, z, style, color = 0xe8dcc4, scale = 1) {
    if (!style) return;
    const mat = this.mat(color);
    const cfg = { nub: [2, 0.07, 0.1, 0.3, 0.2], long: [3, 0.06, 0.13, 0.35, 0.45], big: [3, 0.1, 0.16, 0.5, 0.6], curl: [4, 0.06, 0.1, 0.9, 0.3], ram: [4, 0.09, 0.11, 1.1, 0.1], ice: [3, 0.06, 0.15, 0.2, 0.3], tusk: [2, 0.07, 0.16, -0.6, 0.0] }[style];
    const [n, r0, len, bend, splay] = cfg;
    const m = style === 'ice' ? this.mat(0xcff4ff, { emissive: 0x2a7a9a, ei: 0.5 }) : mat;
    for (const sx of [-1, 1]) {
      let p = this.group(parent, x * sx, y, z);
      p.rotation.z = -sx * (0.35 + splay); p.rotation.x = style === 'tusk' ? 1.4 : -0.15;
      p.scale.setScalar(scale);
      let r = r0;
      for (let k = 0; k < n; k++) {
        this.part(cyl(r * 0.68, r, len, 7), m, p, 0, len / 2, 0, 0.1);
        const nx = this.group(p, 0, len, 0);
        nx.rotation.z = -sx * bend * 0.45; nx.rotation.x = style === 'ram' ? -0.6 : -0.1;
        p = nx; r *= 0.68;
      }
      this.part(cone(r, len * 0.9, 6), m, p, 0, len * 0.45, 0, 0.1);
    }
  }
  ears(parent, x, y, z, style, mat, inner) {
    if (!style) return;
    for (const sx of [-1, 1]) {
      const e = this.group(parent, sx * x, y, z);
      if (style === 'round') { this.part(sph(0.09, 10, 8), mat, e, 0, 0.05, 0).scale.set(1, 1, 0.35); }
      else if (style === 'bat') { const c = this.part(cone(0.1, 0.32, 4), mat, e, 0, 0.14, 0); c.scale.z = 0.35; e.rotation.z = -sx * 0.45; }
      else { const c = this.part(cone(0.08, 0.22, 4), mat, e, 0, 0.1, 0); c.scale.z = 0.5; e.rotation.z = -sx * 0.25; if (inner) this.part(cone(0.045, 0.14, 4), inner, e, 0, 0.08, 0.03, 0).scale.z = 0.3; }
    }
  }
  // tail / tentacle / cloth chain
  chain(parent, x, y, z, n, len, r, mat, dirY = 0) {
    const segs = []; let p = parent;
    for (let k = 0; k < n; k++) {
      const s = this.group(p, k ? 0 : x, k ? 0 : y, k ? -len : z);
      if (!k && dirY) s.rotation.x = dirY;
      const rr = r * (1 - k / (n + 1) * 0.8);
      this.part(G(`ch${rr.toFixed(3)}${len}`, () => { const g = new THREE.CapsuleGeometry(rr, len, 3, 8); g.rotateX(Math.PI / 2); g.translate(0, 0, -len / 2); return g; }), mat, s, 0, 0, 0, 0.08);
      segs.push(s); p = s;
    }
    return segs;
  }
  // two-segment limb: returns { hip, knee } groups for the gait
  limb(parent, x, y, z, upper, lower, r, mat, foot, footMat) {
    const hip = this.group(parent, x, y, z);
    this.part(G(`lu${upper}${r}`, () => { const g = new THREE.CapsuleGeometry(r, upper, 3, 8); g.translate(0, -upper / 2, 0); return g; }), mat, hip, 0, 0, 0, 0.08);
    const knee = this.group(hip, 0, -upper, 0);
    this.part(G(`ll${lower}${r}`, () => { const g = new THREE.CapsuleGeometry(r * 0.85, lower, 3, 8); g.translate(0, -lower / 2, 0); return g; }), mat, knee, 0, 0, 0, 0.08);
    if (foot === 'claw') for (let k = -1; k <= 1; k++) { const c = this.part(cone(r * 0.35, r * 1.6, 5), footMat || mat, knee, k * r * 0.6, -lower - r * 0.2, r * 0.6, 0); c.rotation.x = Math.PI / 2 + 0.4; }
    else if (foot === 'paw') this.part(sph(r * 1.25, 8, 6), footMat || mat, knee, 0, -lower - r * 0.3, r * 0.4, 0.08).scale.set(1, 0.6, 1.3);
    else if (foot === 'hoof') this.part(cyl(r * 1.05, r * 1.2, r * 1.2, 8), footMat || this.mat(0x1a1416), knee, 0, -lower - r * 0.4, 0, 0.06);
    else if (foot === 'boot') this.part(sph(r * 1.4, 8, 6), footMat || mat, knee, 0, -lower - r * 0.4, r * 0.5, 0.08).scale.set(1, 0.6, 1.5);
    return { hip, knee };
  }
  wing(parent, side, span, boneMat, skinColor, feather) {
    const w = this.group(parent, side * 0.15, 0, 0);
    const memb = new THREE.MeshToonMaterial({ color: skinColor, gradientMap: boneMat.gradientMap, side: THREE.DoubleSide });
    memb.emissive = new THREE.Color(0xffffff); memb.emissiveIntensity = 0; this.mats.push(memb);
    if (feather) {
      for (let k = 0; k < 5; k++) {
        const f = this.part(G(`fe${span}`, () => { const g = new THREE.SphereGeometry(0.1, 8, 6); g.scale(0.55, 0.18, 2.6); g.translate(0, 0, -0.18); return g; }), memb, w, side * (0.12 + k * span * 0.16), 0, 0.02 - k * 0.02, 0.06);
        f.rotation.y = side * (0.4 + k * 0.25); f.scale.setScalar(0.8 + k * 0.08 * span);
      }
      this.part(cap(0.05, span * 0.6), boneMat, w, side * span * 0.3, 0, 0, 0.08).rotation.z = Math.PI / 2;
    } else {
      // bat membrane: an arm bone, three finger bones and the skin stretched between them
      const pts = [[0, 0], [span * 0.45, 0.25], [span, 0.05], [span * 0.8, -0.3], [span * 0.5, -0.38], [span * 0.25, -0.3], [0.05, -0.2]];
      const shape = new THREE.Shape(); shape.moveTo(0, 0); for (const [a, b] of pts) shape.lineTo(a, b); shape.lineTo(0, 0);
      const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, memb); m.scale.x = side; w.add(m);
      for (const [a, b] of [[span * 0.45, 0.25], [span, 0.05], [span * 0.8, -0.3], [span * 0.5, -0.38]]) {
        const len = Math.hypot(a, b), bone = this.part(G(`wb${len.toFixed(2)}`, () => { const g = new THREE.CylinderGeometry(0.018, 0.028, len, 5); g.rotateZ(Math.PI / 2); g.translate(len / 2, 0, 0); return g; }), boneMat, w, 0, 0.01, 0, 0);
        bone.rotation.y = Math.atan2(b, a) * side; bone.scale.x = side;
      }
      this.part(cone(0.03, 0.12, 5), this.mat(0xe8dcc4), w, side * span * 0.45, 0, -0.25, 0).rotation.x = -Math.PI / 2;
    }
    return w;
  }
  spikes(parent, n, z0, z1, y, size, mat, curve = 0) {
    for (let k = 0; k < n; k++) { const t = n > 1 ? k / (n - 1) : 0.5; const s = this.part(cone(size * 0.4, size * (1 - Math.abs(t - 0.4) * 0.6), 5), mat, parent, 0, y + Math.sin(t * Math.PI) * curve, z0 + (z1 - z0) * t, 0.08); s.rotation.x = -0.4; }
  }
}

// ---------------------------------------------------------------- body plans
function biped(k, d, root, L) {
  const rig = k.group(root);
  const skin = k.mat(L.skin), cloth = k.mat(L.cloth), dark = k.mat(new THREE.Color(L.cloth).multiplyScalar(0.6).getHex());
  const [tw, th, tdp] = L.torso, legL = L.legs, armL = L.arms;
  const parts = { rig };
  const hipY = legL * 2 + 0.06;
  const pelvis = k.group(rig, 0, hipY, 0); parts.pelvis = pelvis;
  const torso = k.group(pelvis, 0, 0.04, 0); torso.rotation.x = L.hunch || 0; parts.torso = torso;
  const bodyMat = L.ghost ? k.mat(L.cloth, { opacity: 0.85 }) : L.bones ? skin : cloth;
  if (L.bones) {
    k.part(cyl(0.05, 0.05, th, 6), skin, torso, 0, th / 2, 0, 0.08);
    for (let i = 0; i < 3; i++) k.part(G(`rib${tw}`, () => new THREE.TorusGeometry(tw * 0.75, 0.03, 4, 12, Math.PI * 1.4)), skin, torso, 0, th * (0.45 + i * 0.18), 0, 0).rotation.set(Math.PI / 2, 0, Math.PI * 0.8);
    k.part(cyl(tw * 0.6, tw * 0.5, 0.1, 10), skin, torso, 0, 0.02, 0, 0.08);
  } else {
    const body = k.part(G(`bt${tw}${th}`, () => { const g = new THREE.SphereGeometry(1, 16, 12); g.scale(tw, th * 0.62, tdp); g.translate(0, th * 0.5, 0); return g; }), L.rags || L.fur || L.rock || L.metal ? skin : bodyMat, torso, 0, 0, 0, 0.05);
    parts.body = body;
    if (L.rags) { k.part(G(`rag${tw}`, () => new THREE.CylinderGeometry(tw * 0.95, tw * 1.05, th * 0.55, 10, 1, true)), new THREE.MeshToonMaterial({ color: L.cloth, gradientMap: skin.gradientMap, side: THREE.DoubleSide }), torso, 0, th * 0.28, 0); }
    if (L.fur) { for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; k.part(sph(tw * 0.32, 8, 6), cloth, torso, Math.sin(a) * tw * 0.8, th * (0.55 + (i % 3) * 0.12), Math.cos(a) * tdp * 0.8, 0.05); } }
    if (L.armor || L.metal) {
      const steel = L.metal ? k.mat(0xd8a83a, { emissive: 0x3a2400, ei: 0.4 }) : k.mat(0x5a606a);
      k.part(G(`ap${tw}`, () => { const g = new THREE.SphereGeometry(1, 14, 10, -Math.PI / 2, Math.PI, 0.25, 1.9); g.scale(tw * 1.04, th * 0.6, tdp * 1.08); g.translate(0, th * 0.5, 0); return g; }), steel, torso, 0, 0, 0, 0.04);
      for (const sx of [-1, 1]) { const pa = k.part(G(`pa${tw}`, () => new THREE.SphereGeometry(tw * 0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), steel, torso, sx * tw * 0.95, th * 0.86, 0, 0.05); pa.rotation.z = -sx * 0.5; k.spikes(pa, 2, -0.05, 0.08, tw * 0.3, tw * 0.5, k.mat(0x2a2a30)); }
      if (L.key) { const key = k.group(torso, 0, th * 0.6, -tdp - 0.05); parts.key = key; k.part(cyl(0.04, 0.04, 0.3, 6), steel, key, 0, 0, -0.1, 0).rotation.x = Math.PI / 2; k.part(G('keyb', () => new THREE.TorusGeometry(0.12, 0.035, 6, 12)), steel, key, 0, 0, -0.28, 0.06); }
    }
    if (L.rock) { for (let i = 0; i < 6; i++) k.part(G('lc' + i, () => new THREE.BoxGeometry(0.04, th * 0.4, 0.02)), k.glow(0xff7a2a), torso, (i - 2.5) * tw * 0.28, th * 0.45, tdp * 0.98, 0).rotation.z = (i % 2 ? 0.4 : -0.4); }
    if (L.puppet) {
      for (const sx of [-1, 1]) k.part(sph(0.05, 8, 6), k.mat(0xd8a83a), torso, sx * tw * 0.7, th * 0.9, 0, 0);
      k.part(G('pbelt', () => new THREE.TorusGeometry(tw * 0.9, 0.03, 6, 16)), k.mat(0xd8a83a), torso, 0, th * 0.35, 0, 0).rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) k.part(sph(0.03, 6, 5), k.mat(0xf4ecd8), torso, 0, th * (0.5 + i * 0.15), tdp * 0.95, 0);
      const bar = k.group(torso, 0, th + 1.0, 0); parts.bar = bar;
      k.part(G('pbar', () => new THREE.BoxGeometry(0.6, 0.04, 0.04)), k.mat(0x6a4a2a), bar, 0, 0, 0, 0.1);
      k.part(G('pbar2', () => new THREE.BoxGeometry(0.04, 0.04, 0.4)), k.mat(0x6a4a2a), bar, 0, 0, 0, 0.1);
      const sm = k.glow(0xd8d0c0);
      for (const [x, z, l] of [[-0.28, 0, 0.75], [0.28, 0, 0.75], [0, 0.18, 0.55]]) k.part(G('str' + l, () => new THREE.CylinderGeometry(0.004, 0.004, l, 3)), sm, bar, x, -l / 2, z, 0);
    }
    if (L.cape) { parts.cape = k.chain(torso, 0, th * 0.85, -tdp * 0.9, 4, 0.18, 0.12, dark); }
  }
  // head
  const hs = Math.max(0.18, tw * 0.62);
  const head = k.group(torso, 0, th + hs * 0.55, L.hunch ? 0.08 : 0); parts.head = head;
  if (L.puppet) {
    k.part(sph(hs, 14, 10), skin, head, 0, 0, 0, 0.06);
    for (const sx of [-1, 1]) k.part(sph(hs * 0.18, 8, 6), k.mat(0xd84a5a), head, sx * hs * 0.55, -hs * 0.2, hs * 0.75, 0).scale.z = 0.3;
    const grin = k.part(G('grin', () => new THREE.TorusGeometry(hs * 0.38, hs * 0.05, 4, 12, Math.PI)), k.mat(0x1a0a0a), head, 0, -hs * 0.25, hs * 0.86, 0); grin.rotation.z = Math.PI;
    k.part(G('jl', () => new THREE.BoxGeometry(0.01, hs * 0.5, 0.01)), k.mat(0x3a2a1a), head, hs * 0.38, -hs * 0.45, hs * 0.8, 0);
    k.part(G('jl', () => null), k.mat(0x3a2a1a), head, -hs * 0.38, -hs * 0.45, hs * 0.8, 0);
  }
  else if (L.bones) { k.part(sph(hs, 14, 10), skin, head, 0, 0.02, 0, 0.06).scale.set(1, 1.05, 1); const jaw = k.group(head, 0, -hs * 0.45, hs * 0.2); k.part(G(`skj${hs}`, () => new THREE.BoxGeometry(hs * 1.1, hs * 0.35, hs * 0.8)), skin, jaw, 0, 0, 0.05, 0.06); parts.jaw = jaw; }
  else {
    const hm = L.ghost ? k.mat(L.skin, { opacity: 0.85 }) : skin;
    k.part(sph(hs, 16, 12), hm, head, 0, 0, 0, 0.06).scale.set(1.05, 0.95, 1);
    const jaw = k.group(head, 0, -hs * 0.35, hs * 0.25); parts.jaw = jaw;
    k.part(G(`jw${hs}`, () => { const g = new THREE.SphereGeometry(hs * 0.7, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55); return g; }), hm, jaw, 0, 0, 0, 0.06);
    if (!L.ghost) for (const sx of [-1, 1]) k.part(cone(0.03, 0.1, 5), k.mat(0xf4ecd8), jaw, sx * hs * 0.35, hs * 0.12, hs * 0.5, 0).rotation.x = 0.2;
  }
  k.eyes(head, 0, hs * 0.12, hs * 0.85, hs * 0.38, hs * 0.17, L.puppet ? 0xff3a2a : L.eyes, L.puppet ? -0.2 : 0.35, 1);
  if (L.helmet === 'knight' || L.hat) {
    const hm = L.helmet === 'knight' ? k.mat(0xd8a83a, { emissive: 0x3a2400, ei: 0.4 }) : k.mat(0x1a1c24);
    if (L.hat) { k.part(cyl(hs * 1.5, hs * 1.5, 0.04, 16), hm, head, 0, hs * 0.55, 0, 0.05); k.part(cyl(hs * 0.75, hs * 0.85, hs * 0.9, 14), hm, head, 0, hs * 1.0, 0, 0.05); }
    else { k.part(G(`kh${hs}`, () => new THREE.SphereGeometry(hs * 1.08, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62)), hm, head, 0, 0.02, 0, 0.05); k.part(G('crest', () => new THREE.BoxGeometry(0.04, 0.16, 0.4)), hm, head, 0, hs * 1.05, 0, 0.06); }
  }
  if (L.helmet === 'broken') { const hm = k.mat(0x6a6a72); k.part(G(`bh${hs}`, () => new THREE.SphereGeometry(hs * 1.08, 12, 8, 0.4, Math.PI * 1.5, 0, Math.PI * 0.5)), hm, head, 0, 0.02, 0, 0.05); }
  k.horns(head, hs * 0.55, hs * 0.55, 0, L.horns, L.rock ? 0x2a1a16 : 0xe8dcc4, hs * 2.2);
  if (L.fuse) { k.part(cyl(0.02, 0.02, 0.16, 5), k.mat(0x2a2a2a), head, 0, hs + 0.08, 0, 0); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(0.25); sp.position.y = hs + 0.18; head.add(sp); parts.fuse = sp; }
  // arms
  parts.arms = [];
  for (const sx of [-1, 1]) {
    const a = k.limb(torso, sx * (tw + 0.04), th * 0.85, 0, armL * 0.55, armL * 0.5, Math.max(0.05, tw * 0.17), L.bones ? skin : L.fur ? cloth : skin, L.claws ? 'claw' : null);
    a.hip.rotation.z = sx * 0.25;
    if (L.fists) k.part(sph(tw * 0.32, 10, 8), L.metal ? k.mat(0xd8a83a) : L.rock ? skin : k.mat(L.skin), a.knee, 0, -armL * 0.5 - tw * 0.15, 0, 0.06);
    parts.arms.push(a);
  }
  if (L.lantern) {
    const ln = k.group(parts.arms[1].knee, 0, -armL * 0.55, 0.05);
    k.part(cyl(0.08, 0.1, 0.18, 6), k.mat(0x2a2a30), ln, 0, -0.1, 0, 0.06);
    k.part(sph(0.07, 8, 6), k.glow(0xffb347), ln, 0, -0.1, 0, 0);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xffb347, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(0.8); sp.position.y = -0.1; ln.add(sp); parts.lantern = sp;
    const sp2 = k.part(cyl(0.02, 0.02, 1.4, 5), k.mat(0x3a2a20), parts.arms[0].knee, 0, -armL * 0.4, 0.05, 0); sp2.rotation.x = 1.3;
    k.part(cone(0.05, 0.2, 4), k.mat(0xb8c0c8), sp2, 0, 0.75, 0, 0.06);
  }
  // legs
  parts.legs = [];
  for (const sx of [-1, 1]) parts.legs.push(k.limb(pelvis, sx * tw * 0.45, 0, 0, legL, legL, Math.max(0.055, tw * 0.2), L.bones ? skin : L.fur ? cloth : L.ghost ? k.mat(L.cloth, { opacity: 0.6 }) : dark, L.claws && !L.armor ? 'claw' : 'boot', L.bones ? skin : null));
  if (L.tail) parts.tail = k.chain(pelvis, 0, 0.05, -tw * 0.6, 5, 0.12, 0.045, skin, -0.6);
  if (L.wings) { parts.wings = [k.wing(torso, -1, 0.45, skin, 0x5a1a1a), k.wing(torso, 1, 0.45, skin, 0x5a1a1a)]; parts.wings.forEach((w, i) => { w.position.set(0, th * 0.8, -tdp * 0.8); w.rotation.y = (i ? -1 : 1) * 0.5; }); }
  return { parts, height: hipY + th + hs * 2, anim: animBiped };
}

function quad(k, d, root, L) {
  const rig = k.group(root);
  const big = L.big || 1;
  const bm = k.mat(L.body), belly = k.mat(L.belly), dark = k.mat(new THREE.Color(L.body).multiplyScalar(0.6).getHex());
  const len = L.len * big, lg = L.legs * big, wd = (L.wide || 1) * 0.22 * big;
  const parts = { rig, legs: [] };
  const bodyY = lg * 2 + wd * 0.9;
  const body = k.group(rig, 0, bodyY, 0); parts.body = body;
  k.part(G(`qb${len}${wd}`, () => { const g = new THREE.CapsuleGeometry(wd, len * 0.6, 5, 12); g.rotateX(Math.PI / 2); return g; }), bm, body, 0, 0, 0, 0.05).scale.set(1, 0.9, 1);
  k.part(G(`qbe${len}${wd}`, () => { const g = new THREE.CapsuleGeometry(wd * 0.85, len * 0.5, 5, 10); g.rotateX(Math.PI / 2); return g; }), belly, body, 0, -wd * 0.25, 0.02, 0).scale.set(0.9, 0.8, 1);
  // head on a neck
  const neck = k.group(body, 0, wd * 0.4, len * 0.5); parts.neck = neck;
  const hs = wd * 0.95 * (L.snout > 1.2 ? 0.9 : 1);
  const head = k.group(neck, 0, wd * 0.3, hs * 0.6); parts.head = head;
  k.part(sph(hs, 14, 10), bm, head, 0, 0, 0, 0.06);
  const snout = k.part(G(`sn${hs}${L.snout}`, () => { const g = new THREE.SphereGeometry(hs * 0.6, 10, 8); g.scale(1, 0.75, 1.2 * L.snout); return g; }), bm, head, 0, -hs * 0.2, hs * (0.55 + L.snout * 0.35), 0.06);
  k.part(sph(hs * 0.14, 6, 5), k.mat(0x1a1214), head, 0, -hs * 0.05, hs * (0.6 + L.snout * 0.75), 0);
  if (L.jaw || true) {
    const jaw = k.group(head, 0, -hs * 0.45, hs * 0.2); parts.jaw = jaw;
    k.part(G(`qj${hs}${L.snout}`, () => { const g = new THREE.SphereGeometry(hs * 0.5, 10, 6); g.scale(0.95, 0.4, 1.1 * L.snout); g.translate(0, 0, hs * 0.55 * L.snout); return g; }), dark, jaw, 0, 0, 0, 0.06);
    const tooth = k.mat(0xf4ecd8);
    for (const sx of [-1, 1]) for (let i = 0; i < (L.snout > 1.2 ? 4 : 1); i++) k.part(cone(hs * 0.06, hs * 0.22, 4), tooth, head, sx * hs * 0.32, -hs * 0.36, hs * (0.5 + L.snout * 0.6 - i * 0.18), 0).rotation.x = Math.PI;
  }
  k.eyes(head, 0, hs * 0.25, hs * 0.72, hs * 0.42, hs * 0.18, L.eyes, 0.35);
  k.ears(head, hs * 0.55, hs * 0.65, -hs * 0.1, L.ears, bm, k.mat(0xc87a7a));
  k.horns(head, hs * 0.5, hs * 0.55, -hs * 0.1, L.horns, L.horns === 'ice' ? 0xcff4ff : L.horns === 'tusk' ? 0xf4ecd8 : 0xe8dcc4, hs * 2.2);
  if (L.mane) { const mm = k.glow(L.mane); for (let i = 0; i < 7; i++) { const c = k.part(cone(hs * 0.18, hs * 0.7, 5), mm, neck, (i % 2 ? 1 : -1) * hs * 0.15, hs * 0.6, -i * len * 0.07, 0); c.rotation.x = -0.9; } }
  if (L.spikes) k.spikes(body, L.spikes, len * 0.4, -len * 0.45, wd * 0.8, wd * 0.6, L.thorns ? k.mat(L.thorns) : dark, wd * 0.15);
  // legs: front pair + back pair
  const lr = Math.max(0.045, wd * 0.28);
  for (const [z, front] of [[len * 0.36, true], [-len * 0.36, false]]) for (const sx of [-1, 1]) {
    const l = k.limb(body, sx * wd * 0.75, -wd * 0.3, z, lg, lg, lr, bm, L.ears === 'pointy' || L.ears === 'round' ? 'paw' : 'claw', dark);
    l.front = front; l.side = sx; parts.legs.push(l);
  }
  if (L.tail) {
    const tn = L.tail === 'thick' ? 6 : 5, tr = L.tail === 'thick' ? wd * 0.5 : L.tail === 'bushy' ? wd * 0.4 : wd * 0.16;
    parts.tail = k.chain(body, 0, wd * 0.2, -len * 0.55, tn, len * 0.16, tr, L.tail === 'bushy' ? belly : bm, L.tail === 'thick' ? 0.1 : -0.5);
    if (L.tail === 'fork') { const t = parts.tail[parts.tail.length - 1]; for (const sx of [-1, 1]) k.part(cone(0.04, 0.16, 4), bm, t, sx * 0.06, 0, -0.12, 0).rotation.x = -Math.PI / 2; }
  }
  return { parts, height: bodyY + hs * 1.6, anim: animQuad };
}

function flyer(k, d, root, L) {
  const rig = k.group(root, 0, 0, 0);
  const span = L.span || 1;
  const bm = k.mat(L.body), bone = k.mat(new THREE.Color(L.body).multiplyScalar(0.7).getHex());
  const parts = { rig, floatY: 1.1 };
  const body = k.group(rig, 0, 1.1, 0); parts.body = body;
  k.part(G(`fb${L.stone ? 1 : 0}`, () => { const g = new THREE.SphereGeometry(0.24, 14, 10); g.scale(0.9, 1, 1.15); return g; }), bm, body, 0, 0, 0, 0.06);
  const head = k.group(body, 0, 0.16, 0.22); parts.head = head;
  k.part(sph(0.17, 12, 10), bm, head, 0, 0, 0, 0.06);
  if (L.beak) { const b = k.part(cone(0.07, 0.24, 6), k.mat(L.beak), head, 0, -0.03, 0.2, 0.08); b.rotation.x = Math.PI / 2; }
  else { const jaw = k.group(head, 0, -0.08, 0.06); parts.jaw = jaw; k.part(G('fj', () => { const g = new THREE.SphereGeometry(0.1, 8, 6); g.scale(1, 0.4, 1); return g; }), bone, jaw, 0, 0, 0.04, 0.06); for (const sx of [-1, 1]) k.part(cone(0.02, 0.07, 4), k.mat(0xf4ecd8), head, sx * 0.05, -0.08, 0.13, 0).rotation.x = Math.PI; }
  if (L.hair) { k.chain(head, 0, 0.08, -0.12, 4, 0.1, 0.05, k.mat(L.hair), -0.4); }
  k.eyes(head, 0, 0.04, 0.14, 0.07, 0.035, L.eyes, 0.35);
  k.ears(head, 0.1, 0.12, -0.02, L.ears, bm, k.mat(0xc87a7a));
  k.horns(head, 0.09, 0.1, -0.03, L.horns, 0xe8dcc4, 0.4 * (L.stone ? 1.4 : 1));
  parts.wings = [k.wing(body, -1, span, bone, L.wing, L.feather), k.wing(body, 1, span, bone, L.wing, L.feather)];
  parts.wings.forEach(w => { w.position.set(0, 0.08, -0.02); });
  // dangling claws
  parts.legs = [];
  for (const sx of [-1, 1]) parts.legs.push(k.limb(body, sx * 0.09, -0.18, 0, 0.12, 0.12, 0.035, bone, 'claw'));
  parts.tail = L.feather ? null : k.chain(body, 0, -0.05, -0.25, 3, 0.1, 0.03, bone, -0.4);
  if (L.feather) for (let i = 0; i < 3; i++) { const f = k.part(G('tf', () => { const g = new THREE.SphereGeometry(0.06, 8, 6); g.scale(0.6, 0.2, 2.6); g.translate(0, 0, -0.12); return g; }), bone, body, (i - 1) * 0.06, -0.05, -0.22, 0.06); f.rotation.y = (i - 1) * 0.3; }
  if (L.stone) body.scale.setScalar(1.35);
  return { parts, height: 1.6, float: true, anim: animFlyer };
}

function fish(k, d, root, L) {
  const rig = k.group(root);
  const bm = k.mat(L.body), belly = k.mat(L.belly), fin = k.mat(L.fins || L.body);
  const len = L.len, fat = L.fat || 1;
  const parts = { rig };
  const body = k.group(rig, 0, 0.75, 0); parts.body = body;
  k.part(G(`fsb${len}${fat}`, () => { const g = new THREE.SphereGeometry(0.28 * fat, 16, 12); g.scale(0.8, 0.85, len * 1.6 / fat); return g; }), bm, body, 0, 0, 0, 0.05);
  k.part(G(`fsbe${len}${fat}`, () => { const g = new THREE.SphereGeometry(0.25 * fat, 14, 10); g.scale(0.75, 0.6, len * 1.4 / fat); return g; }), belly, body, 0, -0.08 * fat, 0.02, 0);
  const tail = k.group(body, 0, 0, -len * 0.42); parts.tailFin = tail;
  const tg = G('tfin', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-0.28, 0.24); s.lineTo(-0.2, 0); s.lineTo(-0.28, -0.24); s.lineTo(0, 0); const g = new THREE.ShapeGeometry(s); g.rotateY(Math.PI / 2); return g; });
  const tm = new THREE.MeshToonMaterial({ color: L.fins || L.body, gradientMap: bm.gradientMap, side: THREE.DoubleSide }); tm.emissive = new THREE.Color(0xffffff); tm.emissiveIntensity = 0; k.mats.push(tm);
  const tf = new THREE.Mesh(tg, tm); tf.scale.setScalar(1 + len * 0.5); tail.add(tf);
  if (L.dorsal || !L.puffer) { const df = k.part(cone(0.1, 0.32 * (L.dorsal ? 1.4 : 0.8), 3), fin, body, 0, 0.24 * fat, -0.02, 0.06); df.rotation.x = -0.5; df.scale.z = 0.3; }
  parts.fins = [];
  for (const sx of [-1, 1]) { const f = k.group(body, sx * 0.2 * fat, -0.06, 0.1); const m = k.part(G('pfin', () => { const g = new THREE.ConeGeometry(0.08, 0.24, 3); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.1); return g; }), fin, f, 0, 0, 0, 0.06); m.scale.y = 0.3; f.rotation.y = sx * 0.6; parts.fins.push(f); }
  const mouthZ = len * 0.4 * (1.6 / fat) * 0.28 * fat + 0.18;
  const jaw = k.group(body, 0, -0.08, mouthZ - 0.06); parts.jaw = jaw;
  k.part(G(`fj${fat}`, () => { const g = new THREE.SphereGeometry(0.16 * fat, 10, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5); return g; }), belly, jaw, 0, 0, 0, 0.06);
  if (L.teeth) { const tm2 = k.mat(0xf4ecd8); for (let i = 0; i < 6; i++) { const a = (i - 2.5) * 0.35; k.part(cone(0.025, 0.09, 4), tm2, body, Math.sin(a) * 0.15 * fat, -0.04, mouthZ + Math.cos(a) * 0.02 - 0.04, 0).rotation.x = Math.PI; k.part(cone(0.022, 0.08, 4), tm2, jaw, Math.sin(a) * 0.13 * fat, 0.03, Math.cos(a) * 0.02 + 0.02, 0); } }
  k.eyes(body, 0, 0.1 * fat, mouthZ - 0.1, 0.17 * fat, 0.045, L.eyes, 0.2);
  if (L.lure) {
    const rod = k.chain(body, 0, 0.25 * fat, mouthZ - 0.15, 3, 0.16, 0.018, k.mat(0x2a2030), -1.7); parts.lure = rod;
    const end = rod[rod.length - 1];
    k.part(sph(0.06, 8, 6), k.glow(L.lure), end, 0, 0, -0.18, 0);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: L.lure, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(0.7); sp.position.z = -0.18; end.add(sp);
  }
  if (L.puffer) { const sm = k.mat(0xf4ecd8); for (let i = 0; i < 26; i++) { const ph = Math.acos(1 - 2 * (i + 0.5) / 26), th = Math.PI * (1 + Math.sqrt(5)) * i; const v = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)); const s = k.part(cone(0.025, 0.12, 4), sm, body, v.x * 0.43, v.y * 0.43, v.z * 0.45, 0); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v); } }
  return { parts, height: 1.2, float: true, anim: animFish };
}

function blob(k, d, root, L) {
  const rig = k.group(root);
  const parts = { rig };
  const body = k.group(rig, 0, 0, 0); parts.body = body;
  if (L.jelly) {
    const bell = new THREE.MeshToonMaterial({ color: L.body, gradientMap: k.mat(0).gradientMap, transparent: true, opacity: 0.7, emissive: new THREE.Color(L.body), emissiveIntensity: 0.25 }); k.mats.push(bell);
    body.position.y = 0.9;
    k.part(G('bell', () => new THREE.SphereGeometry(0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), bell, body, 0, 0, 0, 0.04);
    k.part(sph(0.16, 10, 8), k.glow(L.inner), body, 0, 0.1, 0, 0);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: L.body, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(1.6); body.add(sp); parts.core = sp;
    parts.tentacles = [];
    for (let i = 0; i < L.tentacles; i++) { const a = i / L.tentacles * Math.PI * 2; parts.tentacles.push(k.chain(body, Math.sin(a) * 0.25, -0.05, Math.cos(a) * 0.25, 4, 0.14, 0.03, bell, -Math.PI / 2)); }
    k.eyes(body, 0, 0.12, 0.38, 0.1, 0.04, L.eyes, 0.3, 0);
    return { parts, height: 1.4, float: true, anim: animBlob };
  }
  const r = L.toad ? 0.5 : 0.44;
  const outer = L.lava ? k.mat(L.body) : new THREE.MeshToonMaterial({ color: L.body, gradientMap: k.mat(0).gradientMap, transparent: !L.toad && !L.leaves, opacity: L.toad || L.leaves ? 1 : 0.78 });
  if (!k.mats.includes(outer)) { outer.emissive = new THREE.Color(0xffffff); outer.emissiveIntensity = 0; k.mats.push(outer); }
  const shell = k.part(G(`bl${r}`, () => { const g = new THREE.SphereGeometry(r, 18, 14); g.scale(1, L.toad ? 0.72 : 0.9, 1.05); g.translate(0, r * 0.82, 0); return g; }), outer, body, 0, 0, 0, 0.05);
  parts.shell = shell;
  if (L.skull) { const sk = k.part(sph(0.15, 10, 8), k.mat(L.inner), body, 0, r * 0.85, 0, 0); sk.scale.set(1, 1.05, 1.1); k.part(sph(0.035, 6, 5), k.mat(0x1a1a1a), sk, -0.05, 0.01, 0.12, 0); k.part(sph(0.035, 6, 5), k.mat(0x1a1a1a), sk, 0.05, 0.01, 0.12, 0); }
  if (L.lava) { for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.part(G('lv', () => new THREE.BoxGeometry(0.05, 0.2, 0.02)), k.glow(L.inner), body, Math.sin(a) * r * 0.98, r * (0.6 + (i % 3) * 0.15), Math.cos(a) * r * 1.02, 0).rotation.y = a; } const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xff6a1a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(1.6); sp.position.y = r * 0.8; body.add(sp); }
  if (L.toad) { k.part(G('tb', () => { const g = new THREE.SphereGeometry(r * 0.85, 14, 10); g.scale(1, 0.5, 1); return g; }), k.mat(L.inner), body, 0, r * 0.45, 0.12, 0); for (let i = 0; i < 9; i++) k.part(sph(0.05, 6, 5), k.mat(0x4a5a2a), body, Math.sin(i * 2.3) * r * 0.7, r * (0.9 + Math.cos(i) * 0.2), Math.cos(i * 1.7) * r * 0.6 - 0.1, 0); parts.legs = []; for (const sx of [-1, 1]) for (const z of [0.25, -0.25]) parts.legs.push(k.limb(body, sx * r * 0.85, r * 0.4, z, 0.16, 0.16, 0.07, k.mat(L.body), 'paw')); }
  if (L.leaves) {
    shell.scale.set(0.85, 1.15, 0.85);
    const lm = k.mat(L.leaves), lm2 = k.mat(new THREE.Color(L.leaves).multiplyScalar(0.7).getHex());
    parts.leaves = k.group(body, 0, r * 1.75, 0);
    for (let i = 0; i < 8; i++) { const lf = k.part(G('leaf2', () => { const g = new THREE.SphereGeometry(0.13, 10, 6); g.scale(0.7, 0.14, 2.8); g.translate(0, 0, 0.32); return g; }), i % 2 ? lm : lm2, parts.leaves, 0, 0, 0, 0.08); lf.rotation.set(-0.9 - (i % 2) * 0.35, i / 8 * Math.PI * 2, 0); }
    k.part(sph(0.07, 8, 6), k.mat(0xd84a6a), parts.leaves, 0, 0.12, 0, 0.1);
    parts.legs = []; for (const sx of [-1, 1]) parts.legs.push(k.limb(body, sx * r * 0.35, r * 0.2, 0, 0.16, 0.18, 0.055, k.mat(0x8a6a3a), 'claw'));
    for (const sx of [-1, 1]) { const arm = k.chain(body, sx * r * 0.85, r * 0.9, 0.05, 3, 0.12, 0.035, k.mat(0x8a6a3a), 0); arm[0].rotation.y = sx * 1.9; arm[0].rotation.x = 0.6; }
    // a furious brow over glowing eyes
    for (const sx of [-1, 1]) k.part(G('brow', () => new THREE.BoxGeometry(0.16, 0.035, 0.05)), k.mat(0x3a2a1a), body, sx * r * 0.32, r * 1.22, r * 0.86, 0).rotation.z = sx * 0.45;
  }
  const eyeY = r * (L.toad ? 1.05 : L.leaves ? 1.1 : 1.0), eyeZ = r * (L.leaves ? 0.82 : 0.85);
  k.eyes(body, 0, eyeY, eyeZ, r * 0.32, r * (L.leaves ? 0.15 : 0.13), L.leaves ? 0xff5a2a : L.eyes, L.toad ? 0 : 0.3, L.lava || L.leaves ? 1 : 0.6);
  if (L.mouth || L.toad || L.leaves) { const mouth = k.part(G('mouth', () => { const g = new THREE.SphereGeometry(0.12, 10, 6); g.scale(1.4, 0.55, 0.4); return g; }), k.mat(0x2a0a0a), body, 0, r * 0.62, r * 0.92, 0); parts.mouth = mouth; }
  k.horns(body, r * 0.5, r * 1.45, 0, L.horns, 0xe8dcc4, 0.9);
  return { parts, height: r * 1.8, anim: animBlob };
}

function floater(k, d, root, L) {
  const rig = k.group(root);
  const parts = { rig };
  const body = k.group(rig, 0, 1.0, 0); parts.body = body;
  if (L.hood) {
    const cm = new THREE.MeshToonMaterial({ color: L.shell, gradientMap: k.mat(0).gradientMap, side: THREE.DoubleSide }); cm.emissive = new THREE.Color(0xffffff); cm.emissiveIntensity = 0; k.mats.push(cm);
    k.part(G('hood', () => new THREE.ConeGeometry(0.42, 1.1, 14, 1, true)), cm, body, 0, -0.1, 0, 0.04);
    k.part(G('hoodtop', () => new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), cm, body, 0, 0.32, -0.02, 0.04);
    k.part(sph(0.22, 12, 10), k.mat(0x050508), body, 0, 0.22, 0.08, 0);
    k.eyes(body, 0, 0.24, 0.26, 0.07, 0.035, L.eyes, 0.4);
    parts.cloak = k.chain(body, 0, -0.5, -0.1, 4, 0.16, 0.12, cm, -1.2);
    parts.arms = []; for (const sx of [-1, 1]) { const a = k.chain(body, sx * 0.3, 0.05, 0.08, 3, 0.16, 0.05, cm, 0); a[0].rotation.y = sx * 2.4; parts.arms.push(a); }
    return { parts, height: 1.6, float: true, anim: animFloater };
  }
  const coreM = k.glow(L.core);
  if (L.eye) {
    const eyeball = k.part(sph(0.34, 18, 14), k.mat(L.core), body, 0, 0, 0, 0.05); parts.eyeball = eyeball;
    const iris = k.part(sph(0.15, 12, 10), k.glow(L.iris), eyeball, 0, 0, 0.24, 0); iris.scale.z = 0.5;
    k.part(sph(0.07, 10, 8), k.mat(0x0a0a0a), iris, 0, 0, 0.12, 0).scale.z = 0.5; parts.iris = iris;
    const lid = k.part(G('lid', () => new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), k.mat(L.shell), body, 0, 0, 0, 0.05); lid.rotation.x = 0.5; parts.lid = lid;
    k.horns(body, 0.24, 0.18, -0.05, L.horns, 0xe8dcc4, 0.75);
    parts.tentacles = []; for (let i = 0; i < L.tentacles; i++) { const a = i / L.tentacles * Math.PI * 2; parts.tentacles.push(k.chain(body, Math.sin(a) * 0.2, -0.25, Math.cos(a) * 0.2 - 0.1, 4, 0.13, 0.04, k.mat(L.shell), -Math.PI / 2)); }
    return { parts, height: 1.5, float: true, anim: animFloater };
  }
  // cores: ember (cinder), crystal (frost), cloud (storm)
  k.part(sph(0.26, 16, 12), coreM, body, 0, 0, 0, 0);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: L.core, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(2); body.add(sp); parts.core = sp;
  // trailing wisps below the core
  parts.tentacles = []; const wm = new THREE.MeshBasicMaterial({ color: L.core, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; parts.tentacles.push(k.chain(body, Math.sin(a) * 0.12, -0.2, Math.cos(a) * 0.12, 3, 0.14, 0.05, wm, -Math.PI / 2)); }
  const cage = k.group(body); parts.cage = cage;
  if (L.crystal) { const cm = k.mat(0xcff4ff, { emissive: 0x2a7a9a, ei: 0.5 }); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const c = k.part(G('cr', () => new THREE.OctahedronGeometry(0.13, 0)), cm, cage, Math.sin(a) * 0.4, Math.cos(a * 2) * 0.08, Math.cos(a) * 0.32, 0.08); c.scale.set(0.7, 2.4, 0.7); c.rotation.z = Math.sin(a) * 0.5; } }
  else if (L.cloud) { const cm = k.mat(L.shell); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; k.part(sph(0.16 + (i % 3) * 0.04, 10, 8), cm, cage, Math.sin(a) * 0.25, 0.12 + Math.cos(a * 3) * 0.06, Math.cos(a) * 0.22, 0.06); } k.eyes(body, 0, 0.02, 0.24, 0.08, 0.04, L.iris, 0.4); }
  else { const rm = k.mat(L.shell); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const r2 = k.part(G('cnd', () => new THREE.DodecahedronGeometry(0.12, 0)), rm, cage, Math.sin(a) * 0.3, Math.cos(a * 2) * 0.1, Math.cos(a) * 0.3, 0.08); r2.rotation.set(a, a * 2, 0); } k.horns(body, 0.16, 0.18, 0, L.horns, 0x2a1a16, 0.6); k.eyes(body, 0, 0.02, 0.19, 0.07, 0.035, 0xffffff, 0.4, 0); }
  return { parts, height: 1.4, float: true, anim: animFloater };
}

function serpent(k, d, root, L) {
  const rig = k.group(root);
  const bm = k.mat(L.body), belly = k.glow(L.belly);
  const parts = { rig };
  const head = k.group(rig, 0, 0.55, 0.2); parts.head = head;
  k.part(G('eh', () => { const g = new THREE.SphereGeometry(0.17, 12, 10); g.scale(0.9, 0.8, 1.4); return g; }), bm, head, 0, 0, 0, 0.06);
  const jaw = k.group(head, 0, -0.06, 0.04); parts.jaw = jaw;
  k.part(G('ej', () => { const g = new THREE.SphereGeometry(0.12, 10, 6); g.scale(0.9, 0.35, 1.5); g.translate(0, 0, 0.08); return g; }), bm, jaw, 0, 0, 0, 0.06);
  k.eyes(head, 0, 0.07, 0.12, 0.09, 0.03, L.eyes, 0.3);
  for (const sx of [-1, 1]) k.part(cone(0.03, 0.14, 4), k.mat(0x2a3a5a), head, sx * 0.1, 0.08, -0.12, 0.08).rotation.x = -1.2;
  parts.segs = [];
  let p = head;
  for (let i = 0; i < L.segs; i++) {
    const s = k.group(p, 0, 0, i ? -0.2 : -0.18);
    const r = 0.13 * (1 - i / (L.segs + 2));
    k.part(sph(r, 10, 8), bm, s, 0, 0, -0.06, 0.06).scale.z = 1.4;
    if (i % 2 === 0) k.part(sph(r * 0.35, 6, 5), belly, s, 0, -r * 0.6, -0.06, 0);
    parts.segs.push(s); p = s;
  }
  return { parts, height: 0.9, float: true, anim: animSerpent };
}

function spider(k, d, root, L) {
  const rig = k.group(root);
  const bm = k.mat(L.body, { emissive: 0x2a7a9a }), belly = k.mat(L.belly);
  const parts = { rig, legs: [] };
  const body = k.group(rig, 0, 0.45, 0); parts.body = body;
  k.part(sph(0.22, 14, 10), bm, body, 0, 0, 0.12, 0.06);
  k.part(G('abd', () => { const g = new THREE.SphereGeometry(0.3, 14, 10); g.scale(1, 0.85, 1.25); return g; }), belly, body, 0, 0.06, -0.3, 0.05);
  for (let i = 0; i < 5; i++) k.part(G('ic', () => new THREE.OctahedronGeometry(0.06, 0)), bm, body, (i - 2) * 0.08, 0.32, -0.3 + Math.abs(i - 2) * 0.04, 0.08).scale.y = 2;
  for (let i = 0; i < 4; i++) k.part(sph(0.03, 6, 5), k.glow(L.eyes), body, (i - 1.5) * 0.06, 0.08, 0.32, 0);
  k.eyes(body, 0, 0.1, 0.3, 0.07, 0.03, L.eyes, 0.2);
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
    const hip = k.group(body, sx * 0.18, 0, 0.18 - i * 0.12); hip.rotation.y = sx * (Math.PI / 2 - 0.5 + i * 0.35) * -1;
    const up = k.group(hip); up.rotation.x = -0.9;
    k.part(G('sl1', () => { const g = new THREE.CylinderGeometry(0.03, 0.035, 0.36, 6); g.translate(0, 0.18, 0); return g; }), bm, up, 0, 0, 0, 0.1);
    const kn = k.group(up, 0, 0.36, 0); kn.rotation.x = 2.1;
    k.part(G('sl2', () => { const g = new THREE.ConeGeometry(0.03, 0.46, 6); g.translate(0, 0.23, 0); return g; }), bm, kn, 0, 0, 0, 0.1);
    parts.legs.push({ hip, up, kn, i, sx });
  }
  return { parts, height: 0.9, anim: animSpider };
}

function crab(k, d, root, L) {
  const rig = k.group(root);
  const bm = k.mat(L.body), belly = k.mat(L.belly), dark = k.mat(new THREE.Color(L.body).multiplyScalar(0.6).getHex());
  const parts = { rig, legs: [], claws: [] };
  const body = k.group(rig, 0, 0.55, 0); parts.body = body;
  k.part(G('crb', () => { const g = new THREE.SphereGeometry(0.5, 18, 12); g.scale(1.35, 0.55, 1); return g; }), bm, body, 0, 0, 0, 0.04);
  k.part(G('crbb', () => { const g = new THREE.SphereGeometry(0.45, 14, 10); g.scale(1.25, 0.35, 0.9); return g; }), belly, body, 0, -0.1, 0, 0);
  k.spikes(body, 5, -0.3, 0.3, 0.22, 0.18, dark, 0.06);
  for (const sx of [-1, 1]) { const st = k.group(body, sx * 0.18, 0.22, 0.32); k.part(cyl(0.03, 0.03, 0.2, 6), bm, st, 0, 0.1, 0, 0.08); k.part(sph(0.06, 8, 6), k.glow(0xfff0a0), st, 0, 0.22, 0, 0.1); }
  for (const sx of [-1, 1]) {
    const arm = k.group(body, sx * 0.6, 0, 0.3); arm.rotation.y = sx * -0.5;
    k.part(cap(0.08, 0.3), bm, arm, 0, 0, 0.18, 0.06).rotation.x = Math.PI / 2;
    const claw = k.group(arm, 0, 0.05, 0.45);
    k.part(G('cl1', () => { const g = new THREE.SphereGeometry(0.2, 12, 8); g.scale(1, 0.75, 1.3); return g; }), bm, claw, 0, 0, 0, 0.06);
    const pin = k.group(claw, 0, -0.06, 0.12); k.part(G('cl2', () => { const g = new THREE.ConeGeometry(0.08, 0.32, 6); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.12); return g; }), dark, pin, 0, 0, 0, 0.06);
    parts.claws.push({ arm, claw, pin, sx });
  }
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { const l = k.limb(body, sx * 0.55, -0.05, 0.1 - i * 0.2, 0.25, 0.3, 0.04, dark, null); l.hip.rotation.z = sx * 1.1; l.knee.rotation.z = -sx * 1.4; l.i = i; l.sx = sx; parts.legs.push(l); }
  return { parts, height: 1.0, anim: animCrab };
}

function mimic(k, d, root, L) {
  const rig = k.group(root);
  const wood = k.mat(L.body), gold = k.mat(L.trim, { emissive: 0x3a2400, ei: 0.4 }), dark = k.mat(0x2a0a0a), tongue = k.mat(0xc83a5a);
  const parts = { rig, legs: [] };
  const body = k.group(rig, 0, 0.32, 0); parts.body = body;
  k.part(G('mb', () => new THREE.BoxGeometry(0.8, 0.42, 0.56, 2, 2, 2)), wood, body, 0, 0.2, 0, 0.04);
  k.part(G('mbi', () => new THREE.BoxGeometry(0.72, 0.1, 0.48)), dark, body, 0, 0.38, 0, 0);
  for (const x of [-0.3, 0.3]) k.part(G('mbs', () => new THREE.BoxGeometry(0.06, 0.44, 0.58)), gold, body, x, 0.2, 0, 0);
  const lid = k.group(body, 0, 0.41, -0.28); parts.jaw = lid;
  k.part(G('ml', () => { const g = new THREE.CylinderGeometry(0.28, 0.28, 0.8, 12, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.scale(1, 0.6, 1); g.translate(0, 0, 0.28); return g; }), wood, lid, 0, 0, 0, 0.04);
  k.part(G('mls', () => new THREE.BoxGeometry(0.06, 0.2, 0.58)), gold, lid, 0, 0.1, 0.28, 0);
  k.part(G('lock', () => new THREE.BoxGeometry(0.12, 0.14, 0.04)), gold, lid, 0, -0.02, 0.57, 0);
  const tm = k.mat(0xf4ecd8);
  for (let i = 0; i < 6; i++) { k.part(cone(0.035, 0.12, 4), tm, lid, -0.3 + i * 0.12, -0.06, 0.52, 0).rotation.x = Math.PI; k.part(cone(0.035, 0.12, 4), tm, body, -0.3 + i * 0.12, 0.47, 0.25, 0); }
  const tg = k.chain(body, 0, 0.38, 0.1, 3, 0.12, 0.06, tongue, 0.3); parts.tongue = tg;
  k.eyes(lid, 0, 0.08, 0.45, 0.14, 0.05, L.eyes, 0.4);
  for (const sx of [-1, 1]) for (const z of [0.18, -0.18]) parts.legs.push(k.limb(body, sx * 0.32, 0, z, 0.16, 0.18, 0.05, k.mat(0x6a2a3a), 'claw'));
  return { parts, height: 1.0, anim: animMimic };
}

const PLANS = { biped, quad, flyer, fish, blob, floater, serpent, spider, crab, mimic };

export function buildMonster(id) {
  const d = MONSTERS[id];
  const k = new Kit();
  const root = new THREE.Group();
  const built = PLANS[d.plan](k, d, root, d.look);
  // normalise size to the collision radius
  const box = new THREE.Box3().setFromObject(root);
  const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  let s = (d.r * 2.4) / Math.max(0.3, w);
  if (d.plan === 'flyer') s = Math.min(1.4, d.r * 3.6);          // wings must not shrink the body
  if (d.plan === 'floater') s *= 1.35;
  const scale = Math.min(1.8, Math.max(0.6, s)) * (d.mini ? 1 : 1);
  built.parts.rig.scale.setScalar(scale);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, 4, 14), new THREE.MeshBasicMaterial({ color: 0xf2b24a }));
  band.rotation.x = Math.PI / 2; band.position.y = 0.06; band.visible = false; root.add(band);
  return { root, rig: built.parts.rig, parts: built.parts, mats: k.mats, eyes: k.eyeGroups, type: id, plan: d.plan, radius: d.r, height: built.height * scale, float: !!built.float, anim: built.anim, eliteBand: band, t0: Math.random() * 10 };
}

// ---------------------------------------------------------------- animation
// s = { t, dt, speed (0..1), state, windupK (0..1 progression into windup), attacking }
function animBiped(m, s) {
  const p = m.parts, ph = s.ph, run = s.speed;
  const sn = Math.sin(ph), cs = Math.cos(ph);
  p.pelvis.position.y = p.pelvis.userData.y0 ?? (p.pelvis.userData.y0 = p.pelvis.position.y);
  p.pelvis.position.y = p.pelvis.userData.y0 + Math.abs(sn) * 0.05 * run - s.windup * 0.08;
  p.legs[0].hip.rotation.x = sn * 0.7 * run - s.windup * 0.4; p.legs[1].hip.rotation.x = -sn * 0.7 * run - s.windup * 0.4;
  p.legs[0].knee.rotation.x = Math.max(0, -cs) * 0.9 * run + s.windup * 0.7; p.legs[1].knee.rotation.x = Math.max(0, cs) * 0.9 * run + s.windup * 0.7;
  const raise = s.state === 'windup' ? -2.4 * s.windup : s.attack ? -0.8 : 0;
  p.arms[0].hip.rotation.x = -sn * 0.6 * run + raise + Math.sin(s.t * 2) * 0.05; p.arms[1].hip.rotation.x = sn * 0.6 * run + raise + Math.sin(s.t * 2 + 1) * 0.05;
  p.arms[0].knee.rotation.x = -0.4 - s.windup * 0.6; p.arms[1].knee.rotation.x = -0.4 - s.windup * 0.6;
  p.torso.rotation.y = sn * 0.15 * run;
  p.torso.rotation.z = Math.sin(s.t * 1.7) * 0.03;
  if (p.head) { p.head.rotation.x = Math.sin(s.t * 2.2) * 0.06 - s.windup * 0.3; p.head.rotation.y = Math.sin(s.t * 0.9) * 0.15 * (1 - run); }
  if (p.jaw) p.jaw.rotation.x = s.attack || s.state === 'windup' ? 0.5 : Math.max(0, Math.sin(s.t * 3)) * 0.12;
  if (p.tail) p.tail.forEach((g, i) => { g.rotation.y = Math.sin(s.t * 4 - i * 0.7) * 0.35; });
  if (p.wings) p.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(s.t * 16) * 0.35); });
  if (p.cape) p.cape.forEach((g, i) => { g.rotation.x = 0.3 + run * 0.4 + Math.sin(s.t * 5 - i) * 0.1; });
  if (p.lantern) p.lantern.material.opacity = 0.6 + Math.sin(s.t * 9) * 0.15 + s.windup * 0.4;
  if (p.fuse) { p.fuse.scale.setScalar(0.2 + Math.random() * 0.12 + s.windup * 0.3); }
  if (p.key) p.key.rotation.z = s.t * 2;
}
function animQuad(m, s) {
  const p = m.parts, ph = s.ph * 1.15, run = s.speed;
  for (const l of p.legs) {
    const o = (l.front ? 0 : Math.PI) + (l.side > 0 ? Math.PI : 0);
    const a = Math.sin(ph + o);
    l.hip.rotation.x = a * 0.75 * run + (l.front ? -s.windup * 0.6 : s.windup * 0.5);
    l.knee.rotation.x = (l.front ? -1 : 1) * Math.max(0, Math.cos(ph + o)) * 0.8 * run + (l.front ? 0.3 : -0.3) * s.windup;
  }
  p.body.position.y = (p.body.userData.y0 ?? (p.body.userData.y0 = p.body.position.y)) + Math.abs(Math.sin(ph)) * 0.04 * run - s.windup * 0.12;
  p.body.rotation.x = -s.windup * 0.15 + (s.attack ? 0.15 : 0);
  p.neck.rotation.x = Math.sin(ph * 2) * 0.06 * run - s.windup * 0.25;
  p.head.rotation.y = Math.sin(s.t * 1.3) * 0.2 * (1 - run);
  if (p.jaw) p.jaw.rotation.x = s.attack || s.state === 'windup' || s.state === 'aim' ? 0.55 : Math.max(0, Math.sin(s.t * 2.6)) * 0.1;
  if (p.tail) p.tail.forEach((g, i) => { g.rotation.y = Math.sin(s.t * (5 + run * 4) - i * 0.8) * (0.25 + run * 0.15); g.rotation.x = i ? 0.1 : g.rotation.x; });
}
function animFlyer(m, s) {
  const p = m.parts, flap = s.state === 'dash' ? 0.2 : 1;
  const f = Math.sin(s.t * (s.state === 'aim' ? 22 : 14));
  p.wings[0].rotation.z = (s.state === 'dash' ? 1.1 : 0.15 + f * 0.75 * flap); p.wings[1].rotation.z = -(s.state === 'dash' ? 1.1 : 0.15 + f * 0.75 * flap);
  p.wings[0].rotation.y = s.state === 'dash' ? 0.9 : 0; p.wings[1].rotation.y = s.state === 'dash' ? -0.9 : 0;
  p.body.position.y = 1.1 + Math.sin(s.t * 14 + 1) * 0.05 + Math.sin(s.t * 1.7) * 0.1 - (s.state === 'dash' ? 0.5 : 0);
  p.body.rotation.x = s.state === 'dash' ? 0.7 : s.state === 'aim' ? -0.3 : 0.15;
  if (p.jaw) p.jaw.rotation.x = s.state === 'aim' || s.state === 'dash' ? 0.6 : 0.1;
  p.legs.forEach((l, i) => { l.hip.rotation.x = 0.4 + Math.sin(s.t * 3 + i) * 0.15; });
  if (p.tail) p.tail.forEach((g, i) => { g.rotation.y = Math.sin(s.t * 4 - i) * 0.3; });
}
function animFish(m, s) {
  const p = m.parts, sp = 1 + s.speed * 2;
  p.tailFin.rotation.y = Math.sin(s.t * 8 * sp) * 0.5;
  p.body.rotation.y = Math.sin(s.t * 8 * sp + 1.5) * 0.08;
  p.body.position.y = 0.75 + Math.sin(s.t * 2.5) * 0.08;
  p.fins.forEach((f, i) => { f.rotation.z = (i ? -1 : 1) * Math.sin(s.t * 6) * 0.3; });
  p.jaw.rotation.x = s.attack || s.state === 'windup' || s.state === 'aim' ? 0.6 : 0.08 + Math.sin(s.t * 3) * 0.06;
  if (p.lure) p.lure.forEach((g, i) => { g.rotation.y = Math.sin(s.t * 2 - i) * 0.25; });
  if (m.type === 'puffer') { const inflate = 1 + s.windup * 0.9 + (s.state === 'windup' ? Math.sin(s.t * 30) * 0.05 : 0); p.body.scale.setScalar(inflate); }
}
function animBlob(m, s) {
  const p = m.parts;
  if (p.tentacles) {
    p.body.position.y = 0.9 + Math.sin(s.t * 2) * 0.12;
    const pulse = 1 + Math.sin(s.t * 4) * 0.06 + s.windup * 0.15; p.body.scale.set(pulse, 2 - pulse, pulse);
    p.tentacles.forEach((tt, i) => tt.forEach((g, j) => { g.rotation.x = (j ? 0.25 : -Math.PI / 2) + Math.sin(s.t * 3 - j - i) * 0.3; }));
    if (p.core) p.core.material.opacity = 0.5 + s.windup * 0.5 + Math.sin(s.t * 6) * 0.1;
    return;
  }
  const hop = p.legs ? Math.max(0, Math.sin(s.ph * 0.9)) : 0;
  const wob = Math.sin(s.t * (6 + s.speed * 6)), sq = 1 + wob * 0.07 - s.windup * 0.25;
  p.body.scale.set(1 / Math.sqrt(sq) * (1 + s.windup * 0.15), sq, 1 / Math.sqrt(sq));
  p.body.position.y = hop * 0.15 * s.speed + (s.attack ? 0.3 : 0);
  if (p.mouth) p.mouth.scale.y = s.attack || s.state === 'windup' ? 2.2 : 1 + Math.max(0, wob) * 0.4;
  if (p.leaves) p.leaves.rotation.y = s.t * 0.8;
  if (p.legs) p.legs.forEach((l, i) => { l.hip.rotation.x = Math.sin(s.ph + i) * 0.4 * s.speed - s.windup * 0.5; });
}
function animFloater(m, s) {
  const p = m.parts;
  p.body.position.y = 1.0 + Math.sin(s.t * 2) * 0.1;
  if (p.cage) p.cage.rotation.y = s.t * (1 + s.windup * 6);
  if (p.core) { const g = 1 + s.windup * 0.8 + Math.sin(s.t * 9) * 0.08; p.core.scale.setScalar(1.6 * g); }
  if (p.lid) p.lid.rotation.x = s.state === 'windup' ? 0.1 : 0.5 + (Math.sin(s.t * 0.7) > 0.95 ? 0.6 : 0);
  if (p.iris) { p.iris.scale.setScalar(1 + s.windup * 0.4); }
  if (p.tentacles) p.tentacles.forEach((tt, i) => tt.forEach((g, j) => { g.rotation.x = (j ? 0.3 : -Math.PI / 2) + Math.sin(s.t * 3 - j - i) * 0.35; }));
  if (p.cloak) p.cloak.forEach((g, i) => { g.rotation.x = (i ? 0.15 : -1.2) + Math.sin(s.t * 3 - i) * 0.2 + s.speed * 0.2; });
  if (p.arms) p.arms.forEach((a, i) => a.forEach((g, j) => { g.rotation.x = Math.sin(s.t * 2 + i + j) * 0.3 - (s.state === 'aim' ? 0.8 : 0); }));
  p.body.rotation.x = s.state === 'dash' ? 0.6 : 0;
}
function animSerpent(m, s) {
  const p = m.parts, sp = 1 + s.speed * 1.5;
  p.head.position.y = 0.55 + Math.sin(s.t * 3) * 0.06 + (s.state === 'windup' ? 0.25 * s.windup : 0);
  p.segs.forEach((g, i) => { g.rotation.y = Math.sin(s.t * 7 * sp - i * 0.8) * 0.32; g.rotation.x = (s.state === 'windup' ? -0.12 : 0.02); });
  p.jaw.rotation.x = s.attack || s.state === 'windup' ? 0.7 : 0.05;
}
function animSpider(m, s) {
  const p = m.parts, run = s.speed;
  for (const l of p.legs) {
    const ph = s.ph * 1.6 + l.i * 1.6 + (l.sx > 0 ? Math.PI : 0);
    l.up.rotation.x = -0.9 + Math.max(0, Math.sin(ph)) * 0.45 * run - s.windup * 0.3;
    l.hip.rotation.y = l.sx * -(Math.PI / 2 - 0.5 + l.i * 0.35) + Math.cos(ph) * 0.25 * run;
  }
  p.body.position.y = 0.45 + Math.sin(s.t * 12) * 0.015 * run - s.windup * 0.15;
  p.body.rotation.x = -s.windup * 0.2;
}
function animCrab(m, s) {
  const p = m.parts;
  p.legs.forEach(l => { l.hip.rotation.x = Math.sin(s.ph * 1.4 + l.i * 1.4 + (l.sx > 0 ? 0 : Math.PI)) * 0.35 * s.speed; });
  p.body.position.y = 0.55 + Math.abs(Math.sin(s.ph * 1.4)) * 0.03 * s.speed;
  p.claws.forEach(c => { c.arm.rotation.x = -s.windup * 1.6 + (s.attack ? 0.6 : 0); c.pin.rotation.x = -0.3 - Math.max(0, Math.sin(s.t * 4)) * 0.4 - s.windup * 0.5; });
}
function animMimic(m, s) {
  const p = m.parts;
  p.legs.forEach((l, i) => { l.hip.rotation.x = Math.sin(s.ph * 1.3 + i * 1.6) * 0.6 * s.speed; });
  p.body.position.y = 0.32 + Math.abs(Math.sin(s.ph * 1.3)) * 0.05 * s.speed;
  const chomp = s.attack || s.state === 'windup' ? 1.0 : Math.max(0, Math.sin(s.t * 5)) * 0.45 * (0.3 + s.speed);
  p.jaw.rotation.x = -chomp;
  p.tongue.forEach((g, i) => { g.rotation.y = Math.sin(s.t * 6 - i) * 0.3; g.rotation.x = 0.3 + chomp * 0.3; });
}
