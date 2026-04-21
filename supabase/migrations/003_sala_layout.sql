create table if not exists sala_layout (
  id      integer primary key default 1,
  layout  jsonb not null default '[]',
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

-- Only one row ever (id=1)
alter table sala_layout enable row level security;

-- Everyone can read
create policy "sala_layout_select" on sala_layout
  for select using (true);

-- Only admin can write
create policy "sala_layout_insert" on sala_layout
  for insert with check (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12');

create policy "sala_layout_update" on sala_layout
  for update using (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12');
