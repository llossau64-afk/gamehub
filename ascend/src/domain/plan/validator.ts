import { EXERCISE_BY_ID } from '../../data/exercises';
import { clamp } from '../../utils';
import { isMinor, workloadLimits } from '../safety';
import type { PlanDay, Profile, TrainingPlan, Weekday } from '../types';
import { capWeeklyVolume, estimateMinutes } from './generator';
import { exerciseAvailability, findSubstitute } from './library';

export interface ValidationIssue {
  level: 'error' | 'fixed' | 'warning';
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  plan: TrainingPlan;
  issues: ValidationIssue[];
}

const PUSH = new Set(['horizontal-push', 'vertical-push']);
const PULL = new Set(['horizontal-pull', 'vertical-pull']);
const LOWER = new Set(['squat', 'hinge', 'lunge', 'isolation-lower']);

/**
 * Deterministic safety layer. Every plan — AI-generated, edited by the user,
 * or adjusted after feedback — passes through here. Problems are repaired where
 * a safe repair exists; anything unrecoverable makes `ok` false so the caller
 * falls back to the deterministic generator.
 */
export function validatePlan(input: TrainingPlan, profile: Profile): ValidationResult {
  const issues: ValidationIssue[] = [];
  const limits = workloadLimits(profile);
  const minor = isMinor(profile.ageRange);
  const plan: TrainingPlan = JSON.parse(JSON.stringify(input));

  // ── Schedule ──
  const seen = new Set<Weekday>();
  plan.days = plan.days.filter((d) => {
    if (typeof d.weekday !== 'number' || d.weekday < 0 || d.weekday > 6) {
      issues.push({ level: 'fixed', message: `Removed "${d.title}": invalid weekday.` });
      return false;
    }
    if (seen.has(d.weekday)) {
      issues.push({ level: 'fixed', message: `Removed duplicate session on the same day ("${d.title}").` });
      return false;
    }
    seen.add(d.weekday);
    return true;
  });
  plan.days.sort((a, b) => a.weekday - b.weekday);

  const maxDays = Math.min(limits.maxTrainingDays, 7 - limits.minRestDays);
  if (plan.days.length > maxDays) {
    issues.push({ level: 'fixed', message: `Reduced to ${maxDays} training days to protect recovery.` });
    plan.days = plan.days.slice(0, maxDays);
  }
  plan.restDays = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter((d) => !plan.days.some((x) => x.weekday === d));

  // ── Exercises ──
  for (const day of plan.days) {
    const used = new Set<string>();
    const kept: PlanDay['exercises'] = [];
    for (const pe of day.exercises ?? []) {
      let id = pe.exerciseId;
      const availability = exerciseAvailability(id, profile);
      if (availability !== 'ok') {
        const sub = availability === 'unknown' ? undefined : findSubstitute(id, profile, used);
        const name = EXERCISE_BY_ID[id]?.name ?? id;
        if (!sub) {
          issues.push({ level: 'fixed', message: `Removed ${name} from ${day.title} (${reasonText(availability)}).` });
          continue;
        }
        issues.push({ level: 'fixed', message: `Replaced ${name} with ${sub.name} (${reasonText(availability)}).` });
        id = sub.id;
      }
      if (used.has(id)) {
        issues.push({ level: 'fixed', message: `Removed duplicate ${EXERCISE_BY_ID[id].name} in ${day.title}.` });
        continue;
      }
      used.add(id);
      const ex = EXERCISE_BY_ID[id];
      const timed = ex.loadType === 'timed';
      const fixed = {
        ...pe,
        exerciseId: id,
        sets: clamp(Math.round(pe.sets || 0), 1, limits.maxSetsPerExercise),
        repsMin: timed ? clamp(Math.round(pe.repsMin || 0), 10, 3600) : clamp(Math.round(pe.repsMin || 0), limits.minReps, limits.maxReps),
        repsMax: timed ? clamp(Math.round(pe.repsMax || 0), 10, 3600) : clamp(Math.round(pe.repsMax || 0), limits.minReps, limits.maxReps),
        restSec: clamp(Math.round(pe.restSec || 0), limits.minRestSec, limits.maxRestSec),
        rir: clamp(Math.round(pe.rir ?? 2), limits.minRir, 5),
      };
      if (fixed.repsMax < fixed.repsMin) [fixed.repsMin, fixed.repsMax] = [fixed.repsMax, fixed.repsMin];
      if (
        fixed.sets !== pe.sets ||
        fixed.repsMin !== pe.repsMin ||
        fixed.repsMax !== pe.repsMax ||
        fixed.restSec !== pe.restSec ||
        fixed.rir !== pe.rir
      )
        issues.push({ level: 'fixed', message: `Adjusted sets/reps/rest for ${ex.name} to safe limits.` });
      kept.push(fixed);
    }
    if (kept.length > limits.maxExercisesPerSession) {
      issues.push({ level: 'fixed', message: `Trimmed ${day.title} to ${limits.maxExercisesPerSession} exercises.` });
      kept.length = limits.maxExercisesPerSession;
    }
    let total = kept.reduce((a, e) => a + e.sets, 0);
    while (total > limits.maxSetsPerSession) {
      const target = [...kept].sort((a, b) => b.sets - a.sets)[0];
      if (!target || target.sets <= 1) break;
      target.sets -= 1;
      total -= 1;
    }
    if (total === limits.maxSetsPerSession && (day.exercises ?? []).reduce((a, e) => a + (e.sets || 0), 0) > total)
      issues.push({ level: 'fixed', message: `Capped ${day.title} at ${limits.maxSetsPerSession} total sets.` });
    day.exercises = kept;
    day.estMinutes = estimateMinutes(kept);
    if (!Array.isArray(day.warmup) || day.warmup.length === 0) {
      day.warmup = ['5 min easy cardio', 'Dynamic movements for the muscles you will train', 'Lighter ramp-up sets for the first exercise'];
      issues.push({ level: 'fixed', message: `Added a warm-up to ${day.title}.` });
    }
    if (!Array.isArray(day.cooldown)) day.cooldown = [];
  }

  // ── Weekly volume per muscle ──
  for (const muscle of capWeeklyVolume(plan.days, limits.maxWeeklySetsPerMuscle))
    issues.push({ level: 'fixed', message: `Reduced weekly sets for ${muscle} to stay within recovery limits.` });
  plan.days.forEach((d) => (d.estMinutes = estimateMinutes(d.exercises)));

  // ── Balance & completeness ──
  plan.days = plan.days.filter((d) => {
    if (d.exercises.length >= 2) return true;
    issues.push({ level: 'error', message: `"${d.title}" has too few valid exercises.` });
    return false;
  });
  if (plan.days.length === 0) issues.push({ level: 'error', message: 'Plan has no valid training days.' });

  let push = 0;
  let pull = 0;
  let lower = 0;
  for (const d of plan.days)
    for (const pe of d.exercises) {
      const p = EXERCISE_BY_ID[pe.exerciseId].pattern;
      if (PUSH.has(p)) push += pe.sets;
      if (PULL.has(p)) pull += pe.sets;
      if (LOWER.has(p)) lower += pe.sets;
    }
  if (push > 0 && pull < push * 0.6)
    issues.push({ level: 'warning', message: 'Pushing volume clearly exceeds pulling volume — consider adding a row or pulldown.' });
  if (plan.days.length >= 2 && lower === 0 && profile.goal !== 'endurance')
    issues.push({ level: 'warning', message: 'No lower-body training this week.' });
  if (plan.days.length > 0 && plan.restDays.length < limits.minRestDays)
    issues.push({ level: 'error', message: 'Not enough rest days.' });

  if (minor && plan.days.some((d) => d.exercises.some((e) => e.rir < 2)))
    issues.push({ level: 'error', message: 'Youth plans must not train close to failure.' });

  plan.days.forEach((d) => {
    if (d.estMinutes > profile.sessionMinutes * 1.35)
      issues.push({ level: 'warning', message: `${d.title} may take ~${d.estMinutes} min, longer than your ${profile.sessionMinutes} min.` });
  });

  plan.warnings = Array.from(new Set([...(plan.warnings ?? []), ...issues.filter((i) => i.level === 'warning').map((i) => i.message)]));
  const ok = !issues.some((i) => i.level === 'error');
  return { ok, plan, issues };
}

export function weeklySetsByMuscle(plan: TrainingPlan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of plan.days)
    for (const pe of d.exercises) {
      const ex = EXERCISE_BY_ID[pe.exerciseId];
      if (!ex) continue;
      for (const m of ex.primary) out[m] = (out[m] ?? 0) + pe.sets;
    }
  return out;
}

function reasonText(a: string): string {
  switch (a) {
    case 'equipment':
      return 'equipment not available';
    case 'limitation':
      return 'avoids an area you flagged';
    case 'difficulty':
      return 'too advanced for now';
    default:
      return 'not in the exercise library';
  }
}
