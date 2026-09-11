-- 022_scorte_semplici_riposi.sql
-- Le scorte semplici (fasi + varianti) NON hanno turni prefissati: i loro pattern
-- teorici devono contenere solo riposi (RM/RC/RI) e disponibilità (D). I token
-- M/P/N che derivavano dal PDF di luglio vengono sostituiti con 'D', così nel
-- mese teorico non occupano sezioni e non collidono con il rilievo (che lavora
-- M il giovedì e N il venerdì su rotazione 4-5-5-6-7-8-9-10-11, max 2/sezione).
--
-- Prima: 38-44 collisioni/mese (>2 persone su stessa sezione+turno, es. 20/11 N7
-- con BOCCHETTI+GRECO rilievo + MINICOZZI+MAROTTA fasi). Dopo: 0.
--
-- Idempotente e per NOME (come la 021): rieseguibile e valida anche su seed
-- rigenerati. Il rilievo NON viene toccato.

update public.shift_team_members set pattern = ARRAY['D', 'D', 'D', 'RC', 'RI', 'RC', 'D', 'D', 'D', 'D', 'RI', 'D', 'D', 'RC', 'D', 'D', 'D', 'RI', 'D', 'RC', 'RI', 'D', 'D', 'D', 'D', 'D', 'D', 'RM']
  where full_name = 'BORRELLI'
    and team_id in (select id from public.shift_teams where name = 'Squadra fase +0' and shift_type_id in (select id from public.shift_types where name = 'Scorte'));

update public.shift_team_members set pattern = ARRAY['D', 'D', 'D', 'RI', 'D', 'D', 'RC', 'D', 'D', 'D', 'RI', 'D', 'RC', 'RI', 'D', 'D', 'D', 'D', 'D', 'D', 'RM', 'D', 'D', 'D', 'RC', 'RI', 'RC', 'D']
  where full_name = 'CACCIUOLO'
    and team_id in (select id from public.shift_teams where name = 'Squadra fase +21' and shift_type_id in (select id from public.shift_types where name = 'Scorte'));

update public.shift_team_members set pattern = ARRAY['D', 'D', 'D', 'RI', 'D', 'RC', 'RI', 'D', 'D', 'D', 'D', 'D', 'D', 'RM', 'D', 'D', 'D', 'RC', 'RI', 'RC', 'D', 'D', 'D', 'D', 'RI', 'D', 'D', 'RC']
  where full_name = 'CAVANNA'
    and team_id in (select id from public.shift_teams where name = 'Squadra fase +14' and shift_type_id in (select id from public.shift_types where name = 'Scorte'));

update public.shift_team_members set pattern = ARRAY['D', 'D', 'D', 'D', 'D', 'D', 'RM', 'D', 'D', 'D', 'RC', 'RI', 'RC', 'D', 'D', 'D', 'D', 'RI', 'D', 'D', 'RC', 'D', 'D', 'D', 'RI', 'D', 'RC', 'RI']
  where full_name = 'MAROTTA'
    and team_id in (select id from public.shift_teams where name = 'Squadra fase +7' and shift_type_id in (select id from public.shift_types where name = 'Scorte'));

update public.shift_team_members set pattern = ARRAY['D', 'D', 'D', 'RC', 'RI', 'RC', 'D', 'D', 'D', 'D', 'RI', 'D', 'D', 'RC', 'D', 'D', 'D', 'RI', 'D', 'RC', 'RI', 'D', 'D', 'D', 'D', 'D', 'D', 'RM']
  where full_name = 'PRINCIPE'
    and team_id in (select id from public.shift_teams where name = 'Squadra fase +21' and shift_type_id in (select id from public.shift_types where name = 'Scorte'));

update public.shift_team_members set pattern = ARRAY['D', 'D', 'D', 'RI', 'D', 'D', 'RC', 'D', 'D', 'D', 'RI', 'D', 'RC', 'RI', 'D', 'D', 'D', 'D', 'D', 'D', 'RM', 'D', 'D', 'D', 'RC', 'RI', 'RC', 'D']
  where full_name = 'MINICOZZI'
    and team_id in (select id from public.shift_teams where name = 'Squadra fase +0' and shift_type_id in (select id from public.shift_types where name = 'Scorte'));

update public.shift_team_members set pattern = ARRAY['D', 'D', 'D', 'RC', 'RI', 'D', 'D', 'D', 'D', 'RM', 'RC', 'RI', 'D', 'D', 'D', 'D', 'D', 'RC', 'RI', 'D', 'D', 'D', 'RM', 'RC', 'RC', 'RI', 'D', 'D']
  where full_name = 'PAPA'
    and team_id in (select id from public.shift_teams where name = 'Squadra varianti' and shift_type_id in (select id from public.shift_types where name = 'Scorte'));

update public.shift_team_members set pattern = ARRAY['D', 'D', 'RI', 'D', 'D', 'RI', 'RC', 'D', 'D', 'D', 'RM', 'D', 'D', 'D', 'D', 'D', 'D', 'RC', 'RI', 'RC', 'D', 'D', 'D', 'RI', 'D', 'D', 'RC', 'D']
  where full_name = 'SPAGNULO'
    and team_id in (select id from public.shift_teams where name = 'Squadra varianti' and shift_type_id in (select id from public.shift_types where name = 'Scorte'));