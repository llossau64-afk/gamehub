// Haircut requests, starting hair, and scoring.
import { clamp, pick, rand } from '../core/util.js';
import { REGIONS } from './hair.js';

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

// target lengths per region, tolerance (normalised), and what the card says
export const HAIRCUTS = {
  simpleTrim: {
    name: 'Simple Trim', price: 25, level: 1, par: 75,
    lines: ['Keep top medium', 'Shorten sides', 'Clean edges'],
    target: { top: 0.42, front: 0.4, left: 0.167, right: 0.167, back: 0.167, edges: 0 },
    tol: 0.06,
    start: { top: 0.64, front: 0.6, left: 0.4, right: 0.4, back: 0.42, fuzz: 0.07 },
    hint: { sides: '3', top: 'scissors' },
  },
  buzzCut: {
    name: 'Buzz Cut', price: 18, level: 1, par: 55,
    lines: ['Even all over', 'Guard 1 (3 mm)', 'Clean edges'],
    target: { top: 0.05, front: 0.05, left: 0.05, right: 0.05, back: 0.05, edges: 0 },
    tol: 0.03,
    start: { top: 0.4, front: 0.38, left: 0.3, right: 0.3, back: 0.32, fuzz: 0.06 },
    hint: { sides: '1', top: '1' },
  },
  shortBackSides: {
    name: 'Short Back & Sides', price: 30, level: 2, par: 85,
    lines: ['Top a bit shorter', 'Sides & back guard 2', 'Clean edges'],
    target: { top: 0.35, front: 0.34, left: 0.1, right: 0.1, back: 0.1, edges: 0 },
    tol: 0.05,
    start: { top: 0.55, front: 0.55, left: 0.36, right: 0.36, back: 0.4, fuzz: 0.07 },
    hint: { sides: '2', top: 'scissors' },
  },
  crewCut: {
    name: 'Crew Cut', price: 34, level: 3, par: 90,
    lines: ['Short top', 'Guard 1 on the sides', 'Clean edges'],
    target: { top: 0.2, front: 0.24, left: 0.05, right: 0.05, back: 0.05, edges: 0 },
    tol: 0.045,
    start: { top: 0.5, front: 0.5, left: 0.34, right: 0.34, back: 0.36, fuzz: 0.07 },
    hint: { sides: '1', top: '4' },
  },
  basicFade: {
    name: 'Basic Fade', price: 42, level: 4, par: 110, fade: true,
    lines: ['Medium top', 'Sides fade down', 'Guard 0.5 at the bottom'],
    target: { top: 0.38, front: 0.38, left: 0.08, right: 0.08, back: 0.08, edges: 0 },
    tol: 0.05,
    start: { top: 0.6, front: 0.58, left: 0.38, right: 0.38, back: 0.4, fuzz: 0.07 },
    hint: { sides: '0.5 → 3', top: 'scissors' },
  },
};

export function availableHaircuts(level) {
  return Object.entries(HAIRCUTS).filter(([, h]) => h.level <= level).map(([id]) => id);
}

// Scoring ----------------------------------------------------------------
// returns { accuracy, symmetry, edges, finish, speed, overall, stars, perRegion }
export function evaluate(hair, cutId, seconds) {
  const cut = HAIRCUTS[cutId];
  const st = hair.regionStats();
  const per = {};
  let accSum = 0, accW = 0;
  const weights = { top: 1.2, front: 0.8, left: 1, right: 1, back: 1 };
  for (const r of ['top', 'front', 'left', 'right', 'back']) {
    const s = st[r];
    const err = Math.abs(s.mean - cut.target[r]);
    let a = clamp(1 - Math.max(0, err - cut.tol * 0.35) / (cut.tol * 2.6), 0, 1);
    a *= 1 - clamp((s.std - 0.035) / 0.25, 0, 0.4);         // patchy = less accurate
    // bald patches are punished harder than slightly long hair
    const tooShort = cut.target[r] > 0.06 ? hair.damage(r, cut.target[r] * 0.35) : 0;
    a *= 1 - clamp(tooShort * 2.2, 0, 0.7);
    per[r] = { score: a, mean: s.mean, target: cut.target[r], std: s.std };
    accSum += a * weights[r]; accW += weights[r];
  }
  const accuracy = accSum / accW;
  const symmetry = clamp(1 - Math.abs(st.left.mean - st.right.mean) / 0.09, 0, 1);
  const edges = clamp(1 - st.edges.messy * 3.0 - Math.max(0, st.edges.mean - 0.004) * 6, 0, 1);
  per.edges = { score: edges, mean: st.edges.mean, target: 0, std: 0 };
  let fade = null;
  if (cut.fade) fade = fadeScore(hair);
  const speed = clamp(1 - Math.max(0, seconds - cut.par) / (cut.par * 1.6), 0.4, 1);
  let overall = accuracy * 0.58 + symmetry * 0.14 + edges * 0.16 + speed * 0.12;
  if (fade !== null) overall = overall * 0.8 + fade * 0.2;
  const stars = overall >= 0.88 ? 5 : overall >= 0.76 ? 4 : overall >= 0.6 ? 3 : overall >= 0.42 ? 2 : 1;
  return { accuracy, symmetry, edges, speed, fade, overall, stars, perRegion: per };
}

function fadeScore(hair) {
  // sides should get gradually shorter toward the hairline
  const { TEX_W, TEX_H } = { TEX_W: 128, TEX_H: 64 };
  let good = 0, tot = 0;
  for (let i = 0; i < TEX_W; i++) {
    let prev = null;
    for (let j = Math.floor(TEX_H * 0.42); j < TEX_H; j++) {
      const k = j * TEX_W + i;
      const reg = hair.region[k];
      if (reg < 3 || reg > 5) continue;
      const v = hair.len[k];
      if (prev !== null) { tot++; if (v <= prev + 0.006) good++; }
      prev = v;
    }
  }
  return tot ? clamp((good / tot - 0.5) * 2, 0, 1) : 0;
}

// Money ----------------------------------------------------------------
export function payment(cutId, result, personality, mult = {}) {
  const cut = HAIRCUTS[cutId];
  const p = personality;
  const pay = Math.round(cut.price * (0.45 + 0.55 * result.overall) * (p.payMult || 1) * (mult.price || 1));
  const tipPct = [0, 0, 0.02, 0.1, 0.18, 0.28][result.stars] * (p.tipMult || 1) * (mult.tips || 1);
  const tip = Math.round(cut.price * tipPct + (result.stars === 5 ? rand(1, 4) : 0));
  const xp = Math.round(18 + 34 * result.overall + (result.stars === 5 ? 12 : 0));
  return { pay, tip, xp };
}

// starting hair for a customer wanting `cutId`
export function startStyle(cutId) {
  const s = { ...HAIRCUTS[cutId].start };
  const j = () => rand(0.92, 1.1);
  for (const k of ['top', 'front', 'left', 'right', 'back']) s[k] = clamp(s[k] * j(), 0.05, 1);
  s.right = s.left * rand(0.95, 1.05);
  s.noise = 0.14;
  return s;
}

export { REGIONS };
