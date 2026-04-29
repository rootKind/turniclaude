alter table app_settings
  add column if not exists shift_swap_limit_enabled boolean not null default false,
  add column if not exists max_shift_swap_days int not null default 90,
  add column if not exists hide_shifts_beyond_limit boolean not null default false;
