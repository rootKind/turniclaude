create table if not exists sala_schedule (
  month        text primary key,  -- "2026-04"
  schedule     jsonb not null default '{}',
  uploaded_at  timestamptz default now(),
  uploaded_by  uuid references auth.users(id)
);

alter table sala_schedule enable row level security;

-- Everyone can read
create policy "sala_schedule_select" on sala_schedule
  for select using (true);

-- Only admin can write
create policy "sala_schedule_insert" on sala_schedule
  for insert with check (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12');

create policy "sala_schedule_update" on sala_schedule
  for update using (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12');
