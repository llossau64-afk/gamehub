import { EXERCISE_BY_ID } from '../data/exercises';
import { dayKey, estimate1RM, uuid } from '../utils';
import type { ExerciseLog, PersonalRecord, WorkoutSession, XPEvent, XPSource } from './types';

/**
 * XP rules. Rewards meaningful participation, never raw volume:
 *  - one full-value workout reward per day (no farming via repeat sessions)
 *  - a minimum amount of real work before a session counts
 *  - personal-record bonuses capped per session, only against your own history
 *  - a daily XP cap so no single day can be "ground out"
 *  - recovery, mobility and check-ins earn XP too, so rest days are rewarded
 */
export const XP = {
  scheduledWorkout: 100,
  partialWorkout: 50,
  extraWorkout: 40,
  personalRecord: 25,
  maxPrsPerSession: 3,
  technique: 15,
  checkin: 30,
  mobility: 40,
  progressReview: 20,
  lightActivity: 25,
  dailyCap: 450,
  minSetsForWorkout: 3,
  minMinutesForWorkout: 8,
} as const;

export const ONCE_PER_DAY: XPSource[] = ['technique', 'checkin', 'mobility', 'progress-review', 'light-activity'];
const CAPPED: XPSource[] = ['scheduled-workout', 'extra-workout', 'personal-record', ...ONCE_PER_DAY];

export function eventsOnDay(events: XPEvent[], day: string): XPEvent[] {
  return events.filter((e) => dayKey(new Date(e.at)) === day);
}

export function totalXp(events: XPEvent[]): number {
  return events.reduce((a, e) => a + e.amount, 0);
}

function cappedRemaining(events: XPEvent[], day: string): number {
  const used = eventsOnDay(events, day)
    .filter((e) => CAPPED.includes(e.source))
    .reduce((a, e) => a + e.amount, 0);
  return Math.max(0, XP.dailyCap - used);
}

/** Award a once-per-day activity. Returns null if already earned today. */
export function awardDaily(
  events: XPEvent[],
  source: Extract<XPSource, 'technique' | 'checkin' | 'mobility' | 'progress-review' | 'light-activity'>,
  now: Date = new Date(),
  ref?: string,
): XPEvent | null {
  const day = dayKey(now);
  if (eventsOnDay(events, day).some((e) => e.source === source)) return null;
  const base = {
    technique: XP.technique,
    checkin: XP.checkin,
    mobility: XP.mobility,
    'progress-review': XP.progressReview,
    'light-activity': XP.lightActivity,
  }[source];
  const amount = Math.min(base, cappedRemaining(events, day));
  if (amount <= 0) return null;
  const label = {
    technique: 'Technique review',
    checkin: 'Recovery check-in',
    mobility: 'Mobility routine',
    'progress-review': 'Progress review',
    'light-activity': 'Light activity',
  }[source];
  return { id: uuid(), source, amount, at: now.toISOString(), ref, label };
}

export function countWorkingSets(exercises: ExerciseLog[]): number {
  return exercises.reduce((a, e) => a + e.sets.filter((s) => s.reps > 0).length, 0);
}

export function plannedSetCount(exercises: ExerciseLog[]): number {
  return exercises.reduce((a, e) => a + (e.planned?.sets ?? 0), 0);
}

export interface WorkoutXPResult {
  events: XPEvent[];
  total: number;
  counted: boolean;
  reason?: string;
}

export function computeWorkoutXP(
  session: Pick<WorkoutSession, 'id' | 'exercises' | 'durationSec' | 'scheduled' | 'prs'>,
  existing: XPEvent[],
  now: Date = new Date(),
): WorkoutXPResult {
  const day = dayKey(now);
  const sets = countWorkingSets(session.exercises);
  if (sets < XP.minSetsForWorkout || session.durationSec < XP.minMinutesForWorkout * 60)
    return {
      events: [],
      total: 0,
      counted: false,
      reason: `Sessions earn XP after at least ${XP.minSetsForWorkout} logged sets and ${XP.minMinutesForWorkout} minutes.`,
    };

  const today = eventsOnDay(existing, day);
  const hadWorkout = today.some((e) => e.source === 'scheduled-workout' || e.source === 'extra-workout');
  let remaining = cappedRemaining(existing, day);
  const out: XPEvent[] = [];
  const push = (source: XPSource, amount: number, label: string, ref?: string) => {
    const a = Math.min(amount, remaining);
    if (a <= 0) return;
    remaining -= a;
    out.push({ id: uuid(), source, amount: a, at: now.toISOString(), ref, label });
  };

  if (!hadWorkout) {
    if (session.scheduled) {
      const planned = plannedSetCount(session.exercises);
      const ratio = planned > 0 ? sets / planned : 1;
      if (ratio >= 0.5) push('scheduled-workout', XP.scheduledWorkout, 'Scheduled session complete', session.id);
      else push('scheduled-workout', XP.partialWorkout, 'Partial session logged', session.id);
    } else push('extra-workout', XP.extraWorkout, 'Training session logged', session.id);
  }

  session.prs.slice(0, XP.maxPrsPerSession).forEach((pr) => {
    push('personal-record', XP.personalRecord, `New record: ${EXERCISE_BY_ID[pr.exerciseId]?.name ?? 'exercise'}`, pr.exerciseId);
  });

  const total = out.reduce((a, e) => a + e.amount, 0);
  return {
    events: out,
    total,
    counted: true,
    reason: hadWorkout ? 'You already earned workout XP today — rest is part of progress.' : undefined,
  };
}

/** Personal records against the user's own history only. */
export function detectPRs(exercises: ExerciseLog[], history: WorkoutSession[], now: Date = new Date()): PersonalRecord[] {
  const prs: PersonalRecord[] = [];
  for (const log of exercises) {
    const valid = log.sets.filter((s) => s.reps > 0);
    if (valid.length === 0) continue;
    const prior = history.flatMap((h) => h.exercises.filter((e) => e.exerciseId === log.exerciseId).flatMap((e) => e.sets)).filter((s) => s.reps > 0);
    if (prior.length === 0) continue; // first exposure is a baseline, not a record
    const ex = EXERCISE_BY_ID[log.exerciseId];
    const weighted = valid.some((s) => (s.weight ?? 0) > 0);
    if (weighted && ex?.loadType === 'weighted') {
      const bestW = Math.max(...valid.map((s) => s.weight ?? 0));
      const prevW = Math.max(0, ...prior.map((s) => s.weight ?? 0));
      const bestE = Math.max(...valid.map((s) => estimate1RM(s.weight ?? 0, s.reps)));
      const prevE = Math.max(0, ...prior.map((s) => estimate1RM(s.weight ?? 0, s.reps)));
      if (bestW > prevW) prs.push({ exerciseId: log.exerciseId, kind: 'weight', value: bestW, previous: prevW || null, at: now.toISOString() });
      else if (bestE > prevE + 0.01)
        prs.push({ exerciseId: log.exerciseId, kind: 'e1rm', value: Math.round(bestE * 10) / 10, previous: Math.round(prevE * 10) / 10, at: now.toISOString() });
    } else {
      const bestR = Math.max(...valid.map((s) => s.reps));
      const prevR = Math.max(0, ...prior.map((s) => s.reps));
      if (bestR > prevR) prs.push({ exerciseId: log.exerciseId, kind: 'reps', value: bestR, previous: prevR, at: now.toISOString() });
    }
  }
  return prs;
}
