-- 027_rename_semplici_drop_iap.sql
-- ── contesto (13/09/2026) ────────────────────────────────────────────────────
-- 1) Le squadre delle scorte semplici si chiamavano «Squadra fase +0/+7/+14/+21»:
--    rinominate «Semplici A/B/C/D» (più leggibile, coerente con Rilievo A/B/C/D).
--    Rinominati anche i template builtin del catalogo 025 («Fase +0» → «Semplici A», ecc.).
-- 2) I dipendenti IAP attualmente in servizio NON hanno accesso all'app: la
--    tipologia IAP (is_active=false) e la sua squadra vengono RIMOSE dal
--    sistema, come richiesto. I codici IAP restano nei PDF storici e continuano
--    a essere interpretati correttamente (sala-month/shift-tokens) — si elimina
--    solo la struttura teorica. Idempotente, lavora per NOME.

-- ── 1. rinomi squadre semplici ───────────────────────────────────────────────
update public.shift_teams set name = 'Semplici A' where name = 'Squadra fase +0';
update public.shift_teams set name = 'Semplici B' where name = 'Squadra fase +7';
update public.shift_teams set name = 'Semplici C' where name = 'Squadra fase +14';
update public.shift_teams set name = 'Semplici D' where name = 'Squadra fase +21';

-- template builtin del catalogo (025) con lo stesso nome: rinominati in blocco
update public.shift_cycle_templates
   set name = 'Semplici A'
 where name = 'Fase +0'
   and shift_type_id = (select id from public.shift_types where name = 'Scorte');
update public.shift_cycle_templates
   set name = 'Semplici B'
 where name = 'Fase +7'
   and shift_type_id = (select id from public.shift_types where name = 'Scorte');
update public.shift_cycle_templates
   set name = 'Semplici C'
 where name = 'Fase +14'
   and shift_type_id = (select id from public.shift_types where name = 'Scorte');
update public.shift_cycle_templates
   set name = 'Semplici D'
 where name = 'Fase +21'
   and shift_type_id = (select id from public.shift_types where name = 'Scorte');

-- ── 2. rimozione della tipologia IAP ────────────────────────────────────────
-- (on delete cascade sulle squadre/membri/templates; l'eventuale user_id link
-- su shift_team_members non è valorizzato per l'IAP e comunque non esiste più)
delete from public.shift_types where name = 'IAP';

-- ── 3. verifica rapida ──────────────────────────────────────────────────────
-- select name from public.shift_types order by sort_order;
-- select name from public.shift_teams where shift_type_id = (select id from public.shift_types where name='Scorte') order by sort_order;
