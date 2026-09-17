-- 17/09/2026 — ELIMINARE LA PROPRIA RICHIESTA DI CAMBIO FERIE.
--
-- La card fa la cancellazione LATO CLIENT (`vacation_requests.delete()` con la
-- chiave anon e la sessione dell'utente). La 011 aveva dato a `vacation_requests`
-- le policy di SELECT, INSERT (own) e UPDATE (own) ma NON quella di DELETE: con
-- la RLS attiva il delete non toglieva nessuna riga e — questa è la trappola —
-- PostgREST NON restituisce errore, quindi la card mostrava «Richiesta
-- eliminata» mentre la richiesta era ancora in elenco.
--
-- Verificato dal vivo il 17/09/2026 con `scripts/.dbg-ferie-delete.mjs`:
-- `data=[]`, `error=nessuno`, riga ancora in tabella.
--
-- Chi può cancellare: il PROPRIETARIO della richiesta. L'admin che cancella
-- quella di un altro passa dalla route server (`/api/admin/vacation-requests`,
-- service-role), quindi qui non gli serve una policy.
drop policy if exists "Users can delete own vacation requests" on public.vacation_requests;
create policy "Users can delete own vacation requests" on public.vacation_requests
  for delete to authenticated using (auth.uid() = user_id);
