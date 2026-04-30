-- Allow managers (is_manager = true) to write sala data, not just admin

-- sala_schedule: drop admin-only write policies, replace with admin+manager
drop policy if exists "sala_schedule_insert" on sala_schedule;
drop policy if exists "sala_schedule_update" on sala_schedule;
drop policy if exists "sala_schedule_delete" on sala_schedule;

create policy "sala_schedule_insert" on sala_schedule
  for insert with check (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );

create policy "sala_schedule_update" on sala_schedule
  for update using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );

create policy "sala_schedule_delete" on sala_schedule
  for delete using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );

-- sala_upload_history: drop admin-only policies, replace with admin+manager
drop policy if exists "sala_upload_history_admin_select" on sala_upload_history;
drop policy if exists "sala_upload_history_admin_insert" on sala_upload_history;

create policy "sala_upload_history_select" on sala_upload_history
  for select using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );

create policy "sala_upload_history_insert" on sala_upload_history
  for insert with check (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
