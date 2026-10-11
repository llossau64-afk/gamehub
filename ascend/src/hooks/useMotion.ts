import { useReducedMotion } from 'react-native-reanimated';
import { useAppStore } from '../store/useAppStore';

/** True when animations should be minimised (system setting or in-app override). */
export function useReduceMotion(): boolean {
  const system = useReducedMotion();
  const pref = useAppStore((s) => s.settings.reduceMotion);
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return system;
}
