-- 016: Changelog (popup "Novità di questa versione")
-- Persistenza server-side delle entry del changelog e dello stato di lettura
-- per utente (permette all'admin di gestire le entry e vedere chi le ha lette).

-- Entry del changelog (una per release/aggiornamento)
create table if not exists public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  date text not null,
  title text not null default 'Aggiornamento',
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz default timezone('utc', now())
);

-- Ultima versione del changelog vista da ciascun utente
create table if not exists public.changelog_reads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_version integer not null default 0,
  updated_at timestamptz default timezone('utc', now())
);

alter table public.changelog_entries enable row level security;
alter table public.changelog_reads enable row level security;

-- RLS: tutti gli utenti autenticati leggono le entry
create policy "changelog_entries_select_authed" on public.changelog_entries
  for select to authenticated using (true);

-- RLS: ogni utente legge/scrive solo la propria riga di lettura
create policy "changelog_reads_select_own" on public.changelog_reads
  for select to authenticated using (auth.uid() = user_id);
create policy "changelog_reads_insert_own" on public.changelog_reads
  for insert to authenticated with check (auth.uid() = user_id);
create policy "changelog_reads_update_own" on public.changelog_reads
  for update to authenticated using (auth.uid() = user_id);

-- Seed: versioni iniziali (25/08/2026)
insert into public.changelog_entries (version, date, title, changes) values
  (2, '25/08/2026', 'Aggiornamento', '["Novità: popup con il riepilogo delle novità di ogni aggiornamento"]'::jsonb),
  (1, '25/08/2026', 'Aggiornamento', '["Sala: la tua postazione è evidenziata con un contorno più spesso sul bordo della card","Sala: separatori verticali tra i pulsanti N / M / P","Sala: titolo delle card più leggibile in tema scuro","Leggibilità: contrasti testi bilanciati tra tema chiaro e scuro"]'::jsonb)
on conflict (version) do nothing;
