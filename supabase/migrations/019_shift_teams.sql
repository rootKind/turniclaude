-- 019_shift_teams.sql
-- Sistema dei turni teorici (squadre e cicli).
--
-- Modello: ogni membro ha la propria riga teorica (pattern di token, es. "M9",
-- "N7S", "RC", "RI", "RM", "D") lunga quanto il ciclo della sua tipologia
-- (28 gg per le squadre con notti / scorte / IAP, 84 gg per senza notti e
-- RIC/ASTER). Il pattern è ancorato alla DATA ASSOLUTA: il token del giorno D
-- è pattern[(giorniDa(pattern_start, D) + aggiustamenti) mod cycle_days].
-- Verificato sui PDF: ogni persona ha 0 conflitti a P=28/84 su 17 mesi.
--
-- Le squadre (shift_teams) sono i sottogruppi della stessa tipologia, sfasati
-- tra loro (es. A/B/C/D a +0/+7/+14/+21; scorte semplici in 4 fasi di 7 gg;
-- senza notti a +0/+28/+56). Il pattern resta per membro perché capisquadra e
-- numerati usano sezioni diverse (DCP/DCCM vs 9/10/11) sullo stesso giorno.
--
-- shift_adjustments = storico del comando "shift turni": sposta di ±1 giorno
-- tutti i turni teorici a partire da una data di efficacia (correzioni
-- systemwide, es. anni bisestili). Cumulativo: si sommano i delta con
-- effective_date <= D.

create table if not exists public.shift_types (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  cycle_days    int  not null check (cycle_days in (3, 6, 28, 84)),
  pattern_start date not null,  -- data assoluta in cui vale pattern[0] di ogni membro
  is_active     boolean not null default true,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default timezone('utc', now())
);

create table if not exists public.shift_teams (
  id                uuid primary key default gen_random_uuid(),
  shift_type_id     uuid not null references public.shift_types(id) on delete cascade,
  name              text not null,
  phase_offset_days int  not null default 0,  -- metadato: sfasamento della squadra (0/7/14/21, 0/28/56)
  sort_order        int  not null default 0
);

create table if not exists public.shift_team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.shift_teams(id) on delete cascade,
  full_name   text not null,      -- nome come nel PDF, es. "DI MONDA"
  user_id     uuid references public.users(id) on delete set null,  -- link opzionale ad auth
  pattern     text[] not null,    -- lunghezza = cycle_days della tipologia
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default timezone('utc', now()),
  unique (team_id, full_name)
);

create table if not exists public.shift_adjustments (
  id             uuid primary key default gen_random_uuid(),
  effective_date date not null,   -- dal giorno X (incluso) in poi
  delta_days     int  not null check (delta_days in (-1, 1)),
  scope          text not null default 'global' check (scope in ('global', 'team')),
  team_id        uuid references public.shift_teams(id) on delete cascade,
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default timezone('utc', now())
);

-- ── indici ──────────────────────────────────────────────────────────────────

create index if not exists shift_teams_type_idx on public.shift_teams (shift_type_id);
create index if not exists shift_team_members_team_idx on public.shift_team_members (team_id);
create index if not exists shift_team_members_user_idx on public.shift_team_members (user_id);
create index if not exists shift_adjustments_effective_idx on public.shift_adjustments (effective_date);
create index if not exists shift_adjustments_team_idx on public.shift_adjustments (team_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Lettura per tutti gli autenticati (pagina turni e generazione client);
-- scrittura solo admin o manager (stessa convenzione di migration 009/013).

alter table public.shift_types enable row level security;
alter table public.shift_teams enable row level security;
alter table public.shift_team_members enable row level security;
alter table public.shift_adjustments enable row level security;

create policy "shift_types_select" on public.shift_types
  for select to authenticated using (true);
create policy "shift_types_insert" on public.shift_types
  for insert with check (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
create policy "shift_types_update" on public.shift_types
  for update using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
create policy "shift_types_delete" on public.shift_types
  for delete using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );

create policy "shift_teams_select" on public.shift_teams
  for select to authenticated using (true);
create policy "shift_teams_insert" on public.shift_teams
  for insert with check (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
create policy "shift_teams_update" on public.shift_teams
  for update using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
create policy "shift_teams_delete" on public.shift_teams
  for delete using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );

create policy "shift_team_members_select" on public.shift_team_members
  for select to authenticated using (true);
create policy "shift_team_members_insert" on public.shift_team_members
  for insert with check (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
create policy "shift_team_members_update" on public.shift_team_members
  for update using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
create policy "shift_team_members_delete" on public.shift_team_members
  for delete using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );

create policy "shift_adjustments_select" on public.shift_adjustments
  for select to authenticated using (true);
create policy "shift_adjustments_insert" on public.shift_adjustments
  for insert with check (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
create policy "shift_adjustments_delete" on public.shift_adjustments
  for delete using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );