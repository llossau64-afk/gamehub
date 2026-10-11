import { EXERCISE_BY_ID } from '../../data/exercises';
import { round } from '../../utils';
import type { BodyArea, ExerciseLog, PlannedExercise, Profile, TrainingPlan, WorkoutFeedback, WorkoutSession } from '../types';
import { findSubstitute } from './library';
import { validatePlan } from './validator';

export interface LastPerformance {
  date: string;
  sets: { weight: number | null; reps: number; rpe: number | null }[];
}

export function lastPerformance(exerciseId: string, sessions: WorkoutSession[]): LastPerformance | null {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const log = sessions[i].exercises.find((e) => e.exerciseId === exerciseId && e.sets.length > 0);
    if (log) return { date: sessions[i].finishedAt, sets: log.sets.map(({ weight, reps, rpe }) => ({ weight, reps, rpe })) };
  }
  return null;
}

export interface Suggestion {
  weight: number | null;
  reps: number;
  reason: string;
  trend: 'up' | 'hold' | 'down' | 'new';
}

function increment(exerciseId: string): number {
  const ex = EXERCISE_BY_ID[exerciseId];
  if (!ex) return 2.5;
  const lower = ['squat', 'hinge', 'lunge'].includes(ex.pattern);
  if (ex.equipment.includes('dumbbells') || ex.equipment.includes('kettlebell')) return lower ? 2.5 : 1;
  if (!ex.compound) return 1.25;
  return lower ? 5 : 2.5;
}

/**
 * Double-progression recommendation for the next session of an exercise,
 * informed by the most recent logged performance and session feedback.
 */
export function suggestNext(planned: PlannedExercise, sessions: WorkoutSession[]): Suggestion {
  const ex = EXERCISE_BY_ID[planned.exerciseId];
  const last = lastPerformance(planned.exerciseId, sessions);
  if (!last || last.sets.length === 0)
    return {
      weight: null,
      reps: planned.repsMin,
      trend: 'new',
      reason: 'First time: pick a load you could lift for a few more reps than the target, and focus on technique.',
    };

  const lastSession = [...sessions].reverse().find((s) => s.exercises.some((e) => e.exerciseId === planned.exerciseId));
  const fb = lastSession?.feedback;
  const working = last.sets;
  const topWeight = Math.max(...working.map((s) => s.weight ?? 0));
  const allHitTop = working.length >= planned.sets && working.every((s) => s.reps >= planned.repsMax);
  const anyMissed = working.some((s) => s.reps < planned.repsMin);
  const rpes = working.map((s) => s.rpe).filter((x): x is number => x != null);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const veryHard = (avgRpe != null && avgRpe >= 9.5) || fb?.difficulty === 5 || fb?.adjustNext === 'easier';

  if (fb?.unusualPain && ex && fb.painArea && ex.stresses.includes(fb.painArea))
    return {
      weight: topWeight > 0 ? round(topWeight * 0.8, 0.5) : null,
      reps: planned.repsMin,
      trend: 'down',
      reason: 'You reported pain last time in an area this exercise loads. Go lighter, stop if it hurts, and consider a substitute.',
    };

  if (ex?.loadType !== 'weighted' || topWeight <= 0) {
    const bestReps = Math.max(...working.map((s) => s.reps));
    if (veryHard) return { weight: null, reps: Math.max(planned.repsMin, bestReps - 1), trend: 'hold', reason: 'Last session felt very hard — repeat it with crisp form.' };
    if (bestReps >= planned.repsMax)
      return {
        weight: null,
        reps: planned.repsMax,
        trend: 'up',
        reason: ex?.loadType === 'timed' ? 'You hit the top of the range — add 5–10 seconds or a harder variation.' : 'You hit the top of the range — try a harder variation or add a slow tempo.',
      };
    return { weight: null, reps: Math.min(planned.repsMax, bestReps + 1), trend: 'up', reason: 'Aim for one more rep than last time.' };
  }

  if (veryHard)
    return { weight: topWeight, reps: planned.repsMin, trend: 'hold', reason: 'Last session felt very hard. Keep the weight and own every rep.' };
  if (allHitTop && (avgRpe == null || avgRpe <= 8.5))
    return {
      weight: round(topWeight + increment(planned.exerciseId), 0.25),
      reps: planned.repsMin,
      trend: 'up',
      reason: `All sets hit ${planned.repsMax} reps — time to add a little load.`,
    };
  if (anyMissed) {
    const prior = sessions.filter((s) => s.exercises.some((e) => e.exerciseId === planned.exerciseId && e.sets.length)).slice(-2);
    const missedTwice =
      prior.length === 2 &&
      prior.every((s) => s.exercises.find((e) => e.exerciseId === planned.exerciseId)!.sets.some((x) => x.reps < planned.repsMin));
    if (missedTwice)
      return { weight: round(topWeight * 0.9, 0.5), reps: planned.repsMin, trend: 'down', reason: 'Two sessions below the target range — a 10% reset will help you build back stronger.' };
    return { weight: topWeight, reps: planned.repsMin, trend: 'hold', reason: 'Stay at this weight until you reach the target range on every set.' };
  }
  const bestReps = Math.max(...working.map((s) => s.reps));
  return {
    weight: topWeight,
    reps: Math.min(planned.repsMax, bestReps + 1),
    trend: 'up',
    reason: 'Same weight — aim to add a rep to each set.',
  };
}

export interface FeedbackResult {
  plan: TrainingPlan;
  changes: string[];
}

/** Apply post-workout feedback to the plan, then re-validate it. */
export function applyFeedback(
  plan: TrainingPlan,
  dayId: string | null,
  feedback: WorkoutFeedback,
  profile: Profile,
  now: Date = new Date(),
): FeedbackResult {
  const next: TrainingPlan = JSON.parse(JSON.stringify(plan));
  const changes: string[] = [];
  const day = next.days.find((d) => d.id === dayId);

  if (feedback.unusualPain && feedback.painArea) {
    const area: BodyArea = feedback.painArea;
    const tmpProfile = { ...profile, limitations: Array.from(new Set([...profile.limitations, area])) };
    for (const d of next.days) {
      const used = new Set(d.exercises.map((e) => e.exerciseId));
      d.exercises = d.exercises.map((pe) => {
        const ex = EXERCISE_BY_ID[pe.exerciseId];
        if (!ex || !ex.stresses.includes(area)) return pe;
        const sub = findSubstitute(pe.exerciseId, tmpProfile, used);
        if (!sub) return pe;
        used.add(sub.id);
        changes.push(`${d.title}: swapped ${ex.name} → ${sub.name} to unload your ${area.replace('-', ' ')}.`);
        return { ...pe, exerciseId: sub.id };
      });
    }
  }

  if (day) {
    if (feedback.adjustNext === 'shorter' && day.exercises.length > 3) {
      const removed = day.exercises.pop()!;
      changes.push(`${day.title}: removed ${EXERCISE_BY_ID[removed.exerciseId]?.name} to shorten the session.`);
    }
    if (feedback.adjustNext === 'easier' || feedback.difficulty === 5) {
      day.exercises.forEach((pe, i) => {
        if (i > 0 && pe.sets > 2) pe.sets -= 1;
        pe.rir = Math.min(4, pe.rir + 1);
      });
      changes.push(`${day.title}: one fewer set on accessories and a little more in reserve.`);
    }
    if (feedback.adjustNext === 'harder' && feedback.difficulty <= 3 && !feedback.unusualPain) {
      const first = day.exercises[0];
      if (first) {
        first.sets += 1;
        changes.push(`${day.title}: added a set to ${EXERCISE_BY_ID[first.exerciseId]?.name}.`);
      }
    }
    if (!feedback.techniqueComfortable) {
      changes.push('Technique flagged as uncomfortable — review the exercise guide and use the easier variation next time.');
    }
  }

  const validated = validatePlan(next, profile);
  if (!validated.ok) return { plan, changes: [] };
  if (changes.length) {
    validated.plan.updatedAt = now.toISOString();
    validated.plan.source = plan.source === 'ai' ? 'ai' : plan.source;
  }
  return { plan: validated.plan, changes };
}

export function sessionVolume(logs: ExerciseLog[]): number {
  let v = 0;
  for (const l of logs) for (const s of l.sets) v += (s.weight ?? 0) * s.reps;
  return v;
}
