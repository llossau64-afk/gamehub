import { EXERCISES, EXERCISE_BY_ID } from '../src/data/exercises';
import { generatePlan, scheduleDays } from '../src/domain/plan/generator';
import { exerciseAvailability } from '../src/domain/plan/library';
import { applyFeedback, suggestNext } from '../src/domain/plan/progression';
import { validatePlan, weeklySetsByMuscle } from '../src/domain/plan/validator';
import { workloadLimits } from '../src/domain/safety';
import type { AgeRange, Equipment, Experience, Goal, Profile, TrainingPlan, Weekday, WorkoutSession } from '../src/domain/types';
import { makeProfile } from './helpers/fixtures';

describe('exercise library', () => {
  it('has at least 50 distinct, fully documented exercises', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    expect(new Set(EXERCISES.map((e) => e.name)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      expect(e.steps.length).toBeGreaterThanOrEqual(2);
      expect(e.mistakes.length).toBeGreaterThan(0);
      expect(e.safety.length).toBeGreaterThan(0);
      expect(e.breathing).toBeTruthy();
      expect(e.startingPosition).toBeTruthy();
      expect(e.easier).toBeTruthy();
      expect(e.demo).toBeUndefined(); // no unlicensed demonstrations
    }
  });

  it('only references existing exercises as alternatives', () => {
    for (const e of EXERCISES) {
      for (const alt of e.alternatives) expect(EXERCISE_BY_ID[alt]).toBeDefined();
      if (e.easierId) expect(EXERCISE_BY_ID[e.easierId]).toBeDefined();
    }
  });

  it('covers every category', () => {
    const cats = new Set(EXERCISES.map((e) => e.category));
    for (const c of ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'fullbody', 'mobility', 'cardio']) expect(cats.has(c as never)).toBe(true);
  });
});

describe('generatePlan', () => {
  const goals: Goal[] = ['muscle', 'strength', 'athletic', 'general', 'endurance', 'active'];
  const exps: Experience[] = ['new', 'beginner', 'intermediate', 'advanced'];
  const ages: AgeRange[] = ['13-15', '16-17', '25-34', '65+'];
  const homeKits: Equipment[][] = [[], ['dumbbells'], ['dumbbells', 'bench', 'pullup-bar'], ['bands', 'kettlebell']];
  const daySets: Weekday[][] = [[2], [0, 3], [0, 2, 4], [0, 1, 3, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]];

  const profiles: Profile[] = [];
  for (const goal of goals)
    for (const experience of exps)
      for (const ageRange of ages)
        for (const days of daySets) {
          profiles.push(makeProfile({ goal, experience, ageRange, trainingDays: days }));
          profiles.push(makeProfile({ goal, experience, ageRange, trainingDays: days, location: 'home', equipment: homeKits[days.length % homeKits.length], sessionMinutes: 30, limitations: days.length % 2 ? ['knee'] : ['shoulder', 'lower-back'] }));
        }

  it(`produces a valid plan for ${profiles.length} profile combinations`, () => {
    for (const p of profiles) {
      const { plan } = generatePlan(p);
      const v = validatePlan(plan, p);
      if (!v.ok) throw new Error(`${JSON.stringify(p)}\n${JSON.stringify(v.issues)}`);
      const limits = workloadLimits(p);
      expect(plan.days.length).toBeGreaterThan(0);
      expect(plan.days.length).toBeLessThanOrEqual(limits.maxTrainingDays);
      expect(plan.restDays.length).toBeGreaterThanOrEqual(limits.minRestDays);
      for (const d of plan.days) {
        expect(d.exercises.length).toBeGreaterThanOrEqual(2);
        expect(d.warmup.length).toBeGreaterThan(0);
        for (const pe of d.exercises) {
          expect(exerciseAvailability(pe.exerciseId, p)).toBe('ok');
          expect(pe.sets).toBeGreaterThan(0);
          expect(pe.repsMin).toBeLessThanOrEqual(pe.repsMax);
        }
      }
    }
  });

  it('never needs safety repairs for its own output', () => {
    for (const p of profiles.slice(0, 200)) {
      const v = validatePlan(generatePlan(p).plan, p);
      const repairs = v.issues.filter((i) => i.level === 'fixed');
      expect(repairs).toEqual([]);
    }
  });

  it('respects home equipment', () => {
    const p = makeProfile({ location: 'home', equipment: [] });
    const { plan } = generatePlan(p);
    for (const d of plan.days) for (const e of d.exercises) expect(EXERCISE_BY_ID[e.exerciseId].equipment.every((x) => x === 'bodyweight')).toBe(true);
  });

  it('avoids exercises that load a flagged body area', () => {
    const p = makeProfile({ limitations: ['knee'] });
    const { plan } = generatePlan(p);
    for (const d of plan.days) for (const e of d.exercises) expect(EXERCISE_BY_ID[e.exerciseId].stresses).not.toContain('knee');
  });

  it('keeps youth plans technique-focused', () => {
    const p = makeProfile({ ageRange: '13-15', intensity: 'hard', experience: 'advanced', trainingDays: [0, 1, 2, 3, 4, 5, 6] });
    const { plan } = generatePlan(p);
    expect(plan.days.length).toBeLessThanOrEqual(4);
    for (const d of plan.days)
      for (const e of d.exercises) {
        expect(e.rir).toBeGreaterThanOrEqual(2);
        if (EXERCISE_BY_ID[e.exerciseId].loadType !== 'timed') expect(e.repsMin).toBeGreaterThanOrEqual(8);
        expect(EXERCISE_BY_ID[e.exerciseId].difficulty).not.toBe('advanced');
      }
  });

  it('fits sessions into short time budgets', () => {
    const p = makeProfile({ sessionMinutes: 30 });
    const { plan } = generatePlan(p);
    for (const d of plan.days) expect(d.estMinutes).toBeLessThanOrEqual(40);
  });

  it('prefers the player’s preferred exercises', () => {
    const p = makeProfile({ preferredExercises: ['dumbbell-bench-press'] });
    const { plan } = generatePlan(p);
    expect(plan.days.some((d) => d.exercises.some((e) => e.exerciseId === 'dumbbell-bench-press'))).toBe(true);
  });

  it('spreads training days when fewer are allowed', () => {
    expect(scheduleDays([0, 1, 2, 3, 4, 5, 6], 3)).toEqual([0, 2, 4]);
    expect(scheduleDays([], 3)).toEqual([0, 2, 4]);
  });
});

describe('validatePlan (AI output safety layer)', () => {
  const p = makeProfile({ location: 'home', equipment: ['dumbbells'], limitations: ['shoulder'] });
  const bad: TrainingPlan = {
    id: 'x',
    name: 'AI',
    split: 'x',
    createdAt: '',
    updatedAt: '',
    source: 'ai',
    restDays: [],
    progression: [],
    recoveryNotes: [],
    techniqueNotes: [],
    rationale: '',
    warnings: [],
    days: [0, 1, 2, 3, 4, 5, 6].map((wd) => ({
      id: `d${wd}`,
      weekday: wd as Weekday,
      title: `Day ${wd}`,
      focus: '',
      warmup: [],
      cooldown: [],
      estMinutes: 0,
      exercises: [
        { exerciseId: 'barbell-bench-press', sets: 12, repsMin: 1, repsMax: 100, restSec: 5, rir: -1 },
        { exerciseId: 'made-up-exercise', sets: 3, repsMin: 8, repsMax: 12, restSec: 60, rir: 2 },
        { exerciseId: 'goblet-squat', sets: 3, repsMin: 8, repsMax: 12, restSec: 60, rir: 2 },
        { exerciseId: 'goblet-squat', sets: 3, repsMin: 8, repsMax: 12, restSec: 60, rir: 2 },
        { exerciseId: 'one-arm-dumbbell-row', sets: 3, repsMin: 12, repsMax: 8, restSec: 60, rir: 2 },
      ],
    })),
  };

  it('repairs unsafe AI plans', () => {
    const v = validatePlan(bad, p);
    expect(v.ok).toBe(true);
    expect(v.plan.days.length).toBeLessThanOrEqual(6);
    expect(v.plan.restDays.length).toBeGreaterThanOrEqual(1);
    const limits = workloadLimits(p);
    for (const d of v.plan.days) {
      expect(new Set(d.exercises.map((e) => e.exerciseId)).size).toBe(d.exercises.length);
      for (const e of d.exercises) {
        expect(exerciseAvailability(e.exerciseId, p)).toBe('ok');
        expect(e.sets).toBeLessThanOrEqual(limits.maxSetsPerExercise);
        expect(e.restSec).toBeGreaterThanOrEqual(30);
        expect(e.rir).toBeGreaterThanOrEqual(0);
        expect(e.repsMin).toBeLessThanOrEqual(e.repsMax);
        expect(e.exerciseId).not.toBe('made-up-exercise');
      }
    }
    for (const [m, sets] of Object.entries(weeklySetsByMuscle(v.plan))) if (m !== 'cardio') expect(sets).toBeLessThanOrEqual(limits.maxWeeklySetsPerMuscle);
    expect(v.issues.some((i) => i.level === 'fixed')).toBe(true);
  });

  it('rejects plans with no usable content', () => {
    const empty = { ...bad, days: [{ ...bad.days[0], exercises: [{ exerciseId: 'nope', sets: 3, repsMin: 8, repsMax: 10, restSec: 60, rir: 2 }] }] };
    expect(validatePlan(empty, p).ok).toBe(false);
  });
});

describe('progression', () => {
  const planned = { exerciseId: 'goblet-squat', sets: 3, repsMin: 8, repsMax: 12, restSec: 90, rir: 2 };
  const session = (reps: number[], weight: number, rpe = 8, extra: Partial<WorkoutSession> = {}): WorkoutSession => ({
    id: Math.random().toString(),
    planDayId: 'd',
    title: 't',
    startedAt: '2026-01-01T10:00:00Z',
    finishedAt: '2026-01-01T11:00:00Z',
    durationSec: 3600,
    exercises: [{ exerciseId: 'goblet-squat', sets: reps.map((r) => ({ weight, reps: r, rpe, completedAt: '' })) }],
    scheduled: true,
    xpEarned: 0,
    prs: [],
    updatedAt: '',
    ...extra,
  });

  it('suggests a baseline for new exercises', () => {
    expect(suggestNext(planned, []).trend).toBe('new');
  });
  it('adds load when every set hits the top of the range', () => {
    const s = suggestNext(planned, [session([12, 12, 12], 20)]);
    expect(s.trend).toBe('up');
    expect(s.weight).toBeGreaterThan(20);
  });
  it('holds when the last session was very hard', () => {
    const s = suggestNext(planned, [session([12, 12, 12], 20, 10)]);
    expect(s.trend).toBe('hold');
    expect(s.weight).toBe(20);
  });
  it('deloads after two sessions below range', () => {
    const s = suggestNext(planned, [session([6, 5, 5], 30), session([6, 6, 5], 30)]);
    expect(s.trend).toBe('down');
    expect(s.weight).toBeLessThan(30);
  });
  it('reduces load after reported pain in a loaded area', () => {
    const s = suggestNext(planned, [
      session([10, 10, 10], 20, 8, { feedback: { completed: 'yes', difficulty: 3, techniqueComfortable: true, unusualPain: true, painArea: 'knee', adjustNext: 'keep' } }),
    ]);
    expect(s.trend).toBe('down');
  });

  it('swaps exercises away from a painful area and stays valid', () => {
    const p = makeProfile();
    const { plan } = generatePlan(p);
    const r = applyFeedback(plan, plan.days[0].id, { completed: 'yes', difficulty: 3, techniqueComfortable: true, unusualPain: true, painArea: 'knee', adjustNext: 'keep' }, p);
    expect(r.changes.length).toBeGreaterThan(0);
    for (const d of r.plan.days) for (const e of d.exercises) expect(EXERCISE_BY_ID[e.exerciseId].stresses).not.toContain('knee');
    expect(validatePlan(r.plan, p).ok).toBe(true);
  });

  it('shortens and eases sessions on request', () => {
    const p = makeProfile();
    const { plan } = generatePlan(p);
    const before = plan.days[0].exercises.length;
    const r = applyFeedback(plan, plan.days[0].id, { completed: 'yes', difficulty: 5, techniqueComfortable: true, unusualPain: false, adjustNext: 'shorter' }, p);
    expect(r.plan.days[0].exercises.length).toBe(before - 1);
  });
});
