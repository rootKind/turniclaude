-- Schema migrated from ngTurni project, adapted for turniclaude

-- Users (extended profile, linked to auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  cognome text,
  is_secondary boolean default false,
  notification_enabled boolean default true,
  notify_on_interest boolean default true,
  notify_on_new_shift boolean default false,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

-- Shifts (id is bigint auto-increment — matches source schema)
create sequence if not exists shifts_id_seq;
create table if not exists public.shifts (
  id bigint primary key default nextval('shifts_id_seq'),
  user_id uuid not null references public.users(id) on delete cascade,
  offered_shift text not null check (offered_shift in ('Mattina', 'Pomeriggio', 'Notte')),
  shift_date date not null,
  requested_shifts text[] not null check (array_length(requested_shifts, 1) <= 2),
  highlight boolean default false,
  created_at timestamptz default timezone('utc', now())
);

-- Shift interest (composite PK)
create table if not exists public.shift_interested_users (
  shift_id bigint not null references public.shifts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default timezone('utc', now()),
  primary key (shift_id, user_id)
);

-- Push subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  endpoint text not null,
  browser text,
  platform text,
  last_update timestamptz default timezone('utc', now()),
  created_at timestamptz default timezone('utc', now()),
  unique (user_id, endpoint)
);

-- Feedback
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  categories text not null,
  message text not null,
  read boolean default false,
  created_at timestamptz default timezone('utc', now())
);

-- OTP codes (for password reset and email change)
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  type text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- RLS
alter table public.users enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_interested_users enable row level security;

-- RLS policies
create policy "Users can read own profile" on public.users
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

create policy "Authenticated users can read shifts" on public.shifts
  for select to authenticated using (true);
create policy "Users can insert own shifts" on public.shifts
  for insert with check (auth.uid() = user_id);
create policy "Users can update own shifts" on public.shifts
  for update using (auth.uid() = user_id);
create policy "Users can delete own shifts" on public.shifts
  for delete using (auth.uid() = user_id);

create policy "Authenticated users can read interests" on public.shift_interested_users
  for select to authenticated using (true);
create policy "Users can insert own interest" on public.shift_interested_users
  for insert with check (auth.uid() = user_id);
create policy "Users can delete own interest" on public.shift_interested_users
  for delete using (auth.uid() = user_id);
