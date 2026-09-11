-- 021_shift_teams_reorg.sql
-- Riorganizzazione delle tipologie/squadre dei turni teorici (richiesta utente 10/09/2026):
--   * «Con notti»    → «Squadra in terza»
--   * «Senza notti»  → «Squadra in seconda»
--   * le due tipologie scorte diventano UN solo gruppo «Scorte» con 6 squadre:
--     Rilievo + Fasi +0/+7/+14/+21 + Varianti
--   * nuovo flag `is_lead`: marca i capisquadra, usato per comporre il nome
--     visualizzato della squadra («Squadra A D'ELIA-PASSANNANTI», «Squadra arancione ALBANO»).
--
-- La migrazione è IDEMPOTENTE e lavora per NOME (non per id del seed 020), così resta
-- valida anche se il seed viene rigenerato o se gli id cambiano.

-- ── 1. flag caposquadra ──────────────────────────────────────────────────────

alter table public.shift_team_members
  add column if not exists is_lead boolean not null default false;

-- ── 2. nomi tipologie ────────────────────────────────────────────────────────

update public.shift_types set name = 'Squadra in terza'  where name = 'Con notti';
update public.shift_types set name = 'Squadra in seconda' where name = 'Senza notti';
update public.shift_types set name = 'Scorte'            where name = 'Scorte rilievo';

-- ── 3. unifica le scorte in un unico gruppo ──────────────────────────────────
-- Le squadre delle «Scorte semplici» passano sotto «Scorte», poi la tipologia
-- svuotata viene eliminata. (Le «Semplici fase *»/«varianti» restano come squadre.)

update public.shift_teams
   set shift_type_id = (select id from public.shift_types where name = 'Scorte')
 where shift_type_id = (select id from public.shift_types where name = 'Scorte semplici');

delete from public.shift_types where name = 'Scorte semplici';

-- ── 4. nomi squadre leggibili ────────────────────────────────────────────────

-- Senza notti (i colori diventano «Squadra …»)
update public.shift_teams set name = 'Squadra arancione' where name = 'ARANCIONE';
update public.shift_teams set name = 'Squadra verde'     where name = 'VERDE';
update public.shift_teams set name = 'Squadra rosa'      where name = 'ROSA';

-- Scorte
update public.shift_teams set name = 'Squadra rilievo'  where name = 'Rilievo';
update public.shift_teams set name = 'Squadra fase +0'  where name = 'Semplici fase 0';
update public.shift_teams set name = 'Squadra fase +7'  where name = 'Semplici fase +7';
update public.shift_teams set name = 'Squadra fase +14' where name = 'Semplici fase +14';
update public.shift_teams set name = 'Squadra fase +21' where name = 'Semplici fase +21';
update public.shift_teams set name = 'Squadra varianti' where name = 'Semplici varianti';

-- ordine di visualizzazione dentro «Scorte» (rilievo, poi le fasi, poi le varianti)
update public.shift_teams set sort_order = 1 where name = 'Squadra rilievo';
update public.shift_teams set sort_order = 2 where name = 'Squadra fase +0';
update public.shift_teams set sort_order = 3 where name = 'Squadra fase +7';
update public.shift_teams set sort_order = 4 where name = 'Squadra fase +14';
update public.shift_teams set sort_order = 5 where name = 'Squadra fase +21';
update public.shift_teams set sort_order = 6 where name = 'Squadra varianti';

-- ── 5. capisquadra (usati per il nome squadra) ───────────────────────────────

-- Squadra in terza: 2 capisquadra per squadra (dai PDF, pag. 1)
update public.shift_team_members set is_lead = true
 where full_name in ('D''ELIA', 'PASSANNANTI')
   and team_id = (select id from public.shift_teams where name = 'Squadra A');
update public.shift_team_members set is_lead = true
 where full_name in ('DI MONDA', 'ROMANO N.')
   and team_id = (select id from public.shift_teams where name = 'Squadra B');
update public.shift_team_members set is_lead = true
 where full_name in ('ARMENANTE', 'DI MONACO')
   and team_id = (select id from public.shift_teams where name = 'Squadra C');
update public.shift_team_members set is_lead = true
 where full_name in ('COPPETA', 'LONI G.')
   and team_id = (select id from public.shift_teams where name = 'Squadra D');

-- Squadra in seconda: 1 caposquadra per squadra
update public.shift_team_members set is_lead = true
 where full_name = 'ALBANO'
   and team_id = (select id from public.shift_teams where name = 'Squadra arancione');
update public.shift_team_members set is_lead = true
 where full_name = 'DI MEO'
   and team_id = (select id from public.shift_teams where name = 'Squadra verde');
update public.shift_team_members set is_lead = true
 where full_name = 'LANGIONE'
   and team_id = (select id from public.shift_teams where name = 'Squadra rosa');

-- Scorte di rilievo: SENATORE + BARRA
update public.shift_team_members set is_lead = true
 where full_name in ('SENATORE', 'BARRA')
   and team_id = (select id from public.shift_teams where name = 'Squadra rilievo');
