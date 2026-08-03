# 🧠 Memoria di progetto — Turni Sala C.C.C. (PWA)

> Questo file è la **memoria persistente** del progetto per l'AI assistant (convenzione Freebuff:
> `knowledge.md` nella root, iniettato automaticamente nel contesto a ogni sessione).
> Aggiornarlo quando cambiano convenzioni, architettura o stato noto del progetto.

---

## Panoramica

PWA per la gestione dei turni della sala C.C.C.: turni giornalieri (DCO / Noni), scambi con
interessi, ferie/vacanze con rotazione e catene, layout sala con desk e pallini colorati
(anche da PDF), notifiche push, pannello admin (utenti, statistiche, feedback).

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, `@tanstack/react-query`,
`zustand` (persist), Supabase (auth + Postgres + realtime + storage), `web-push`, `framer-motion`,
`sonner` (toast), `react-day-picker`, `@base-ui/react` (primitivi shadcn).

**Package manager: pnpm.** Non usare npm: `package-lock.json` è stato eliminato (lockfile duplicato
accidentale); l'unico lockfile è `pnpm-lock.yaml`.

---

## Comandi

| Azione | Comando |
|---|---|
| Dev server | `pnpm dev` (o `npx next dev`) |
| Build | `pnpm build` |
| Lint | `pnpm lint` (eslint) |
| Typecheck | `npx tsc --noEmit` |
| Install | `pnpm install` (pnpm non è su PATH → `npx --yes pnpm@10 install`) |
| Sync lockfile senza node_modules | `npx --yes pnpm@10 install --lockfile-only` |

**Deploy:** Vercel, auto-deploy dal branch `master`, regione `fra1`. Non modificare `vercel.json`
senza motivo.

---

## Struttura del progetto

```
app/            App Router: (app)/ protetto, (auth)/ login-OTP-reset, admin/, api/* (route handlers)
components/     admin, auth, nav, notifications, providers, sala, settings, shifts, ui, vacanze
hooks/          use-* (react-query) — use-shifts, use-users, use-vacation-requests, use-push, ...
lib/            queries/* (accesso dati), supabase/*, push/send-to-user, cache, utils, pdf-parser
stores/         zustand: user-store (profilo persist)
types/          database.ts — tipi schema + ADMIN_ID + isAdmin/isManager
supabase/       migrations/ 001–014 (schema completo), functions/cleanup-shifts (edge function cron)
public/         manifest.json, sw.js (solo push + click)
proxy.ts        middleware di Next.js 16 (in Next 16 middleware.ts è rinominato proxy.ts)
```

---

## Regole architetturali (da non violare)

- **Ruoli utente:** `is_secondary = false` → DCO; `is_secondary = true` → Noni;
  `is_manager = true` → manager (né DCO né Noni). Ogni utente vede solo la propria categoria.
- **DCO+ (`is_dco_plus`):** utente formalmente DCO che vede/appaia/interagisce con la tabella
  cambi turno di ENTRAMBE le categorie. Regole di visibilità (`isShiftVisibleTo` in
  `lib/queries/shifts.ts`): DCO+ → tutto; Noni → Noni + richieste dei DCO+; DCO normale → solo
  DCO (i DCO+ restano formalmente DCO). Le FERIE restano quelle DCO (nessun cambiamento).
  Le richieste dell'altro gruppo portano badge neutro **NONO** (viste dal DCO+) o **DCO+**
  (viste dai Noni) + bordo sottile `border-foreground/25` sulla card. `is_dco_plus` è forzato
  `false` per manager e Noni (route create/update utente + dialog admin). Query key/cache dei
  turni includono `isDcoPlus` (`shifts-{isSecondary}-{isDcoPlus}`).
- **`ADMIN_ID`** hardcoded `fdd6c008-7a22-42d5-a75b-c44d9edfef12` in `types/database.ts` — NON spostarlo in env.
- **PostgREST:** nelle query embedded usare SEMPRE la FK esplicita
  (`user:users!shifts_user_id_fkey(...)`), altrimenti falliscono silenziosamente.
- **Cache user-scoped:** `lib/cache.ts` → chiavi `cache:{userId}:{suffix}` + `LAST_USER_KEY`;
  `AuthCacheGuard` pulisce le cache al cambio utente; `clearUserCaches()` su logout;
  `user-store` resettato da `clearUserCaches`. NOTA: `notification-history`
  (`lib/notification-storage.ts`) NON è user-scoped.
- **Push:** un solo path attivo — route Next.js (`/api/push/notify|send|subscribe`) +
  `lib/push/send-to-user.ts` (usa il service role: la RLS su `push_subscriptions` è own-row-only).
  `sw.js`: solo push + click (cache statica minima, NESSUNA pagina offline).
  `Notification.requestPermission()` in forma Promise (standard) — non reintrodurre la callback.
- **Colori (funzionalità admin RIMOSSA 03/08/2026):** niente più pagina `/admin/colori`,
  inspector, `/api/admin/save-colors`, né override: `app_settings.color_overrides` è stata
  eliminata (migration 014) e il cookie `co` non è più letto/scritto. I colori reali sono solo
  in `globals.css`; `lib/color-defaults.ts` resta solo con `LIGHT_BACKGROUND`/`DARK_BACKGROUND`
  (meta theme-color). NON reintrodurre il sistema di override. Nota: il cookie `co`
  residuo nei browser di chi aveva salvato colori è INERTE (nessun codice lo legge più).
  `public/color-studio.html` (tool dev standalone) va tenuto sincronizzato con i token di
  `globals.css` (blocchi `:root`/`.dark`, classi componente, `VAR_LABELS`/`CLASS_MAP`).
- **Tema a 2 colori (03/08/2026):** scuro = bianco/nero puro; chiaro = nero + celeste molto
  lieve ("negativo" dello scuro). COLORATE solo le pill semantiche: fasce orarie
  (mattina/pomeriggio/notte, incluse le toggle pill del dialog turno) e stagioni ferie
  (P1–P6). Tutto il resto del chrome è neutro: highlight bianco (non più ambra), my-period
  con accento nero/bianco, chip selezionati nero/bianco, match/chain/badge DCO-NONI/banner
  impersonazione/interesse/own-interest NEUTRI (verde/viola/ambra rimossi). Resta verde solo
  il "conferma" del manager (come le pill). Il cuore interessato usa `text-interest-date`
  (neutro), non più `text-red-500`. Separatori: `border-black/10 dark:border-white/10`.
- **Sistema colori 2-tinte (03/08/2026):** tema scuro = solo bianco/nero (nessun ambra nel
  chrome: highlight, my-period, chip selezionati, badge sala sono bianchi); tema chiaro =
  negativo del scuro: nero + celeste molto lieve (accent `#38bdf8` sostituito col nero).
  Restano COLORATI (semantici, NON toccare): pill Mattina/Pomeriggio/Notte (fasce orarie),
  pill periodi ferie P1–P6 (stagioni), pannelli match (verde) / chain (viola), badge DCO/NONI,
  banner impersonazione (arancione). Vista manager: stato "in attesa" = neutro
  (`--state-pending-*`), "conferma" = verde (`--state-confirm-*`) — classi
  `btn-pending|btn-confirm|ring-pending|ring-confirm|pending-overlay|confirm-overlay|text-pending|text-confirm`.
  Card periodi /turniferie: header uniforme `period-card-header` che stacca dal corpo `bg-card`;
  la card "il tuo periodo" usa `my-period-header` (più scura in chiaro / più chiara in scuro).
- **Sala:** `colored_persons` scritto via RPC atomico `set_person_color` (migration 013) —
  colori PER PERSONA dei desk (board /turnisala, admin o manager), diverso dall'ex-funzionalità
  colori tema. Upload PDF / cancellazione mese: admin O manager (route + RLS allineati).
- **Anno minimo (gate + skeleton condiviso):** `min_year_turniferie` / `min_year_vacanze`
  caricano in modo asincrono da `app_settings`. Sia `/turniferie` sia `/vacanze` mostrano uno
  skeleton finché `minYear === null` — l'anno reale (es. 2027) non viene MAI preceduto dal flash
  dell'anno corrente (2026). Lo skeleton è UNICO: `components/ui/year-gate-skeleton.tsx`
  (`variant="turniferie" | "vacanze"`), usato sia dal gate inline nelle pagine sia dai rispettivi
  `loading.tsx` — NON duplicare lo skeleton altrove. Il fetch di `getAppSettings` ha fallback
  `.catch(() => setMinYear(new Date().getFullYear()))` (niente skeleton infinito se il fetch fallisce).
  `VacationRequestDialog` riceve `minYear` come prop: niente più `MIN_YEAR = 2026` hardcoded.
- **Animazioni d'ingresso uniformi:** `initial={{ opacity: 0, y: 6 }}`,
  `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.15, ease: 'easeOut' }}`,
  stagger `index * 0.04` (liste con cap a 0.3). In /vacanze il cambio anno fa rientrare card
  periodo (`key={selectedYear}`) E lista richieste (`key={year}`) con la stessa animazione.
  Le animazioni FUNZIONALI (drag, expand, page-transition, slide filtri shift-list) sono
  volutamente diverse.
- **Migrations 001–014 completano lo schema** (turni, vacanze, sala, app_settings, RLS,
  realtime publication, RPC). NON riscrivere le policy RLS, NON aggiungere colonne/tabelle duplicate.
- **Next.js 16:** API e convenzioni diverse dalle versioni precedenti (`proxy.ts` ecc.).
  In caso di dubbio leggere `node_modules/next/dist/docs/` prima di scrivere codice.

---

## Workaround INTENZIONALI — non "correggerli"

- **Backdoor dev (NECESSARIA):** `components/providers/pwa-guard.tsx` —
  `DEV_BYPASS_TOKEN = 'rootkind-dev-2026'`; visitando `?dev=rootkind-dev-2026` si salta il gate PWA
  per la sessione. Il token è volutamente nel bundle client. NON rimuoverla, NON flaggarla come vulnerabilità.
  **Attenzione pratica:** aprendo il dev server da browser normale (non PWA installata) la guard
  reindirizza sempre a `/installa` — per navigare nel dev server (es. pannello admin) serve
  `?dev=rootkind-dev-2026` sulla PRIMA URL (salva il bypass in sessionStorage per la tab).
  Vale anche nei test automatici headless (Edge/CDP): navigare a `/login?dev=rootkind-dev-2026`.
- **Reset password (NON è un bug):** flusso `/reset-password` → `/verify-otp?email=...` →
  `verifyOtp({ type: 'recovery' })` → `/update-password`. Il template email di recovery invia il
  CODICE OTP a 6 cifre. Il percorso magic-link (`token_hash`) è volutamente NON gestito.
  NON cambiare il flusso.
- **`Math.random()` nei nomi canale realtime** (`hooks/use-shifts.ts`, `hooks/use-vacation-requests.ts`)
  è un workaround OBBLIGATO al bug Supabase "cannot add callbacks after subscribe()".
  L'errore lint `react-hooks/purity` associato è accettato. NON sostituire con un id statico.
- **Semantica invertita di `toggleInterest` / `toggleVacationInterest`** (`lib/queries/shifts.ts`,
  `lib/queries/vacations.ts`): il parametro è lo STATO CORRENTE (`true` = rimuovi, `false` = inserisci).
  Ogni chiamante passa lo stato corrente. NON "correggerla".
- **ThemeColor — MutationObserver su `<head>`:** Next.js App Router riscrive la `<head>` a ogni
  navigazione; `components/providers/theme-color.tsx` usa un MutationObserver per mantenere il meta
  `theme-color`. NON rimuovere questo workaround.
- **Version footer hardcoded** in `components/settings/settings-page.tsx`
  (`vX.YYY · <hash> — ultimo aggiornamento: ...`): va AGGIORNATO a ogni release. NON refactorarlo in dinamico.

---

## Stato attuale (snapshot 03/08/2026)

- **Funzionalità DCO+ (03/08/2026):** nuovo attributo `is_dco_plus` (DCO che vedono anche la
  tabella cambi turno dei Noni) + `notify_on_cross_shifts` (toggle notifiche "altro gruppo"
  visibile solo a DCO+ e Noni). Notifiche push `new_shift` allineate alla visibilità (DCO+
  pubblica → tutti; Noni → Noni + DCO+; DCO → DCO) con gating del toggle cross per chi riceve
  dall'altro gruppo. Badge NONO/DCO+ + bordo sottile nelle viste miste. Migration **015_dco_plus**
  (add columns users.is_dco_plus, users.notify_on_cross_shifts) APPLICATA al DB dev
  (`uokfixddsuqcjddbfkln`). DCO+ attivi su dev (03/08/2026): Ernesto Gagliotta
  (`bc8dc7f3-…-512d4`), Luigi Neri (`001c315b-…-f3ff`), Mariapia Di Napoli (`51a6cc71-…-cb2`).
- **⚠ Migration 015 da applicare anche al DB di produzione/main al merge su `master`**
  (come la 014).

- **Fix cambio categoria DCO↔NONO (03/08/2026):** `app/api/admin/update-user/route.ts` —
  il ramo `else if (typeof isSecondary === 'boolean')` era codice morto perché
  `edit-user-dialog.tsx` invia SEMPRE `isManager` come booleano → `is_secondary` non veniva
  mai scritto (DCO→NONO restava DCO). Ora i due flag sono indipendenti e `isManager === true`
  forza `is_secondary = false`. Verificato end-to-end su dev: 14/14 (v. sezione "Note per il
  testing E2E in dev").
- **Fix anno minimo senza flash (03/08/2026):** /vacanze e /turniferie non mostrano più
  brevemente il 2026 prima dell'anno minimo reale (2027 impostato dall'admin): gate su
  `minYear === null` con `YearGateSkeleton` condiviso (v. Regole architetturali), fallback sul
  fetch di `app_settings`, animazione keyed-by-year su card periodo e lista richieste,
  dialog ferie con prop `minYear`, stagger unificato a 0.04 in /notifiche.
- **Admin colori rimosso:** eliminati `/admin/colori`, `color-settings-page`, `color-inspector`,
  `/api/admin/save-colors`, `ColorThemeProvider`, `color-inspect-store`, `color-inspect-map`,
  `color-overrides` + migration 014 (DROP `app_settings.color_overrides`). Il tile "Colori app"
  è sparito dal pannello admin. `public/color-studio.html` (tool dev standalone, localStorage)
  è stato volutamente mantenuto.
- **⚠ Migration 014 già applicata SOLO al DB di dev** (03/08/2026, progetto linkato
  `uokfixddsuqcjddbfkln`). Al MERGE su `master` va applicata ANCHE al DB di produzione/main
  (`supabase db push` con progetto main linkato, o SQL equivalente).
- **Pulizia completata:** rimossi i tool folders (`.claude/`, `.serena/`, `.codegraph/`, `.next/`,
  `.worktrees/`, `docs/`, `.vercel/`), `package-lock.json`, le dipendenze morte
  (`pdfjs-dist`, `@dnd-kit/sortable`), funzioni e tipi inutilizzati. Le cartelle tool sono
  gitignored (voci `.claude/`, `.serena/`, `.codegraph/` in `.gitignore`).
- `tsc --noEmit` → PULITO (0 errori).
- `eslint` → errori preesistenti noti, non bloccanti: `react-hooks/purity` (Math.random, accettato),
  `react-hooks/refs` in `shift-list.tsx:241,244`, `no-explicit-any` in `lib/pdf-parser.ts:275,279`,
  `lib/queries/sala-layout.ts:13`, `lib/queries/vacations.ts:125–127,136`.
- **Attenzione auth/push:** `app/api/vacanze/check-chains` accetta `newRequestUserId`/`isSecondary`
  dal client senza validarli (vettore spam notifiche). Da validare se si tocca quella route.
- Edge function `supabase/functions/cleanup-shifts` (cron pulizia turni passati, migration 002)
  è attiva e deployata — non è codice morto.

---

## Note per il testing E2E in dev (03/08/2026)

- **Progetti Supabase:** dev = `uokfixddsuqcjddbfkln`, main/produzione = `zrbbzfingrdpdflkndgl`.
  L'account admin esiste su ENTRAMBI con lo stesso UUID (`fdd6c008-...` = ADMIN_ID): dev è un
  clone di main, quindi il pannello admin si può testare anche su dev.
- **Precedenza env (IMPORTANTE):** le variabili d'ambiente REALI del processo sovrascrivono
  `.env.local` (regola dotenv: process env > `.env.local`). Prima di lanciare il server verificare
  con `printenv NEXT_PUBLIC_SUPABASE_URL`: se punta a main, i test locali toccano il DB LIVE anche
  con `.env.local` su dev. Per forzare dev:
  `NEXT_PUBLIC_SUPABASE_URL=https://uokfixddsuqcjddbfkln.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon dev> SUPABASE_SERVICE_ROLE_KEY=<service dev> npx next dev -p 3000`
- **`.env.local`:** era stato popolato con i valori di main (verosimilmente `vercel env pull` da
  prod); ora è su dev, con backup del vecchio in `.env.local.main.bak` (gitignored).
  NON committare `.env.local`.
- **Login:** email + password (`signInWithPassword`) — l'OTP è SOLO per il reset password.
- **Flusso test E2E su dev (usato 03/08/2026):** Edge headless via CDP
  (`msedge --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp>`) pilotato da Node
  (WebSocket globale) → naviga a `/login?dev=rootkind-dev-2026` → fill form e submit via
  `Runtime.evaluate` (native setter + `Event('input', { bubbles: true })` per react-hook-form) →
  attesa `/dashboard` → cattura `document.cookie` e riuso come header `Cookie` nelle chiamate alle
  route (es. `POST /api/admin/update-user`) → utenti di prova `e2e.*@example.com` creati con la
  service key dev e CANCELLATI a fine test (auth admin + riga `users`). Verifica su DB:
  `/rest/v1/users?id=eq.<id>&select=is_secondary,is_manager`.

---

## Convenzioni di lavoro

- **Piano + approvazione:** per modifiche non banali, presentare prima un piano breve
  (obiettivo, file coinvolti, passi, rischi) e attendere l'approvazione dell'utente prima di procedere.
- **Commit atomici:** un commit per feature/fix, messaggi convenzionali (`tipo: descrizione concisa`),
  es. `fix:`, `feat:`, `chore:`, `docs:`.
- **Version footer:** a ogni release aggiornare `vX.YYY · <hash> — ultimo aggiornamento: DD/MM/YYYY HH:MM`
  in `/impostazioni` (footer hardcoded in `settings-page.tsx`).
- **Branch:** sviluppo su `dev`, deploy da `master`.
