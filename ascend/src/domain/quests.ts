import { addDays, dayKey, startOfWeek, weekdayOf, weekKey } from '../utils';
import { eventsOnDay, XP } from './xp';
import type { TrainingPlan, WorkoutSession, XPEvent, XPSource } from './types';

export interface Quest {
  id: string;
  title: string;
  description: string;
  xp: number;
  done: boolean;
  optional?: boolean;
  source: XPSource;
  action: 'workout' | 'library' | 'checkin' | 'mobility' | 'progress' | 'light';
}

export function isTrainingDay(plan: TrainingPlan | null, d: Date = new Date()): boolean {
  if (!plan) return false;
  return plan.days.some((x) => x.weekday === weekdayOf(d));
}

export function dailyQuests(plan: TrainingPlan | null, events: XPEvent[], now: Date = new Date()): Quest[] {
  const today = eventsOnDay(events, dayKey(now));
  const has = (s: XPSource) => today.some((e) => e.source === s);
  const training = isTrainingDay(plan, now);
  const quests: Quest[] = [];
  if (training)
    quests.push({
      id: 'workout',
      title: "Complete today's scheduled session",
      description: 'Follow your plan and log your sets.',
      xp: XP.scheduledWorkout,
      done: has('scheduled-workout'),
      source: 'scheduled-workout',
      action: 'workout',
    });
  quests.push({
    id: 'checkin',
    title: 'Complete a recovery check-in',
    description: 'Four quick taps on sleep, energy, soreness and mood.',
    xp: XP.checkin,
    done: has('checkin'),
    source: 'checkin',
    action: 'checkin',
  });
  if (training)
    quests.push({
      id: 'technique',
      title: 'Review exercise technique',
      description: "Open the guide for one of today's exercises.",
      xp: XP.technique,
      done: has('technique'),
      source: 'technique',
      action: 'library',
    });
  else {
    quests.push({
      id: 'mobility',
      title: 'Complete the mobility routine',
      description: 'A guided 5-minute flow for hips, spine and ankles.',
      xp: XP.mobility,
      done: has('mobility'),
      source: 'mobility',
      action: 'mobility',
    });
    quests.push({
      id: 'light',
      title: 'Optional: light activity',
      description: 'A relaxed walk or easy bike ride of 20+ minutes.',
      xp: XP.lightActivity,
      done: has('light-activity'),
      optional: true,
      source: 'light-activity',
      action: 'light',
    });
  }
  quests.push({
    id: 'review',
    title: 'Review your training progress',
    description: 'Look at your stats and records.',
    xp: XP.progressReview,
    done: has('progress-review'),
    source: 'progress-review',
    action: 'progress',
  });
  return quests;
}

export interface Mission {
  id: string;
  title: string;
  progress: number;
  target: number;
  xp: number;
  claimed: boolean;
}

export interface WeeklyInputs {
  plan: TrainingPlan | null;
  sessions: WorkoutSession[];
  events: XPEvent[];
  techniqueViews: { date: string; exerciseId: string }[];
}

export function weeklyMissions({ plan, sessions, events, techniqueViews }: WeeklyInputs, now: Date = new Date()): Mission[] {
  const start = startOfWeek(now);
  const end = addDays(start, 7);
  const wk = weekKey(now);
  const inWeek = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= start.getTime() && t < end.getTime();
  };
  const daysWith = (s: XPSource) => new Set(events.filter((e) => e.source === s && inWeek(e.at)).map((e) => dayKey(new Date(e.at)))).size;
  const claimed = (id: string) => events.some((e) => e.source === 'weekly-mission' && e.ref === `${wk}:${id}`);

  const plannedCount = plan?.days.length ?? 3;
  const scheduledDone = new Set(sessions.filter((s) => s.scheduled && inWeek(s.finishedAt)).map((s) => dayKey(new Date(s.finishedAt)))).size;
  const techniques = new Set(
    techniqueViews.filter((v) => {
      const d = new Date(`${v.date}T12:00:00`);
      return d >= start && d < end;
    }).map((v) => v.exerciseId),
  ).size;

  return [
    { id: 'sessions', title: `Complete ${plannedCount} scheduled sessions`, progress: Math.min(scheduledDone, plannedCount), target: plannedCount, xp: 150, claimed: claimed('sessions') },
    { id: 'techniques', title: 'Study 3 different exercise techniques', progress: Math.min(techniques, 3), target: 3, xp: 50, claimed: claimed('techniques') },
    { id: 'review', title: 'Review your progress on 2 days', progress: Math.min(daysWith('progress-review'), 2), target: 2, xp: 40, claimed: claimed('review') },
    { id: 'checkins', title: 'Check in on 4 days', progress: Math.min(daysWith('checkin'), 4), target: 4, xp: 60, claimed: claimed('checkins') },
  ];
}

export function missionRef(id: string, now: Date = new Date()): string {
  return `${weekKey(now)}:${id}`;
}
