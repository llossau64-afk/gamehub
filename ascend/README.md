# ASCEND — Level Up Your Reality

A fitness RPG for iOS and Android. Real, validated training programs, guided workouts, an AI coach, and a character that levels up as you train consistently and recover well.

Built with **Expo SDK 57 · React Native 0.86 · TypeScript · Expo Router · Reanimated 4 · Zustand · Supabase · Claude (via a server-side Edge Function)**.

---

## What's in the app

| Area | What works |
|---|---|
| **Onboarding** | Cinematic welcome ("YOUR JOURNEY BEGINS NOW."), 8-step player creation (name, age range, optional gender & height, experience, goal, optional adult weight goal, gym/home + equipment, days, session length, favourite exercises, areas to protect, intensity), "ANALYZING YOUR PROFILE…" sequence, program review with editing, rebuilding and accepting. |
| **Home** | Avatar, level, rank, XP bar, flexible streak, today's mission (start/resume workout, or recovery day), coach tip, daily quests, player stats. A welcome-back message with no penalty after time away. |
| **Train** | Weekly schedule, expandable day cards with warm-up and cool-down, a plan editor that runs safety validation on save, rebuilding the plan, free workouts, recent sessions and coach plan updates. |
| **Workout mode** | Exercise rail, technique cues, target, last performance, a progression suggestion, set logging (weight, reps or seconds with a hold timer, perceived difficulty), undo, an automatic rest timer, pause, replace, easier, skip, finish. The coach opens mid-workout without losing progress, and you can resume after closing the app. |
| **Mission complete** | Duration, exercises, sets, volume, records, animated XP and level progress. Feedback (completed? difficulty? technique? pain + area? adjust next?) adapts the plan through the validator. |
| **Quests** | Daily quests (rest days get recovery quests), weekly missions, flexible streak, 10 collectible achievement emblems, recent XP. |
| **Progress** | Week, month and year views compared with the previous period. Trend charts for workouts, sets, volume and minutes, weekly consistency, estimated-1RM strength trend per lift, personal records, recovery averages and exercise history. Optional body-weight tracking for adults only. Empty states show until you have real data. |
| **Coach** | Chat in English and German. Uses the AI backend when it is configured and falls back to a rule-based offline coach that only uses your own plan and data. |
| **Library** | 60 exercises across 9 categories. Each has muscles, equipment, difficulty, starting position, steps, movement, breathing, mistakes, safety notes, an easier variation, alternatives and your own history chart. |
| **Character** | Original SVG avatar: 5 styles, outfits, accents, backgrounds, rank frames, titles and badges, unlocked by levels and achievements. Body shape never changes. |
| **Wellness** | Balanced nutrition, protein, hydration, sleep, rest and habits. Adults get optional goal context; under-18s get youth-specific guidance with no calorie talk. |
| **Settings** | Account and sync, profile, units, coach language, sound, music, haptics, reduce motion, auto rest timer, reminders (workout, check-in, weekly summary, plan updates, achievements), demo mode, JSON export, and deletion of the account or local data. |

**Safety design.** Every plan passes `validatePlan`, whether it comes from the AI, the user's edits, or post-workout feedback. The validator checks:
- exercises exist and match the player's equipment, flagged body areas and level
- set, rep, rest and reps-in-reserve bounds
- exercises and total sets per session
- weekly sets per muscle
- rest days
- push/pull balance
- stricter youth rules

The player's age range also limits intensity and turns off weight features for under-18s.

**XP and anti-farming.**
- One full workout reward per day.
- A session must have at least 3 logged sets and at least 8 minutes before it earns XP.
- Personal-record bonuses are capped at 3 per session.
- A daily cap of 450 XP.
- Rest-day quests also earn XP.
- XP is never taken away.

**Demonstrations.** No exercise videos ship with the app. Every exercise screen says *"No demonstration available"* and gives accurate written instructions. Licensed media can be added later through the `demo` field in `src/data/exercises.ts`.

---

## 1. Install

Requirements: Node 20+ (22 recommended), npm, and the **Expo Go** app or a development build on your phone.

```bash
cd ascend
npm install
cp .env.example .env        # optional — leave the Supabase values empty to run fully offline
npm run sounds              # optional: regenerates the original sound effects in assets/sounds
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | app (`.env`) | Supabase project URL. Public. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | app (`.env`) | Supabase **anon** key. Public by design; RLS protects the data. |
| `EXPO_PUBLIC_ENABLE_OAUTH` | app (`.env`) | `true` shows the Apple and Google sign-in buttons. Enable it only after configuring the providers in Supabase. |
| `ANTHROPIC_API_KEY` | **Supabase secret** | Claude API key. Never put it in the app. |
| `COACH_MODEL` | Supabase secret (optional) | Defaults to `claude-opus-5-5`. |
| `COACH_DAILY_LIMIT` | Supabase secret (optional) | AI requests per player per day. Defaults to 60. |

Without Supabase variables, ASCEND runs **offline-first**: all data stays on the device, the program engine builds plans, and the offline coach answers questions. Every feature except cloud sync and the AI responses works.

---

## 2. Run on a real phone

```bash
npx expo start
```

Scan the QR code with **Expo Go**: the Camera app on iOS, the Expo Go app on Android. Phone and computer must be on the same network. If they can't reach each other, use `npx expo start --tunnel`.

All native modules used (Reanimated, SVG, audio, haptics, notifications, secure store, file system, sharing) are official Expo SDK modules. If Expo Go on your device reports a missing module, or you want production-like behaviour such as scheduled notifications, use a development build:

```bash
npx eas-cli@latest build --profile development --platform android   # or ios
npx expo start --dev-client
```

Web preview (handy for quick UI checks): `npm run web`.

---

## 3. Backend (Supabase) setup

1. Create a project at [supabase.com](https://supabase.com) and install the Supabase CLI.
2. Link the project and apply the schema:
   ```bash
   cd ascend
   supabase link --project-ref <your-ref>
   supabase db push                     # applies supabase/migrations/*.sql
   ```
3. **Auth settings** (Dashboard → Authentication):
   - Turn on **Anonymous sign-ins**, so guests get a secure session for AI and backup.
   - Keep email sign-ups on. Set the minimum password length to 8.
   - **Password reset template:** ASCEND resets passwords with a 6-digit code entered in the app, not a deep link. Edit *Email Templates → Reset Password* so the body contains `{{ .Token }}`. Example: `Your ASCEND reset code is {{ .Token }}`.
   - Optional: Apple and Google providers. Add `ascend://auth-callback` to the redirect URLs, then set `EXPO_PUBLIC_ENABLE_OAUTH=true`.
4. Deploy the Edge Functions and secrets:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy coach
   supabase functions deploy delete-account
   ```
5. Put the project URL and anon key in `.env`, then restart `npx expo start`.

### Database schema (`supabase/migrations/20261011000000_init.sql`)

| Table | Contents |
|---|---|
| `profiles` | Player profile (jsonb) and cosmetics, keyed by `auth.users.id` |
| `training_plans` | Validated plans. A trigger keeps a single active plan per player |
| `workout_sessions` | Sessions with logged sets (jsonb), PRs and feedback |
| `xp_events` | Append-only XP ledger with source and amount checks, plus a server-side daily-cap trigger |
| `checkins` | Daily recovery check-ins, unique per player and day |
| `body_metrics` | Optional body weight, adults only (enforced in the app) |
| `achievements` | Unlocked achievements |
| `coach_usage` | Per-day AI request counter. Only the service role can access it |

Every table uses **Row Level Security** with `user_id = auth.uid()`. All tables cascade-delete with the auth user.

### Secure AI architecture

```
 App (anon key + user JWT) ──HTTPS──▶ Edge Function "coach" ──▶ Claude API
        │                                 │  • verifies JWT (guests = anonymous users)
        │                                 │  • per-user daily rate limit
        │                                 │  • safety system prompt (no diagnosis,
        │                                 │    no body-shaming, youth rules)
        │                                 │  • plan mode: JSON-schema structured output,
        │                                 │    may only use exercise IDs it is given
        ▼                                 ▼
 validatePlan() on device ◀── plan JSON ──┘   (+ fallback to the program engine on any failure)
```

The API key exists only as a Supabase secret. The client sends a minimised context: age range, goal, equipment, plan summary, the last 8 sessions and the last 7 check-ins. It never sends the email address or account IDs.

---

## 4. Tests & quality checks

```bash
npm test             # Jest: 57 tests
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint (includes React Compiler rules)
```

| Suite | Covers |
|---|---|
| `plan.test.ts` | Library integrity. The generator is checked across **1,344 profile combinations** (always valid, no safety repairs needed, equipment, limitations, youth rules, time budgets). The validator repairs unsafe AI output. Progression (overload, hold, deload, pain). Feedback adaptation. |
| `xp.test.ts` | Level curve, ranks, workout XP, anti-farming (minimum work, one workout per day, PR cap, daily cap), PR detection, quests, missions, flexible streaks, achievements. |
| `store.test.ts` | Navigation entry routing (new, mid-onboarding, review, dashboard, resume workout). The full workout flow through the store. Persistence round-trip to device storage. Settings migration. Cloud merge. |
| `coach.test.ts` | Language detection, intent routing for all the example questions, plan-grounded answers, pain referral, youth nutrition rules. |

---

## 5. Build for the stores (EAS)

```bash
npm i -g eas-cli          # or use npx eas-cli@latest
eas login
eas init                  # links the project and writes the projectId into app.json
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://...
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value ...

eas build --platform android --profile preview      # installable APK for testers
eas build --platform ios --profile preview          # internal distribution (registered devices)
eas build --platform all --profile production       # store builds (AAB / IPA)
eas submit --platform ios                           # App Store Connect / TestFlight
eas submit --platform android                       # Google Play (needs a service account key)
```

Bundle identifiers are `app.ascend.fitness` for iOS and Android. Change them in `app.json` before the first store build if you need different IDs. Over-the-air JavaScript updates: `eas update --channel production`.

See **[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)** for the full testing and release checklist, and **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the code structure.

---

## Project structure

```
ascend/
├── src/app/              Expo Router screens (tabs, onboarding, workout, modals)
├── src/components/       UI kit: Panel, Button, XPBar, Charts, Avatar, RankEmblem, overlays…
├── src/domain/           Pure, tested logic: plan generator/validator/progression, XP, quests,
│                         achievements, streaks, analytics, offline coach, safety rules
├── src/data/             Exercise library, cosmetics, wellness content
├── src/store/            Zustand store, persisted with AsyncStorage (offline-first)
├── src/services/         Supabase client (SecureStore sessions), auth, sync, coach API,
│                         sound/haptics, notifications, data export
├── supabase/             SQL migration + Edge Functions (coach, delete-account)
├── scripts/              Sound and icon generators (original assets)
└── __tests__/            Jest suites
```
