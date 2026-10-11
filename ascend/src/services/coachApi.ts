import { EXERCISE_BY_ID } from '../data/exercises';
import { offlineCoachReply, type CoachContext } from '../domain/coach';
import { generatePlan } from '../domain/plan/generator';
import { availableExercises } from '../domain/plan/library';
import { validatePlan, type ValidationIssue } from '../domain/plan/validator';
import { isMinor } from '../domain/safety';
import type { ChatMessage, PlanDay, Profile, TrainingPlan, Weekday } from '../domain/types';
import { uuid } from '../utils';
import { supabase } from './supabase';

const TIMEOUT_MS = 45000;

async function hasSession(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('not-configured');
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS));
  const call = supabase.functions.invoke('coach', { body }).then(({ data, error }) => {
    if (error) throw error;
    return data as T;
  });
  return Promise.race([call, timeout]);
}

/** Compact, privacy-minimised context for the AI: no email, no account ids. */
export function buildContext(ctx: CoachContext) {
  const { profile, plan, sessions, checkins } = ctx;
  return {
    profile: {
      name: profile.name,
      ageRange: profile.ageRange,
      minor: isMinor(profile.ageRange),
      experience: profile.experience,
      goal: profile.goal,
      weightGoal: isMinor(profile.ageRange) ? 'none' : profile.weightGoal,
      location: profile.location,
      equipment: profile.equipment,
      sessionMinutes: profile.sessionMinutes,
      limitations: profile.limitations,
      limitationNotes: profile.limitationNotes,
      intensity: profile.intensity,
      units: profile.units,
      language: profile.coachLanguage,
    },
    plan: plan
      ? {
          split: plan.split,
          days: plan.days.map((d) => ({
            weekday: d.weekday,
            title: d.title,
            exercises: d.exercises.map((e) => `${EXERCISE_BY_ID[e.exerciseId]?.name} ${e.sets}x${e.repsMin}-${e.repsMax}`),
          })),
        }
      : null,
    recentSessions: sessions.slice(-8).map((s) => ({
      date: s.finishedAt.slice(0, 10),
      title: s.title,
      minutes: Math.round(s.durationSec / 60),
      exercises: s.exercises.map((e) => ({
        name: EXERCISE_BY_ID[e.exerciseId]?.name,
        sets: e.sets.map((x) => `${x.weight ?? 'BW'}x${x.reps}${x.rpe ? `@${x.rpe}` : ''}`).join(', '),
      })),
      feedback: s.feedback,
    })),
    recentCheckins: checkins.slice(-7).map(({ date, sleep, energy, soreness, mood, pain }) => ({ date, sleep, energy, soreness, mood, pain })),
    today: new Date().toISOString().slice(0, 10),
  };
}

export interface CoachReply {
  text: string;
  source: 'ai' | 'offline';
}

export async function askCoach(message: string, history: ChatMessage[], ctx: CoachContext): Promise<CoachReply> {
  if (await hasSession()) {
    try {
      const res = await invoke<{ reply: string }>({
        mode: 'chat',
        message,
        history: history.slice(-12).map((m) => ({ role: m.role === 'coach' ? 'assistant' : 'user', content: m.text })),
        context: buildContext(ctx),
      });
      if (res?.reply) return { text: res.reply, source: 'ai' };
    } catch {
      // fall through to the offline coach
    }
  }
  return { text: offlineCoachReply(message, ctx), source: 'offline' };
}

interface AIPlanDay {
  weekday: number;
  title: string;
  focus: string;
  warmup: string[];
  cooldown: string[];
  exercises: { exerciseId: string; sets: number; repsMin: number; repsMax: number; restSec: number; rir: number; notes?: string }[];
}
interface AIPlan {
  name: string;
  split: string;
  rationale: string;
  days: AIPlanDay[];
  progression: string[];
  recoveryNotes: string[];
  techniqueNotes: string[];
}

export interface PlanResult {
  plan: TrainingPlan;
  source: 'ai' | 'fallback';
  issues: ValidationIssue[];
  message?: string;
}

/**
 * AI plan generation with a deterministic safety net:
 * 1. the AI may only choose exercise ids from the player's available library;
 * 2. the result is validated and repaired by `validatePlan`;
 * 3. on any failure the professional fallback generator is used.
 */
export async function createPersonalPlan(profile: Profile): Promise<PlanResult> {
  const fallback = () => {
    const { plan } = generatePlan(profile);
    const v = validatePlan(plan, profile);
    return v.plan;
  };
  if (!(await hasSession()))
    return { plan: fallback(), source: 'fallback', issues: [], message: 'Built with the ASCEND program engine (offline mode).' };

  try {
    const allowed = availableExercises(profile).map((e) => ({ id: e.id, name: e.name, pattern: e.pattern, category: e.category, loadType: e.loadType }));
    const res = await invoke<{ plan: AIPlan }>({ mode: 'plan', profile: buildContext({ profile, plan: null, sessions: [], checkins: [] }).profile, trainingDays: profile.trainingDays, preferred: profile.preferredExercises, allowedExercises: allowed });
    const ai = res?.plan;
    if (!ai || !Array.isArray(ai.days)) throw new Error('empty');
    const now = new Date().toISOString();
    const days: PlanDay[] = ai.days.map((d) => ({
      id: `day-${d.weekday}-${uuid().slice(0, 8)}`,
      weekday: d.weekday as Weekday,
      title: String(d.title || 'Training'),
      focus: String(d.focus || ''),
      warmup: Array.isArray(d.warmup) ? d.warmup.map(String) : [],
      cooldown: Array.isArray(d.cooldown) ? d.cooldown.map(String) : [],
      exercises: (d.exercises ?? []).map((e) => ({ ...e })),
      estMinutes: 0,
    }));
    const candidate: TrainingPlan = {
      id: uuid(),
      name: String(ai.name || 'Personal Program'),
      split: String(ai.split || 'Custom'),
      createdAt: now,
      updatedAt: now,
      source: 'ai',
      days,
      restDays: [],
      progression: ai.progression ?? [],
      recoveryNotes: ai.recoveryNotes ?? [],
      techniqueNotes: ai.techniqueNotes ?? [],
      rationale: String(ai.rationale || ''),
      warnings: [],
    };
    const v = validatePlan(candidate, profile);
    if (!v.ok) throw new Error('invalid');
    return { plan: v.plan, source: 'ai', issues: v.issues };
  } catch {
    return { plan: fallback(), source: 'fallback', issues: [], message: 'The AI coach was unavailable, so your program was built by the ASCEND program engine.' };
  }
}
