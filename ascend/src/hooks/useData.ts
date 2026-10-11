import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { computeStreak } from '../domain/achievements';
import { buildDemoData } from '../domain/demo';
import { levelFromXp, nextRank, rankForLevel } from '../domain/ranks';
import { totalXp } from '../domain/xp';
import { useAppStore } from '../store/useAppStore';

/**
 * Training history for analytics screens. In demo mode this returns clearly
 * labelled sample data generated from the player's plan; real data is never
 * mixed in or overwritten.
 */
export function useTrainingData() {
  const { sessions, checkins, plan, demo } = useAppStore(useShallow((s) => ({ sessions: s.sessions, checkins: s.checkins, plan: s.plan, demo: s.settings.demoMode })));
  return useMemo(() => {
    if (demo && plan) {
      const d = buildDemoData(plan);
      return { sessions: d.sessions, checkins: d.checkins, demo: true };
    }
    return { sessions, checkins, demo: false };
  }, [sessions, checkins, plan, demo]);
}

export function usePlayer() {
  const { xpEvents, sessions, plan, profile } = useAppStore(useShallow((s) => ({ xpEvents: s.xpEvents, sessions: s.sessions, plan: s.plan, profile: s.profile })));
  return useMemo(() => {
    const level = levelFromXp(totalXp(xpEvents));
    const rank = rankForLevel(level.level);
    const streak = computeStreak({ sessions, events: xpEvents, plan, since: profile?.createdAt ?? null });
    return { level, rank, next: nextRank(level.level), streak };
  }, [xpEvents, sessions, plan, profile]);
}
