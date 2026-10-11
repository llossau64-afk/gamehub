import NetInfo from '@react-native-community/netinfo';
import type { BodyMetric, Checkin, Profile, TrainingPlan, WorkoutSession, XPEvent } from '../domain/types';
import { useAppStore, type PersistedState } from '../store/useAppStore';
import { supabase } from './supabase';

/**
 * Offline-first sync. The on-device store is the source of truth; when online
 * and signed in (including anonymous guests), changes are pushed to Supabase
 * and remote records are merged back (newest `updatedAt` wins).
 */

async function session() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

const toSessionRow = (uid: string, s: WorkoutSession) => ({
  id: s.id,
  user_id: uid,
  plan_day_id: s.planDayId,
  title: s.title,
  started_at: s.startedAt,
  finished_at: s.finishedAt,
  duration_sec: s.durationSec,
  scheduled: s.scheduled,
  xp_earned: s.xpEarned,
  exercises: s.exercises,
  prs: s.prs,
  feedback: s.feedback ?? null,
  updated_at: s.updatedAt,
});

type Row = Record<string, unknown>;
const fromSessionRow = (r: Row): WorkoutSession => ({
  id: r.id as string,
  planDayId: (r.plan_day_id as string) ?? null,
  title: r.title as string,
  startedAt: r.started_at as string,
  finishedAt: r.finished_at as string,
  durationSec: r.duration_sec as number,
  scheduled: r.scheduled as boolean,
  xpEarned: r.xp_earned as number,
  exercises: r.exercises as WorkoutSession['exercises'],
  prs: (r.prs as WorkoutSession['prs']) ?? [],
  feedback: (r.feedback as WorkoutSession['feedback']) ?? undefined,
  updatedAt: r.updated_at as string,
});

function changedSince<T extends { updatedAt: string }>(xs: T[], since: string | null): T[] {
  return since ? xs.filter((x) => x.updatedAt > since) : xs;
}

async function upsertChunks(table: string, rows: Row[], ignoreDuplicates = false) {
  if (!supabase) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'id', ignoreDuplicates });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function pushChanges(): Promise<void> {
  const sess = await session();
  if (!supabase || !sess) return;
  const uid = sess.user.id;
  const s = useAppStore.getState();
  const since = s.sync.lastSyncedAt;
  const startedAt = new Date().toISOString();

  if (s.profile) {
    const { error } = await supabase.from('profiles').upsert({ id: uid, data: s.profile, cosmetics: s.cosmetics, updated_at: startedAt });
    if (error) throw new Error(`profiles: ${error.message}`);
  }
  if (s.plan) await upsertChunks('training_plans', [{ id: s.plan.id, user_id: uid, data: s.plan, is_active: true, updated_at: s.plan.updatedAt }]);
  await upsertChunks('workout_sessions', changedSince(s.sessions, since).map((x) => toSessionRow(uid, x)));
  await upsertChunks(
    'checkins',
    changedSince(s.checkins, since).map((c) => ({ id: c.id, user_id: uid, date: c.date, sleep: c.sleep, energy: c.energy, soreness: c.soreness, mood: c.mood, pain: c.pain, note: c.note ?? null, updated_at: c.updatedAt })),
  );
  await upsertChunks(
    'body_metrics',
    changedSince(s.bodyMetrics, since).map((b) => ({ id: b.id, user_id: uid, date: b.date, weight_kg: b.weightKg, updated_at: b.updatedAt })),
  );
  await upsertChunks(
    'xp_events',
    s.xpEvents.filter((e) => !since || e.at >= since).map((e) => ({ id: e.id, user_id: uid, source: e.source, amount: e.amount, label: e.label, ref: e.ref ?? null, at: e.at })),
    true,
  );
  if (s.achievements.length) {
    const { error } = await supabase
      .from('achievements')
      .upsert(s.achievements.map((a) => ({ user_id: uid, achievement_id: a.id, unlocked_at: a.at })), { onConflict: 'user_id,achievement_id', ignoreDuplicates: true });
    if (error) throw new Error(`achievements: ${error.message}`);
  }
  for (const d of s.sync.deleted) {
    const { error } = await supabase.from(d.table).delete().eq('id', d.id);
    if (error) throw new Error(`${d.table}: ${error.message}`);
  }
  useAppStore.getState().markSynced(startedAt);
}

export async function pullRemote(): Promise<void> {
  const sess = await session();
  if (!supabase || !sess) return;
  const [profile, plans, sessions, checkins, metrics, events, achievements] = await Promise.all([
    supabase.from('profiles').select('data, cosmetics').maybeSingle(),
    supabase.from('training_plans').select('data').eq('is_active', true).order('updated_at', { ascending: false }).limit(1),
    supabase.from('workout_sessions').select('*').order('finished_at'),
    supabase.from('checkins').select('*'),
    supabase.from('body_metrics').select('*'),
    supabase.from('xp_events').select('*'),
    supabase.from('achievements').select('achievement_id, unlocked_at'),
  ]);
  const firstError = [profile, plans, sessions, checkins, metrics, events, achievements].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const remote: Partial<PersistedState> = {
    profile: (profile.data?.data as Profile) ?? null,
    cosmetics: (profile.data?.cosmetics as PersistedState['cosmetics']) ?? undefined,
    plan: ((plans.data?.[0]?.data as TrainingPlan) ?? null) || null,
    sessions: (sessions.data ?? []).map(fromSessionRow),
    checkins: (checkins.data ?? []).map(
      (r): Checkin => ({ id: r.id, date: r.date, sleep: r.sleep, energy: r.energy, soreness: r.soreness, mood: r.mood, pain: r.pain, note: r.note ?? undefined, updatedAt: r.updated_at }),
    ),
    bodyMetrics: (metrics.data ?? []).map((r): BodyMetric => ({ id: r.id, date: r.date, weightKg: Number(r.weight_kg), updatedAt: r.updated_at })),
    xpEvents: (events.data ?? []).map((r): XPEvent => ({ id: r.id, source: r.source, amount: r.amount, label: r.label, ref: r.ref ?? undefined, at: r.at })),
    achievements: (achievements.data ?? []).map((r) => ({ id: r.achievement_id as string, at: r.unlocked_at as string })),
  };
  useAppStore.getState().mergeRemote(remote);
}

let running = false;
let queued = false;

export async function syncNow(opts: { pull?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Cloud sync is not configured.' };
  if (running) {
    queued = true;
    return { ok: true };
  }
  running = true;
  try {
    const net = await NetInfo.fetch();
    if (net.isConnected === false) return { ok: false, error: 'You are offline. Changes are saved on this device and will sync later.' };
    if (opts.pull) await pullRemote();
    await pushChanges();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed';
    useAppStore.getState().markSynced(new Date().toISOString(), msg);
    return { ok: false, error: msg };
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void syncNow();
    }
  }
}

/** Debounced background sync on local changes and on reconnect. */
export function startAutoSync(): () => void {
  if (!supabase) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 4000);
  };
  const unsubStore = useAppStore.subscribe((s, prev) => {
    if (s.sync.dirty && (!prev.sync.dirty || s.sessions !== prev.sessions || s.xpEvents !== prev.xpEvents)) schedule();
  });
  const unsubNet = NetInfo.addEventListener((st) => {
    if (st.isConnected && useAppStore.getState().sync.dirty) schedule();
  });
  void syncNow({ pull: true });
  return () => {
    unsubStore();
    unsubNet();
    if (timer) clearTimeout(timer);
  };
}
