-- ASCEND initial schema
-- Every table is protected by Row Level Security: a player can only ever read
-- or write their own rows. The mobile client uses the anon key + user JWT.

create extension if not exists pgcrypto;

-- ─── Profiles ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null,               -- player profile (see src/domain/types.ts → Profile)
  cosmetics   jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Training plans ────────────────────────────────────────────────────────
create table if not exists public.training_plans (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  data        jsonb not null,               -- full validated TrainingPlan
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists training_plans_user_idx on public.training_plans (user_id, is_active, updated_at desc);

-- Only one active plan per player.
create or replace function public.deactivate_other_plans() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.is_active then
    update public.training_plans set is_active = false
    where user_id = new.user_id and id <> new.id and is_active;
  end if;
  return new;
end $$;
drop trigger if exists training_plans_single_active on public.training_plans;
create trigger training_plans_single_active after insert or update of is_active on public.training_plans
for each row execute function public.deactivate_other_plans();

-- ─── Workout sessions ──────────────────────────────────────────────────────
create table if not exists public.workout_sessions (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  plan_day_id   text,
  title         text not null,
  started_at    timestamptz not null,
  finished_at   timestamptz not null,
  duration_sec  integer not null check (duration_sec >= 0 and duration_sec < 86400),
  scheduled     boolean not null default false,
  xp_earned     integer not null default 0 check (xp_earned between 0 and 1000),
  exercises     jsonb not null,             -- ExerciseLog[] with sets
  prs           jsonb not null default '[]'::jsonb,
  feedback      jsonb,
  updated_at    timestamptz not null default now()
);
create index if not exists workout_sessions_user_idx on public.workout_sessions (user_id, finished_at);

-- ─── XP ledger (append-only) ───────────────────────────────────────────────
create table if not exists public.xp_events (
  id       uuid primary key,
  user_id  uuid not null references auth.users (id) on delete cascade,
  source   text not null check (source in (
             'scheduled-workout','extra-workout','personal-record','technique','checkin',
             'mobility','progress-review','light-activity','weekly-mission','achievement')),
  amount   integer not null check (amount between 0 and 300),
  label    text not null,
  ref      text,
  at       timestamptz not null
);
create index if not exists xp_events_user_idx on public.xp_events (user_id, at);

-- Server-side anti-farming backstop: cap daily XP from repeatable sources.
create or replace function public.enforce_daily_xp_cap() returns trigger
language plpgsql security invoker set search_path = public as $$
declare used integer;
begin
  if new.source in ('weekly-mission', 'achievement') then return new; end if;
  select coalesce(sum(amount), 0) into used from public.xp_events
   where user_id = new.user_id and source not in ('weekly-mission', 'achievement')
     and at >= date_trunc('day', new.at) and at < date_trunc('day', new.at) + interval '1 day';
  -- Generous server backstop (client enforces 450 per local day; UTC days can straddle two local days).
  if used + new.amount > 1000 then
    raise exception 'daily XP cap exceeded';
  end if;
  return new;
end $$;
drop trigger if exists xp_events_daily_cap on public.xp_events;
create trigger xp_events_daily_cap before insert on public.xp_events
for each row execute function public.enforce_daily_xp_cap();

-- ─── Check-ins & body metrics ──────────────────────────────────────────────
create table if not exists public.checkins (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  sleep       smallint not null check (sleep between 1 and 5),
  energy      smallint not null check (energy between 1 and 5),
  soreness    smallint not null check (soreness between 1 and 5),
  mood        smallint not null check (mood between 1 and 5),
  pain        boolean not null default false,
  note        text check (char_length(note) <= 500),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.body_metrics (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  weight_kg   numeric(5,1) not null check (weight_kg between 20 and 400),
  updated_at  timestamptz not null default now()
);
create index if not exists body_metrics_user_idx on public.body_metrics (user_id, date);

-- ─── Achievements ──────────────────────────────────────────────────────────
create table if not exists public.achievements (
  user_id         uuid not null references auth.users (id) on delete cascade,
  achievement_id  text not null,
  unlocked_at     timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ─── AI coach usage (rate limiting, written only by the Edge Function) ─────
create table if not exists public.coach_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  requests integer not null default 0,
  primary key (user_id, day)
);

-- ─── Row Level Security ────────────────────────────────────────────────────
alter table public.profiles         enable row level security;
alter table public.training_plans   enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.xp_events        enable row level security;
alter table public.checkins         enable row level security;
alter table public.body_metrics     enable row level security;
alter table public.achievements     enable row level security;
alter table public.coach_usage      enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own plans" on public.training_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own sessions" on public.workout_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- XP ledger: read and append only — no updates or deletes from clients.
create policy "read own xp" on public.xp_events for select to authenticated using (user_id = (select auth.uid()));
create policy "append own xp" on public.xp_events for insert to authenticated with check (user_id = (select auth.uid()));

create policy "own checkins" on public.checkins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own body metrics" on public.body_metrics for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read own achievements" on public.achievements for select to authenticated using (user_id = (select auth.uid()));
create policy "append own achievements" on public.achievements for insert to authenticated with check (user_id = (select auth.uid()));

-- coach_usage: no client policies → only the service role (Edge Function) can access it.

-- Atomic usage counter used by the coach Edge Function.
create or replace function public.bump_coach_usage(p_user uuid, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.coach_usage (user_id, day, requests) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set requests = coach_usage.requests + 1
  returning requests into n;
  return n <= p_limit;
end $$;
revoke all on function public.bump_coach_usage(uuid, integer) from public, anon, authenticated;
