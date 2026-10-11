// Character appearance presets and the random customer generator.
import { pick, rand, chance } from '../core/util.js';

const BASE = {
  EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a',
  Sole: '#1e1916', Belt: '#2a1d15', Metal: '#b9a06a', Button: '#2a2420', MouthDark: '#2a0d0b', Apron: '#2b2f33',
  Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#3a332c', TopDark: '#2d2a28',
};

export const SKIN = ['#f1c9a8', '#e3b08c', '#d29b77', '#b77f5c', '#8f5c3e', '#6b4330', '#efc3a0'];
const HAIR = ['#1f1611', '#2e2018', '#4a3020', '#6b4a2e', '#8c6a42', '#b58c5a', '#2a2a2a', '#5e2c18', '#141414'];
const IRIS = ['#4a6a7a', '#5c4632', '#3b2a1e', '#5f7a52', '#6a8aa0', '#3e3226'];
const TOPS = ['#7a2a26', '#2f4a3a', '#24344d', '#5a5f66', '#3d3d42', '#a8843f', '#6c7a8a', '#d8cdb8', '#46303a', '#e0a33c', '#3b6e8f', '#e8e2d6', '#9b3d5a', '#5d7a3a'];
const PANTS = ['#2b2f38', '#3a332c', '#4a4f57', '#6a5a44', '#1f2228', '#5a4a3a', '#34404f'];
const SHOES = ['#2a1a12', '#1b1b1d', '#e8e2d6', '#e8e2d6', '#6a4a2e', '#3a3f4a', '#8a2a20', '#f0f0f0', '#c9922e'];

export const OWNER_LOOK = {
  name: 'Owner',
  colors: { ...BASE, Skin: '#e2ae8e', Top: '#5a4c3e', Sleeve: '#5a4c3e', Pants: '#4a3f35', Shoes: '#3a2316', ShoesRough: 0.25,
    Hair: '#c8c2b8', Iris: '#5a7380', Lapel: '#4a3e33', Tie: '#7a2a26', Shirt: '#ece4d2' },
  accessories: ['jacket', 'tie', 'moustache', 'belly'],
  hunch: 0.6,
  scale: 0.97,
  voice: { pitch: 112, rate: 0.95, wobble: 0.12, vol: 0.1 },
  hair: { color: '#c8c2b8', style: { top: 0.06, front: 0.03, left: 0.14, right: 0.14, back: 0.15, fuzz: 0.02, bald: 0.85, noise: 0.25 } },
};

export const PLAYER_LOOK = {
  colors: { ...BASE, Skin: '#d8a482', Top: '#2b3442', Sleeve: '#2b3442', Pants: '#2b2f38', Shoes: '#2a1a12', Hair: '#2a1d14', Iris: '#4a3a2a' },
};

export const PERSONALITIES = {
  chill: { id: 'chill', label: 'Chill', patience: 1.3, payMult: 1, tipMult: 1.1, voiceRate: 0.9,
    greet: ['Hey man. Just clean the sides, no rush.', 'Yo. Whatever you think looks good.', 'Hey. Take your time.'],
    happy: ['Yeah, that’s nice.', 'Clean. Appreciate it.', 'Sweet, man.'],
    bad: ['Hm. It’s... fine, I guess.', 'Eh. Hair grows back.'],
    wait: ['No worries, I can wait.'], idle: 'phone' },
  impatient: { id: 'impatient', label: 'Impatient', patience: 0.65, payMult: 1.05, tipMult: 0.8, voiceRate: 1.25,
    greet: ['I’ve got somewhere to be.', 'Quick one, yeah? I’m in a hurry.', 'Let’s go, let’s go.'],
    happy: ['Fast AND clean? Respect.', 'Good. Gotta run.'],
    bad: ['Took long enough.', 'Seriously?'],
    wait: ['Is this gonna take long?', 'Come on...'], idle: 'tap' },
  nervous: { id: 'nervous', label: 'Nervous', patience: 1.0, payMult: 1, tipMult: 1.2, voiceRate: 1.1,
    greet: ['Please don’t cut too much.', 'Um, hi. Just... careful, okay?', 'My last barber... never mind.'],
    happy: ['Oh! Oh, that’s actually good!', 'Phew. Thank you so much.'],
    bad: ['I knew it. I KNEW it.', 'I’m wearing a hat for a week.'],
    wait: ['Is it always this quiet?'], idle: 'fidget' },
  confident: { id: 'confident', label: 'Confident', patience: 1.0, payMult: 1.1, tipMult: 1.3, voiceRate: 1.0,
    greet: ['Make me look fresh.', 'Big date tonight. Make it count.', 'I want to look expensive.'],
    happy: ['Bro cooked me.', 'Now THAT is a haircut.', 'I look like a million bucks.'],
    bad: ['What happened?', 'Nah. Nah nah nah.'],
    wait: ['Take your time, quality matters.'], idle: 'phone' },
  risky: { id: 'risky', label: 'Risky', patience: 1.1, payMult: 0.95, tipMult: 1.4, voiceRate: 1.05,
    greet: ['Do whatever you want.', 'Surprise me. Seriously.'],
    happy: ['Wild. I love it.', 'Okay, you’re an artist.'],
    bad: ['Bold choice. Not good. But bold.'],
    wait: ['Cool place. Kind of.'], idle: 'look' },
};

export function randomPersonality(level) {
  const pool = ['chill', 'chill', 'impatient', 'nervous', 'confident'];
  if (level >= 2) pool.push('risky', 'confident');
  return PERSONALITIES[pick(pool)];
}

// ---------------------------------------------------------------- customers
// A customer is assembled from parts: head shape, nose, eyes and brows, skin tone, body type,
// an outfit with its own colour logic, a few occasional accessories, and hair of a type and
// starting style of their own. Two customers should never read as the same person.
const SKIN_TONES = ['#f6d5bd', '#efc6a5', '#e6b693', '#d9a37f', '#c99068', '#b77f5c', '#a36c4b', '#8f5c3e', '#7a4d34', '#653f2b', '#523223', '#3f271c'];
const HAIR_LIGHT = ['#e1c48e', '#c9a46a', '#b58c5a', '#8c6a42', '#6b4a2e', '#5e2c18', '#a3522a', '#4a3020'];
const HAIR_DARK = ['#1f1611', '#2e2018', '#141414', '#2a2a2a', '#3a2618', '#4a3020'];
const IRIS_LIGHT = ['#4a6a7a', '#6a8aa0', '#5f7a52', '#7a8a5a', '#5c4632', '#3e3226', '#8a9aa8'];
const IRIS_DARK = ['#3b2a1e', '#2e2118', '#4a3624', '#5c4632'];
const NEUTRALS = ['#2b2f38', '#3a332c', '#4a4f57', '#1f2228', '#5a5f66', '#e8e2d6', '#d8cdb8', '#6c7a8a'];
const COLOURS = ['#7a2a26', '#2f4a3a', '#24344d', '#a8843f', '#46303a', '#e0a33c', '#3b6e8f', '#9b3d5a', '#5d7a3a', '#c8562e', '#4a6a8a', '#8a6a9a'];
const DENIM = ['#34404f', '#2f3a4f', '#4a5a72', '#1f2633'];
const CHINO = ['#6a5a44', '#a8946e', '#3a332c', '#5a4a3a', '#2b2f38'];
const SHOE = ['#2a1a12', '#1b1b1d', '#e8e2d6', '#f0f0f0', '#6a4a2e', '#3a3f4a', '#8a2a20', '#c9922e'];
const TEAMS = [['#b8302b', '#ffffff'], ['#24447a', '#f2cf7c'], ['#2f8a4a', '#ffffff'], ['#f2cf7c', '#1b1b1d'], ['#ffffff', '#24344d'], ['#5c2d82', '#f2cf7c'], ['#e0702a', '#1b1b1d']];

const darken = (hex, k = 0.72) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(v * k).toString(16).padStart(2, '0'); return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255); };
const weighted = (items) => { let t = 0; for (const [, w] of items) t += w; let r = Math.random() * t; for (const [v, w] of items) { r -= w; if (r <= 0) return v; } return items[0][0]; };

const OUTFITS = {
  tee: (c) => { const top = pick([...COLOURS, ...NEUTRALS]); return { acc: ['tee'], Top: top, Sleeve: c.skin, Pants: pick([...DENIM, ...CHINO]), Shoes: pick(SHOE) }; },
  hoodie: (c) => { const top = pick([...COLOURS, '#2b2f38', '#5a5f66', '#d8cdb8', '#1f2228']); return { acc: ['hoodie'], Top: top, Sleeve: top, TopDark: darken(top), Pants: pick([...DENIM, '#1f2228', '#5a5f66']), Shoes: pick(SHOE) }; },
  sweater: (c) => { const top = pick(['#7a2a26', '#2f4a3a', '#24344d', '#a8843f', '#d8cdb8', '#6c7a8a', '#46303a', '#8a6a4a']); return { acc: ['sweater', chance(0.3) ? 'tee' : null], Top: top, Sleeve: top, TopDark: darken(top, 0.8), Pants: pick([...CHINO, ...DENIM]), Shoes: pick(['#2a1a12', '#6a4a2e', '#1b1b1d']) }; },
  smart: (c) => { const suit = pick(['#2c2f3a', '#3a3f4a', '#24344d', '#4a3e33', '#5a5f66']); return { acc: ['jacket', chance(0.55) ? 'tie' : null], Top: suit, Sleeve: suit, Lapel: darken(suit, 0.85), Pants: suit, Shirt: pick(['#e9e1cf', '#d8dde3', '#dce8f2']), Tie: pick(['#7a2a26', '#24344d', '#2f4a3a', '#c9922e', '#5c3a8f']), Shoes: pick(['#1b1b1d', '#2a1a12', '#4a2a1a']) }; },
  shirt: (c) => { const top = pick(['#dce8f2', '#e9e1cf', '#8fb0d0', '#c9d8c0', '#e6c8c8', '#3b6e8f', '#d8cdb8']); return { acc: ['shirt'], Top: top, Sleeve: top, Shirt: darken(top, 0.92), Button: '#f3efe4', Pants: pick([...CHINO, ...DENIM]), Shoes: pick(SHOE) }; },
  bomber: (c) => { const top = pick(['#2f4a3a', '#1f2a36', '#1b1b1d', '#5a3b1c', '#7a2a26']); return { acc: ['bomber', 'tee'], Top: top, Sleeve: top, TopDark: pick(['#c9922e', '#1b1b1d', darken(top)]), Pants: pick([...DENIM, '#1f2228']), Shoes: pick(SHOE) }; },
  vest: (c) => { const tee = pick([...NEUTRALS, ...COLOURS]); return { acc: ['vest', 'tee'], Top: tee, Sleeve: c.skin, TopDark: pick(['#1f2a36', '#2f4a3a', '#141414', '#7a2a26', '#c9922e']), Pants: pick(DENIM), Shoes: pick(SHOE) }; },
  track: (c) => { const t = pick(['#1b1b1d', '#24344d', '#2f4a3a', '#7a2a26', '#5a5f66', '#5c2d82']); return { acc: ['track'], Top: t, Sleeve: t, Pants: t, TopDark: darken(t), Shirt: pick(['#ffffff', '#f2cf7c', '#e0455a']), Shoes: pick(['#f0f0f0', '#e8e2d6', '#1b1b1d']) }; },
  jersey: (c) => { const [a, b] = pick(TEAMS); return { acc: ['jersey', 'tee'], Top: a, Sleeve: c.skin, Shirt: b, Pants: pick(['#1b1b1d', '#24344d', '#e8e2d6', ...DENIM]), Shoes: pick(['#f0f0f0', '#1b1b1d']) }; },
  work: (c) => { const t = pick(['#24344d', '#3a3f4a', '#5a5f66', '#2f4a3a']); return { acc: ['hivis', 'tee'], Top: t, Sleeve: t, Apron: pick(['#d7f24a', '#ff8a3c', '#e8f04a']), Metal: '#d8dde3', Pants: pick(['#3a3f4a', '#2b2f38', '#5a4a3a']), Shoes: pick(['#6a4a2e', '#4a3220', '#1b1b1d']) }; },
};

export function randomCustomerLook() {
  const si = Math.floor(Math.random() * SKIN_TONES.length);
  const skin = SKIN_TONES[si];
  const deep = si >= 7;
  const outfitId = weighted([['tee', 18], ['hoodie', 15], ['sweater', 10], ['smart', 8], ['shirt', 10], ['bomber', 7], ['vest', 6], ['track', 9], ['jersey', 7], ['work', 6]]);
  const o = OUTFITS[outfitId]({ skin });
  const accs = o.acc.filter(Boolean);
  // occasional extras — most people wear none or one
  if (chance(0.15)) accs.push('glasses');
  if (chance(0.25)) accs.push('watch');
  if (chance(0.12)) accs.push('earring');
  if (!['smart', 'work'].includes(outfitId) && chance(0.1)) accs.push('chain');
  if (['tee', 'hoodie', 'track'].includes(outfitId) && chance(0.07)) accs.push('headphones');
  else if (['sweater', 'smart', 'shirt'].includes(outfitId) && chance(0.07)) accs.push('scarf');
  // body
  const build = weighted([['slim', 3], ['average', 5], ['broad', 3]]);
  const buildSpec = { slim: { shoulders: 0.92, hips: 0.95 }, average: { shoulders: 1, hips: 1 }, broad: { shoulders: 1.09, hips: 1.04 } }[build];
  if (build !== 'slim' && chance(build === 'broad' ? 0.25 : 0.1)) accs.push('belly');
  // face
  accs.push(weighted([['hd0', 3], ['hd1', 2], ['hd2', 2], ['hd3', 2], ['hd4', 2], ['hd5', 1.5], ['hd6', 1.5], ['hd7', 2]]));
  accs.push(weighted([['ns0', 3], ['ns1', 2], ['ns2', deep ? 3 : 1.5], ['ns3', 2], ['ns4', 1.5], ['ns5', 1.5], ['ns6', 1.5]]));
  const hairColor = deep ? pick(HAIR_DARK) : pick(chance(0.55) ? HAIR_DARK : HAIR_LIGHT);
  const hairType = weighted([['straight', deep ? 2 : 6], ['wavy', deep ? 1 : 3], ['curly', deep ? 3 : 2], ['tight', deep ? 5 : 0.4]]);
  const curl = { straight: rand(0, 0.08), wavy: rand(0.22, 0.38), curly: rand(0.5, 0.72), tight: rand(0.82, 1) }[hairType];
  const colors = {
    ...BASE, Skin: skin, Top: o.Top, Sleeve: o.Sleeve, Pants: o.Pants, Shoes: o.Shoes, Hair: hairColor,
    Iris: deep ? pick(IRIS_DARK) : pick(IRIS_LIGHT),
    Lapel: o.Lapel || o.Top, Shirt: o.Shirt || pick(['#e9e1cf', '#d8dde3', '#ece3c8']), Tie: o.Tie || pick(['#7a2a26', '#24344d', '#2f4a3a']),
    TopDark: o.TopDark || darken(o.Top), Apron: o.Apron || BASE.Apron, Button: o.Button || BASE.Button,
    Metal: o.Metal || pick(['#d1a956', '#d1a956', '#c4c6c6']), Belt: pick(['#2a1d15', '#141414', '#5a3b1c']),
    Frame: pick(['#1d1b1a', '#1d1b1a', '#6a4a2e', '#c4c6c6', '#7a2a26']),
  };
  return {
    colors,
    accessories: accs,
    outfit: outfitId,
    build: buildSpec,
    scale: { slim: rand(0.95, 1.06), average: rand(0.93, 1.05), broad: rand(0.95, 1.07) }[build],
    head: [rand(0.97, 1.04), rand(0.97, 1.04), rand(0.97, 1.03)],
    width: { slim: rand(0.93, 0.98), average: rand(0.98, 1.03), broad: rand(1.03, 1.09) }[build],
    hunch: rand(0, 0.25),
    face: { eye: rand(0.9, 1.12), spread: rand(-0.0025, 0.0025), browThick: rand(0.7, 1.6), browLen: rand(0.85, 1.15), browTilt: rand(-0.12, 0.15), browRaise: rand(-0.0018, 0.0022) },
    cap: ['tee', 'hoodie', 'track', 'jersey', 'work'].includes(outfitId) && chance(0.16) ? pick(['#1b1b1d', '#24344d', '#b8302b', '#e8e2d6', '#2f4a3a', '#c9922e']) : null,
    voice: { pitch: rand(110, 175), rate: rand(0.95, 1.12), wobble: rand(0.06, 0.12), vol: 0.085 },
    hairColor,
    hairType,
    curl,
  };
}

export const TUTORIAL_LOOK = {
  colors: { ...BASE, Skin: '#d29b77', Top: '#2f4a3a', Sleeve: '#d29b77', Pants: '#34404f', Shoes: '#e8e2d6', Hair: '#3a2618', Iris: '#5c4632' },
  accessories: ['tee'],
  scale: 1.0, width: 1.0, hunch: 0.05,
  voice: { pitch: 150, rate: 1.0, wobble: 0.08, vol: 0.09 },
  hairColor: '#3a2618',
};

// VIP guests: fictional celebrities with their own look, line and demands
export const VIPS = [
  { title: 'Footballer', name: 'Rico “Rocket” Alves', line: 'Big match tomorrow. Make it sharp.',
    colors: { Top: '#b8302b', Sleeve: '#b8302b', Pants: '#1f2228', Shoes: '#e8e2d6' }, accessories: ['tee'], skin: '#b77f5c' },
  { title: 'Rapper', name: 'Lil Fade', line: 'Yo. Cameras are outside. Don’t mess this up.',
    colors: { Top: '#171717', Sleeve: '#171717', Pants: '#171717', Shoes: '#e8e2d6', Frame: '#c7a24a', TopDark: '#c7a24a' }, accessories: ['hoodie', 'glasses'], skin: '#6b4330' },
  { title: 'Streamer', name: 'GlitchKid', line: 'I’m live right now, by the way. Say hi to chat.',
    colors: { Top: '#5c3a8f', Sleeve: '#5c3a8f', Pants: '#2b2f38', Shoes: '#3a3f4a' }, accessories: ['hoodie'], skin: '#f1c9a8' },
  { title: 'Actor', name: 'Julian Vance', line: 'Premiere tonight. Nothing too dramatic.',
    colors: { Top: '#2c2f3a', Sleeve: '#2c2f3a', Pants: '#2c2f3a', Shoes: '#1b1b1d', Shirt: '#e9e1cf', Frame: '#111' }, accessories: ['jacket', 'glasses'], skin: '#e3b08c' },
  { title: 'Businessman', name: 'Mr. Sterling', line: 'You have twenty minutes. Impress me.',
    colors: { Top: '#3a3f4a', Sleeve: '#3a3f4a', Pants: '#3a3f4a', Shoes: '#1b1b1d', Tie: '#7a2a26' }, accessories: ['jacket', 'tie'], skin: '#d29b77' },
  { title: 'Influencer', name: 'Kai Lumen', line: 'This is going on my page. No pressure.',
    colors: { Top: '#e0a33c', Sleeve: '#d29b77', Pants: '#e8e2d6', Shoes: '#e8e2d6' }, accessories: ['tee'], skin: '#d29b77' },
];

export const VIP_PERSONALITY = {
  id: 'vip', label: 'VIP', patience: 0.9, payMult: 2.5, tipMult: 1.6, voiceRate: 1.0, vip: true,
  greet: [], happy: ['Now THAT is what I pay for.', 'You’re my barber now. Official.', 'Chat is going crazy. They love it.'],
  bad: ['I can’t go out like this.', 'My manager is going to hear about this.'],
  wait: ['Do you know who I am?'], idle: 'phone',
};
