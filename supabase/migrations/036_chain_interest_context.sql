-- 036_chain_interest_context.sql
-- INTERESSI «AL FINE DELLA CATENA» (richiesta 25/09/2026).
--
-- Quando un utente aderisce a una CATENA (bottone unico della vista «⛓ A
-- catena», o il dialog di pubblicazione con le catene presenti) esprime in
-- realtà UN solo interesse, Ma su più richieste insieme: quello di chiudere
-- il giro. Nella lista interessati di ogni card del giro va quindi detto che
-- quell'interesse non è un semplice «vuoi il mio periodo», ma è AL FINE della
-- catena selezionata.
--
-- `chain_context` (jsonb, null = interesse semplice) conserva il giro:
--   { "periods": [2, 6, 3], "source": "list" | "dialog" }
-- periods = i periodi OFFERTI nell'ordine del giro partendo da chi aderisce
-- (il primo numero è il suo, l'ultimo è quello che gli chiude il ciclo).
-- La colonna viaggia con le policy RLS esistenti di vacation_request_interests.

alter table public.vacation_request_interests
  add column if not exists chain_context jsonb;
