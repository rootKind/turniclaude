-- 011_rls_hardening.sql
-- Closes the RLS gaps and codifies the live-DB policies the app needs.
-- Idempotent (policy names are unique per table, so re-runs are safe).

-- ── push_subscriptions: fully open before → own-row policies only ───────────

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own push subscriptions" on public.push_subscriptions;
create policy "Users can insert own push subscriptions" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions" on public.push_subscriptions
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ── feedback: own read/insert, admin read-all + mark-read ───────────────────

alter table public.feedback enable row level security;

drop policy if exists "Users can read own feedback" on public.feedback;
create policy "Users can read own feedback" on public.feedback
  for select using (auth.uid() = user_id);

drop policy if exists "Admin can read all feedback" on public.feedback;
create policy "Admin can read all feedback" on public.feedback
  for select using (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12');

drop policy if exists "Users can insert own feedback" on public.feedback;
create policy "Users can insert own feedback" on public.feedback
  for insert with check (auth.uid() = user_id);

drop policy if exists "Admin can update feedback" on public.feedback;
create policy "Admin can update feedback" on public.feedback
  for update using (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12');

-- ── otp_codes: dead table → RLS on, no client policies (deny all) ───────────

alter table public.otp_codes enable row level security;

-- ── users: app needs cross-user reads (names, categories) ───────────────────

drop policy if exists "Authenticated users can read all users" on public.users;
create policy "Authenticated users can read all users" on public.users
  for select to authenticated using (true);

-- ── vacation tables (created in 010) ────────────────────────────────────────

-- vacation_assignments: everyone reads (turniferie board), writes via service role
alter table public.vacation_assignments enable row level security;
drop policy if exists "Authenticated users can read vacation assignments" on public.vacation_assignments;
create policy "Authenticated users can read vacation assignments" on public.vacation_assignments
  for select to authenticated using (true);

-- vacation_year_overrides: everyone reads (turniferie + vacanze), admin writes via service role
alter table public.vacation_year_overrides enable row level security;
drop policy if exists "Authenticated users can read vacation year overrides" on public.vacation_year_overrides;
create policy "Authenticated users can read vacation year overrides" on public.vacation_year_overrides
  for select to authenticated using (true);

-- vacation_requests: read all (vacanze list), insert own, update own (pending)
alter table public.vacation_requests enable row level security;
drop policy if exists "Authenticated users can read vacation requests" on public.vacation_requests;
create policy "Authenticated users can read vacation requests" on public.vacation_requests
  for select to authenticated using (true);
drop policy if exists "Users can insert own vacation requests" on public.vacation_requests;
create policy "Users can insert own vacation requests" on public.vacation_requests
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own vacation requests" on public.vacation_requests;
create policy "Users can update own vacation requests" on public.vacation_requests
  for update using (auth.uid() = user_id);

-- vacation_request_interests: read all, insert/delete own
alter table public.vacation_request_interests enable row level security;
drop policy if exists "Authenticated users can read vacation request interests" on public.vacation_request_interests;
create policy "Authenticated users can read vacation request interests" on public.vacation_request_interests
  for select to authenticated using (true);
drop policy if exists "Users can insert own vacation request interests" on public.vacation_request_interests;
create policy "Users can insert own vacation request interests" on public.vacation_request_interests
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete own vacation request interests" on public.vacation_request_interests;
create policy "Users can delete own vacation request interests" on public.vacation_request_interests
  for delete using (auth.uid() = user_id);

-- ── app_events: insert own (via /api/events), stats reads via service role ──

alter table public.app_events enable row level security;
drop policy if exists "Users can insert own app events" on public.app_events;
create policy "Users can insert own app events" on public.app_events
  for insert with check (auth.uid() = user_id);
