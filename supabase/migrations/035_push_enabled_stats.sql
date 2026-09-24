-- 035_push_enabled_stats.sql
-- STATISTICHE DELLE NOTIFICHE (richiesta 25/09/2026).
--
-- La schermata invasiva del promemoria ora trasforma reluctant users in iscritti:
-- serve MISURARLA. Due fonti:
--
--   1. app_events con event_type 'push_enabled' (metadata->>'source':
--      'prompt' = schermata invasiva, 'settings' = pagina impostazioni).
--      L'INSERT resta via /api/events (INSERT own, policy 011): l'evento è
--      dell'utente, non dell'admin.
--   2. push_subscriptions.created_at: la data REALE della prima iscrizione
--      push per utente (già in tabella fin dalla migration 001).
--
-- La RPC get_admin_stats (018) viene estesa: 'push' block con attivazioni
-- nel periodo, conteggio per sorgente, iscritti (con iscrizione attiva), e
-- la data della prima iscrizione per ogni utente nel blocco 'users' per
-- alimentare le statistiche con i dati veri, aggregati IN POSTGRES.
--
-- Il CHECK su event_type è allargato con idempotenza (drop+add in DO block).

do $$ begin
  alter table public.app_events drop constraint if exists app_events_event_type_check;
  alter table public.app_events add constraint app_events_event_type_check
    check (event_type = any (array['access'::text, 'new_shift'::text, 'interest'::text, 'push_enabled'::text]));
exception when others then raise; end $$;

create index if not exists app_events_type_created_idx
  on public.app_events (event_type, created_at);

-- (la funzione get_admin_stats viene ricreata interamente qui sotto)
drop function if exists public.get_admin_stats(int);

create or replace function public.get_admin_stats(p_days int default 365)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'overview', jsonb_build_object(
      'users_total', (select count(*) from public.users),
      'users_active', (select count(distinct user_id) from public.app_events
                       where p_days <= 0 or created_at >= now() - make_interval(days => p_days)),
      'access', (select count(*) from public.app_events
                 where event_type = 'access'
                   and (p_days <= 0 or created_at >= now() - make_interval(days => p_days))),
      'new_shift', (select count(*) from public.app_events
                    where event_type = 'new_shift'
                      and (p_days <= 0 or created_at >= now() - make_interval(days => p_days))),
      'interest', (select count(*) from public.app_events
                   where event_type = 'interest'
                     and (p_days <= 0 or created_at >= now() - make_interval(days => p_days))),
      'push_enabled', (select count(*) from public.app_events
                       where event_type = 'push_enabled'
                         and (p_days <= 0 or created_at >= now() - make_interval(days => p_days))),
      'push_enabled_prompt', (select count(*) from public.app_events
                              where event_type = 'push_enabled'
                                and coalesce(metadata->>'source', 'prompt') = 'prompt'
                                and (p_days <= 0 or created_at >= now() - make_interval(days => p_days))),
      'push_enabled_settings', (select count(*) from public.app_events
                                where event_type = 'push_enabled'
                                  and metadata->>'source' = 'settings'
                                  and (p_days <= 0 or created_at >= now() - make_interval(days => p_days))),
      'shifts_total', (select count(*) from public.shifts
                       where p_days <= 0 or shift_date >= current_date - p_days)
    ),
    'activity', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.week)
      from (
        select to_char(date_trunc('week', created_at)::date, 'YYYY-MM-DD') as week,
               count(*) filter (where event_type = 'access') as access,
               count(*) filter (where event_type = 'new_shift') as new_shift,
               count(*) filter (where event_type = 'interest') as interest,
               count(*) filter (where event_type = 'push_enabled') as push_enabled
        from public.app_events
        where p_days <= 0 or created_at >= now() - make_interval(days => p_days)
        group by 1
      ) w
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.cognome nulls last, t.nome nulls last)
      from (
        select
          us.id,
          us.nome,
          us.cognome,
          us.is_secondary,
          us.is_manager,
          us.is_dco_plus,
          count(ev.id) filter (where ev.event_type = 'access') as access,
          count(ev.id) filter (where ev.event_type = 'new_shift') as new_shift,
          count(ev.id) filter (where ev.event_type = 'interest') as interest,
          count(ev.id) filter (where ev.event_type = 'push_enabled') as push_enabled,
          max(ev.created_at) filter (where ev.event_type = 'access') as last_access,
          -- LA DATA VERA della prima iscrizione push (fonte: push_subscriptions)
          (select min(ps.created_at) from public.push_subscriptions ps
            where ps.user_id = us.id) as push_first_subscribed_at,
          (select count(*) from public.push_subscriptions ps
            where ps.user_id = us.id) as push_devices,
          coalesce(s.cnt, 0) as shifts,
          coalesce(s.mattina, 0) as mattina,
          coalesce(s.pomeriggio, 0) as pomeriggio,
          coalesce(s.notte, 0) as notte
        from public.users us
        left join public.app_events ev on ev.user_id = us.id
        left join (
          select user_id,
                 count(*) as cnt,
                 count(*) filter (where offered_shift = 'Mattina') as mattina,
                 count(*) filter (where offered_shift = 'Pomeriggio') as pomeriggio,
                 count(*) filter (where offered_shift = 'Notte') as notte
          from public.shifts
          group by user_id
        ) s on s.user_id = us.id
        group by us.id, us.nome, us.cognome, us.is_secondary, us.is_manager,
                 us.is_dco_plus, s.cnt, s.mattina, s.pomeriggio, s.notte
      ) t
    ), '[]'::jsonb),
    'shiftModes', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.mode)
      from (
        select offered_shift as mode, count(*) as count
        from public.shifts
        where p_days <= 0 or shift_date >= current_date - p_days
        group by 1
      ) m
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_admin_stats(int) from public, anon, authenticated;
grant execute on function public.get_admin_stats(int) to service_role;
