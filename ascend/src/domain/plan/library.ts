import { EXERCISES, EXERCISE_BY_ID } from '../../data/exercises';
import { isMinor } from '../safety';
import type { Equipment, Exercise, Profile } from '../types';

const GYM_EQUIPMENT: Equipment[] = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'bench',
  'rack',
  'cable',
  'machine',
  'pullup-bar',
  'kettlebell',
  'bands',
  'cardio-machine',
];

export function ownedEquipment(profile: Pick<Profile, 'location' | 'equipment'>): Set<Equipment> {
  if (profile.location === 'gym') return new Set(GYM_EQUIPMENT);
  return new Set<Equipment>(['bodyweight', ...profile.equipment]);
}

export function hasEquipmentFor(ex: Exercise, owned: Set<Equipment>): boolean {
  return ex.equipment.every((e) => owned.has(e));
}

export function conflictsWithLimitations(ex: Exercise, profile: Pick<Profile, 'limitations'>): boolean {
  return ex.stresses.some((s) => profile.limitations.includes(s));
}

export function difficultyAllowed(ex: Exercise, profile: Pick<Profile, 'experience' | 'ageRange'>): boolean {
  if (ex.difficulty !== 'advanced') return true;
  if (isMinor(profile.ageRange)) return false;
  return profile.experience === 'intermediate' || profile.experience === 'advanced';
}

export type Availability = 'ok' | 'equipment' | 'limitation' | 'difficulty' | 'unknown';

export function exerciseAvailability(
  id: string,
  profile: Pick<Profile, 'location' | 'equipment' | 'limitations' | 'experience' | 'ageRange'>,
): Availability {
  const ex = EXERCISE_BY_ID[id];
  if (!ex) return 'unknown';
  if (!hasEquipmentFor(ex, ownedEquipment(profile))) return 'equipment';
  if (conflictsWithLimitations(ex, profile)) return 'limitation';
  if (!difficultyAllowed(ex, profile)) return 'difficulty';
  return 'ok';
}

export function availableExercises(
  profile: Pick<Profile, 'location' | 'equipment' | 'limitations' | 'experience' | 'ageRange'>,
): Exercise[] {
  return EXERCISES.filter((e) => exerciseAvailability(e.id, profile) === 'ok');
}

/**
 * Best available substitute for an exercise: listed alternatives first, then
 * anything with the same movement pattern, then the same category.
 */
export function findSubstitute(
  id: string,
  profile: Pick<Profile, 'location' | 'equipment' | 'limitations' | 'experience' | 'ageRange'>,
  exclude: Set<string> = new Set(),
): Exercise | undefined {
  const ex = EXERCISE_BY_ID[id];
  const ok = (cand: Exercise | undefined): cand is Exercise =>
    !!cand && cand.id !== id && !exclude.has(cand.id) && exerciseAvailability(cand.id, profile) === 'ok';
  if (!ex) return undefined;
  for (const alt of ex.alternatives) {
    const c = EXERCISE_BY_ID[alt];
    if (ok(c)) return c;
  }
  const samePattern = EXERCISES.filter((c) => c.pattern === ex.pattern && ok(c));
  const overlap = (c: Exercise) => c.primary.filter((m) => ex.primary.includes(m)).length;
  samePattern.sort((a, b) => overlap(b) - overlap(a));
  if (samePattern[0]) return samePattern[0];
  const sameCategory = EXERCISES.filter((c) => c.category === ex.category && ok(c));
  sameCategory.sort((a, b) => overlap(b) - overlap(a));
  return sameCategory[0];
}
