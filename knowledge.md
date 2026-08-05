# 🧠 Memoria di progetto — Turni Sala C.C.C. (PWA)

> Questo file è la **memoria persistente** del progetto per l'AI assistant (convenzione Freebuff:
> `knowledge.md` nella root, iniettato automaticamente nel contesto a ogni sessione).
> Aggiornarlo quando cambiano convenzioni, architettura o stato noto del progetto.
> **Igiene:** promuovi le regole durevoli in "Regole architetturali", tieni in "Stato attuale"
> solo ciò che è ANCORA vero o azione pendente, cancella la cronaca dei fix già committati
> (vivono in git). Obiettivo: file sotto ~150 righe.

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
supabase/       migrations/ 001–015 (schema completo), functions/cleanup-shifts (edge function cron)
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
  Le richieste dell'altro gruppo portano SOLO il badge neutro **NONO** (viste dal DCO+) o
  **DCO+** (viste dai Noni): la card ha lo STESSO bordo delle altre (il bordo speciale
  `border-foreground/25` è stato rimosso 04/08/2026). `is_dco_plus` è forzato
  `false` per manager e Noni (route create/update utente + dialog admin). Query key/cache dei
  turni includono `isDcoPlus` (`shifts-{isSecondary}-{isDcoPlus}`).
- **`ADMIN_ID`** hardcoded `fdd6c008-7a22-42d5-a75b-c44d9edfef12` in `types/database.ts` — NON spostarlo in env.
- **Flag categoria indipendenti:** in `app/api/admin/update-user/route.ts` e nel dialog admin, `is_secondary` e `is_manager` sono indipendenti; `isManager === true` forza `is_secondary = false` (un manager non può essere DCO/Noni). Non reintrodurre l'accoppiamento dei due flag.
- **PostgREST:** nelle query embedded usare SEMPRE la FK esplicita
  (`user:users!shifts_user_id_fkey(...)`), altrimenti falliscono silenziosamente.
- **Cache user-scoped:** `lib/cache.ts` → chiavi `cache:{userId}:{suffix}` + `LAST_USER_KEY`;
  `AuthCacheGuard` pulisce le cache al cambio utente (`clearUserCaches`); su logout
  `clearAllLocalData()` svuota TUTTO (localStorage, sessionStorage, IndexedDB, cache SW,
  cookie) DOPO il signOut. NOTA: `notification-history` (`lib/notification-storage.ts`)
  NON è user-scoped, ma viene eliminata dal logout completo.
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
  `public/color-studio.html` è stato ELIMINATO (04/08/2026) — NON ricrearlo.
- **Tema a 2 colori (03/08/2026):** scuro = bianco/nero puro; chiaro = nero + celeste molto
  lieve ("negativo" dello scuro). COLORATE solo le pill semantiche: fasce orarie
  (mattina/pomeriggio/notte, incluse le toggle pill del dialog turno) e stagioni ferie
  (P1–P6). Le pill colorate hanno bordo 1px (`color-mix(in srgb, currentColor 30%, transparent)`,
  adattivo ai 2 temi) e le chip dei filtri un contatore `.chip-count` (badge a contrasto:
  traslucido da spento, invertito da selezionato). Tutto il resto del chrome è neutro: highlight bianco (non più ambra), my-period
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
- **Splash/launch PWA (03/08/2026):** splash IN-APP (`components/providers/boot-splash.tsx`,
  primo elemento del `<body>`) SOLO su iOS via `@supports (-webkit-touch-callout: none)` in
  `globals.css` (su Android è `display:none` per evitare il doppio splash con quella nativa).
  Icone `icon-192/512` TRASPARENTI, NIENTE `purpose: maskable`; `apple-icon.png` (home iOS)
  a sfondo BIANCO `#ffffff` cotto. `manifest.json` colori `#0a0a0a` = FALLBACK legacy.
  Bump `CACHE_NAME` in `sw.js` a ogni cambio icone/manifest (cache-first).
- **Bordi card turni/ferie (05/08/2026):** gerarchia a 3 livelli — divisore verticale della
  colonna data IN PRIMO PIANO (ininterrotto: le giunzioni interne rendono TRASPARENTE il bordo
  orizzontale di stato con `.shift-grouped-t/b`). Card NON prime del giorno (ordinali 2°, 3°):
  colonna data opaca dedicata `.shift-date-sub-others` (sfondo più chiaro del primo + border-right
  PIENO dello stesso colore → divisore continuo) — niente `opacity-20` sull'intero blocco (sbiadiva
  ordinale e divisore). Separatore orizzontale di gruppo sulla TUTTA larghezza con colori diversi:
  corpo `.shift-content-divider` (`--shift-inner-border`) + colonna data `.shift-date-divider`
  (`--shift-date-inner-border`, più tenue), entrambi box-shadow inset, solo se la card precedente
  non è la propria (`isPrevOwn`, da `prev.user_id === effectiveUserId`). Riquadro TUO (Variante A)
  completo su 4 lati e MAI toccato dalle giunzioni né dai separatori (guard `!isOwn`, `!isPrevOwn`).
  Contorno TUO tono A3: `--shift-own-empty/interest-border` = `#969696` (chiaro) / `#8a8a8a` (scuro).
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
- **Migrations 001–015 completano lo schema** (turni, vacanze, sala, app_settings, RLS,
  realtime publication, RPC, DCO+). NON riscrivere le policy RLS, NON aggiungere colonne/tabelle duplicate.
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

## Stato attuale (snapshot 04/08/2026)

- **⚠ AZIONE PENDENTE:** migration **014** (drop color_overrides) e **015** (DCO+) applicate
  SOLO al DB dev (`uokfixddsuqcjddbfkln`). Al MERGE su `master` vanno applicate ANCHE al DB di
  produzione/main (`zrbbzfingrdpdflkndgl`): `supabase db push` con progetto main linkato, o SQL equivalente.
- **Password dev per test (04/08/2026):** per facilitare i test su dev, la password di alcuni
  utenti = email: Luigi Neri, Mariapia Di Napoli, Fortunato Di Monda, Ernesto Gagliotta,
  Nicola Romano, Maurizio Tammaro (es. `lu.neri@rfi.it` / `lu.neri@rfi.it`). Vale SOLO su dev.
- **DCO+ attivi su dev (03/08/2026):** Ernesto Gagliotta (`bc8dc7f3-…-512d4`), Luigi Neri
  (`001c315b-…-f3ff`), Mariapia Di Napoli (`51a6cc71-…-cb2`).
- **Attenzione auth/push:** `app/api/vacanze/check-chains` accetta `newRequestUserId`/`isSecondary`
  dal client senza validarli (vettore spam notifiche). Da validare se si tocca quella route.
- **Lint noti, non bloccanti:** `react-hooks/purity` (Math.random, accettato),
  `react-hooks/refs` in `shift-list.tsx:241,244`, `no-explicit-any` in `lib/pdf-parser.ts:275,279`,
  `lib/queries/sala-layout.ts:13`, `lib/queries/vacations.ts:125–127,136`.
- Edge function `supabase/functions/cleanup-shifts` (cron pulizia turni passati, migration 002)
  è attiva e deployata — non è codice morto.

---

## Note per il testing E2E in dev

- **Due PWA installate sul telefono del titolare (IMPORTANTE, 04/08/2026):** sul cellulare
  sono installate DUE PWA: una punta a `master` (produzione) e una alla preview Vercel di
  `dev`. Un push su `dev` è quindi subito verificabile da telefono tramite la PWA dev — NON
  serve il merge su `master` per i controlli grafici (il titolare sceglie quale PWA aprire).
  La PWA di produzione si aggiorna SOLO al merge su `master` + deploy Vercel.
- **Progetti Supabase:** dev = `uokfixddsuqcjddbfkln`, main/produzione = `zrbbzfingrdpdflkndgl`.
  L'account admin esiste su ENTRAMBI con lo stesso UUID (`fdd6c008-...` = ADMIN_ID): dev è un
  clone di main, quindi il pannello admin si può testare anche su dev.
- **Precedenza env (IMPORTANTE):** le variabili d'ambiente REALI del processo sovrascrivono
  `.env.local` (regola dotenv: process env > `.env.local`). Prima di lanciare il server verificare
  con `printenv NEXT_PUBLIC_SUPABASE_URL`: se punta a main, i test locali toccano il DB LIVE anche
  con `.env.local` su dev. Per forzare dev:
  `NEXT_PUBLIC_SUPABASE_URL=https://uokfixddsuqcjddbfkln.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon dev> SUPABASE_SERVICE_ROLE_KEY=<service dev> npx next dev -p 3000`
- **`.env.local`:** ora su dev, con backup del vecchio in `.env.local.main.bak` (gitignored).
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
  in `/impostazioni` (footer hardcoded in `settings-page.tsx`). Il `<hash>` è lo short hash del commit
  padre (HEAD prima del commit di bump).
- **Branch:** sviluppo su `dev`, deploy da `master`.
