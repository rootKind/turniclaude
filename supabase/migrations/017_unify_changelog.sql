-- 017: Changelog unificato (una sola entry per la release)
-- Elimina le entry di sviluppo (v1-v3, comprese quelle seminate da 016) e lascia
-- una sola entry (v4) con il riepilogo finale delle novità per gli utenti.
-- Idempotente: riapplicabile senza effetti collaterali.
delete from public.changelog_entries where version in (1, 2, 3);

insert into public.changelog_entries (version, date, title, changes) values
  (4, '26/08/2026', 'Aggiornamento',
   '[
     "Nuovo pulsante Chiedi congedo per aprire il modulo di richiesta congedo",
     "I Noni possono vedere i cambi turno dei DCO che effettuano le mansioni superiori e viceversa",
     "Highlight funzionante anche se tirocinante/altre presenze",
     "Nuova pagina \"Il tuo turno\" work in progress",
     "Impostazioni nuova voce Novità per rivedere il changelog"
   ]'::jsonb)
on conflict (version) do update
  set date = excluded.date,
      title = excluded.title,
      changes = excluded.changes;
