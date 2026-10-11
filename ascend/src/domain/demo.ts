import { EXERCISE_BY_ID } from '../data/exercises';
import { addDays, dayKey, uuid, weekdayOf } from '../utils';
import { detectPRs } from './xp';
import type { Checkin, TrainingPlan, WorkoutSession } from './types';

/**
 * Sample history for DEMO MODE only. Every screen that shows it carries a
 * visible "DEMO DATA" label; it is never mixed with or saved over real data.
 */
export function buildDemoData(plan: TrainingPlan, now: Date = new Date(), weeks = 12): { sessions: WorkoutSession[]; checkins: Checkin[] } {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const sessions: WorkoutSession[] = [];
  const checkins: Checkin[] = [];
  const start = addDays(now, -weeks * 7);
  const baseLoad: Record<string, number> = {};

  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const day = plan.days.find((x) => x.weekday === weekdayOf(d));
    if (rand() < 0.7)
      checkins.push({
        id: uuid(),
        date: dayKey(d),
        sleep: (3 + Math.round(rand() * 2)) as Checkin['sleep'],
        energy: (2 + Math.round(rand() * 3)) as Checkin['energy'],
        soreness: (1 + Math.round(rand() * 2)) as Checkin['soreness'],
        mood: (3 + Math.round(rand() * 2)) as Checkin['mood'],
        pain: false,
        updatedAt: d.toISOString(),
      });
    if (!day || rand() < 0.15) continue;
    const progress = i / (weeks * 7);
    const startAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, 0);
    const exercises = day.exercises.map((pe) => {
      const ex = EXERCISE_BY_ID[pe.exerciseId];
      const weighted = ex?.loadType === 'weighted';
      const base = (baseLoad[pe.exerciseId] ??= ex?.compound ? 40 : 10);
      const w = weighted ? Math.round((base * (1 + progress * 0.25)) / 2.5) * 2.5 : null;
      return {
        exerciseId: pe.exerciseId,
        planned: pe,
        sets: Array.from({ length: pe.sets }, (_, k) => ({
          weight: w,
          reps: ex?.loadType === 'timed' ? pe.repsMin : Math.max(pe.repsMin, pe.repsMax - k - Math.round(rand())),
          rpe: 7 + Math.round(rand() * 2),
          completedAt: new Date(startAt.getTime() + k * 120000).toISOString(),
        })),
      };
    });
    const durationSec = day.estMinutes * 60 + Math.round(rand() * 300);
    const finishedAt = new Date(startAt.getTime() + durationSec * 1000).toISOString();
    const prs = detectPRs(exercises, sessions, new Date(finishedAt));
    sessions.push({
      id: uuid(),
      planDayId: day.id,
      title: day.title,
      startedAt: startAt.toISOString(),
      finishedAt,
      durationSec,
      exercises,
      scheduled: true,
      xpEarned: 100 + prs.length * 25,
      prs,
      updatedAt: finishedAt,
    });
  }
  return { sessions, checkins };
}
