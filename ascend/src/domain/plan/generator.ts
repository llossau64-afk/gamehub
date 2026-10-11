import { EXERCISE_BY_ID } from '../../data/exercises';
import { uuid, WEEKDAY_LONG } from '../../utils';
import { effectiveIntensity, isMinor, isOlderAdult, workloadLimits } from '../safety';
import type { Exercise, Goal, Pattern, PlanDay, PlannedExercise, Profile, TrainingPlan, Weekday } from '../types';
import { availableExercises } from './library';

type Role = 'main' | 'acc' | 'core' | 'cardio';
interface Slot {
  role: Role;
  patterns: Pattern[];
  prefs: string[];
}
interface DayTemplate {
  key: string;
  title: string;
  focus: string;
  slots: Slot[];
}

const S = (role: Role, patterns: Pattern[], prefs: string[]): Slot => ({ role, patterns, prefs });

const SQUAT = ['back-squat', 'goblet-squat', 'leg-press', 'bodyweight-squat'];
const SQUAT_ALT = ['leg-press', 'goblet-squat', 'back-squat', 'bodyweight-squat'];
const HINGE_MAIN = ['deadlift', 'romanian-deadlift', 'dumbbell-romanian-deadlift', 'hip-thrust', 'glute-bridge'];
const HINGE_ACC = ['romanian-deadlift', 'dumbbell-romanian-deadlift', 'hip-thrust', 'glute-bridge'];
const GLUTE = ['hip-thrust', 'glute-bridge', 'kettlebell-swing', 'dumbbell-romanian-deadlift'];
const LUNGE = ['bulgarian-split-squat', 'walking-lunge', 'step-up', 'bodyweight-squat'];
const HPUSH = ['barbell-bench-press', 'dumbbell-bench-press', 'machine-chest-press', 'push-up'];
const INCLINE = ['incline-dumbbell-press', 'machine-chest-press', 'push-up', 'dumbbell-bench-press'];
const VPUSH = ['overhead-press', 'seated-dumbbell-shoulder-press', 'landmine-press', 'pike-push-up', 'push-up'];
const VPUSH_ACC = ['seated-dumbbell-shoulder-press', 'landmine-press', 'pike-push-up', 'push-up'];
const HPULL = ['seated-cable-row', 'one-arm-dumbbell-row', 'chest-supported-dumbbell-row', 'barbell-row', 'inverted-row', 'band-pull-apart'];
const HPULL_B = ['chest-supported-dumbbell-row', 'barbell-row', 'one-arm-dumbbell-row', 'seated-cable-row', 'inverted-row', 'band-pull-apart'];
const VPULL = ['pull-up', 'lat-pulldown', 'inverted-row', 'one-arm-dumbbell-row', 'band-pull-apart'];
const VPULL_ACC = ['lat-pulldown', 'pull-up', 'inverted-row', 'one-arm-dumbbell-row'];
const REAR = ['face-pull', 'band-pull-apart', 'reverse-dumbbell-fly'];
const LATERAL = ['lateral-raise', 'face-pull', 'band-pull-apart'];
const BICEPS = ['dumbbell-curl', 'cable-curl', 'barbell-curl', 'hammer-curl'];
const BICEPS_B = ['hammer-curl', 'barbell-curl', 'dumbbell-curl', 'cable-curl'];
const TRICEPS = ['cable-triceps-pushdown', 'overhead-dumbbell-triceps-extension', 'close-grip-push-up'];
const TRICEPS_B = ['overhead-dumbbell-triceps-extension', 'close-grip-push-up', 'cable-triceps-pushdown'];
const HAMSTRING_ISO = ['lying-leg-curl', 'glute-bridge', 'dumbbell-romanian-deadlift'];
const QUAD_ISO = ['leg-extension', 'step-up', 'bodyweight-squat'];
const CALF = ['standing-calf-raise'];
const CORE_A = ['plank', 'dead-bug', 'bird-dog'];
const CORE_B = ['dead-bug', 'pallof-press', 'side-plank', 'bird-dog'];
const CORE_C = ['side-plank', 'farmer-carry', 'hanging-knee-raise', 'plank'];
const CARDIO = ['rowing-machine', 'stationary-bike', 'incline-walk', 'brisk-walk', 'jumping-jack'];
const POWER = ['kettlebell-swing', 'dumbbell-thruster', 'burpee', 'mountain-climber', 'jumping-jack'];

const FULL_A: DayTemplate = {
  key: 'full-a',
  title: 'Full Body A',
  focus: 'Squat · Horizontal push & pull',
  slots: [
    S('main', ['squat'], SQUAT),
    S('main', ['horizontal-push'], HPUSH),
    S('acc', ['horizontal-pull'], HPULL),
    S('acc', ['hinge'], HINGE_ACC),
    S('acc', ['vertical-push'], VPUSH_ACC),
    S('core', ['core'], CORE_A),
  ],
};
const FULL_B: DayTemplate = {
  key: 'full-b',
  title: 'Full Body B',
  focus: 'Hinge · Vertical push & pull',
  slots: [
    S('main', ['hinge'], HINGE_MAIN),
    S('main', ['vertical-pull'], VPULL),
    S('acc', ['vertical-push'], VPUSH),
    S('acc', ['lunge'], LUNGE),
    S('acc', ['horizontal-pull', 'isolation-upper'], REAR),
    S('core', ['core'], CORE_B),
  ],
};
const FULL_C: DayTemplate = {
  key: 'full-c',
  title: 'Full Body C',
  focus: 'Single-leg · Incline press · Arms',
  slots: [
    S('main', ['squat', 'lunge'], ['goblet-squat', 'leg-press', 'bulgarian-split-squat', 'back-squat', 'bodyweight-squat']),
    S('main', ['horizontal-push'], INCLINE),
    S('acc', ['horizontal-pull'], HPULL_B),
    S('acc', ['hinge'], GLUTE),
    S('acc', ['isolation-upper'], BICEPS),
    S('acc', ['isolation-upper', 'horizontal-push'], TRICEPS),
    S('core', ['carry', 'core'], CORE_C),
  ],
};
const UPPER_A: DayTemplate = {
  key: 'upper-a',
  title: 'Upper Body A',
  focus: 'Chest · Back · Arms',
  slots: [
    S('main', ['horizontal-push'], HPUSH),
    S('main', ['horizontal-pull'], HPULL),
    S('acc', ['vertical-push'], VPUSH_ACC),
    S('acc', ['vertical-pull'], VPULL_ACC),
    S('acc', ['isolation-upper'], LATERAL),
    S('acc', ['isolation-upper'], BICEPS),
    S('acc', ['isolation-upper', 'horizontal-push'], TRICEPS),
  ],
};
const UPPER_B: DayTemplate = {
  key: 'upper-b',
  title: 'Upper Body B',
  focus: 'Shoulders · Lats · Arms',
  slots: [
    S('main', ['vertical-push'], VPUSH),
    S('main', ['vertical-pull'], VPULL),
    S('acc', ['horizontal-push'], INCLINE),
    S('acc', ['horizontal-pull'], HPULL_B),
    S('acc', ['horizontal-pull', 'isolation-upper'], REAR),
    S('acc', ['isolation-upper'], BICEPS_B),
    S('acc', ['isolation-upper', 'horizontal-push'], TRICEPS_B),
  ],
};
const LOWER_A: DayTemplate = {
  key: 'lower-a',
  title: 'Lower Body A',
  focus: 'Squat focus · Hamstrings · Core',
  slots: [
    S('main', ['squat'], SQUAT),
    S('acc', ['hinge'], HINGE_ACC),
    S('acc', ['lunge'], LUNGE),
    S('acc', ['isolation-lower', 'hinge'], HAMSTRING_ISO),
    S('acc', ['isolation-lower'], CALF),
    S('core', ['core'], CORE_A),
  ],
};
const LOWER_B: DayTemplate = {
  key: 'lower-b',
  title: 'Lower Body B',
  focus: 'Hinge focus · Quads · Core',
  slots: [
    S('main', ['hinge'], HINGE_MAIN),
    S('acc', ['squat'], SQUAT_ALT),
    S('acc', ['lunge'], ['step-up', 'walking-lunge', 'bulgarian-split-squat', 'bodyweight-squat']),
    S('acc', ['isolation-lower', 'lunge'], QUAD_ISO),
    S('acc', ['hinge'], GLUTE),
    S('core', ['core'], CORE_B),
  ],
};
const PUSH: DayTemplate = {
  key: 'push',
  title: 'Push',
  focus: 'Chest · Shoulders · Triceps',
  slots: [
    S('main', ['horizontal-push'], HPUSH),
    S('main', ['vertical-push'], VPUSH),
    S('acc', ['horizontal-push'], INCLINE),
    S('acc', ['isolation-upper'], ['lateral-raise', 'cable-fly', 'band-pull-apart']),
    S('acc', ['isolation-upper', 'horizontal-push'], TRICEPS),
    S('acc', ['isolation-upper', 'horizontal-push'], TRICEPS_B),
  ],
};
const PULL: DayTemplate = {
  key: 'pull',
  title: 'Pull',
  focus: 'Back · Rear shoulders · Biceps',
  slots: [
    S('main', ['vertical-pull'], VPULL),
    S('main', ['horizontal-pull'], HPULL),
    S('acc', ['horizontal-pull'], HPULL_B),
    S('acc', ['horizontal-pull', 'isolation-upper'], REAR),
    S('acc', ['isolation-upper'], BICEPS),
    S('acc', ['isolation-upper'], BICEPS_B),
  ],
};
const LEGS: DayTemplate = {
  key: 'legs',
  title: 'Legs',
  focus: 'Quads · Hamstrings · Glutes',
  slots: [
    S('main', ['squat'], SQUAT),
    S('main', ['hinge'], HINGE_ACC),
    S('acc', ['lunge'], LUNGE),
    S('acc', ['isolation-lower', 'hinge'], HAMSTRING_ISO),
    S('acc', ['isolation-lower'], CALF),
    S('core', ['core'], CORE_C),
  ],
};

export function chooseSplit(days: number): { name: string; templates: DayTemplate[] } {
  switch (days) {
    case 1:
      return { name: 'Full Body', templates: [FULL_A] };
    case 2:
      return { name: 'Full Body A/B', templates: [FULL_A, FULL_B] };
    case 3:
      return { name: 'Full Body A/B/C', templates: [FULL_A, FULL_B, FULL_C] };
    case 4:
      return { name: 'Upper / Lower', templates: [UPPER_A, LOWER_A, UPPER_B, LOWER_B] };
    case 5:
      return { name: 'Upper / Lower + Push / Pull / Legs', templates: [UPPER_A, LOWER_A, PUSH, PULL, LEGS] };
    default:
      return { name: 'Push / Pull / Legs ×2', templates: [PUSH, PULL, LEGS, PUSH, PULL, LEGS] };
  }
}

interface Scheme {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
}

export function repScheme(goal: Goal, role: Role, profile: Pick<Profile, 'experience' | 'ageRange'>): Scheme {
  const table: Record<Goal, Record<'main' | 'acc', Scheme>> = {
    strength: { main: { sets: 4, repsMin: 4, repsMax: 6, restSec: 180 }, acc: { sets: 3, repsMin: 8, repsMax: 10, restSec: 90 } },
    muscle: { main: { sets: 3, repsMin: 6, repsMax: 10, restSec: 120 }, acc: { sets: 3, repsMin: 10, repsMax: 15, restSec: 75 } },
    athletic: { main: { sets: 4, repsMin: 5, repsMax: 8, restSec: 150 }, acc: { sets: 3, repsMin: 8, repsMax: 12, restSec: 75 } },
    general: { main: { sets: 3, repsMin: 8, repsMax: 12, restSec: 90 }, acc: { sets: 2, repsMin: 10, repsMax: 15, restSec: 60 } },
    endurance: { main: { sets: 3, repsMin: 12, repsMax: 15, restSec: 60 }, acc: { sets: 2, repsMin: 15, repsMax: 20, restSec: 45 } },
    active: { main: { sets: 2, repsMin: 10, repsMax: 15, restSec: 60 }, acc: { sets: 2, repsMin: 12, repsMax: 15, restSec: 60 } },
  };
  const base = { ...table[goal][role === 'main' ? 'main' : 'acc'] };
  if (profile.experience === 'new') base.sets = Math.max(2, base.sets - 1);
  if (profile.experience === 'advanced' && role === 'main') base.sets += 1;
  if (isMinor(profile.ageRange)) {
    // Youth guidance: moderate loads, technique first — no very low rep work.
    base.repsMin = Math.max(base.repsMin, 8);
    base.repsMax = Math.max(base.repsMax, base.repsMin + 4);
    base.sets = Math.min(base.sets, 3);
  }
  if (isOlderAdult(profile.ageRange)) base.restSec = Math.max(base.restSec, 90);
  return base;
}

function timedScheme(ex: Exercise, goal: Goal): Scheme {
  if (ex.category === 'cardio') {
    const minutes = goal === 'endurance' ? 20 : goal === 'active' ? 15 : 10;
    return { sets: 1, repsMin: minutes * 60, repsMax: minutes * 60, restSec: 60 };
  }
  if (ex.pattern === 'carry') return { sets: 3, repsMin: 30, repsMax: 45, restSec: 60 };
  return { sets: 3, repsMin: 20, repsMax: 45, restSec: 45 };
}

const SET_WORK_SEC = 45;

export function estimateMinutes(exercises: PlannedExercise[]): number {
  let sec = 8 * 60; // warm-up
  for (const pe of exercises) {
    const ex = EXERCISE_BY_ID[pe.exerciseId];
    const work = ex?.loadType === 'timed' ? pe.repsMax : SET_WORK_SEC;
    sec += pe.sets * work + Math.max(0, pe.sets - 1) * pe.restSec + 60; // +60 transition/setup
  }
  return Math.round(sec / 60);
}

function rirFor(profile: Profile): number {
  const intensity = effectiveIntensity(profile);
  const rir = intensity === 'easy' ? 3 : intensity === 'moderate' ? 2 : 1;
  return Math.max(rir, workloadLimits(profile).minRir);
}

/** Spread training days through the week if the user selected more than allowed. */
export function scheduleDays(selected: Weekday[], max: number): Weekday[] {
  const days = Array.from(new Set(selected)).sort((a, b) => a - b) as Weekday[];
  if (days.length === 0) return [0, 2, 4].slice(0, Math.max(1, Math.min(3, max))) as Weekday[];
  if (days.length <= max) return days;
  // Greedily keep days that maximise spacing.
  const result: Weekday[] = [days[0]];
  while (result.length < max) {
    let best: Weekday | null = null;
    let bestGap = -1;
    for (const d of days) {
      if (result.includes(d)) continue;
      const gap = Math.min(...result.map((r) => Math.min(Math.abs(r - d), 7 - Math.abs(r - d))));
      if (gap >= bestGap) {
        bestGap = gap;
        best = d;
      }
    }
    if (best === null) break;
    result.push(best);
  }
  return result.sort((a, b) => a - b);
}

function maxDaysFor(profile: Profile): number {
  const limits = workloadLimits(profile);
  let max = Math.min(limits.maxTrainingDays, 7 - limits.minRestDays);
  if (profile.experience === 'new') max = Math.min(max, 4);
  if (profile.experience === 'beginner') max = Math.min(max, 5);
  return max;
}

function warmupFor(t: DayTemplate, first: Exercise | undefined): string[] {
  const lower = t.key.startsWith('lower') || t.key === 'legs';
  const upper = t.key.startsWith('upper') || t.key === 'push' || t.key === 'pull';
  const out = ['5 min easy cardio (bike, brisk walk or rower) to raise body temperature'];
  if (lower) out.push('10 bodyweight squats, 10 glute bridges, 5 slow lunges per leg');
  else if (upper) out.push('10 arm circles each way, 15 band pull-aparts or wall slides, 10 push-ups from an incline');
  else out.push('10 bodyweight squats, 10 incline push-ups, 10 band pull-aparts or arm circles, 5 hip hinges');
  if (first && first.loadType === 'weighted')
    out.push(`2–3 ramp-up sets of ${first.name}: ~40%, 60%, 80% of working weight with fewer reps`);
  return out;
}

const COOLDOWN = ['2–3 min easy walking to bring breathing down', 'Light stretching for the muscles you trained, 20–30 s each'];

export interface GenerateResult {
  plan: TrainingPlan;
  notes: string[];
}

/**
 * Deterministic, evidence-informed plan generator. Used as the professional
 * fallback when AI generation is unavailable and as the baseline the AI
 * output is validated against.
 */
export function generatePlan(profile: Profile, now: Date = new Date()): GenerateResult {
  const notes: string[] = [];
  const limits = workloadLimits(profile);
  const maxDays = maxDaysFor(profile);
  const trainingDays = scheduleDays(profile.trainingDays, maxDays);
  if (profile.trainingDays.length > trainingDays.length)
    notes.push(
      `You selected ${profile.trainingDays.length} days; the plan uses ${trainingDays.length} so you have enough recovery between sessions.`,
    );

  const chosen = chooseSplit(trainingDays.length);
  const pool = availableExercises(profile);
  const poolIds = new Set(pool.map((e) => e.id));
  const preferred = profile.preferredExercises.filter((id) => poolIds.has(id));
  const rir = rirFor(profile);

  const buildDays = (templates: DayTemplate[]): PlanDay[] => {
    const usedInPlan = new Set<string>();
    const pick = (slot: Slot, usedInDay: Set<string>): Exercise | undefined => {
      const fits = (ex: Exercise) => slot.patterns.includes(ex.pattern) && !usedInDay.has(ex.id);
      const pref = preferred
        .map((id) => EXERCISE_BY_ID[id])
        .filter((ex) => fits(ex) && slot.prefs.includes(ex.id) && !usedInPlan.has(ex.id));
      if (pref[0]) return pref[0];
      for (const id of slot.prefs) if (poolIds.has(id) && !usedInDay.has(id)) return EXERCISE_BY_ID[id];
      return pool.find(fits);
    };

    return trainingDays.map((weekday, i) => {
      const t = templates[i % templates.length];
      const usedInDay = new Set<string>();
      const exercises: PlannedExercise[] = [];
      const roles: Role[] = [];
      const slots = [...t.slots];
      if (profile.goal === 'endurance' || profile.goal === 'active') slots.push(S('cardio', ['conditioning'], CARDIO));
      if (profile.goal === 'athletic') slots.splice(Math.min(2, slots.length), 0, S('acc', ['hinge', 'squat', 'conditioning'], POWER));

      const add = (ex: Exercise, role: Role) => {
        usedInDay.add(ex.id);
        usedInPlan.add(ex.id);
        roles.push(role);
        const scheme = ex.loadType === 'timed' ? timedScheme(ex, profile.goal) : repScheme(profile.goal, role === 'main' ? 'main' : 'acc', profile);
        exercises.push({
          exerciseId: ex.id,
          sets: Math.min(scheme.sets, limits.maxSetsPerExercise),
          repsMin: scheme.repsMin,
          repsMax: scheme.repsMax,
          restSec: scheme.restSec,
          rir: ex.loadType === 'timed' ? Math.max(rir, 2) : rir,
          notes: role === 'main' ? 'Main lift — focus on clean technique before adding load.' : undefined,
        });
      };

      for (const slot of slots) {
        const ex = pick(slot, usedInDay);
        if (ex) add(ex, slot.role);
      }
      // Very restricted setups (little equipment + several limitations) can leave a
      // template thin: top it up with any safe, available training movement.
      const fillOrder = ['legs', 'back', 'core', 'fullbody', 'chest', 'shoulders', 'arms', 'cardio'];
      for (const cat of fillOrder) {
        if (exercises.length >= 3) break;
        const ex = pool.find((e) => e.category === cat && !usedInDay.has(e.id));
        if (ex) add(ex, 'acc');
      }

      // Fit the session into the user's available time: drop trailing accessories,
      // then trim accessory sets, never going below three exercises.
      const budget = profile.sessionMinutes;
      while (estimateMinutes(exercises) > budget && exercises.length > 3) {
        const idx = findLastIndex(roles, (r, j) => j >= 2 && r !== 'cardio' && r !== 'main');
        const at = idx >= 0 ? idx : exercises.length - 1;
        exercises.splice(at, 1);
        roles.splice(at, 1);
      }
      let guard = 0;
      while (estimateMinutes(exercises) > budget && guard++ < 20) {
        const target = [...exercises].reverse().find((e) => e.sets > 2);
        if (!target) break;
        target.sets -= 1;
      }
      while (exercises.length > limits.maxExercisesPerSession) exercises.pop();
      let total = exercises.reduce((a, e) => a + e.sets, 0);
      while (total > limits.maxSetsPerSession) {
        const target = [...exercises].reverse().reduce((a, e) => (e.sets > a.sets ? e : a));
        if (target.sets <= 1) break;
        target.sets -= 1;
        total -= 1;
      }

      const first = exercises[0] ? EXERCISE_BY_ID[exercises[0].exerciseId] : undefined;
      return {
        id: `day-${weekday}-${t.key}`,
        weekday,
        title: t.title,
        focus: t.focus,
        warmup: warmupFor(t, first),
        exercises,
        cooldown: COOLDOWN,
        estMinutes: estimateMinutes(exercises),
      };
    });
  };

  let splitName = chosen.name;
  let days = buildDays(chosen.templates);
  if (days.some((d) => d.exercises.length < 3) && chosen.templates[0] !== FULL_A) {
    // Not enough suitable exercises for a body-part split — use full-body sessions instead.
    splitName = 'Full Body Rotation';
    days = buildDays([FULL_A, FULL_B, FULL_C]);
    notes.push('Your equipment and limitations suit full-body sessions best, so each day trains the whole body.');
  }
  capWeeklyVolume(days, limits.maxWeeklySetsPerMuscle);
  days.forEach((d) => (d.estMinutes = estimateMinutes(d.exercises)));

  const restDays = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter((d) => !trainingDays.includes(d));
  const iso = now.toISOString();
  const plan: TrainingPlan = {
    id: uuid(),
    name: `${goalLabel(profile.goal)} — ${splitName}`,
    split: splitName,
    createdAt: iso,
    updatedAt: iso,
    source: 'fallback',
    days,
    restDays,
    progression: progressionNotes(profile),
    recoveryNotes: recoveryNotes(profile, restDays),
    techniqueNotes: [
      'Control the lowering phase of every rep (about 2 seconds).',
      `Stop each set with about ${rir} rep${rir === 1 ? '' : 's'} in reserve — you should feel you could do ${rir} more with good form.`,
      'If form breaks down, end the set. Quality reps build strength; sloppy reps build injuries.',
      'Use the exercise detail page to review technique before your first session with a new movement.',
    ],
    rationale: rationaleFor(profile, splitName, trainingDays),
    warnings: notes,
  };
  return { plan, notes };
}

/** Trim accessory sets so no muscle exceeds the weekly hard-set limit. Returns muscles that were capped. */
export function capWeeklyVolume(days: PlanDay[], limit: number): string[] {
  const capped: string[] = [];
  const count = () => {
    const out: Record<string, number> = {};
    for (const d of days)
      for (const pe of d.exercises) for (const m of EXERCISE_BY_ID[pe.exerciseId]?.primary ?? []) out[m] = (out[m] ?? 0) + pe.sets;
    return out;
  };
  for (const [muscle, sets] of Object.entries(count())) {
    if (muscle === 'cardio') continue;
    let excess = sets - limit;
    if (excess <= 0) continue;
    capped.push(muscle);
    for (let pass = 0; pass < 10 && excess > 0; pass++)
      for (const day of days)
        for (let i = day.exercises.length - 1; i >= 0 && excess > 0; i--) {
          const pe = day.exercises[i];
          if (!EXERCISE_BY_ID[pe.exerciseId]?.primary.includes(muscle as never) || pe.sets <= 1) continue;
          pe.sets--;
          excess--;
        }
  }
  return capped;
}

function findLastIndex<T>(xs: T[], fn: (x: T, i: number) => boolean): number {
  for (let i = xs.length - 1; i >= 0; i--) if (fn(xs[i], i)) return i;
  return -1;
}

export function goalLabel(goal: Goal): string {
  return {
    muscle: 'Muscle Building',
    strength: 'Strength',
    athletic: 'Athletic Performance',
    general: 'General Fitness',
    endurance: 'Endurance',
    active: 'Active Lifestyle',
  }[goal];
}

function progressionNotes(profile: Profile): string[] {
  const minor = isMinor(profile.ageRange);
  const out = [
    'Double progression: when you complete every set at the top of the rep range with good form, increase the load next session (≈2.5 kg upper body, ≈5 kg lower body, or the smallest dumbbell jump).',
    'If you miss the bottom of the rep range on two sessions in a row, keep the weight and focus on technique, sleep and recovery.',
    'For bodyweight exercises add reps first, then move to a harder variation.',
  ];
  if (!minor && (profile.experience === 'intermediate' || profile.experience === 'advanced'))
    out.push('Every 5–7 weeks, take a lighter "deload" week: same exercises, about half the sets.');
  else out.push('Every 6–8 weeks, take an easier week with fewer sets to let your body consolidate progress.');
  if (minor) out.push('Technique and enjoyment come first. Increase load only when every rep looks and feels the same.');
  return out;
}

function recoveryNotes(profile: Profile, restDays: Weekday[]): string[] {
  const out = [
    `Rest days: ${restDays.map((d) => WEEKDAY_LONG[d]).join(', ') || 'none — please add at least one'}. Light walking or the mobility routine is welcome on these days.`,
    'Sleep is your most powerful recovery tool — aim for a consistent schedule.',
    'Mild muscle soreness 24–72 h after training is normal. Sharp or joint pain is not — stop and seek professional advice.',
  ];
  if (isMinor(profile.ageRange)) out.push('Growing bodies need plenty of sleep, regular meals and time for other sports and play.');
  if (isOlderAdult(profile.ageRange)) out.push('Allow a little extra warm-up time and rest between sets; balance work is valuable.');
  return out;
}

function rationaleFor(profile: Profile, split: string, days: Weekday[]): string {
  const where = profile.location === 'gym' ? 'a full gym' : 'your home equipment';
  return `A ${split} structure across ${days.length} day${days.length === 1 ? '' : 's'} per week trains every major muscle group at least ${days.length >= 2 ? 'twice' : 'once'} weekly using ${where}. Rep ranges and rest periods match your goal (${goalLabel(profile.goal).toLowerCase()}), and sessions are sized to about ${profile.sessionMinutes} minutes.`;
}
