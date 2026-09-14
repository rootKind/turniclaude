-- 030_sala_schedule_realtime.sql
-- ── contesto (20/09/2026) ─────────────────────────────────────────────────────
-- Cache-first per /turnisala: la board legge il mese da IndexedDB e poi
-- riconvalida. Perché i client APERTI si aggiornino al volo quando un admin
-- pubblica/elimina/ricolora un PDF, sala_schedule deve essere nella
-- publication supabase_realtime (pattern della migration 012 per shifts e
-- vacanze: realtime = push, zero polling).
--
-- RLS: la tabella ha già «sala_schedule_select» using (true) (migration 004),
-- quindi i messaggi realtime raggiungono tutti gli autenticati — stesso
-- modello di shifts, già in produzione.
--
-- Guardia DO block come in 012: `alter publication add table` fallisce se la
-- tabella è già presente (idempotente su dev e live).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sala_schedule'
  ) then
    alter publication supabase_realtime add table public.sala_schedule;
  end if;
end $$;
