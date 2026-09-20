-- 034_notify_vacation_filter.sql
-- Nuovo toggle notifiche ferie: «solo i cambi ferie che cercano il mio periodo».
-- È lo SPECCHIO di notify_shift_filter (migration 023), che fa la stessa cosa per
-- i cambi turno: quando è attivo, l'utente NON riceve «nuovo cambio ferie
-- disponibile» se il suo periodo ferie dell'anno richiesto (override admin
-- compresi, vedi vacation_year_overrides) non è fra i periodi che la richiesta
-- cerca — quel cambio non potrebbe mai riguardarlo.
-- Chi lo riceve ha un testo DEDICATO (new_vacation.compatible), che dice il
-- proprio periodo: la notifica generica resta a chi non ha il filtro attivo.
-- Default false = comportamento attuale (riceve tutto). Applicare a dev e
-- production via Management API (scripts/apply-release-migrations.mjs).

alter table public.users
  add column if not exists notify_vacation_filter boolean not null default false;
