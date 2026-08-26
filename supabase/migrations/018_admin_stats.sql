-- 018_admin_stats.sql
-- Statistiche admin: aggregazione IN POSTGRES (mai scaricare righe nel server:
-- il fetch di app_events via REST è troncato a 1000 righe da db-max-rows).
-- Una sola RPC che restituisce JSONB con 4 blocchi:
--   overview   -> conteggi aggregati (periodo o da sempre)
--   activity   -> serie settimanale di access/new_shift/interest
--   users      -> per utente: eventi (all-time) + turni reali + N/M/P + ultimo accesso
--   shiftModes -> conteggio turni offerti per fascia (periodo o da sempre)
-- p_days: giorni di periodo; 0 (o negativo) = da sempre.
-- Accesso SOLO via service_role (la route API verifica ADMIN_ID).

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
      'shifts_total', (select count(*) from public.shifts
                       where p_days <= 0 or shift_date >= current_date - p_days)
    ),
    'activity', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.week)
      from (
        select to_char(date_trunc('week', created_at)::date, 'YYYY-MM-DD') as week,
               count(*) filter (where event_type = 'access') as access,
               count(*) filter (where event_type = 'new_shift') as new_shift,
               count(*) filter (where event_type = 'interest') as interest
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
          max(ev.created_at) filter (where ev.event_type = 'access') as last_access,
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

-- Solo service_role può chiamarla (la route verifica ADMIN_ID col cookie sessione)
revoke all on function public.get_admin_stats(int) from public, anon, authenticated;
grant execute on function public.get_admin_stats(int) to service_role;

-- Indici per le aggregazioni (tabelle piccole: costo trascurabile)
create index if not exists app_events_created_at_idx on public.app_events (created_at);
create index if not exists app_events_type_created_idx on public.app_events (event_type, created_at);
create index if not exists shifts_user_date_idx on public.shifts (user_id, shift_date);
create index if not exists shifts_shift_date_idx on public.shifts (shift_date);
