/**
 * Levels & ranks. Ranks are fictional game titles earned through consistent,
 * sustainable training. They say nothing about appearance or worth.
 */

export interface RankDef {
  id: 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
  name: string;
  title: string;
  minLevel: number;
  blurb: string;
}

export const RANKS: RankDef[] = [
  { id: 'E', name: 'E-RANK', title: 'Beginner', minLevel: 1, blurb: 'Every journey starts with the first session.' },
  { id: 'D', name: 'D-RANK', title: 'Explorer', minLevel: 10, blurb: 'You are discovering how your body responds to training.' },
  { id: 'C', name: 'C-RANK', title: 'Challenger', minLevel: 20, blurb: 'Training has become part of who you are.' },
  { id: 'B', name: 'B-RANK', title: 'Warrior', minLevel: 35, blurb: 'Months of steady effort. Your habits are forged.' },
  { id: 'A', name: 'A-RANK', title: 'Elite', minLevel: 50, blurb: 'A rare level of dedication and consistency.' },
  { id: 'S', name: 'S-RANK', title: 'Ascended', minLevel: 70, blurb: 'Years of patient, intelligent training.' },
  { id: 'SS', name: 'SS-RANK', title: 'Mythic', minLevel: 100, blurb: 'A legend of consistency. The journey continues.' },
];

/** XP needed to go from `level` to `level + 1`. Gently increasing curve. */
export function xpToNext(level: number): number {
  return 150 + 50 * (level - 1);
}

/** Total XP required to reach `level` from level 1. */
export function totalXpForLevel(level: number): number {
  // Σ_{l=1}^{level-1} (150 + 50(l-1)) = 150(n) + 50·n(n-1)/2 with n = level-1
  const n = Math.max(0, level - 1);
  return 150 * n + 25 * n * (n - 1);
}

export interface LevelInfo {
  level: number;
  intoLevel: number;
  needed: number;
  progress: number; // 0..1
  totalXp: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (totalXpForLevel(level + 1) <= xp) level++;
  const base = totalXpForLevel(level);
  const needed = xpToNext(level);
  return { level, intoLevel: xp - base, needed, progress: (xp - base) / needed, totalXp: xp };
}

export function rankForLevel(level: number): RankDef {
  let r = RANKS[0];
  for (const rank of RANKS) if (level >= rank.minLevel) r = rank;
  return r;
}

export function nextRank(level: number): RankDef | null {
  return RANKS.find((r) => r.minLevel > level) ?? null;
}
