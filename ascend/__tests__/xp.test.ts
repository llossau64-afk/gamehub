import { computeStats, computeStreak, newlyUnlocked } from '../src/domain/achievements';
import { dailyQuests, weeklyMissions } from '../src/domain/quests';
import { levelFromXp, rankForLevel, totalXpForLevel, xpToNext } from '../src/domain/ranks';
import type { ExerciseLog, TrainingPlan, WorkoutSession, XPEvent } from '../src/domain/types';
import { awardDaily, computeWorkoutXP, detectPRs, XP } from '../src/domain/xp';
import { generatePlan } from '../src/domain/plan/generator';
import { makeProfile } from './helpers/fixtures';

const NOW = new Date(2026, 9, 14, 18, 0); // Wednesday 14 Oct 2026

const logs = (n: number, weight = 20, reps = 10): ExerciseLog[] => [
  {
    exerciseId: 'goblet-squat',
    planned: { exerciseId: 'goblet-squat', sets: n, repsMin: 8, repsMax: 12, restSec: 60, rir: 2 },
    sets: Array.from({ length: n }, () => ({ weight, reps, rpe: 8, completedAt: '' })),
  },
];

describe('levels & ranks', () => {
  it('uses a monotonic, gently increasing curve', () => {
    expect(totalXpForLevel(1)).toBe(0);
    expect(totalXpForLevel(2)).toBe(150);
    for (let l = 1; l < 120; l++) {
      expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
      expect(totalXpForLevel(l + 1) - totalXpForLevel(l)).toBe(xpToNext(l));
    }
  });
  it('derives level and progress from total XP', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, intoLevel: 0 });
    expect(levelFromXp(149).level).toBe(1);
    expect(levelFromXp(150).level).toBe(2);
    const info = levelFromXp(totalXpForLevel(10) + 50);
    expect(info.level).toBe(10);
    expect(info.intoLevel).toBe(50);
    expect(info.progress).toBeCloseTo(50 / xpToNext(10));
  });
  it('maps levels to ranks', () => {
    expect(rankForLevel(1).id).toBe('E');
    expect(rankForLevel(10).id).toBe('D');
    expect(rankForLevel(20).id).toBe('C');
    expect(rankForLevel(35).id).toBe('B');
    expect(rankForLevel(50).id).toBe('A');
    expect(rankForLevel(70).id).toBe('S');
    expect(rankForLevel(150).id).toBe('SS');
  });
});

describe('workout XP & anti-farming', () => {
  const base = { id: 's1', exercises: logs(4), durationSec: 40 * 60, scheduled: true, prs: [] };

  it('awards the scheduled-session quest', () => {
    const r = computeWorkoutXP(base, [], NOW);
    expect(r.total).toBe(XP.scheduledWorkout);
  });
  it('gives nothing for trivially short sessions', () => {
    expect(computeWorkoutXP({ ...base, exercises: logs(2) }, [], NOW).total).toBe(0);
    expect(computeWorkoutXP({ ...base, durationSec: 120 }, [], NOW).total).toBe(0);
  });
  it('does not reward a second workout on the same day', () => {
    const first = computeWorkoutXP(base, [], NOW);
    const second = computeWorkoutXP({ ...base, id: 's2' }, first.events, NOW);
    expect(second.total).toBe(0);
  });
  it('gives partial credit for a heavily cut session', () => {
    const ex = logs(3);
    ex[0].planned!.sets = 10;
    expect(computeWorkoutXP({ ...base, exercises: ex }, [], NOW).total).toBe(XP.partialWorkout);
  });
  it('caps PR bonuses per session', () => {
    const prs = Array.from({ length: 6 }, (_, i) => ({ exerciseId: `e${i}`, kind: 'weight' as const, value: 1, previous: 0, at: '' }));
    const r = computeWorkoutXP({ ...base, prs }, [], NOW);
    expect(r.total).toBe(XP.scheduledWorkout + XP.maxPrsPerSession * XP.personalRecord);
  });
  it('enforces a daily XP cap', () => {
    const many: XPEvent[] = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, source: 'personal-record', amount: 25, at: NOW.toISOString(), label: '' }));
    expect(computeWorkoutXP(base, many, NOW).total).toBe(0);
    expect(awardDaily(many, 'checkin', NOW)).toBeNull();
  });
  it('awards daily activities once per day', () => {
    const a = awardDaily([], 'checkin', NOW)!;
    expect(a.amount).toBe(XP.checkin);
    expect(awardDaily([a], 'checkin', NOW)).toBeNull();
    const tomorrow = new Date(NOW.getTime() + 86400000);
    expect(awardDaily([a], 'checkin', tomorrow)).not.toBeNull();
  });
});

describe('personal records', () => {
  const hist = (weight: number, reps: number): WorkoutSession => ({
    id: 'h',
    planDayId: null,
    title: '',
    startedAt: '',
    finishedAt: '2026-10-01T10:00:00Z',
    durationSec: 1,
    exercises: logs(3, weight, reps),
    scheduled: false,
    xpEarned: 0,
    prs: [],
    updatedAt: '',
  });
  it('treats the first exposure as a baseline', () => {
    expect(detectPRs(logs(3), [], NOW)).toEqual([]);
  });
  it('detects weight and estimated-1RM records', () => {
    expect(detectPRs(logs(3, 25, 10), [hist(20, 10)], NOW)[0].kind).toBe('weight');
    expect(detectPRs(logs(3, 20, 12), [hist(20, 10)], NOW)[0].kind).toBe('e1rm');
    expect(detectPRs(logs(3, 20, 10), [hist(20, 10)], NOW)).toEqual([]);
  });
});

describe('quests, missions & streaks', () => {
  const profile = makeProfile({ trainingDays: [0, 2, 4] });
  const plan: TrainingPlan = generatePlan(profile, NOW).plan;

  it('gives workout quests on training days and recovery quests on rest days', () => {
    const wed = dailyQuests(plan, [], NOW).map((q) => q.id);
    expect(wed).toContain('workout');
    expect(wed).not.toContain('mobility');
    const tue = dailyQuests(plan, [], new Date(2026, 9, 13, 12)).map((q) => q.id);
    expect(tue).not.toContain('workout');
    expect(tue).toContain('mobility');
  });

  it('marks quests done from the XP ledger', () => {
    const ev = awardDaily([], 'checkin', NOW)!;
    expect(dailyQuests(plan, [ev], NOW).find((q) => q.id === 'checkin')!.done).toBe(true);
  });

  it('tracks weekly missions', () => {
    const events = [awardDaily([], 'checkin', NOW)!];
    const m = weeklyMissions({ plan, sessions: [], events, techniqueViews: [{ date: '2026-10-14', exerciseId: 'plank' }] }, NOW);
    expect(m.find((x) => x.id === 'checkins')!.progress).toBe(1);
    expect(m.find((x) => x.id === 'techniques')!.progress).toBe(1);
  });

  it('keeps streaks through planned rest days and forgives one missed day', () => {
    const at = (d: number) => new Date(2026, 9, d, 18).toISOString();
    const sess = (d: number): WorkoutSession => ({ id: `${d}`, planDayId: null, title: '', startedAt: at(d), finishedAt: at(d), durationSec: 1, exercises: [], scheduled: true, xpEarned: 0, prs: [], updatedAt: '' });
    // Mon 5, Wed 7, Fri 9, Mon 12 trained; Wed 14 (today) not yet.
    const s = computeStreak({ sessions: [sess(5), sess(7), sess(9), sess(12)], events: [], plan, since: at(5), now: NOW });
    expect(s.current).toBeGreaterThanOrEqual(8);
    // Missing Mon 12 too is forgiven once
    const s2 = computeStreak({ sessions: [sess(5), sess(7), sess(9)], events: [], plan, since: at(5), now: NOW });
    expect(s2.current).toBeGreaterThan(0);
    expect(s2.graceUsed).toBe(1);
  });

  it('welcomes players back without punishment', () => {
    const s = computeStreak({ sessions: [], events: [{ id: '1', source: 'checkin', amount: 30, at: new Date(2026, 8, 1).toISOString(), label: '' }], plan, since: null, now: NOW });
    expect(s.welcomeBack).toBe(true);
  });

  it('unlocks achievements from stats', () => {
    const stats = computeStats({ sessions: [], events: [], checkins: [], techniqueViews: [], plan, level: 1 });
    expect(newlyUnlocked(stats, [])).toEqual([]);
    const s2 = { ...stats, workouts: 1, prs: 1 };
    expect(newlyUnlocked(s2, []).map((a) => a.id)).toEqual(expect.arrayContaining(['first-workout', 'personal-best']));
    expect(newlyUnlocked(s2, ['first-workout']).map((a) => a.id)).not.toContain('first-workout');
  });
});
