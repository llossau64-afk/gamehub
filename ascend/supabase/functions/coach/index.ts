// ASCEND AI coach — Supabase Edge Function (Deno).
//
// The Anthropic API key lives ONLY here, as a function secret. The mobile app
// calls this function with the player's Supabase JWT; we verify the user,
// rate-limit, build a safety-first prompt, and return either a chat reply or
// a structured plan. Every plan is validated again on the device by the
// deterministic safety layer (src/domain/plan/validator.ts).
//
// Deploy:  supabase functions deploy coach
// Secrets: supabase secrets set ANTHROPIC_API_KEY=... [COACH_MODEL=claude-opus-5-5] [COACH_DAILY_LIMIT=60]

import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const MODEL = Deno.env.get('COACH_MODEL') ?? 'claude-opus-5-5';
const DAILY_LIMIT = Number(Deno.env.get('COACH_DAILY_LIMIT') ?? '60');
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SAFETY_RULES = `
Safety rules (always follow):
- You give general fitness education, not medical advice. Never diagnose injuries or conditions.
- For pain, injury, dizziness, chest symptoms, pregnancy, or medical conditions: advise stopping the activity and consulting a doctor or physiotherapist.
- Never guarantee outcomes, never invent credentials or studies, and say so when you are unsure.
- Never shame bodies, promote extreme physiques, crash diets, dehydration, or training through pain. Food is never something to be "earned".
- If the player is a minor (profile.minor = true): focus on technique, enjoyment, strength and recovery. Never give weight-loss advice, calorie targets, deficits, restrictive diets, or appearance goals. Keep effort comfortably below failure.
- Respect planned rest days and recovery; recommend reducing load when check-ins show poor sleep, high soreness or pain.
- Be encouraging, respectful, concise and practical.`;

const CHAT_SYSTEM = `You are the ASCEND coach — a knowledgeable, warm strength & conditioning coach inside a fitness RPG app.
Answer using the player's own profile, plan, recent sessions and check-ins provided as JSON. Be specific (exercise names, sets, reps, rest) and brief (usually under 150 words, plain text, short lists welcome, no markdown headings).
Reply in the language the player writes in (German or English) unless profile.language is "en" or "de", which then takes priority.
You cannot change the plan directly; when the player wants changes, explain what to do and mention the in-app tools (Replace / Easier / Skip during a workout, or "Edit plan" in the Train tab).
${SAFETY_RULES}`;

const PLAN_SYSTEM = `You are the ASCEND program designer. Create a safe, evidence-informed weekly training program for the player.
Requirements:
- Use ONLY exercise ids from allowedExercises. Never invent exercises.
- Schedule sessions on the player's preferred training days (0 = Monday … 6 = Sunday), leaving at least one rest day (minors: at least three).
- Balance pushing and pulling, include lower-body work, and train each major muscle group roughly twice per week when the schedule allows.
- Size each session to profile.sessionMinutes. Typical: 4–7 exercises, 2–4 sets each.
- Match rep ranges and rest to the goal: strength 3–6 reps / 2–3 min on main lifts; muscle 6–12 / 1.5–2 min; endurance & general 10–20 / 45–90 s.
- rir = reps in reserve (2–3 for beginners and minors, 1–2 for experienced adults).
- For timed exercises (loadType "timed") repsMin/repsMax are seconds.
- Respect limitations: avoid exercises stressing listed body areas.
- Include a short warm-up and cool-down per day, progression rules, recovery notes and technique notes.
${SAFETY_RULES}`;

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'split', 'rationale', 'days', 'progression', 'recoveryNotes', 'techniqueNotes'],
  properties: {
    name: { type: 'string' },
    split: { type: 'string' },
    rationale: { type: 'string' },
    progression: { type: 'array', items: { type: 'string' } },
    recoveryNotes: { type: 'array', items: { type: 'string' } },
    techniqueNotes: { type: 'array', items: { type: 'string' } },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['weekday', 'title', 'focus', 'warmup', 'cooldown', 'exercises'],
        properties: {
          weekday: { type: 'integer' },
          title: { type: 'string' },
          focus: { type: 'string' },
          warmup: { type: 'array', items: { type: 'string' } },
          cooldown: { type: 'array', items: { type: 'string' } },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['exerciseId', 'sets', 'repsMin', 'repsMax', 'restSec', 'rir'],
              properties: {
                exerciseId: { type: 'string' },
                sets: { type: 'integer' },
                repsMin: { type: 'integer' },
                repsMax: { type: 'integer' },
                restSec: { type: 'integer' },
                rir: { type: 'integer' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

type ChatTurn = { role: 'user' | 'assistant'; content: string };

function textOf(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

async function callClaude(params: { system: string; messages: ChatTurn[]; maxTokens: number; effort: 'low' | 'medium'; schema?: unknown }) {
  // Server-side refusal fallback ("default" routing) keeps the coach answering
  // if a safety classifier declines a request on the primary model.
  const msg = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: params.maxTokens,
    system: params.system,
    messages: params.messages,
    output_config: { effort: params.effort, ...(params.schema ? { format: { type: 'json_schema' as const, schema: params.schema as Record<string, unknown> } } : {}) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  return msg;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // ── Authenticate the caller (anonymous guests are allowed) ──
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);

  // ── Rate limit per user per day ──
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: allowed, error: rlErr } = await admin.rpc('bump_coach_usage', { p_user: userData.user.id, p_limit: DAILY_LIMIT });
  if (rlErr) return json({ error: 'rate limit check failed' }, 500);
  if (!allowed) return json({ error: 'daily coach limit reached' }, 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  try {
    if (body.mode === 'chat') {
      const message = String(body.message ?? '').slice(0, 2000);
      if (!message) return json({ error: 'empty message' }, 400);
      const history = (Array.isArray(body.history) ? (body.history as ChatTurn[]) : [])
        .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
        .slice(-12)
        .map((t) => ({ role: t.role, content: t.content.slice(0, 2000) }));
      // The conversation must start with a user turn.
      while (history.length && history[0].role !== 'user') history.shift();
      const context = JSON.stringify(body.context ?? {}).slice(0, 20000);
      const msg = await callClaude({
        system: `${CHAT_SYSTEM}\n\nPlayer data (JSON, authorised by the player):\n${context}`,
        messages: [...history, { role: 'user', content: message }],
        maxTokens: 2000,
        effort: 'low',
      });
      if (msg.stop_reason === 'refusal') return json({ reply: 'I can’t help with that one. For health concerns, please talk to a doctor or physiotherapist.' });
      const reply = textOf(msg);
      if (!reply) return json({ error: 'empty reply' }, 502);
      return json({ reply });
    }

    if (body.mode === 'plan') {
      const input = JSON.stringify({ profile: body.profile, trainingDays: body.trainingDays, preferred: body.preferred, allowedExercises: body.allowedExercises }).slice(0, 40000);
      const msg = await callClaude({
        system: PLAN_SYSTEM,
        messages: [{ role: 'user', content: `Design the program for this player:\n${input}` }],
        maxTokens: 16000,
        effort: 'medium',
        schema: PLAN_SCHEMA,
      });
      if (msg.stop_reason !== 'end_turn') return json({ error: `incomplete: ${msg.stop_reason}` }, 502);
      const plan = JSON.parse(textOf(msg));
      return json({ plan });
    }

    return json({ error: 'unknown mode' }, 400);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'coach busy, try again shortly' }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: `coach unavailable (${e.status})` }, 502);
    return json({ error: 'coach failed' }, 500);
  }
});
