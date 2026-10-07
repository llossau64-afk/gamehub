// Haircut requests, starting hair, and scoring.
import { clamp, rand } from '../core/util.js';
import { REGIONS, EDGE_REGIONS, hairline, THETA_MAX, TEX_W, TEX_H } from './hair.js';

// Guard lengths in normalised units (1.0 = 60 mm)
export const GUARDS = [
  { id: '0', mm: 0.5, len: 0.008 },
  { id: '0.5', mm: 1.5, len: 0.025 },
  { id: '1', mm: 3, len: 0.05 },
  { id: '2', mm: 6, len: 0.1 },
  { id: '3', mm: 10, len: 0.167 },
  { id: '4', mm: 13, len: 0.217 },
];

export const mm = (len) => Math.round(len * 60);

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
  mullet: {
    name: 'Mullet', price: 55, level: 6, par: 115,
    lines: ['Business in front', 'Party in the back', 'Short sides'],
    target: { top: 0.34, front: 0.3, left: 0.1, right: 0.1, back: 0.55, edges: 0 },
    tol: 0.06,
    start: { top: 0.58, front: 0.56, left: 0.4, right: 0.4, back: 0.7, fuzz: 0.06 },
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
      sum += fadeTarget(f, hl, th); n++;
    }
  }
  return n ? sum / n : f.top;
}
export function fadeTarget(f, hl, theta) { return f.bottom + (f.top - f.bottom) * clamp((hl - theta) / f.height, 0, 1); }
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
// returns { accuracy, symmetry, edges, speed, fade, overall, stars, perRegion }
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
  const stars = starsFor(overall);
  return { accuracy, symmetry, edges, speed, fade, overall, stars, perRegion: per };
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
      err += Math.abs(v - fadeTarget(f, hl, th)); n++;
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
export function startStyle(cutId) {
  const cut = HAIRCUTS[cutId];
  const s = { ...(cut.start || HAIR_START) };
  const j = () => rand(0.92, 1.1);
  for (const k of ['top', 'front', 'left', 'right', 'back']) s[k] = clamp(s[k] * j(), 0.05, 1);
  s.right = s.left * rand(0.95, 1.05);
  s.noise = 0.14;
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
