-- 038_sala_read_authenticated.sql
-- TURNI DELLA SALA E PIANTINA: SI LEGGONO SOLO CON UNA SESSIONE.
--
-- Le due policy di lettura erano `for select using (true)`, senza `to
-- authenticated`: in PostgreSQL una policy senza ruolo vale per PUBLIC, quindi
-- anche per `anon` — la chiave che sta DENTRO il sito, leggibile da chiunque lo
-- apra. Provato il 13/10/2026: senza nessun login,
--   GET /rest/v1/sala_schedule?select=month   → HTTP 200, 7 mesi
--   GET /rest/v1/sala_layout?select=id        → HTTP 200, la piantina
-- Il middleware non proteggeva questi dati: protegge la PAGINA, non la tabella.
--
-- Da qui in avanti la board completa dei turni (nomi delle persone compresi)
-- richiede una sessione. Chi non è loggato non riceve un errore ma una lista
-- VUOTA: la RLS filtra le righe, quindi una pagina che per caso leggesse senza
-- sessione mostrerebbe un mese vuoto invece di rompersi.
--
-- Perché non si rompe niente: ogni lettura dell'app passa da un client che porta
-- i cookie di sessione — le due pagine (client), i dialog dei cambi e della
-- pulizia, la piantina. Nessuna pagina pubblica (login, landing, manifest) tocca
-- queste tabelle, e i test usano la service-role (che scavalca la RLS).
--
-- Scritture invariate: sono già dell'admin (o dei manager), vedi migration 009.

drop policy if exists "sala_schedule_select" on sala_schedule;
create policy "sala_schedule_select" on sala_schedule
  for select to authenticated using (true);

drop policy if exists "sala_layout_select" on sala_layout;
create policy "sala_layout_select" on sala_layout
  for select to authenticated using (true);
