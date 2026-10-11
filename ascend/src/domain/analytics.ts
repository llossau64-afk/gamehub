import { addDays, dayKey, estimate1RM, startOfWeek } from '../utils';
import type { PersonalRecord, TrainingPlan, WorkoutSession } from './types';

export type Range = 'W' | 'M' | 'Y';

export interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** W: last 7 days (daily) · M: last 5 weeks (weekly) · Y: last 12 months (monthly). */
export function buckets(range: Range, now: Date = new Date(), offset = 0): Bucket[] {
  const out: Bucket[] = [];
  if (range === 'W') {
    const end = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1 - offset * 7);
    for (let i = 7; i >= 1; i--) {
      const s = addDays(end, -i);
      out.push({ key: dayKey(s), label: DAYS[(s.getDay() + 6) % 7], start: s, end: addDays(s, 1) });
    }
  } else if (range === 'M') {
    const thisWeek = addDays(startOfWeek(now), -offset * 35);
    for (let i = 4; i >= 0; i--) {
      const s = addDays(thisWeek, -7 * i);
      out.push({ key: dayKey(s), label: `${s.getDate()} ${MONTHS[s.getMonth()]}`, start: s, end: addDays(s, 7) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i - offset * 12, 1);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      out.push({ key: `${s.getFullYear()}-${s.getMonth()}`, label: MONTHS[s.getMonth()], start: s, end: e });
    }
  }
  return out;
}

function inBucket(iso: string, b: Bucket): boolean {
  const t = new Date(iso).getTime();
  return t >= b.start.getTime() && t < b.end.getTime();
}

export function sessionSets(s: WorkoutSession): number {
  return s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.reps > 0).length, 0);
}

export function sessionVolumeKg(s: WorkoutSession): number {
  return s.exercises.reduce((a, e) => a + e.sets.reduce((b, x) => b + (x.weight ?? 0) * x.reps, 0), 0);
}

export interface SeriesPoint {
  label: string;
  value: number;
}

export function seriesBy(sessions: WorkoutSession[], range: Range, metric: 'workouts' | 'sets' | 'volume' | 'minutes', now = new Date()): SeriesPoint[] {
  return buckets(range, now).map((b) => {
    const inB = sessions.filter((s) => inBucket(s.finishedAt, b));
    let value = 0;
    if (metric === 'workouts') value = inB.length;
    else if (metric === 'sets') value = inB.reduce((a, s) => a + sessionSets(s), 0);
    else if (metric === 'volume') value = Math.round(inB.reduce((a, s) => a + sessionVolumeKg(s), 0));
    else value = Math.round(inB.reduce((a, s) => a + s.durationSec, 0) / 60);
    return { label: b.label, value };
  });
}

export interface Summary {
  workouts: number;
  sets: number;
  volumeKg: number;
  minutes: number;
  prs: number;
}

export function summarize(sessions: WorkoutSession[], from: Date, to: Date): Summary {
  const inRange = sessions.filter((s) => {
    const t = new Date(s.finishedAt).getTime();
    return t >= from.getTime() && t < to.getTime();
  });
  return {
    workouts: inRange.length,
    sets: inRange.reduce((a, s) => a + sessionSets(s), 0),
    volumeKg: Math.round(inRange.reduce((a, s) => a + sessionVolumeKg(s), 0)),
    minutes: Math.round(inRange.reduce((a, s) => a + s.durationSec, 0) / 60),
    prs: inRange.reduce((a, s) => a + s.prs.length, 0),
  };
}

/** Current period vs the previous equal-length period. */
export function periodComparison(sessions: WorkoutSession[], range: Range, now = new Date()): { current: Summary; previous: Summary } {
  const cur = buckets(range, now);
  const prev = buckets(range, now, 1);
  return {
    current: summarize(sessions, cur[0].start, cur[cur.length - 1].end),
    previous: summarize(sessions, prev[0].start, prev[prev.length - 1].end),
  };
}

export interface StrengthPoint {
  date: string;
  e1rm: number;
  bestWeight: number;
  bestReps: number;
}

export function strengthHistory(exerciseId: string, sessions: WorkoutSession[]): StrengthPoint[] {
  const out: StrengthPoint[] = [];
  for (const s of sessions) {
    const sets = s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets).filter((x) => x.reps > 0);
    if (!sets.length) continue;
    out.push({
      date: s.finishedAt,
      e1rm: Math.round(Math.max(...sets.map((x) => estimate1RM(x.weight ?? 0, x.reps))) * 10) / 10,
      bestWeight: Math.max(...sets.map((x) => x.weight ?? 0)),
      bestReps: Math.max(...sets.map((x) => x.reps)),
    });
  }
  return out;
}

export function trainedExercises(sessions: WorkoutSession[]): { exerciseId: string; count: number }[] {
  const m = new Map<string, number>();
  for (const s of sessions) for (const e of s.exercises) if (e.sets.length) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + 1);
  return Array.from(m, ([exerciseId, count]) => ({ exerciseId, count })).sort((a, b) => b.count - a.count);
}

export function allPRs(sessions: WorkoutSession[]): PersonalRecord[] {
  return sessions.flatMap((s) => s.prs).sort((a, b) => b.at.localeCompare(a.at));
}

/** Scheduled sessions completed vs planned, per week, most recent last. */
export function weeklyConsistency(sessions: WorkoutSession[], plan: TrainingPlan | null, weeks = 8, now = new Date()): { label: string; done: number; planned: number }[] {
  const planned = plan?.days.length ?? 0;
  const out = [];
  const thisWeek = startOfWeek(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const s = addDays(thisWeek, -7 * i);
    const e = addDays(s, 7);
    const done = new Set(
      sessions
        .filter((x) => {
          const t = new Date(x.finishedAt).getTime();
          return t >= s.getTime() && t < e.getTime();
        })
        .map((x) => dayKey(new Date(x.finishedAt))),
    ).size;
    out.push({ label: `${s.getDate()}/${s.getMonth() + 1}`, done, planned });
  }
  return out;
}
