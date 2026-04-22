create table if not exists app_settings (
  id boolean primary key default true check (id = true),
  min_year_turniferie int not null default 2026,
  min_year_vacanze int not null default 2026
);

insert into app_settings (id) values (true)
on conflict (id) do nothing;

alter table app_settings enable row level security;

create policy "everyone can read app_settings"
  on app_settings for select using (true);

create policy "admin can update app_settings"
  on app_settings for update
  using (auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12');
