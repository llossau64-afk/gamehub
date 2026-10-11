import { addDays, dayKey, startOfWeek } from '../utils';
import type { Checkin, TrainingPlan, WorkoutSession, XPEvent } from './types';

export interface AchievementStats {
  workouts: number;
  prs: number;
  techniqueExercises: number;
  checkins: number;
  mobility: number;
  fullWeeks: number;
  activeWeeks: number;
  level: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: 'spark' | 'shield' | 'flame' | 'book' | 'crown' | 'star' | 'leaf' | 'wave' | 'gem';
  xp: number;
  reward?: string;
  check: (s: AchievementStats) => boolean;
  progress: (s: AchievementStats) => [number, number];
}

const p = (v: number, t: number): [number, number] => [Math.min(v, t), t];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-workout', name: 'First Workout', description: 'Complete your first training session.', icon: 'spark', xp: 50, reward: 'Amethyst outfit', check: (s) => s.workouts >= 1, progress: (s) => p(s.workouts, 1) },
  { id: 'first-week', name: 'First Week', description: 'Complete every scheduled session in one week.', icon: 'shield', xp: 75, reward: 'Sentinel style · "The Steadfast"', check: (s) => s.fullWeeks >= 1, progress: (s) => p(s.fullWeeks, 1) },
  { id: 'consistency-builder', name: 'Consistency Builder', description: 'Train in 4 different weeks.', icon: 'flame', xp: 100, reward: 'Citadel background', check: (s) => s.activeWeeks >= 4, progress: (s) => p(s.activeWeeks, 4) },
  { id: 'technique-explorer', name: 'Technique Explorer', description: 'Study the technique of 10 different exercises.', icon: 'book', xp: 75, reward: 'Aurora background · "Form Scholar"', check: (s) => s.techniqueExercises >= 10, progress: (s) => p(s.techniqueExercises, 10) },
  { id: 'personal-best', name: 'Personal Best', description: 'Set your first personal record.', icon: 'star', xp: 50, reward: 'Ember accent · "Record Breaker"', check: (s) => s.prs >= 1, progress: (s) => p(s.prs, 1) },
  { id: 'recovery-ritual', name: 'Recovery Ritual', description: 'Complete 10 recovery check-ins.', icon: 'leaf', xp: 60, reward: 'Jade accent', check: (s) => s.checkins >= 10, progress: (s) => p(s.checkins, 10) },
  { id: 'mobility-adept', name: 'Mobility Adept', description: 'Finish the mobility routine 10 times.', icon: 'wave', xp: 60, check: (s) => s.mobility >= 10, progress: (s) => p(s.mobility, 10) },
  { id: 'workouts-10', name: 'Ten Sessions', description: 'Complete 10 workouts.', icon: 'gem', xp: 75, check: (s) => s.workouts >= 10, progress: (s) => p(s.workouts, 10) },
  { id: 'workouts-50', name: '50 Workouts Completed', description: 'Complete 50 workouts.', icon: 'crown', xp: 150, reward: 'Ivory outfit · "Relentless"', check: (s) => s.workouts >= 50, progress: (s) => p(s.workouts, 50) },
  { id: 'workouts-100', name: '100 Workouts Completed', description: 'Complete 100 workouts.', icon: 'crown', xp: 250, reward: 'Aurum accent · "Centurion"', check: (s) => s.workouts >= 100, progress: (s) => p(s.workouts, 100) },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function computeStats(input: {
  sessions: WorkoutSession[];
  events: XPEvent[];
  checkins: Checkin[];
  techniqueViews: { exerciseId: string }[];
  plan: TrainingPlan | null;
  level: number;
}): AchievementStats {
  const { sessions, events, checkins, techniqueViews, plan, level } = input;
  const counted = sessions.filter((s) => s.exercises.some((e) => e.sets.length > 0));
  const byWeek = new Map<string, Set<string>>();
  for (const s of counted) {
    const wk = dayKey(startOfWeek(new Date(s.finishedAt)));
    if (!byWeek.has(wk)) byWeek.set(wk, new Set());
    if (s.scheduled) byWeek.get(wk)!.add(dayKey(new Date(s.finishedAt)));
  }
  const planned = plan?.days.length ?? 0;
  let fullWeeks = 0;
  if (planned > 0) for (const days of byWeek.values()) if (days.size >= planned) fullWeeks++;
  return {
    workouts: counted.length,
    prs: sessions.reduce((a, s) => a + s.prs.length, 0),
    techniqueExercises: new Set(techniqueViews.map((v) => v.exerciseId)).size,
    checkins: checkins.length,
    mobility: events.filter((e) => e.source === 'mobility').length,
    fullWeeks,
    activeWeeks: byWeek.size,
    level,
  };
}

export function newlyUnlocked(stats: AchievementStats, unlocked: string[]): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.check(stats));
}

// ─── Flexible streaks ───────────────────────────────────────────────────────

export interface StreakInfo {
  current: number;
  daysSinceActivity: number | null;
  welcomeBack: boolean;
  graceUsed: number;
}

/**
 * A day keeps the streak alive if the player trained, checked in, did
 * recovery work, or it was a planned rest day. One missed training day per
 * rolling week is forgiven automatically. Nothing is ever "lost" in a way that
 * resets progress — XP and levels are permanent.
 */
export function computeStreak(input: {
  sessions: WorkoutSession[];
  events: XPEvent[];
  plan: TrainingPlan | null;
  since: string | null;
  now?: Date;
}): StreakInfo {
  const now = input.now ?? new Date();
  const active = new Set<string>();
  for (const s of input.sessions) active.add(dayKey(new Date(s.finishedAt)));
  for (const e of input.events) if (['checkin', 'mobility', 'light-activity', 'scheduled-workout', 'extra-workout'].includes(e.source)) active.add(dayKey(new Date(e.at)));
  const trainingWeekdays = new Set(input.plan?.days.map((d) => d.weekday) ?? []);
  const since = input.since ? dayKey(new Date(input.since)) : null;

  let streak = 0;
  let graceUsed = 0;
  const graceDays: number[] = [];
  const todayKey = dayKey(now);
  if (active.has(todayKey)) streak++;

  for (let i = 1; i < 400; i++) {
    const d = addDays(now, -i);
    const key = dayKey(d);
    if (since && key < since) break;
    const wd = (d.getDay() + 6) % 7;
    if (active.has(key)) {
      streak++;
      continue;
    }
    if (!trainingWeekdays.has(wd as never)) {
      // planned rest day (or no plan) — counts only if a real activity happened within the last 7 days
      const recent = Array.from({ length: 7 }, (_, j) => dayKey(addDays(d, -j))).some((k) => active.has(k));
      if (recent) {
        streak++;
        continue;
      }
      break;
    }
    // missed training day: forgive one per rolling 7 days
    if (!graceDays.some((g) => i - g < 7)) {
      graceDays.push(i);
      graceUsed++;
      continue;
    }
    break;
  }

  let daysSince: number | null = null;
  for (let i = 0; i < 400; i++) {
    if (active.has(dayKey(addDays(now, -i)))) {
      daysSince = i;
      break;
    }
  }
  return { current: streak, daysSinceActivity: daysSince, welcomeBack: daysSince !== null && daysSince >= 5, graceUsed };
}
