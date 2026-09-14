-- 031_anagraphic_realtime.sql
-- ── contesto (20/09/2026) ─────────────────────────────────────────────────────
-- Cache-first fase 2: utenti e albero squadre sono in cache react-query con
-- staleTime 6h + persistenza IndexedDB. La cache lunga resta corretta grazie
-- all'invalidazione REALTIME (hooks/use-realtime-invalidation.ts): queste
-- tabelle devono quindi essere nella publication supabase_realtime (stesso
-- modello delle migration 012 e 030).
--
-- RLS: tutte hanno policy SELECT per «authenticated» (users: 011_rls_hardening;
-- shift_*: 019/025), quindi i messaggi realtime raggiungono tutti i client
-- autenticati — nessuna policy da toccare qui.
--
-- Guardia DO block come in 012/030: idempotente su dev e live.

do $$
declare
  t text;
begin
  foreach t in array array[
    'users',
    'shift_types',
    'shift_teams',
    'shift_team_members',
    'shift_adjustments'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
