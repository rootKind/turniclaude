-- 024_scorte_minisquadre.sql
-- ── contesto (13/09/2026) ────────────────────────────────────────────────────
-- Due problemi emersi verificando i cicli dei turni:
-- 1) Le scorte di rilievo ruotano ogni 28gg ma sono divise in MINI-SQUADRE con
--    riposi sfalzati: i pattern dei membri sono già diversi TRA gruppi e
--    identici DENTRO il gruppo, ma la gestione squadre li teneva tutti in un
--   'unica «Squadra rilievo». Ora anche la gestione li separa (idempotente, per nome):
--      Rilievo A: BOCCHETTI, COCOZZA, DE GIOVANNI
--      Rilievo B: CENTOMANI, CORBI
--      Rilievo C: GRECO, MUCCI
--      Rilievo D: LONI A., NEVANO
--    (SENATORE e BARRA restano capisquadra in «Squadra rilievo», sort_order 1).
-- 2) Le scorte semplici (fasi): i pattern in DB erano SCAMBIATI tra squadre
--    (BORRELLI aveva il pattern di PRINCIPE, IORIO quello di CAVANNA,
--    CACCIUOLO quello di MINICOZZI...). Verifica dai PDF reali: le 4 fasi sono
--    UN ciclo base di riposi sfasato di 0/+7/+14/+21 giorni (27/27 posizioni
--    di riposo coincidono applicando l'offset). Si ripristinano i pattern di
--    consenso dei PDF (>=50% e >=4 occorrenze per posizione → riposo, altrimenti 'D').

-- ── 1. mini-squadre del rilievo ──────────────────────────────────────────────
-- create if not exists: la migration è riapplicabile.
insert into public.shift_teams (shift_type_id, name, phase_offset_days, sort_order)
select t.id, v.name, v.phase, v.sort
from (values
  ('Rilievo A', 0, 10),
  ('Rilievo B', 7, 11),
  ('Rilievo C', 14, 12),
  ('Rilievo D', 21, 13)
) as v(name, phase, sort)
join public.shift_types t on t.name = 'Scorte'
where not exists (
  select 1 from public.shift_teams s
  where s.shift_type_id = t.id and s.name = v.name
);

-- sposta i membri nella loro mini-squadra (per nome, idempotente)
update public.shift_team_members m
set team_id = (
  select s.id from public.shift_teams s
  join public.shift_types t on t.id = s.shift_type_id
  where t.name = 'Scorte' and s.name =
    case m.full_name
      when 'BOCCHETTI'  then 'Rilievo A'
      when 'COCOZZA'    then 'Rilievo A'
      when 'DE GIOVANNI' then 'Rilievo A'
      when 'CENTOMANI'  then 'Rilievo B'
      when 'CORBI'      then 'Rilievo B'
      when 'GRECO'      then 'Rilievo C'
      when 'MUCCI'      then 'Rilievo C'
      when 'LONI A.'    then 'Rilievo D'
      when 'NEVANO'     then 'Rilievo D'
    end
)
where m.full_name in ('BOCCHETTI','COCOZZA','DE GIOVANNI','CENTOMANI','CORBI','GRECO','MUCCI','LONI A.','NEVANO')
  and m.team_id in (
    select s.id from public.shift_teams s
    join public.shift_types t on t.id = s.shift_type_id
    where t.name = 'Scorte' and s.name = 'Squadra rilievo'
  );

-- ── 2. pattern di consenso delle fasi (dai PDF reali, ciascuno nella SUA squadra) ──
update public.shift_team_members
set pattern = ARRAY['D','RI','D','D','D','RC','D','D','D','RM','D','D','D','RC','RI','D','D','D','RI','RC','D','D','D','RC','RI','D','D','D']
where team_id in (select s.id from public.shift_teams s join public.shift_types t on t.id = s.shift_type_id where t.name = 'Scorte' and s.name = 'Squadra fase +0')
  and full_name in ('BORRELLI','IORIO','MINICOZZI');

update public.shift_team_members
set pattern = ARRAY['D','D','RC','RI','D','D','D','D','RI','D','D','D','RC','D','D','D','RM','D','D','D','RC','RI','D','D','D','RI','RC','D']
where team_id in (select s.id from public.shift_teams s join public.shift_types t on t.id = s.shift_type_id where t.name = 'Scorte' and s.name = 'Squadra fase +7')
  and full_name in ('MAROTTA');

update public.shift_team_members
set pattern = ARRAY['RI','D','D','D','RI','RC','D','D','D','RC','RI','D','D','D','D','RI','D','D','D','RC','D','D','D','RM','D','D','D','D']
where team_id in (select s.id from public.shift_teams s join public.shift_types t on t.id = s.shift_type_id where t.name = 'Scorte' and s.name = 'Squadra fase +14')
  and full_name in ('DE ROSA','DONNARUMMA','CAVANNA');

update public.shift_team_members
set pattern = ARRAY['D','D','RM','D','D','D','RC','RI','D','D','D','RI','RC','D','D','D','RC','RI','D','D','D','D','RI','D','D','D','RC','D']
where team_id in (select s.id from public.shift_teams s join public.shift_types t on t.id = s.shift_type_id where t.name = 'Scorte' and s.name = 'Squadra fase +21')
  and full_name in ('CACCIUOLO','PRINCIPE');

-- le varianti non hanno turni prefissati ma i riposi sì: allineo anch'esse al consenso PDF
update public.shift_team_members
set pattern = ARRAY['RI','D','D','D','D','D','RC','RI','D','D','D','D','D','RC','RI','D','D','D','D','RM','RC','RI','D','D','D','D','D','RC']
where team_id in (select s.id from public.shift_teams s join public.shift_types t on t.id = s.shift_type_id where t.name = 'Scorte' and s.name = 'Squadra varianti')
  and full_name in ('DONZELLI','PAPA');

-- ── 3. verifica rapida ──────────────────────────────────────────────────────
-- select s.name, string_agg(m.full_name, ', ' order by m.sort_order), array_agg(distinct m.pattern::text) as patterns
-- from public.shift_team_members m join public.shift_teams s on s.id = m.team_id
-- join public.shift_types t on t.id = s.shift_type_id
-- where t.name = 'Scorte' group by s.name order by s.sort_order;
