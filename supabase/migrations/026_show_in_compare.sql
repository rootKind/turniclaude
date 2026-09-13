-- 026_show_in_compare.sql
-- ── contesto (13/09/2026) ────────────────────────────────────────────────────
-- Il selettore «Confronta» di /tuoturno elenca TUTTI i nomi presenti nei PDF
-- dei turni, ma all'app accede solo una parte dei dipendenti. Nuovo flag
-- users.show_in_compare: l'admin decide chi compare nell'elenco di confronto
-- (gestione dal pannello admin, dialog squadre). Default true = comportamento
-- attuale finché l'admin non toglie qualcuno.
-- NOTA sulla migrazione main: la tabella users è nell'SQL editor (stesso SQL).

alter table public.users add column if not exists show_in_compare boolean not null default true;

-- RLS: la colonna viaggia con le righe users già leggibili da tutti gli
-- autenticati (policy 011) → nessuna policy nuova serve.

-- seed opzionale: lascia TUTTI visibili (comportamento attuale). L'admin
-- spegne da UI chi non ha l'account / non deve comparire.
