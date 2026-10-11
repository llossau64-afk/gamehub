import type { Profile } from '../../src/domain/types';

export function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    name: 'Kai',
    ageRange: '25-34',
    gender: 'prefer-not',
    experience: 'beginner',
    previousTraining: '',
    goal: 'muscle',
    weightGoal: 'none',
    location: 'gym',
    equipment: [],
    trainingDays: [0, 2, 4],
    sessionMinutes: 60,
    preferredExercises: [],
    limitations: [],
    limitationNotes: '',
    intensity: 'moderate',
    units: 'kg',
    coachLanguage: 'auto',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}
