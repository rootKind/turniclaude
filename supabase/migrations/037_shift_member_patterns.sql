-- 037_shift_member_patterns.sql
-- ── I PATTERN DEI MEMBRI HANNO UNA DATA DI INIZIO VALIDITÀ (26/09/2026) ─────
--
-- Il problema. `shift_team_members.pattern` è un ciclo che vale «per sempre»,
-- ancorato al `pattern_start` della tipologia (2026-03-01 per tutte). Ma gli
-- assetti CAMBIANO: dal 1° ottobre 2026 i 44 della squadra in terza passano
-- da `P5T`/`M5T` a `PJ`/`MJ` (la 5ª sezione diventa la JOLLY), le tre squadre
-- «in seconda» prendono un nuovo ciclo di 84 giorni e le scorte di rilievo
-- passano da un ciclo di 28 a uno di 252 giorni. Sono cambiamenti di
-- CONTENUTO, non di fase: nessuna rotazione del ciclo precedente li produce,
-- quindi non si possono simulare con `shift_adjustments` (che sposta solo i
-- giorni).
--
-- Il costo. Scrivendo il nuovo pattern nella colonna, la teoria di luglio,
-- agosto e settembre smetteva di combaciare con i PDF di quei mesi (98,3% →
-- 81,5% a settembre), mentre ottobre saliva a 98,7%: la board mostrava «≠»
-- sui mesi già chiusi, che sono invece corretti.
--
-- La soluzione. Il pattern diventa una STORIA: più righe per membro, ognuna
-- valida dal proprio giorno. `lib/turni-teorici.ts` (`tokenForMember`) sceglie
-- la riga in vigore nella data che sta chiedendo, quindi ogni mese — passato o
-- futuro — viene calcolato con l'assetto che valeva allora. La colonna
-- `pattern` resta: è il pattern di base (quello valido dal `pattern_start`) e
-- il ripiego quando un membro non ha storico.
--
-- ── schema ───────────────────────────────────────────────────────────────────
create table if not exists public.shift_member_patterns (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.shift_team_members(id) on delete cascade,
  from_date   date not null,                                    -- dal giorno X (incluso) vale questo pattern
  pattern     text[] not null,
  note        text,
  created_at  timestamptz not null default timezone('utc', now()),
  unique (member_id, from_date)
);

create index if not exists shift_member_patterns_member_idx
  on public.shift_member_patterns (member_id, from_date desc);

comment on table public.shift_member_patterns is
  'Storico dei cicli di un membro: la riga con from_date più vicina (non successiva) alla data vale per quel giorno. shift_team_members.pattern è il ciclo di base, valido dal pattern_start della tipologia.';

-- ── RLS (convenzione 019) ────────────────────────────────────────────────────
alter table public.shift_member_patterns enable row level security;

create policy "shift_member_patterns_select" on public.shift_member_patterns
  for select to authenticated using (true);
create policy "shift_member_patterns_insert" on public.shift_member_patterns
  for insert with check (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
create policy "shift_member_patterns_update" on public.shift_member_patterns
  for update using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );
create policy "shift_member_patterns_delete" on public.shift_member_patterns
  for delete using (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  );

-- ── backfill: il pattern di oggi è la riga che vale dal pattern_start ────────
-- Così il comportamento non cambia nulla: finché non si aggiungono righe, la
-- riga trovata è identica alla colonna. Idempotente.
insert into public.shift_member_patterns (member_id, from_date, pattern, note)
select m.id, t.pattern_start, m.pattern, 'ciclo di base (quello in colonna)'
from public.shift_team_members m
join public.shift_teams tm on tm.id = m.team_id
join public.shift_types t on t.id = tm.shift_type_id
where m.pattern is not null and cardinality(m.pattern) > 0
on conflict (member_id, from_date) do nothing;
