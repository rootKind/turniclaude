-- 028_rename_varianti_maternita.sql
-- La squadra «Squadra varianti» (scorte) diventa «Maternità»: è il gruppo che
-- gestisce le coperture per maternità, il vecchio nome non l'ha mai reso chiaro.
-- Rinominato anche il template builtin del ciclo (025, «Varianti») e allineato
-- l'ordine di visualizzazione dentro «Scorte» (dopo Semplici A–D).
-- Idempotente, lavora per NOME.

-- squadra: «Squadra varianti» → «Maternità»
update public.shift_teams
   set name = 'Maternità'
 where name = 'Squadra varianti';

-- template builtin del catalogo (025) con lo stesso nome: rinominato
update public.shift_cycle_templates
   set name = 'Maternità'
 where name = 'Varianti'
   and shift_type_id = (select id from public.shift_types where name = 'Scorte');

-- ── verifica rapida ─────────────────────────────────────────────────────────
-- select name from public.shift_teams where name like '%aternit%';
-- select name from public.shift_cycle_templates where name = 'Maternità';
