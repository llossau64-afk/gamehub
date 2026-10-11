import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { COSMETICS, DEFAULT_COSMETICS, isUnlocked } from '../data/cosmetics';
import { EXERCISE_BY_ID } from '../data/exercises';
import { ACHIEVEMENT_BY_ID, computeStats, newlyUnlocked } from '../domain/achievements';
import { applyFeedback } from '../domain/plan/progression';
import { validatePlan } from '../domain/plan/validator';
import { missionRef, weeklyMissions } from '../domain/quests';
import { levelFromXp, rankForLevel } from '../domain/ranks';
import type {
  ActiveWorkout,
  BodyMetric,
  ChatMessage,
  Checkin,
  Cosmetics,
  PlannedExercise,
  Profile,
  SetLog,
  Settings,
  TrainingPlan,
  WorkoutFeedback,
  WorkoutSession,
  XPEvent,
} from '../domain/types';
import { awardDaily, computeWorkoutXP, detectPRs, totalXp } from '../domain/xp';
import { dayKey, uuid } from '../utils';

export interface Celebration {
  id: string;
  kind: 'level' | 'rank' | 'achievement';
  level?: number;
  rankId?: string;
  achievementId?: string;
  rewards: string[];
}

export interface AuthState {
  mode: 'none' | 'guest' | 'account';
  userId: string | null;
  email: string | null;
}

export interface SyncState {
  dirty: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  deleted: { table: string; id: string }[];
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: false,
  haptics: true,
  reduceMotion: 'system',
  autoRestTimer: true,
  notifications: {
    enabled: false,
    workoutReminder: true,
    workoutHour: 17,
    workoutMinute: 30,
    checkinReminder: true,
    checkinHour: 9,
    weeklySummary: true,
    achievements: true,
    planUpdates: true,
  },
  demoMode: false,
};

export interface PersistedState {
  onboarded: boolean;
  auth: AuthState;
  profile: Profile | null;
  draftPlan: TrainingPlan | null;
  plan: TrainingPlan | null;
  sessions: WorkoutSession[];
  activeWorkout: ActiveWorkout | null;
  xpEvents: XPEvent[];
  checkins: Checkin[];
  bodyMetrics: BodyMetric[];
  achievements: { id: string; at: string }[];
  techniqueViews: { date: string; exerciseId: string }[];
  cosmetics: Cosmetics;
  settings: Settings;
  chat: ChatMessage[];
  planChanges: { at: string; changes: string[] }[];
  sync: SyncState;
}

interface Actions {
  setAuth: (auth: Partial<AuthState>) => void;
  setProfile: (p: Profile) => void;
  updateProfile: (p: Partial<Profile>) => void;
  setDraftPlan: (p: TrainingPlan | null) => void;
  acceptPlan: (p: TrainingPlan) => void;
  replacePlan: (p: TrainingPlan, reason: string) => void;
  completeOnboarding: () => void;

  startWorkout: (dayId: string | null, title?: string, exercises?: PlannedExercise[]) => void;
  logSet: (exerciseIndex: number, set: Omit<SetLog, 'completedAt'>) => void;
  removeLastSet: (exerciseIndex: number) => void;
  goToExercise: (index: number) => void;
  replaceExercise: (index: number, exerciseId: string) => void;
  reduceDifficulty: (index: number) => void;
  skipExercise: (index: number) => void;
  setPaused: (paused: boolean) => void;
  startRest: (seconds: number) => void;
  clearRest: () => void;
  discardWorkout: () => void;
  finishWorkout: () => { sessionId: string; xp: number; reason?: string } | null;
  submitFeedback: (sessionId: string, feedback: WorkoutFeedback) => string[];

  addCheckin: (c: Omit<Checkin, 'id' | 'updatedAt'>) => XPEvent | null;
  completeMobility: () => XPEvent | null;
  logLightActivity: () => XPEvent | null;
  markProgressReviewed: () => XPEvent | null;
  markTechniqueViewed: (exerciseId: string) => XPEvent | null;
  addBodyMetric: (weightKg: number, date?: string) => void;
  removeBodyMetric: (id: string) => void;

  setCosmetic: (slot: keyof Omit<Cosmetics, 'badges'>, id: string) => void;
  toggleBadge: (achievementId: string) => void;
  updateSettings: (s: Partial<Settings>) => void;
  updateNotificationSettings: (s: Partial<Settings['notifications']>) => void;

  addChat: (m: Omit<ChatMessage, 'id' | 'at'>) => void;
  clearChat: () => void;

  consumeCelebration: () => void;
  markSynced: (at: string, error?: string | null) => void;
  mergeRemote: (remote: Partial<PersistedState>) => void;
  resetAll: () => void;
}

export interface AppState extends PersistedState, Actions {
  hydrated: boolean;
  celebrations: Celebration[];
}

const initial: PersistedState = {
  onboarded: false,
  auth: { mode: 'none', userId: null, email: null },
  profile: null,
  draftPlan: null,
  plan: null,
  sessions: [],
  activeWorkout: null,
  xpEvents: [],
  checkins: [],
  bodyMetrics: [],
  achievements: [],
  techniqueViews: [],
  cosmetics: DEFAULT_COSMETICS,
  settings: DEFAULT_SETTINGS,
  chat: [],
  planChanges: [],
  sync: { dirty: false, lastSyncedAt: null, lastError: null, deleted: [] },
};

const dirty = (s: PersistedState): Pick<PersistedState, 'sync'> => ({ sync: { ...s.sync, dirty: true } });

/**
 * Apply XP events and resolve all consequences: level-ups, rank promotions,
 * achievements (which grant XP themselves) and weekly missions.
 */
function resolveProgress(state: AppState, newEvents: XPEvent[], now: Date = new Date()): Partial<AppState> {
  let events = [...state.xpEvents, ...newEvents];
  const before = levelFromXp(totalXp(state.xpEvents)).level;
  const celebrations: Celebration[] = [];
  let achievements = state.achievements;

  for (let pass = 0; pass < 3; pass++) {
    const lvl = levelFromXp(totalXp(events)).level;
    const stats = computeStats({
      sessions: state.sessions,
      events,
      checkins: state.checkins,
      techniqueViews: state.techniqueViews,
      plan: state.plan,
      level: lvl,
    });
    const unlocked = newlyUnlocked(
      stats,
      achievements.map((a) => a.id),
    );
    const missions = weeklyMissions({ plan: state.plan, sessions: state.sessions, events, techniqueViews: state.techniqueViews }, now).filter(
      (m) => !m.claimed && m.progress >= m.target,
    );
    if (!unlocked.length && !missions.length) break;
    for (const a of unlocked) {
      achievements = [...achievements, { id: a.id, at: now.toISOString() }];
      events.push({ id: uuid(), source: 'achievement', amount: a.xp, at: now.toISOString(), ref: a.id, label: `Achievement: ${a.name}` });
      celebrations.push({ id: uuid(), kind: 'achievement', achievementId: a.id, rewards: a.reward ? [a.reward] : [] });
    }
    for (const m of missions)
      events.push({ id: uuid(), source: 'weekly-mission', amount: m.xp, at: now.toISOString(), ref: missionRef(m.id, now), label: `Weekly mission: ${m.title}` });
  }

  const after = levelFromXp(totalXp(events)).level;
  if (after > before) {
    const rankBefore = rankForLevel(before);
    const rankAfter = rankForLevel(after);
    const rewards = COSMETICS.filter((c) => c.unlock.kind === 'level' && c.unlock.level > before && c.unlock.level <= after).map((c) => c.name);
    if (rankAfter.id !== rankBefore.id) celebrations.unshift({ id: uuid(), kind: 'rank', level: after, rankId: rankAfter.id, rewards });
    else celebrations.unshift({ id: uuid(), kind: 'level', level: after, rewards });
  }
  events = events.sort((a, b) => a.at.localeCompare(b.at));
  return { xpEvents: events, achievements, celebrations: [...state.celebrations, ...celebrations] };
}

function plannedToLogs(exercises: PlannedExercise[]) {
  return exercises.map((pe) => ({ exerciseId: pe.exerciseId, planned: { ...pe }, sets: [] as SetLog[] }));
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initial,
      hydrated: false,
      celebrations: [],

      setAuth: (auth) => set((s) => ({ auth: { ...s.auth, ...auth } })),
      setProfile: (profile) => set((s) => ({ profile, ...dirty(s) })),
      updateProfile: (p) =>
        set((s) => {
          if (!s.profile) return {};
          const profile = { ...s.profile, ...p };
          // Keep the plan consistent with new equipment / limitations.
          let plan = s.plan;
          const planChanges = [...s.planChanges];
          if (plan) {
            const v = validatePlan(plan, profile);
            if (v.ok) {
              const fixes = v.issues.filter((i) => i.level === 'fixed').map((i) => i.message);
              if (fixes.length) {
                plan = { ...v.plan, updatedAt: new Date().toISOString() };
                planChanges.push({ at: new Date().toISOString(), changes: fixes });
              }
            }
          }
          return { profile, plan, planChanges, ...dirty(s) };
        }),
      setDraftPlan: (draftPlan) => set({ draftPlan }),
      acceptPlan: (plan) => set((s) => ({ plan, draftPlan: null, ...dirty(s) })),
      replacePlan: (plan, reason) =>
        set((s) => ({ plan, planChanges: [...s.planChanges, { at: new Date().toISOString(), changes: [reason] }], ...dirty(s) })),
      completeOnboarding: () => set((s) => ({ onboarded: true, auth: s.auth.mode === 'none' ? { ...s.auth, mode: 'guest' } : s.auth })),

      startWorkout: (dayId, title, exercises) => {
        const s = get();
        if (s.activeWorkout) return;
        const day = s.plan?.days.find((d) => d.id === dayId);
        const list = exercises ?? day?.exercises ?? [];
        // Any planned day counts as scheduled (players may shift sessions); XP is still limited to one workout per day.
        const scheduled = !!day;
        set({
          activeWorkout: {
            id: uuid(),
            planDayId: day?.id ?? null,
            title: title ?? day?.title ?? 'Free Training',
            startedAt: new Date().toISOString(),
            pausedAt: null,
            pausedTotalSec: 0,
            exercises: plannedToLogs(list),
            currentIndex: 0,
            restEndsAt: null,
            scheduled,
          },
        });
      },
      logSet: (i, setLog) =>
        set((s) => {
          if (!s.activeWorkout) return {};
          const exercises = s.activeWorkout.exercises.map((e, j) =>
            j === i ? { ...e, skipped: false, sets: [...e.sets, { ...setLog, completedAt: new Date().toISOString() }] } : e,
          );
          return { activeWorkout: { ...s.activeWorkout, exercises } };
        }),
      removeLastSet: (i) =>
        set((s) => {
          if (!s.activeWorkout) return {};
          const exercises = s.activeWorkout.exercises.map((e, j) => (j === i ? { ...e, sets: e.sets.slice(0, -1) } : e));
          return { activeWorkout: { ...s.activeWorkout, exercises } };
        }),
      goToExercise: (index) =>
        set((s) => (s.activeWorkout ? { activeWorkout: { ...s.activeWorkout, currentIndex: Math.max(0, Math.min(index, s.activeWorkout.exercises.length - 1)), restEndsAt: null } } : {})),
      replaceExercise: (i, exerciseId) =>
        set((s) => {
          if (!s.activeWorkout || !EXERCISE_BY_ID[exerciseId]) return {};
          const exercises = s.activeWorkout.exercises.map((e, j) => {
            if (j !== i) return e;
            const ex = EXERCISE_BY_ID[exerciseId];
            const planned = e.planned ? { ...e.planned, exerciseId } : undefined;
            if (planned && ex.loadType === 'timed' && EXERCISE_BY_ID[e.exerciseId]?.loadType !== 'timed') {
              planned.repsMin = 20;
              planned.repsMax = 40;
            }
            return { exerciseId, planned, sets: [], replacedFrom: e.exerciseId };
          });
          return { activeWorkout: { ...s.activeWorkout, exercises } };
        }),
      reduceDifficulty: (i) =>
        set((s) => {
          if (!s.activeWorkout) return {};
          const exercises = s.activeWorkout.exercises.map((e, j) => {
            if (j !== i || !e.planned) return e;
            const easierId = EXERCISE_BY_ID[e.exerciseId]?.easierId;
            const planned = { ...e.planned, sets: Math.max(e.sets.length || 1, e.planned.sets - 1), rir: Math.min(4, e.planned.rir + 1) };
            if (easierId && e.sets.length === 0) return { ...e, exerciseId: easierId, planned: { ...planned, exerciseId: easierId }, replacedFrom: e.exerciseId };
            return { ...e, planned };
          });
          return { activeWorkout: { ...s.activeWorkout, exercises } };
        }),
      skipExercise: (i) =>
        set((s) => {
          if (!s.activeWorkout) return {};
          const exercises = s.activeWorkout.exercises.map((e, j) => (j === i ? { ...e, skipped: true } : e));
          const next = Math.min(i + 1, exercises.length - 1);
          return { activeWorkout: { ...s.activeWorkout, exercises, currentIndex: next, restEndsAt: null } };
        }),
      setPaused: (paused) =>
        set((s) => {
          const w = s.activeWorkout;
          if (!w) return {};
          if (paused && !w.pausedAt) return { activeWorkout: { ...w, pausedAt: new Date().toISOString(), restEndsAt: null } };
          if (!paused && w.pausedAt) {
            const add = Math.round((Date.now() - new Date(w.pausedAt).getTime()) / 1000);
            return { activeWorkout: { ...w, pausedAt: null, pausedTotalSec: w.pausedTotalSec + add } };
          }
          return {};
        }),
      startRest: (seconds) =>
        set((s) => (s.activeWorkout ? { activeWorkout: { ...s.activeWorkout, restEndsAt: new Date(Date.now() + seconds * 1000).toISOString() } } : {})),
      clearRest: () => set((s) => (s.activeWorkout ? { activeWorkout: { ...s.activeWorkout, restEndsAt: null } } : {})),
      discardWorkout: () => set({ activeWorkout: null }),

      finishWorkout: () => {
        const s = get();
        const w = s.activeWorkout;
        if (!w) return null;
        const now = new Date();
        const pausedExtra = w.pausedAt ? Math.round((now.getTime() - new Date(w.pausedAt).getTime()) / 1000) : 0;
        const durationSec = Math.max(0, Math.round((now.getTime() - new Date(w.startedAt).getTime()) / 1000) - w.pausedTotalSec - pausedExtra);
        const exercises = w.exercises.filter((e) => e.sets.length > 0 || e.skipped);
        const logged = exercises.filter((e) => e.sets.length > 0);
        if (logged.length === 0) {
          set({ activeWorkout: null });
          return null;
        }
        const prs = detectPRs(logged, s.sessions, now);
        const session: WorkoutSession = {
          id: w.id,
          planDayId: w.planDayId,
          title: w.title,
          startedAt: w.startedAt,
          finishedAt: now.toISOString(),
          durationSec,
          exercises,
          scheduled: w.scheduled,
          xpEarned: 0,
          prs,
          updatedAt: now.toISOString(),
        };
        const xp = computeWorkoutXP(session, s.xpEvents, now);
        session.xpEarned = xp.total;
        const sessions = [...s.sessions, session];
        const nextState = { ...s, sessions } as AppState;
        const progress = resolveProgress(nextState, xp.events, now);
        set({ sessions, activeWorkout: null, ...progress, ...dirty(s) });
        return { sessionId: session.id, xp: xp.total, reason: xp.reason };
      },

      submitFeedback: (sessionId, feedback) => {
        const s = get();
        const sessions = s.sessions.map((x) => (x.id === sessionId ? { ...x, feedback, updatedAt: new Date().toISOString() } : x));
        const session = sessions.find((x) => x.id === sessionId);
        let plan = s.plan;
        let changes: string[] = [];
        if (plan && s.profile && session) {
          const r = applyFeedback(plan, session.planDayId, feedback, s.profile);
          plan = r.plan;
          changes = r.changes;
        }
        set({
          sessions,
          plan,
          planChanges: changes.length ? [...s.planChanges, { at: new Date().toISOString(), changes }] : s.planChanges,
          ...dirty(s),
        });
        return changes;
      },

      addCheckin: (c) => {
        const s = get();
        const existing = s.checkins.find((x) => x.date === c.date);
        const record: Checkin = { ...c, id: existing?.id ?? uuid(), updatedAt: new Date().toISOString() };
        const checkins = existing ? s.checkins.map((x) => (x.id === existing.id ? record : x)) : [...s.checkins, record];
        const ev = awardDaily(s.xpEvents, 'checkin');
        const next = { ...s, checkins } as AppState;
        set({ checkins, ...(ev ? resolveProgress(next, [ev]) : {}), ...dirty(s) });
        return ev;
      },
      completeMobility: () => {
        const s = get();
        const ev = awardDaily(s.xpEvents, 'mobility');
        if (ev) set({ ...resolveProgress(s, [ev]), ...dirty(s) });
        return ev;
      },
      logLightActivity: () => {
        const s = get();
        const ev = awardDaily(s.xpEvents, 'light-activity');
        if (ev) set({ ...resolveProgress(s, [ev]), ...dirty(s) });
        return ev;
      },
      markProgressReviewed: () => {
        const s = get();
        const ev = awardDaily(s.xpEvents, 'progress-review');
        if (ev) set({ ...resolveProgress(s, [ev]), ...dirty(s) });
        return ev;
      },
      markTechniqueViewed: (exerciseId) => {
        const s = get();
        const today = dayKey();
        const techniqueViews = s.techniqueViews.some((v) => v.date === today && v.exerciseId === exerciseId)
          ? s.techniqueViews
          : [...s.techniqueViews, { date: today, exerciseId }];
        const ev = awardDaily(s.xpEvents, 'technique', new Date(), exerciseId);
        const next = { ...s, techniqueViews } as AppState;
        set({ techniqueViews, ...resolveProgress(next, ev ? [ev] : []), ...dirty(s) });
        return ev;
      },
      addBodyMetric: (weightKg, date = dayKey()) =>
        set((s) => {
          const existing = s.bodyMetrics.find((b) => b.date === date);
          const rec: BodyMetric = { id: existing?.id ?? uuid(), date, weightKg, updatedAt: new Date().toISOString() };
          const bodyMetrics = existing ? s.bodyMetrics.map((b) => (b.id === rec.id ? rec : b)) : [...s.bodyMetrics, rec];
          return { bodyMetrics: bodyMetrics.sort((a, b) => a.date.localeCompare(b.date)), ...dirty(s) };
        }),
      removeBodyMetric: (id) =>
        set((s) => ({
          bodyMetrics: s.bodyMetrics.filter((b) => b.id !== id),
          sync: { ...s.sync, dirty: true, deleted: [...s.sync.deleted, { table: 'body_metrics', id }] },
        })),

      setCosmetic: (slot, id) =>
        set((s) => {
          const item = COSMETICS.find((c) => c.id === id && c.slot === slot);
          const level = levelFromXp(totalXp(s.xpEvents)).level;
          if (!item || !isUnlocked(item, level, s.achievements.map((a) => a.id))) return {};
          return { cosmetics: { ...s.cosmetics, [slot]: id }, ...dirty(s) };
        }),
      toggleBadge: (achievementId) =>
        set((s) => {
          if (!s.achievements.some((a) => a.id === achievementId) || !ACHIEVEMENT_BY_ID[achievementId]) return {};
          const has = s.cosmetics.badges.includes(achievementId);
          const badges = has ? s.cosmetics.badges.filter((b) => b !== achievementId) : [...s.cosmetics.badges, achievementId].slice(-3);
          return { cosmetics: { ...s.cosmetics, badges }, ...dirty(s) };
        }),
      updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      updateNotificationSettings: (p) => set((s) => ({ settings: { ...s.settings, notifications: { ...s.settings.notifications, ...p } } })),

      addChat: (m) => set((s) => ({ chat: [...s.chat, { ...m, id: uuid(), at: new Date().toISOString() }].slice(-200) })),
      clearChat: () => set({ chat: [] }),

      consumeCelebration: () => set((s) => ({ celebrations: s.celebrations.slice(1) })),
      markSynced: (at, error = null) =>
        set((s) => ({ sync: { ...s.sync, dirty: error ? s.sync.dirty : false, lastSyncedAt: error ? s.sync.lastSyncedAt : at, lastError: error, deleted: error ? s.sync.deleted : [] } })),
      mergeRemote: (remote) => set((s) => mergeState(s, remote)),
      resetAll: () => set({ ...initial, hydrated: true, celebrations: [] }),
    }),
    {
      name: 'ascend-state',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s): PersistedState => ({
        onboarded: s.onboarded,
        auth: s.auth,
        profile: s.profile,
        draftPlan: s.draftPlan,
        plan: s.plan,
        sessions: s.sessions,
        activeWorkout: s.activeWorkout,
        xpEvents: s.xpEvents,
        checkins: s.checkins,
        bodyMetrics: s.bodyMetrics,
        achievements: s.achievements,
        techniqueViews: s.techniqueViews,
        cosmetics: s.cosmetics,
        settings: s.settings,
        chat: s.chat,
        planChanges: s.planChanges,
        sync: s.sync,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedState>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}), notifications: { ...DEFAULT_SETTINGS.notifications, ...(p.settings?.notifications ?? {}) } },
          cosmetics: { ...DEFAULT_COSMETICS, ...(p.cosmetics ?? {}) },
        };
      },
      onRehydrateStorage: () => () => {
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Union by id; newer `updatedAt` wins. Used when pulling from the cloud. */
function unionById<T extends { id: string; updatedAt?: string; at?: string }>(local: T[], remote: T[] | undefined): T[] {
  if (!remote) return local;
  const map = new Map<string, T>();
  for (const x of local) map.set(x.id, x);
  for (const r of remote) {
    const l = map.get(r.id);
    const lt = l?.updatedAt ?? l?.at ?? '';
    const rt = r.updatedAt ?? r.at ?? '';
    if (!l || rt > lt) map.set(r.id, r);
  }
  return Array.from(map.values());
}

export function mergeState(local: PersistedState, remote: Partial<PersistedState>): Partial<PersistedState> {
  const plan =
    remote.plan && (!local.plan || remote.plan.updatedAt > local.plan.updatedAt) ? remote.plan : local.plan;
  const profile = local.profile ?? remote.profile ?? null;
  return {
    profile,
    plan,
    onboarded: local.onboarded || (!!profile && !!plan),
    sessions: unionById(local.sessions, remote.sessions).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt)),
    xpEvents: unionById(local.xpEvents, remote.xpEvents).sort((a, b) => a.at.localeCompare(b.at)),
    checkins: unionById(local.checkins, remote.checkins).sort((a, b) => a.date.localeCompare(b.date)),
    bodyMetrics: unionById(local.bodyMetrics, remote.bodyMetrics).sort((a, b) => a.date.localeCompare(b.date)),
    achievements: Array.from(new Map([...(remote.achievements ?? []), ...local.achievements].map((a) => [a.id, a])).values()),
    cosmetics: remote.cosmetics && local.cosmetics === DEFAULT_COSMETICS ? remote.cosmetics : local.cosmetics,
  };
}

// ─── Selectors ──────────────────────────────────────────────────────────────

export const selectLevel = (s: Pick<PersistedState, 'xpEvents'>) => levelFromXp(totalXp(s.xpEvents));
