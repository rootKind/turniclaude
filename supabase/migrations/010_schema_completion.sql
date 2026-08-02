-- 010_schema_completion.sql
-- Completes the schema so a fresh `supabase db reset` produces a working app.
-- All statements are idempotent (IF NOT EXISTS) so this also applies cleanly
-- to the live DB where these objects were created manually.

-- ── Vacation tables (no migration existed) ──────────────────────────────────

create table if not exists public.vacation_assignments (
  user_id     uuid primary key references public.users(id) on delete cascade,
  base_period int not null check (base_period between 1 and 6),
  created_at  timestamptz default timezone('utc', now())
);

create table if not exists public.vacation_year_overrides (
  user_id     uuid not null references public.users(id) on delete cascade,
  year        int  not null,
  period      int  not null check (period between 1 and 6),
  created_at  timestamptz default timezone('utc', now()),
  primary key (user_id, year)
);

create sequence if not exists vacation_requests_id_seq;
create table if not exists public.vacation_requests (
  id              bigint primary key default nextval('vacation_requests_id_seq'),
  user_id         uuid not null references public.users(id) on delete cascade,
  offered_period  int  not null check (offered_period between 1 and 6),
  target_periods  int[] not null,
  year            int  not null,
  is_pending      boolean default false,
  created_at      timestamptz default timezone('utc', now())
);

-- target_periods: non-empty array of valid periods (mirrors the live DB constraint)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vacation_requests'::regclass
      and conname = 'vacation_requests_target_periods_check'
  ) then
    alter table public.vacation_requests
      add constraint vacation_requests_target_periods_check
      check (cardinality(target_periods) > 0 and target_periods <@ array[1,2,3,4,5,6]);
  end if;
end $$;

create table if not exists public.vacation_request_interests (
  request_id  bigint not null references public.vacation_requests(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz default timezone('utc', now()),
  primary key (request_id, user_id)
);

-- ── app_events (written by /api/events, read by /api/admin/stats) ───────────

create sequence if not exists app_events_id_seq;
create table if not exists public.app_events (
  id          bigint primary key default nextval('app_events_id_seq'),
  user_id     uuid not null references public.users(id) on delete cascade,
  event_type  text not null check (event_type in ('access', 'new_shift', 'interest')),
  metadata    jsonb,
  created_at  timestamptz default timezone('utc', now())
);

-- ── Missing columns on existing tables ──────────────────────────────────────

alter table public.users
  add column if not exists is_manager boolean default false,
  add column if not exists notify_on_vacation_interest boolean default true,
  add column if not exists notify_on_new_vacation boolean default false;

alter table public.shifts
  add column if not exists is_pending boolean default false;

alter table public.app_settings
  add column if not exists color_overrides jsonb default '{}'::jsonb;

alter table public.sala_schedule
  add column if not exists colored_persons jsonb default '{}'::jsonb;

-- ── Indexes matching the app's query patterns ───────────────────────────────

create index if not exists app_events_user_id_idx on public.app_events (user_id);
create index if not exists vacation_requests_year_idx on public.vacation_requests (year);
create index if not exists vacation_requests_user_year_idx on public.vacation_requests (user_id, year);
create index if not exists vacation_request_interests_request_id_idx on public.vacation_request_interests (request_id);
