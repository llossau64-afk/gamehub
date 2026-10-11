import type { AgeRange, Intensity, Profile } from './types';

export function isMinor(age: AgeRange): boolean {
  return age === 'under13' || age === '13-15' || age === '16-17';
}

export function isBlockedAge(age: AgeRange): boolean {
  return age === 'under13';
}

export function isOlderAdult(age: AgeRange): boolean {
  return age === '55-64' || age === '65+';
}

/** Adult-only features: weight goals, body-weight tracking, personalised nutrition. */
export function allowsWeightFeatures(profile: Pick<Profile, 'ageRange'>): boolean {
  return !isMinor(profile.ageRange);
}

/** Effective intensity after age and experience caps. */
export function effectiveIntensity(profile: Pick<Profile, 'ageRange' | 'intensity' | 'experience'>): Intensity {
  if (isMinor(profile.ageRange) && profile.intensity === 'hard') return 'moderate';
  if (profile.experience === 'new' && profile.intensity === 'hard') return 'moderate';
  return profile.intensity;
}

/** Hard limits applied to every plan regardless of source (AI or fallback). */
export function workloadLimits(profile: Pick<Profile, 'ageRange' | 'experience'>) {
  const minor = isMinor(profile.ageRange);
  const beginner = profile.experience === 'new' || profile.experience === 'beginner';
  return {
    maxTrainingDays: minor ? 4 : 6,
    minRestDays: minor ? 3 : 1,
    maxSetsPerSession: minor ? 16 : beginner ? 20 : 26,
    maxExercisesPerSession: minor ? 6 : 8,
    maxSetsPerExercise: minor ? 4 : 5,
    /** Weekly hard sets per primary muscle */
    maxWeeklySetsPerMuscle: minor ? 10 : beginner ? 14 : 20,
    minReps: minor ? 6 : 3,
    maxReps: 30,
    minRir: minor ? 2 : beginner ? 2 : 0,
    minRestSec: 30,
    maxRestSec: 300,
  };
}

export const PAIN_DISCLAIMER =
  'Pain that is sharp, persistent, or unusual is a signal to stop. ASCEND cannot diagnose injuries — please consult a doctor or physiotherapist.';

export const GENERAL_DISCLAIMER =
  'ASCEND provides general fitness guidance, not medical advice. Check with a healthcare professional before starting a new program if you have a medical condition, are pregnant, or are returning from injury.';
