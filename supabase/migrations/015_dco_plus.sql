-- 015: DCO+ (is_dco_plus)
-- Utenti formalmente DCO che vedono/appaiono/interagiscono con la tabella cambi
-- turno di ENTRAMBE le categorie (DCO e Noni). Le ferie restano quelle DCO.
-- notify_on_cross_shifts: toggle per chi riceve notifiche push dei turni
-- pubblicati dall'ALTRO gruppo (vale per i DCO+ e per i Noni).

alter table public.users
  add column if not exists is_dco_plus boolean default false,
  add column if not exists notify_on_cross_shifts boolean default true;

-- Sanity: un DCO+ è per definizione DCO (is_secondary = false) e non manager.
update public.users
  set is_dco_plus = false
  where is_secondary = true or is_manager = true;
