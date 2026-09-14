-- 029_notif_template_overrides.sql
-- ── contesto (14/09/2026) ────────────────────────────────────────────────────
-- Pannello debug notifiche (pannello admin): l'admin vede tutti i messaggi
-- push dell'app, ne modifica titolo/testo (con variabili {nome}, {turno}…)
-- e testa l'invio globale o a utenti specifici. Gli override dei testi
-- vivono in app_settings.notif_template_overrides (jsonb: chiave template →
-- {title, body}); null/assente = testi predefiniti del codice.
-- NOTA sulla migrazione main: ALTER direttamente nell'SQL editor di Supabase
-- (stesso SQL), come per le migrazioni precedenti.

alter table public.app_settings
  add column if not exists notif_template_overrides jsonb;

-- RLS: la colonna viaggia con l'unica riga di app_settings già leggibile
-- (SELECT everyone) e scrivibile solo dall'admin (policy esistenti):
-- nessuna policy nuova necessaria.
