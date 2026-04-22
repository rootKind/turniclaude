create table if not exists sala_upload_history (
  id           uuid default gen_random_uuid() primary key,
  month        text not null,
  filename     text not null,
  uploaded_at  timestamptz default now(),
  uploaded_by  uuid references auth.users(id)
);

alter table sala_upload_history enable row level security;

create policy "sala_upload_history_admin_select" on sala_upload_history
  for select using (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid);

create policy "sala_upload_history_admin_insert" on sala_upload_history
  for insert with check (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid);

-- Delete policy for sala_schedule (was missing)
create policy "sala_schedule_delete" on sala_schedule
  for delete using (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid);
