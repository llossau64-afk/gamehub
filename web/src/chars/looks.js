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
const TOPS = ['#7a2a26', '#2f4a3a', '#24344d', '#c9b48a', '#5a5f66', '#8a5a3a', '#3d3d42', '#a8843f', '#6c7a8a', '#d8cdb8', '#46303a'];
const PANTS = ['#2b2f38', '#3a332c', '#4a4f57', '#6a5a44', '#1f2228', '#5a4a3a', '#34404f'];
const SHOES = ['#2a1a12', '#1b1b1d', '#e8e2d6', '#6a4a2e', '#3a3f4a', '#8a2a20'];

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

export function randomCustomerLook() {
  const skin = pick(SKIN);
  const top = pick(TOPS);
  const style = pick(['tee', 'tee', 'hoodie', 'jacket']);
  const accs = [];
  if (style === 'tee') accs.push('tee');
  if (style === 'hoodie') accs.push('hoodie');
  if (style === 'jacket') accs.push('jacket');
  if (chance(0.2)) accs.push('glasses');
  if (chance(0.12)) accs.push('moustache');
  if (chance(0.12)) accs.push('belly');
  const hairColor = pick(HAIR);
  const sleeve = style === 'tee' ? skin : top;
  return {
    colors: { ...BASE, Skin: skin, Top: top, Sleeve: sleeve, Pants: pick(PANTS), Shoes: pick(SHOES), Hair: hairColor, Iris: pick(IRIS),
      Lapel: top, Shirt: pick(['#e9e1cf', '#d8dde3', '#ece3c8']), Tie: pick(['#7a2a26', '#24344d', '#2f4a3a']) },
    accessories: accs,
    scale: rand(0.94, 1.05),
    width: rand(0.96, 1.08),
    hunch: rand(0, 0.25),
    voice: { pitch: rand(120, 175), rate: rand(0.95, 1.12), wobble: rand(0.06, 0.12), vol: 0.085 },
    hairColor,
    curl: chance(0.15) ? rand(0.4, 0.9) : 0,
  };
}

export const TUTORIAL_LOOK = {
  colors: { ...BASE, Skin: '#d29b77', Top: '#2f4a3a', Sleeve: '#d29b77', Pants: '#34404f', Shoes: '#e8e2d6', Hair: '#3a2618', Iris: '#5c4632' },
  accessories: ['tee'],
  scale: 1.0, width: 1.0, hunch: 0.05,
  voice: { pitch: 150, rate: 1.0, wobble: 0.08, vol: 0.09 },
  hairColor: '#3a2618',
};
