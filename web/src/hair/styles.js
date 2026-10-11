// Haircut requests, starting hair, and scoring.
import { clamp, rand, pick } from '../core/util.js';
import { REGIONS, EDGE_REGIONS, hairline, THETA_MAX, TEX_W, TEX_H } from './hair.js';

// Guard lengths in normalised units (1.0 = 60 mm)
export const GUARDS = [
  { id: '0', mm: 0.5, len: 0.008 },
  { id: '0.5', mm: 1.5, len: 0.025 },
  { id: '1', mm: 3, len: 0.05 },
  { id: '1.5', mm: 4.5, len: 0.075 },
  { id: '2', mm: 6, len: 0.1 },
  { id: '3', mm: 10, len: 0.167 },
  { id: '4', mm: 13, len: 0.217 },
];

export const mm = (len) => Math.round(len * 60);
export const guardIndex = (id) => GUARDS.findIndex((g) => g.id === id);

const HAIR_START = { top: 0.6, front: 0.58, left: 0.38, right: 0.38, back: 0.4, fuzz: 0.07 };
const BEARD_START = { chin: 0.3, cheeks: 0.24, moustache: 0.26, neck: 0.12 };

// target lengths per region (normalised), tolerance, and what the card says.
// fade: side/back lengths blend from `bottom` at the hairline to `top` over `height` (radians up the head)
export const HAIRCUTS = {
  simpleTrim: {
    name: 'Simple Trim', price: 25, level: 1, par: 75,
    lines: ['Keep top medium', 'Shorten sides', 'Clean edges'],
    target: { top: 0.42, front: 0.4, left: 0.167, right: 0.167, back: 0.167, edges: 0 },
    tol: 0.06,
    start: { top: 0.64, front: 0.6, left: 0.4, right: 0.4, back: 0.42, fuzz: 0.07 },
  },
  buzzCut: {
    name: 'Buzz Cut', price: 18, level: 1, par: 55,
    lines: ['Even all over', 'Guard 1 (3 mm)', 'Clean edges'],
    target: { top: 0.05, front: 0.05, left: 0.05, right: 0.05, back: 0.05, edges: 0 },
    tol: 0.03,
    start: { top: 0.4, front: 0.38, left: 0.3, right: 0.3, back: 0.32, fuzz: 0.06 },
  },
  beardTrim: {
    name: 'Beard Trim', price: 16, level: 1, par: 60, beard: true,
    lines: ['Tidy the beard', 'Short on the cheeks', 'Clean neckline'],
    target: { chin: 0.1, cheeks: 0.07, moustache: 0.1, neck: 0 },
    tol: 0.035,
    beardStart: BEARD_START,
  },
  shortBackSides: {
    name: 'Short Back & Sides', price: 30, level: 2, par: 85,
    lines: ['Top a bit shorter', 'Sides & back guard 2', 'Clean edges'],
    target: { top: 0.35, front: 0.34, left: 0.1, right: 0.1, back: 0.1, edges: 0 },
    tol: 0.05,
    start: { top: 0.55, front: 0.55, left: 0.36, right: 0.36, back: 0.4, fuzz: 0.07 },
  },
  cleanShave: {
    name: 'Clean Shave', price: 20, level: 2, par: 60, beard: true,
    lines: ['Everything off', 'Trimmer close to the skin', 'Keep it smooth'],
    target: { chin: 0, cheeks: 0, moustache: 0, neck: 0 },
    tol: 0.02,
    beardStart: { chin: 0.14, cheeks: 0.1, moustache: 0.12, neck: 0.08 },
  },
  crewCut: {
    name: 'Crew Cut', price: 34, level: 3, par: 90,
    lines: ['Short top', 'Guard 1 on the sides', 'Clean edges'],
    target: { top: 0.2, front: 0.24, left: 0.05, right: 0.05, back: 0.05, edges: 0 },
    tol: 0.045,
    start: { top: 0.5, front: 0.5, left: 0.34, right: 0.34, back: 0.36, fuzz: 0.07 },
  },
  trimAndBeard: {
    name: 'Trim & Beard', price: 44, level: 3, par: 130, beard: true,
    lines: ['Simple trim on top', 'Sides guard 3', 'Beard tidy, clean neck'],
    target: { top: 0.42, front: 0.4, left: 0.167, right: 0.167, back: 0.167, edges: 0, chin: 0.12, cheeks: 0.08, neck: 0 },
    tol: 0.06,
    start: { top: 0.62, front: 0.6, left: 0.4, right: 0.4, back: 0.42, fuzz: 0.07 },
    beardStart: BEARD_START,
  },
  basicFade: {
    name: 'Basic Fade', price: 42, level: 4, par: 110,
    lines: ['Medium top', 'Sides fade from 1.5 to 10 mm', 'Clean edges'],
    target: { top: 0.38, front: 0.38, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.025, top: 0.167, height: 0.55 },
    tol: 0.05,
    start: HAIR_START,
  },
  texturedCrop: {
    name: 'Textured Crop', price: 46, level: 5, par: 110,
    styling: { dir: 'forward', volume: 0.4, label: 'Forward, powder texture' },
    lines: ['Short textured top', 'Short fringe', 'Sides guard 1, faded'],
    target: { top: 0.28, front: 0.22, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.025, top: 0.1, height: 0.4 },
    tol: 0.045,
    start: HAIR_START,
  },
  midFade: {
    name: 'Mid Fade', price: 52, level: 5, par: 120,
    lines: ['Longer top', 'Fade from 0.5 mm up to 13 mm', 'Sharp edges'],
    target: { top: 0.45, front: 0.42, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.008, top: 0.217, height: 0.7 },
    tol: 0.05,
    start: { top: 0.66, front: 0.62, left: 0.4, right: 0.4, back: 0.42, fuzz: 0.08 },
  },
  skinFade: {
    name: 'Skin Fade', price: 60, level: 6, par: 125,
    lines: ['Skin at the bottom', 'Blend up to 6 mm', 'Medium top'],
    target: { top: 0.36, front: 0.34, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.0, top: 0.1, height: 0.6 },
    tol: 0.045,
    start: HAIR_START,
  },
  taperFade: {
    name: 'Taper Fade', price: 38, level: 3, par: 100,
    lines: ['Keep the length on top', 'Taper only at the hairline', 'Clean edges'],
    target: { top: 0.4, front: 0.38, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.05, top: 0.2, height: 0.28 },
    tol: 0.055,
    start: HAIR_START,
  },
  sidePart: {
    name: 'Side Part', price: 45, level: 4, par: 115, style: 'part',
    styling: { dir: 'part', product: 0.4, label: 'Side part, a bit of wax' },
    lines: ['Classic top, keep it long', 'Sides guard 2', 'Comb it into a side part'],
    target: { top: 0.46, front: 0.5, left: 0.1, right: 0.1, back: 0.1, edges: 0 },
    tol: 0.06,
    start: { top: 0.66, front: 0.7, left: 0.36, right: 0.36, back: 0.38, fuzz: 0.07 },
  },
  lowFade: {
    name: 'Low Fade', price: 46, level: 4, par: 115,
    lines: ['Medium top', 'Fade starts just above the ear', 'Sharp edges'],
    target: { top: 0.4, front: 0.38, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.008, top: 0.167, height: 0.36 },
    tol: 0.05,
    start: HAIR_START,
  },
  frenchCrop: {
    name: 'French Crop', price: 48, level: 5, par: 115,
    styling: { dir: 'forward', product: 0.25, label: 'Fringe brushed forward' },
    lines: ['Short top, longer fringe', 'Blunt fringe with scissors', 'Sides faded to 6 mm'],
    target: { top: 0.22, front: 0.32, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.008, top: 0.1, height: 0.45 },
    tol: 0.045,
    start: HAIR_START,
  },
  slickBack: {
    name: 'Slick Back', price: 58, level: 5, par: 125, style: 'back',
    styling: { dir: 'back', product: 0.7, label: 'Slicked back with wax' },
    lines: ['Keep the top long', 'Sides faded to 13 mm', 'Comb everything back'],
    target: { top: 0.58, front: 0.56, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.05, top: 0.217, height: 0.6 },
    tol: 0.06,
    start: { top: 0.76, front: 0.74, left: 0.42, right: 0.42, back: 0.44, fuzz: 0.07 },
  },
  highFade: {
    name: 'High Fade', price: 58, level: 6, par: 125,
    lines: ['Short medium top', 'Fade goes high, almost to the top', 'Skin at the bottom'],
    target: { top: 0.32, front: 0.3, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.0, top: 0.1, height: 0.95 },
    tol: 0.045,
    start: HAIR_START,
  },
  curlyFade: {
    name: 'Curly Top', price: 62, level: 7, par: 130, curly: true,
    styling: { dir: 'up', volume: 0.5, label: 'Curls lifted, volume' },
    lines: ['Keep the curls on top', 'Mid fade on the sides', 'Shape it with scissors'],
    target: { top: 0.5, front: 0.44, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.008, top: 0.167, height: 0.62 },
    tol: 0.06,
    start: { top: 0.72, front: 0.66, left: 0.42, right: 0.42, back: 0.44, fuzz: 0.08 },
  },
  longerTop: {
    name: 'Longer Top', price: 44, level: 3, par: 110,
    styling: { dir: 'messy', volume: 0.45, label: 'Messy with volume' },
    lines: ['Messy longer top', 'Scissors on top, keep the length', 'Sides faded to 6 mm'],
    target: { top: 0.55, front: 0.5, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.008, top: 0.1, height: 0.5 },
    tol: 0.06,
    start: { top: 0.76, front: 0.7, left: 0.42, right: 0.42, back: 0.44, fuzz: 0.08 },
  },
  curtainHair: {
    name: 'Curtain Hair', price: 50, level: 4, par: 120, style: 'center',
    styling: { dir: 'center', volume: 0.2, label: 'Parted in the middle' },
    lines: ['Long top, middle parting', 'Sides and back tidy at 18 mm', 'Comb it away from the centre'],
    target: { top: 0.56, front: 0.62, left: 0.3, right: 0.3, back: 0.3, edges: 0 },
    tol: 0.065,
    start: { top: 0.78, front: 0.82, left: 0.48, right: 0.48, back: 0.5, fuzz: 0.07 },
  },
  mullet: {
    name: 'Mullet', price: 55, level: 6, par: 115,
    lines: ['Business in front', 'Party in the back', 'Short sides'],
    target: { top: 0.34, front: 0.3, left: 0.1, right: 0.1, back: 0.55, edges: 0 },
    tol: 0.06,
    start: { top: 0.58, front: 0.56, left: 0.4, right: 0.4, back: 0.7, fuzz: 0.06 },
  },
  quiff: {
    name: 'Quiff', price: 64, level: 6, par: 135,
    styling: { dir: 'up', volume: 0.7, product: 0.35, label: 'Blow-dried up, wax to hold' },
    lines: ['Long front, swept up', 'Low fade to 10 mm', 'Dryer + wax for the quiff'],
    target: { top: 0.5, front: 0.62, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.008, top: 0.167, height: 0.4 },
    tol: 0.06,
    start: { top: 0.74, front: 0.82, left: 0.42, right: 0.42, back: 0.44, fuzz: 0.07 },
  },
  burstFade: {
    name: 'Burst Fade', price: 60, level: 6, par: 130,
    styling: { dir: 'forward', volume: 0.3, label: 'Top pushed forward' },
    lines: ['Fade curves around the ear', 'Back stays longer', 'Top medium, textured'],
    target: { top: 0.38, front: 0.36, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.008, top: 0.167, height: 0.6, burst: true },
    tol: 0.05,
    start: HAIR_START,
  },
  dropFade: {
    name: 'Drop Fade', price: 58, level: 7, par: 130,
    lines: ['Fade drops behind the ear', 'Skin at the bottom, 10 mm up top', 'Clean edges'],
    target: { top: 0.4, front: 0.38, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.0, top: 0.167, height: 0.55, drop: true },
    tol: 0.05,
    start: HAIR_START,
  },
  edgarCut: {
    name: 'Edgar Cut', price: 62, level: 7, par: 130,
    styling: { dir: 'forward', product: 0.3, label: 'Blunt fringe, combed forward' },
    lines: ['Straight blunt fringe', 'High skin fade', 'Comb it all forward'],
    target: { top: 0.3, front: 0.3, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.0, top: 0.1, height: 0.85 },
    tol: 0.045,
    start: HAIR_START,
  },
  modernMullet: {
    name: 'Modern Mullet', price: 62, level: 7, par: 130,
    styling: { dir: 'messy', volume: 0.45, label: 'Messy, powder texture' },
    lines: ['Textured top', 'Tapered sides', 'Long in the back'],
    target: { top: 0.4, front: 0.36, left: 0.1, right: 0.1, back: 0.5, edges: 0 },
    tol: 0.06,
    start: { top: 0.62, front: 0.6, left: 0.4, right: 0.4, back: 0.7, fuzz: 0.07 },
  },
  burstMullet: {
    name: 'Burst Fade Mullet', price: 72, level: 8, par: 145,
    styling: { dir: 'messy', volume: 0.4, label: 'Messy texture' },
    lines: ['Burst fade around the ear', 'Long flow in the back', 'Textured top'],
    target: { top: 0.4, front: 0.36, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.008, top: 0.167, height: 0.55, burst: true, backLen: 0.5 },
    tol: 0.06,
    start: { top: 0.64, front: 0.6, left: 0.42, right: 0.42, back: 0.72, fuzz: 0.07 },
  },
  curlyTaper: {
    name: 'Curly Taper', price: 56, level: 6, par: 125, curly: true,
    styling: { dir: 'up', volume: 0.45, label: 'Curls lifted with powder' },
    lines: ['Keep the curls on top', 'Taper at the hairline only', 'Shape with scissors'],
    target: { top: 0.5, front: 0.46, left: 0, right: 0, back: 0, edges: 0 },
    fade: { bottom: 0.025, top: 0.2, height: 0.3 },
    tol: 0.06,
    start: { top: 0.72, front: 0.66, left: 0.42, right: 0.42, back: 0.44, fuzz: 0.08 },
  },
};

// mean target of a faded region (what the length bar shows)
function fadeMean(f, region) {
  let sum = 0, n = 0;
  for (let i = 0; i < TEX_W; i++) {
    const phi = (i + 0.5) / TEX_W * Math.PI * 2 - Math.PI;
    const a = Math.abs(phi);
    const inRegion = region === 'back' ? a > 2.3 : region === 'left' ? (phi > 0 && a <= 2.3 && a > 0.73) : (phi < 0 && a <= 2.3 && a > 0.73);
    if (!inRegion) continue;
    const hl = hairline(phi);
    for (let j = 0; j < TEX_H; j++) {
      const th = (j + 0.5) / TEX_H * THETA_MAX;
      if (th < 0.95 || th > hl) continue;
      sum += fadeTarget(f, hl, th, phi); n++;
    }
  }
  return n ? sum / n : f.top;
}
// burst: the fade arcs around the ear and the back keeps its length (or grows to backLen);
// drop: the fade line sits higher on the sides and drops down behind the ear
export function fadeTarget(f, hl, theta, phi = Math.PI / 2) {
  const a = Math.abs(phi);
  let h = f.height, top = f.top;
  if (f.drop) h *= 1 + 0.55 * clamp(1 - Math.abs(a - 1.4) / 1.2, 0, 1) - 0.35 * clamp((a - 2.4) / 0.6, 0, 1);
  let t = clamp((hl - theta) / h, 0, 1);
  if (f.burst) {
    const ear = clamp(1 - Math.abs(a - 1.65) / 0.9, 0, 1);   // 1 over the ear, 0 at the temple and nape
    t = clamp(t + (1 - ear) * 1.2, 0, 1);
    if (f.backLen) top = top + (f.backLen - top) * clamp((a - 2.2) / 0.6, 0, 1);
  }
  return f.bottom + (top - f.bottom) * t;
}
for (const c of Object.values(HAIRCUTS)) if (c.fade) for (const r of ['left', 'right', 'back']) c.target[r] = fadeMean(c.fade, r);

export function availableHaircuts(level) {
  return Object.entries(HAIRCUTS).filter(([, h]) => h.level <= level).map(([id]) => id);
}

// merged stats of scalp and beard
export function stats(c) {
  const out = c.hair.regionStats();
  if (c.beard) Object.assign(out, c.beard.regionStats());
  return out;
}

const WEIGHTS = { top: 1.2, front: 0.8, left: 1, right: 1, back: 1, chin: 1.2, cheeks: 1, moustache: 0.8 };

// Scoring ----------------------------------------------------------------
// returns { accuracy, symmetry, edges, speed, fade, style, overall, stars, perRegion }
export function evaluate(c, cutId, seconds) {
  const cut = HAIRCUTS[cutId];
  const st = stats(c);
  const per = {};
  let accSum = 0, accW = 0, edgeSum = 0, edgeN = 0;
  for (const [r, tgt] of Object.entries(cut.target)) {
    const s = st[r];
    if (!s) continue;
    if (EDGE_REGIONS.has(r)) {
      const e = clamp(1 - s.messy * 3.0 - Math.max(0, s.mean - 0.004) * 6, 0, 1);
      per[r] = { score: e, mean: s.mean, target: 0, std: 0 };
      edgeSum += e; edgeN++;
      continue;
    }
    const err = Math.abs(s.mean - tgt);
    let a = clamp(1 - Math.max(0, err - cut.tol * 0.35) / (cut.tol * 2.6), 0, 1);
    if (!cut.fade || !['left', 'right', 'back'].includes(r)) a *= 1 - clamp((s.std - 0.035) / 0.25, 0, 0.4);
    // bald patches are punished harder than slightly long hair
    const sys = ['chin', 'cheeks', 'moustache'].includes(r) ? c.beard : c.hair;
    const tooShort = tgt > 0.06 ? sys.damage(r, tgt * 0.35) : 0;
    a *= 1 - clamp(tooShort * 2.2, 0, 0.7);
    per[r] = { score: a, mean: s.mean, target: tgt, std: s.std };
    const w = WEIGHTS[r] ?? 1;
    accSum += a * w; accW += w;
  }
  const accuracy = accW ? accSum / accW : 1;
  const symmetry = 'left' in cut.target ? clamp(1 - Math.abs(st.left.mean - st.right.mean) / 0.09, 0, 1) : 1;
  const edges = edgeN ? edgeSum / edgeN : 1;
  const fade = cut.fade ? fadeScore(c.hair, cut.fade) : null;
  const speed = clamp(1 - Math.max(0, seconds - cut.par) / (cut.par * 1.6), 0.4, 1);
  let overall = accuracy * 0.58 + symmetry * 0.14 + edges * 0.16 + speed * 0.12;
  if (fade !== null) overall = overall * 0.75 + fade * 0.25;
  // styling: direction / product / volume against what the cut asks for
  let style = null;
  if (cut.styling) style = clamp(c.hair.styledShare() * 0.3 + c.hair.styleScore(cut.styling) * 0.7, 0, 1);
  else if (cut.style) style = c.hair.styledShare();
  if (style !== null) overall = overall * 0.78 + style * 0.22;
  const stars = starsFor(overall);
  return { accuracy, symmetry, edges, speed, fade, style, overall, stars, perRegion: per };
}

export const starsFor = (o) => (o >= 0.88 ? 5 : o >= 0.76 ? 4 : o >= 0.6 ? 3 : o >= 0.42 ? 2 : 1);

// how closely sides and back follow the fade gradient, texel by texel
export function fadeScore(hair, f) {
  let err = 0, n = 0, order = 0, orderN = 0;
  for (let i = 0; i < TEX_W; i++) {
    const phi = (i + 0.5) / TEX_W * Math.PI * 2 - Math.PI;
    const hl = hairline(phi);
    let prev = null;
    for (let j = 0; j < TEX_H; j++) {
      const k = j * TEX_W + i;
      const reg = hair.region[k];
      if (reg < 3 || reg > 5) continue;
      const th = (j + 0.5) / TEX_H * THETA_MAX;
      const v = hair.len[k];
      err += Math.abs(v - fadeTarget(f, hl, th, phi)); n++;
      if (prev !== null) { orderN++; if (v <= prev + 0.008) order++; }
      prev = v;
    }
  }
  if (!n) return 0;
  const closeness = clamp(1 - (err / n) / 0.07, 0, 1);
  const smooth = orderN ? clamp((order / orderN - 0.5) * 2, 0, 1) : 0;
  return closeness * 0.7 + smooth * 0.3;
}

// Money ----------------------------------------------------------------
export function payment(cutId, result, personality, mult = {}) {
  const cut = HAIRCUTS[cutId];
  const p = personality;
  const pay = Math.round(cut.price * (0.45 + 0.55 * result.overall) * (p.payMult || 1) * (mult.price || 1));
  const tipPct = [0, 0, 0.02, 0.1, 0.18, 0.28][result.stars] * (p.tipMult || 1) * (mult.tips || 1);
  const tip = Math.round(cut.price * tipPct + (result.stars === 5 ? rand(1, 4) : 0));
  const xp = Math.round(18 + 34 * result.overall + (result.stars === 5 ? 12 : 0) + (cut.level - 1) * 3);
  return { pay, tip, xp };
}

// starting hair for a customer wanting `cutId`
// How customers walk in: genuinely different starting hair. Each preset is a region length
// spec (0..1); `types` says which hair types it suits.
export const START_PRESETS = {
  grownBuzz: { name: 'Grown-out buzz', spec: { top: 0.3, front: 0.3, left: 0.27, right: 0.27, back: 0.28, fuzz: 0.08, noise: 0.12 }, types: ['straight', 'wavy', 'curly', 'tight'] },
  messyShort: { name: 'Messy short', spec: { top: 0.48, front: 0.52, left: 0.32, right: 0.32, back: 0.34, fuzz: 0.08, noise: 0.32 }, types: ['straight', 'wavy'] },
  grownFade: { name: 'Grown-out fade', spec: { top: 0.55, front: 0.55, left: 0.3, right: 0.3, back: 0.31, fuzz: 0.07, fade: 0.45, noise: 0.14 }, types: ['straight', 'wavy', 'curly', 'tight'] },
  shortCurls: { name: 'Short curls', spec: { top: 0.5, front: 0.46, left: 0.42, right: 0.42, back: 0.42, fuzz: 0.06, noise: 0.2 }, types: ['curly', 'tight'] },
  mediumCurls: { name: 'Medium curls', spec: { top: 0.72, front: 0.7, left: 0.55, right: 0.55, back: 0.56, fuzz: 0.06, noise: 0.22 }, types: ['curly', 'tight', 'wavy'] },
  sidePart: { name: 'Side part', spec: { top: 0.62, front: 0.66, left: 0.34, right: 0.36, back: 0.36, fuzz: 0.06, noise: 0.1 }, types: ['straight', 'wavy'] },
  messyFringe: { name: 'Messy fringe', spec: { top: 0.66, front: 0.82, left: 0.4, right: 0.4, back: 0.42, fuzz: 0.08, noise: 0.28 }, types: ['straight', 'wavy'] },
  grownCrop: { name: 'Grown-out crop', spec: { top: 0.58, front: 0.64, left: 0.3, right: 0.3, back: 0.32, fuzz: 0.07, noise: 0.18 }, types: ['straight', 'wavy', 'curly'] },
  textured: { name: 'Short textured', spec: { top: 0.46, front: 0.46, left: 0.28, right: 0.28, back: 0.3, fuzz: 0.07, noise: 0.3 }, types: ['straight', 'wavy', 'curly'] },
  topShortSides: { name: 'Medium top, short sides', spec: { top: 0.72, front: 0.7, left: 0.24, right: 0.24, back: 0.27, fuzz: 0.08, fade: 0.3, noise: 0.15 }, types: ['straight', 'wavy', 'curly', 'tight'] },
  longer: { name: 'Longer hair', spec: { top: 0.86, front: 0.86, left: 0.62, right: 0.62, back: 0.72, fuzz: 0.06, noise: 0.16 }, types: ['straight', 'wavy', 'curly'] },
  afro: { name: 'Short afro', spec: { top: 0.66, front: 0.6, left: 0.56, right: 0.56, back: 0.56, fuzz: 0.05, noise: 0.12 }, types: ['tight'] },
};

// the starting hair for a cut: a preset that suits the customer's hair type and leaves
// something to cut everywhere the request wants it shorter
export function startStyle(cutId, look = null) {
  const cut = HAIRCUTS[cutId];
  const tgt = cut.target || {};
  const type = look?.hairType || 'straight';
  const ok = (p) => ['top', 'front', 'left', 'right', 'back'].every((k) => tgt[k] === undefined || p.spec[k] >= tgt[k] + 0.12);
  let choices = Object.values(START_PRESETS).filter((p) => p.types.includes(type) && ok(p));
  if (!choices.length) choices = Object.values(START_PRESETS).filter(ok);
  const base = choices.length ? pick(choices).spec : (cut.start || HAIR_START);
  const s = { ...base };
  const j = () => rand(0.94, 1.08);
  for (const k of ['top', 'front', 'left', 'right', 'back']) s[k] = clamp(s[k] * j(), 0.05, 1);
  s.right = s.left * rand(0.95, 1.05);
  s.noise = base.noise ?? 0.14;
  return s;
}

export function startBeard(cutId) {
  const b = HAIRCUTS[cutId].beardStart;
  if (!b) return null;
  const out = { noise: 0.25 };
  for (const [k, v] of Object.entries(b)) out[k] = clamp(v * rand(0.9, 1.12), 0, 1);
  return out;
}

export { REGIONS };
