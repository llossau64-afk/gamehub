import type { PersistedState } from '../store/useAppStore';

type RouteInput = Pick<PersistedState, 'onboarded' | 'profile' | 'plan' | 'draftPlan' | 'activeWorkout'>;

/** Decide where the app opens. Pure so it can be unit-tested. */
export function initialRoute(s: RouteInput): '/onboarding' | '/onboarding/create' | '/onboarding/review' | '/workout' | '/(tabs)' {
  if (!s.onboarded || !s.plan) {
    if (s.profile && s.draftPlan) return '/onboarding/review';
    if (s.profile && !s.plan) return '/onboarding/create';
    if (!s.profile) return '/onboarding';
  }
  if (s.activeWorkout) return '/workout';
  return '/(tabs)';
}
