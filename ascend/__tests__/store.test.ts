import AsyncStorage from '@react-native-async-storage/async-storage';
import { generatePlan } from '../src/domain/plan/generator';
import { mergeState, useAppStore } from '../src/store/useAppStore';
import { initialRoute } from '../src/utils/routing';
import { makeProfile } from './helpers/fixtures';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setupPlayer() {
  const profile = makeProfile({ trainingDays: [0, 1, 2, 3, 4, 5, 6].slice(0, 3) as never });
  const { plan } = generatePlan(profile);
  const s = useAppStore.getState();
  s.setProfile(profile);
  s.acceptPlan(plan);
  s.completeOnboarding();
  return { profile, plan };
}

beforeEach(async () => {
  useAppStore.getState().resetAll();
  await AsyncStorage.clear();
});

describe('navigation entry point', () => {
  const base = { onboarded: false, profile: null, plan: null, draftPlan: null, activeWorkout: null };
  it('sends new players to onboarding', () => expect(initialRoute(base)).toBe('/onboarding'));
  it('resumes an interrupted questionnaire', () => expect(initialRoute({ ...base, profile: makeProfile() })).toBe('/onboarding/create'));
  it('returns to plan review if a draft exists', () => {
    const p = makeProfile();
    expect(initialRoute({ ...base, profile: p, draftPlan: generatePlan(p).plan })).toBe('/onboarding/review');
  });
  it('opens the dashboard once onboarded', () => {
    const p = makeProfile();
    expect(initialRoute({ ...base, onboarded: true, profile: p, plan: generatePlan(p).plan })).toBe('/(tabs)');
  });
  it('resumes an active workout after an app restart', () => {
    const p = makeProfile();
    const w = { id: 'w', planDayId: null, title: 't', startedAt: '', pausedAt: null, pausedTotalSec: 0, exercises: [], currentIndex: 0, restEndsAt: null, scheduled: false };
    expect(initialRoute({ ...base, onboarded: true, profile: p, plan: generatePlan(p).plan, activeWorkout: w })).toBe('/workout');
  });
});

describe('workout flow in the store', () => {
  it('logs sets, finishes, awards XP, unlocks achievements and queues celebrations', () => {
    const { plan } = setupPlayer();
    const s = useAppStore.getState();
    s.startWorkout(plan.days[0].id);
    const w = useAppStore.getState().activeWorkout!;
    expect(w.exercises.length).toBe(plan.days[0].exercises.length);
    // Pretend the session started 30 minutes ago.
    useAppStore.setState({ activeWorkout: { ...w, startedAt: new Date(Date.now() - 30 * 60000).toISOString() } });
    w.exercises.forEach((e, i) => {
      for (let k = 0; k < (e.planned?.sets ?? 1); k++) useAppStore.getState().logSet(i, { weight: 20, reps: 10, rpe: 8 });
    });
    const r = useAppStore.getState().finishWorkout()!;
    expect(r.xp).toBe(100);
    const st = useAppStore.getState();
    expect(st.activeWorkout).toBeNull();
    expect(st.sessions).toHaveLength(1);
    expect(st.achievements.map((a) => a.id)).toContain('first-workout');
    expect(st.celebrations.some((c) => c.kind === 'achievement')).toBe(true);
    expect(st.sync.dirty).toBe(true);
  });

  it('discards a workout with nothing logged', () => {
    const { plan } = setupPlayer();
    useAppStore.getState().startWorkout(plan.days[0].id);
    expect(useAppStore.getState().finishWorkout()).toBeNull();
    expect(useAppStore.getState().sessions).toHaveLength(0);
  });

  it('replaces, eases and skips exercises', () => {
    const { plan } = setupPlayer();
    const s = useAppStore.getState();
    s.startWorkout(plan.days[0].id);
    s.replaceExercise(0, 'goblet-squat');
    expect(useAppStore.getState().activeWorkout!.exercises[0].exerciseId).toBe('goblet-squat');
    const before = useAppStore.getState().activeWorkout!.exercises[1].planned!.sets;
    useAppStore.getState().reduceDifficulty(1);
    expect(useAppStore.getState().activeWorkout!.exercises[1].planned!.sets).toBeLessThanOrEqual(before);
    useAppStore.getState().skipExercise(2);
    expect(useAppStore.getState().activeWorkout!.exercises[2].skipped).toBe(true);
    expect(useAppStore.getState().activeWorkout!.currentIndex).toBe(3);
  });

  it('awards check-in XP once per day and allows updates', () => {
    setupPlayer();
    const c = { date: '2026-10-14', sleep: 4, energy: 4, soreness: 2, mood: 4, pain: false } as const;
    expect(useAppStore.getState().addCheckin(c)).not.toBeNull();
    expect(useAppStore.getState().addCheckin({ ...c, sleep: 2 })).toBeNull();
    expect(useAppStore.getState().checkins).toHaveLength(1);
    expect(useAppStore.getState().checkins[0].sleep).toBe(2);
  });

  it('only equips unlocked cosmetics', () => {
    setupPlayer();
    useAppStore.getState().setCosmetic('style', 'monarch'); // requires level 20
    expect(useAppStore.getState().cosmetics.style).toBe('vanguard');
    useAppStore.getState().setCosmetic('style', 'wanderer');
    expect(useAppStore.getState().cosmetics.style).toBe('wanderer');
  });
});

describe('persistence', () => {
  it('writes state to device storage and restores it', async () => {
    const { plan } = setupPlayer();
    useAppStore.getState().addBodyMetric(80);
    await flush();
    const raw = await AsyncStorage.getItem('ascend-state');
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw!);
    expect(saved.state.plan.id).toBe(plan.id);
    expect(saved.state.celebrations).toBeUndefined(); // transient UI state is not persisted

    useAppStore.setState({ plan: null, profile: null, bodyMetrics: [] });
    await AsyncStorage.setItem('ascend-state', raw!); // simulate a cold start from disk
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().plan?.id).toBe(plan.id);
    expect(useAppStore.getState().bodyMetrics[0].weightKg).toBe(80);
    expect(useAppStore.getState().hydrated).toBe(true);
  });

  it('fills defaults for settings added in newer versions', async () => {
    await AsyncStorage.setItem('ascend-state', JSON.stringify({ version: 1, state: { onboarded: true, settings: { sound: false } } }));
    await useAppStore.persist.rehydrate();
    const st = useAppStore.getState().settings;
    expect(st.sound).toBe(false);
    expect(st.haptics).toBe(true);
    expect(st.notifications.workoutHour).toBe(17);
  });

  it('merges cloud data: union by id, newest wins', () => {
    const p = makeProfile();
    const plan = generatePlan(p).plan;
    const local = { ...useAppStore.getState(), profile: p, plan, checkins: [{ id: 'a', date: '2026-10-01', sleep: 3, energy: 3, soreness: 3, mood: 3, pain: false, updatedAt: '2026-10-01T10:00:00Z' }] } as never;
    const merged = mergeState(local, {
      checkins: [
        { id: 'a', date: '2026-10-01', sleep: 5, energy: 3, soreness: 3, mood: 3, pain: false, updatedAt: '2026-10-02T10:00:00Z' },
        { id: 'b', date: '2026-10-02', sleep: 4, energy: 3, soreness: 3, mood: 3, pain: false, updatedAt: '2026-10-02T10:00:00Z' },
      ],
    });
    expect(merged.checkins).toHaveLength(2);
    expect(merged.checkins!.find((c) => c.id === 'a')!.sleep).toBe(5);
    expect(merged.plan!.id).toBe(plan.id);
  });
});
