-- 023_notify_shift_filter.sql
-- Nuovo toggle notifiche: «solo i nuovi turni che posso coprire». Quando attivo,
-- l'utente NON riceve la notifica «nuovo turno pubblicato» se il suo turno del
-- giorno offerto (reale dal PDF; in mancanza il teorico) non è fra quelli cercati
-- dalla richiesta: non potrebbe mai prendere quel cambio.
-- Default false = comportamento attuale (riceve tutto). Applicare a dev e
-- production via SQL editor/Management API (vedi knowledge.md, migration history).

alter table public.users
  add column if not exists notify_shift_filter boolean not null default false;
