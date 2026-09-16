-- 032 — ROTAZIONE TEORICA DI ROTONDO (Squadra rosa) — 16/09/2026
--
-- Il suo pattern su 84 giorni era diventato «46 G + 13 turni di sezione»: i
-- compagni girano su 4/6/7/10 con 56 turni di sezione, lui no. Conseguenza:
-- /turnisala non lo metteva mai in sezione nel teorico, la sua card risultava
-- «scoperta» e la sua riga in /tuoturno (per i mesi senza PDF) spariva.
--
-- Causa: scripts/apply-super-cycle.mjs derivava il pattern per MAGGIORANZA per
-- classe di resto da tutta la storia dei PDF, senza distinguere i codici che non
-- dicono niente sulla rotazione. Da maggio il teorico di ROTONDO è una serie di
-- «G» (5 mesi su 7), quindi il G ha vinto la maggioranza in 46 classi su 84.
-- Lo script ora (a) conta solo i token informativi (turni + riposi/assenze) e
-- (b) RICOSTRUISCE dalla griglia comune chi non ha più una rotazione nella
-- propria storia, alla sua fase e con i riposi di squadra.
--
-- Il pattern qui sotto è quello che lo script produce — e non è un'invenzione:
-- riproduce il teorico dei PDF di ROTONDO giorno per giorno per TUTTI i 71 giorni
-- in cui l'ufficio lo pianificava ancora sulla rotazione (1/3 → 10/5/2026, primo
-- «G»), con la griglia che torna a coprire 4/6/7/10 una volta sola ogni giorno di
-- lavoro. Difeso da tests/squadra-rosa.spec.ts.
--
-- Da eseguire sull'SQL editor di Supabase (o con lo script, che qui è già stato
-- applicato):  node --env-file=.env.local scripts/apply-super-cycle.mjs --apply --only=ROTONDO

update public.shift_team_members
set pattern = ARRAY['M6T','RI','P7T','M7T','RC','P10T','M10T','RI','P4T','M4T','RC','P6T','M6T','RI','P7T','M7T','RC','P10T','M10T','RM','P4T','M4T','RI','P6T','M6T','RC','P7T','M7T','RI','P10T','M10T','RC','P4T','M4T','RI','P6T','M6T','RC','P7T','M7T','RI','P10T','M10T','RC','P4T','M4T','RM','P6T','M6T','D','P7T','M7T','RI','P10T','M10T','RC','P4T','M4T','RI','P6T','M6T','RC','P7T','M7T','RI','P10T','M10T','RC','P4T','M4T','RI','P6T','M6T','RC','P7T','M7T','RM','P10T','M10T','RI','P4T','M4T','RC','P6T']
where id = '30000000-0000-4000-8000-000000000059';   -- ROTONDO, Squadra rosa

-- Il ciclo di catalogo era la COPIA esatta del pattern rotto: dal pannello si
-- sarebbe potuto riapplicare il guasto con un tap.
update public.shift_cycle_templates
set pattern = ARRAY['M6T','RI','P7T','M7T','RC','P10T','M10T','RI','P4T','M4T','RC','P6T','M6T','RI','P7T','M7T','RC','P10T','M10T','RM','P4T','M4T','RI','P6T','M6T','RC','P7T','M7T','RI','P10T','M10T','RC','P4T','M4T','RI','P6T','M6T','RC','P7T','M7T','RI','P10T','M10T','RC','P4T','M4T','RM','P6T','M6T','D','P7T','M7T','RI','P10T','M10T','RC','P4T','M4T','RI','P6T','M6T','RC','P7T','M7T','RI','P10T','M10T','RC','P4T','M4T','RI','P6T','M6T','RC','P7T','M7T','RM','P10T','M10T','RI','P4T','M4T','RC','P6T']
where id = 'd52b1cec-72c4-45ea-af62-1469953e1f64';   -- «LANGIONE · ROTONDO»
