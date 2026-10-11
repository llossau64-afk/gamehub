import { Redirect } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/useAppStore';
import { initialRoute } from '../utils/routing';

export default function Index() {
  const state = useAppStore(
    useShallow((s) => ({ onboarded: s.onboarded, profile: s.profile, plan: s.plan, draftPlan: s.draftPlan, activeWorkout: s.activeWorkout })),
  );
  return <Redirect href={initialRoute(state)} />;
}
