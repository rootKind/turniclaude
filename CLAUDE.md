## Navigazione codebase

Se esiste `.codegraph/codegraph.db`, leggilo **sempre** prima di
qualsiasi Glob, Grep o apertura di file. Usa il grafo per identificare
i nodi coinvolti, poi apri solo quei file specifici.

## Workflow obbligatorio

### 1. ESPLORA (subagent isolato)
Prima di qualsiasi codice,
- Leggi `.codegraph/codegraph.db`
- Identifica i file coinvolti dal grafo
- Riporta solo i file rilevanti e le dipendenze a rischio


### 2. DOMANDE (proporzionali alla complessità)
Valuta la difficoltà del task su scala 1-3:

- **Difficoltà 1** (bug UI, testo, stile): 0 domande — vai direttamente al piano
- **Difficoltà 2** (nuova logica, hook, query): 1-2 domande mirate, poi piano
- **Difficoltà 3** (architettura, auth, realtime, push): brainstorming con
  opzioni e tradeoff prima del piano

Non fare mai più di 3 domande totali. Se hai dubbi, scegli tu e documenta
la decisione nel piano.

### 3. PIANO
Scrivi il piano 
Formato:
Obiettivo
File coinvolti
Passi di implementazione (checklist)
Test necessari (solo logica critica)
Rischi
Mostrami il piano e aspetta la mia approvazione prima di procedere.
Un piano approvato non si cambia in corsa — se emerge qualcosa di nuovo,
fermati e aggiorna il piano.

### 4. IMPLEMENTA
- Lavora un passo alla volta seguendo la checklist
- Spunta ogni step completato nel file del piano
- Scrivi test solo per: logica di business critica, query Supabase complesse,
  funzioni pure con edge cases. Non testare UI, routing, o wrapper banali.
- Se un passo richiede più di ~30 min di lavoro, fermati e proponi
  di spezzarlo

### 5. VERSIONE + COMMIT (atomico)
Dopo ogni feature o bug fix completato:

1. Genera lo short hash PREVISIONALE con:
   `git rev-parse --short HEAD`
   (usa questo hash come base, sarà quello precedente ma accettabile)

2. Genera data e ora attuale

3. Aggiorna la versione nella pagina `/impostazioni` nel formato:
   `vX.YYY · <hash> — ultimo aggiornamento: DD/MM/YYYY HH:MM`

4. Esegui un unico commit includendo TUTTO:
```bash
git add -A
git commit -m "tipo: descrizione concisa"```
---

# Turni Sala C.C.C. — PWA

## Gotcha critici

### PostgREST — FK esplicito obbligatorio
Le query embedded in `lib/queries/shifts.ts` usano FK esplicito:
`user:users!shifts_user_id_fkey(id, nome, cognome, is_secondary)`
Senza `!fk_name` le query falliscono silenziosamente.

### Realtime — canali con nome univoco
`hooks/use-shifts.ts` usa `shifts-realtime-{isSecondary}-{random}` per
evitare il bug "cannot add callbacks after subscribe()" di Supabase.

### ThemeColor — MutationObserver su `<head>`
Next.js App Router riscrive la `<head>` ad ogni navigazione.
`components/providers/theme-color.tsx` usa un MutationObserver per
mantenere il meta `theme-color` corretto. Non rimuovere questo workaround.

### Push — forma Promise standard
`requestPermission` usa la forma Promise (`await Notification.requestPermission()`), che è lo standard moderno
e funziona su Android Chrome. La forma callback è deprecata — non reintrodurla.

### Admin
- `ADMIN_ID = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'` in `types/database.ts`
- Il FAB (lucchetto) in BottomNav appare SOLO su `/impostazioni` da admin

### Categorie utenti
- `is_secondary = false` → DCO
- `is_secondary = true` → Noni
I turni sono filtrati per categoria: ogni utente vede solo la sua.


## Deploy
Vercel auto-deploy da branch `master`. Non modificare `vercel.json` senza motivo.

---

## 🧠 Memoria permanente per l'IA (ground truth — aggiornato: 02/08/2026)

> Questa sezione è la "memoria permanente" che l'IA DEVE conoscere PRIMA di operare sul
> progetto. Distingue ciò che è INTENZIONALE (anche se sembra un bug) dall'inventario di
> codice/file inutili o duplicati e dalle regole architetturali da non violare.
> Se un task tocca uno di questi punti, NON "correggerlo" a meno che l'utente non lo
> chieda esplicitamente.

### 1. NON-BUG / INTENZIONALI — non flaggare, non rimuovere

**Backdoor dev (B2) — NECESSARIA, va preservata.**
`components/providers/pwa-guard.tsx`: `DEV_BYPASS_TOKEN = 'rootkind-dev-2026'`; visitando
`?dev=rootkind-dev-2026` si salta il gate PWA (display-mode standalone) per la sessione.
Il token è volutamente nel bundle client (backdoor di sviluppo). NON rimuoverla, NON
flaggarla come vulnerabilità da correggere.

**Reset password (H8) — NON è un bug.**
Flusso: `/reset-password` → `/verify-otp?email=...` → `verifyOtp({ type: 'recovery' })` →
`/update-password`. Funziona: il template email di recovery è configurato dalla dashboard
Supabase per inviare il CODICE OTP a 6 cifre. Il percorso magic-link (`token_hash`) è
volutamente NON gestito dal codice. NON "fixare" la gestione di `token_hash`, NON cambiare
il flusso, NON segnalarlo come recovery rotto.

**`Math.random()` nei nomi canale realtime** (`hooks/use-shifts.ts`, `hooks/use-vacation-requests.ts`)
è un workaround OBBLIGATO al bug Supabase "cannot add callbacks after subscribe()".
L'errore lint `react-hooks/purity` associato è accettato. NON sostituire con un id statico.

**Semantica invertita di `toggleInterest` / `toggleVacationInterest`** (`lib/queries/shifts.ts`,
`lib/queries/vacations.ts`): il parametro è lo STATO CORRENTE (`true` = rimuovi, `false` =
inserisci). È documentato nel codice e ogni chiamante passa lo stato corrente. NON "correggerla".

**`proxy.ts` è la middleware di Next.js 16** (in Next 16 `middleware.ts` è stato rinominato
`proxy.ts`). `lib/supabase/middleware-client.ts` è usato da `proxy.ts` → NON è codice morto,
NON flaggare "middleware mancante".

**Migrations 010–013 completano lo schema** (tabelle ferie/vacanze, `app_events`, colonne
mancanti, RLS, realtime publication, RPC `set_person_color`). Il cosiddetto "schema drift"
di CODEBASE_ANALYSIS.md è già risolto. NON riscrivere le policy RLS, NON aggiungere colonne
o tabelle duplicate.

**FIX migrazioni applicati il 02/08/2026 — INTENZIONALI, da preservare:**
- Le colonne `is_manager`, `notify_on_vacation_interest`, `notify_on_new_vacation` sono
  definite nella CREATE TABLE di `public.users` in **migration 001** (spostate da 010):
  condizione necessaria perché un fresh `supabase db push`/`db reset` superi migration 009
  (le policy sala-manager leggono `is_manager`). NON riportarle in 010, NON rimuoverle da 001.
- `app_events.id` è **uuid `gen_random_uuid()`** (migration 010, allineato a prod dove la
  tabella fu creata manualmente con uuid). La sequence `app_events_id_seq` NON è più creata
  dalle migrazioni ed è stata rimossa dal DB dev (in prod eventuale residuo, inutilizzato).
  L'app non usa mai l'id degli eventi (solo `user_id`/`event_type`). NON ripristinare la sequence.
- Migration **007** (`alter publication ... add table app_settings`) è idempotente grazie
  alla guardia DO-block (stesso pattern di 012). NON rimuovere la guardia.

**Cookie `co` = base64(JSON)** (`app/api/admin/save-colors` + SSR in `app/layout.tsx`):
volutamente NON CSS raw (RFC 6265 vieta `;`/newline nei valori). NON "fixare".

**Version footer hardcoded** in `components/settings/settings-page.tsx`
(`vX.YYY · <hash> — ultimo aggiornamento: ...`): va AGGIORNATO a ogni release secondo il
workflow §5 di questo file. NON refactorarlo in dinamico.

### 2. INVENTARIO CODICE/FILE INUTILI O DUPLICATI (rilevato e RIPULITO il 02/08/2026)

> Pulizia completata e committata il 02/08/2026. Restano solo: `shadcn` da spostare in
> devDependencies e la tabella morta `otp_codes`.

**Già eliminati e committati:**
- File UI mai importati: `components/ui/avatar.tsx`, `checkbox.tsx`, `badge.tsx`, `toggle.tsx`, `card.tsx`, `sheet.tsx`
- `scripts/` (test-aprile.mjs, test-pdf-parse.mjs — prototipi rotti), `dictionaries/` (it.ts) — cartelle ormai vuote, rimosse
- File "fantasma": `stores/loading-store.ts`, `supabase/functions/notify-push/index.ts`,
  `AGENTS.md`, `finalize_graph.py`, `Aprile_28-04-2026.pdf`, `Maggio_29-04-2026.pdf`
- `CODEBASE_ANALYSIS.md` (obsoleto, sostituito da questo file)
- Codice morto rimosso: `cyclePreset()`/`PRESET_CYCLE` e prop `tirocinanteWidth` in `desk-card.tsx`; ramo `highlight` di `getShiftItemState()` + voci `SHIFT_STATE_CLASSES.highlight`/`SHIFT_DATE_CLASSES.highlight` in `lib/utils.ts`
- `pdfjs-dist` rimosso da `dependencies` (100% inutilizzato) — `pnpm-lock.yaml` rigenerato con `pnpm install`
- `package-lock.json` (lockfile npm accidentale in un progetto pnpm) eliminato
- Artefatti locali ripuliti: `docs/` (vecchi piani AI), `.vercel/`, `.worktrees/`, `tsconfig.tsbuildinfo`, `.codegraph/errors.log`, `.claude/settings.json` (vuoto)

**Rimasti volutamente (NON eliminare senza motivo):**
- `otp_codes` (migration 001): tabella morta, mai letta/scritta dal codice. NON toccare le migrations (già applicate).
- `shadcn` (CLI) in `dependencies`: da spostare in devDependencies (richiede `pnpm install`). NOTA: `app/globals.css` fa `@import "shadcn/tailwind.css"` — serve in build.

**Codice duplicato — CONSOLIDATO in helper condivisi (02/08/2026):**
- `VACATION_PERIOD_LABELS_SHORT` in `lib/vacations.ts` (ex mappe locali in notify, manager/vacation-requests, join-chain)
- `formatDateShort` in `lib/utils.ts` (ex `formatDate` locale in notify e manager/shift-requests)
- `createAdminSupabase()` in `lib/supabase/admin.ts` (ex `createAdminClient(...)` in ~12 route)
- `pushToUser()` in `lib/push/send-to-user.ts` come unico invio web-push (ex logica duplicata in notify, send, check-chains, join-chain)

### 3. GROUND TRUTH ARCHITETTURALE (regole da non violare)

- **Ruoli:** `is_secondary = false` → DCO; `true` → Noni; `is_manager = true` → manager (né DCO né Noni). Ogni utente vede solo la propria categoria; manager/admin possono cambiarla.
- **ADMIN_ID** hardcoded `fdd6c008-7a22-42d5-a75b-c44d9edfef12` in `types/database.ts` — NON spostarlo in env.
- **PostgREST:** nelle query embedded usare SEMPRE la FK esplicita (`user:users!shifts_user_id_fkey(...)`), altrimenti falliscono silenziosamente.
- **Cache user-scoped:** `lib/cache.ts` → chiavi `cache:{userId}:{suffix}` + `LAST_USER_KEY`; `AuthCacheGuard` pulisce le cache al cambio utente; `clearUserCaches()` su logout; `user-store` (zustand persist `user-profile`) resettato da `clearUserCaches`. NOTA: `notification-history` (`lib/notification-storage.ts`) NON è user-scoped.
- **Push:** un solo path attivo — route Next.js (`/api/push/notify|send|subscribe`) + `lib/push/send-to-user.ts`. Edge function `notify-push` RIMOSSA. `sw.js`: solo push + click (cache statica minima, NESSUNA pagina offline). `Notification.requestPermission()` forma Promise (standard) — non reintrodurre la callback.
- **Colori:** override in `app_settings.color_overrides`, applicati a runtime (ColorThemeProvider) e in SSR via cookie `co` base64; default completi in `lib/color-defaults.ts`.
- **Sala:** `colored_persons` scritto via RPC atomico `set_person_color` (migration 013). Upload PDF / cancellazione mese: admin O manager (route + RLS allineati).
- **Deploy:** Vercel, auto-deploy da `master`, regione fra1. NON modificare `vercel.json`. `proxy.ts` protegge le route `(app)` ed esclude api, asset statici e le pagine auth (elencate singolarmente nel matcher).
- **Next.js 16:** API e convenzioni diverse dalle versioni precedenti (`proxy.ts`, ecc.). In caso di dubbio leggere `node_modules/next/dist/docs/` prima di scrivere codice.

### 4. STATO ATTUALE NOTO (snapshot 02/08/2026)

- `tsc --noEmit` → PULITO (0 errori, 02/08/2026). I 2 errori in `hooks/use-notification-history.ts` sono stati fixati con il generic esplicito `new Promise<NotificationEntry[]>(...)`.
- `eslint` → 23 errori / 9 warning (preesistenti, non bloccanti): `react-hooks/purity` (Math.random, accettato — §1), `react-hooks/refs` in `shift-list.tsx:239,242`, `no-explicit-any` in `lib/pdf-parser.ts:275,279`, `lib/queries/sala-layout.ts:13`, `lib/queries/vacations.ts:125–127,136`.
- FIX applicato con la pulizia: `app/api/push/send` leggeva le subscription altrui con il client di sessione → con RLS 011 (own-row-only) inviava sempre 0; ora usa `pushToUser` (service role).
- Da NON ignorare se si tocca auth/push: `app/api/vacanze/check-chains` accetta `newRequestUserId`/`isSecondary` dal client senza validarli (vettore spam notifiche).
