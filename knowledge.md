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
supabase/       migrations/ 001–018 (schema completo), functions/cleanup-shifts (edge function cron)
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
- **Parità di leggibilità tra i temi (25/08/2026) — REGOLA:** la scelta del tema deve essere
  MERAMENTE estetica: ogni coppia testo/sfondo deve passare WCAG AA (≥4.5:1) in ENTRAMBI i temi,
  e le bande adiacenti (titolo/corpo, header/card, bordi) devono restare distinguibili in
  entrambi. Audited con canvas-readback (browser risolve oklch/lab → sRGB) su tutte le variabili
  di `globals.css`. Fix applicati: `--muted-foreground` chiaro `#5f5f5f` (prima oklch 0.556 ≈
  #737373 → 3.94:1 su `--muted`, sotto AA); `--destructive` `#dc2626` in ENTRAMBI (prima salmone
  #ff6467 → 2.69:1 su bg chiaro); `--state-confirm-btn-bg` `#15803d` (+ hover `#106b31`) in
  entrambi (bianco su #16a34a era 3.3:1); `--state-confirm-text` chiaro `#126b2f`;
  `--pill-mattina-text` scuro `#6fb1fc` (era 4.52); `--pill-pomeriggio-text` chiaro `#a14a06`
  (era 4.51);  bordi/bande scuri più visibili: `--border` 16% bianco (era 10%),
  `--sala-card-border` `#363636`, `--shift-others-border` `#41414c` (poi 26/08/2026: `#2e2e2e`,
  stesso colore dei separatori interni `--shift-others-date-border` — contorno uniforme come
  nel tema chiaro),
  `--period-card-header-bg` `#343434`, `--my-period-header-bg` `#454545`.
- **Convenzione elevazione tema scuro (25/08/2026):** la card resta PIÙ CHIARA della pagina anche
  in tema scuro (best practice Material/Apple: l'elevazione in dark si esprime SCHIARENDO la
  superficie, niente superfici nere pure). NON invertire il corpo rispetto alla pagina
  (es. corpo #000000: sbagliato, testato e scartato). Ciò che si inverte tra i temi è solo il
  rapporto titolo↔corpo: chiaro `titolo < corpo`, scuro `titolo > corpo` (attualmente
  `#454545` vs `#171717`). Sfondo pagina scuro `#0a0a0a` accettato (Material suggerisce
  `#121212`, ma l'utente ha scelto di mantenerlo).
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
- **Bordi card turni/ferie — ARCHITETTURA (25/08/2026, 2° fix):** il bordo e lo sfondo della
  card vivono sul WRAPPER INTERNO (`shift-item.tsx` / `vacation-request-item.tsx`: il primo
  div dopo l'outer che porta ring/shadow), che contiene riga + pannello espanso: `stateClass`
  (bg + `border: 1px solid`), `borderRadius` per posizione nel giorno, `overflow-hidden`,
  `shift-grouped-t/b`. Riga e pannello sono TRASPARENTI e senza bordo. PERCHÉ: i bordi 1px di
  due elementi impilati con lo stesso colore (riga↔pannello, pannello↔card successiva) vengono
  ANTIALIASATI dal browser alla giunzione e a zoom alto (es. 5x) quella riga da 1px diventa un
  TRIANGOLO diagonale sui bordi laterali (#2d2d33 su #41414c); con un unico tratto continuo sul
  wrapper la giunzione è pulita a qualunque zoom. Rimossi per questo: le classi `shift-expanded-*`
  (il pannello è trasparente), il `border-x`/`border-b`/`panelRadius` del pannello (il fondo si
  chiude sul wrapper: `borderRadius` espansa = `rounded-t-[10px]` se prima del giorno +
  `rounded-b-[10px]` se ultima), le varianti `.shift-grouped-t-date/-own-empty/-own-interest`
  e le prop `prevDateClass`/`isPrevOwn` dalle liste.
  LINEE FRA CARD DELLO STESSO GIORNO (25/08/2026, richiesta utente): il divisore è il bordo
  basso VISIBILE del wrapper, `.shift-grouped-b { border-bottom-color: var(--shift-others-date-border) }`
  (#2e2e2e scuro / #bdd0e0 chiaro — stesso colore del divisore verticale della colonna data,
  sottile e adattivo ai 2 temi).  Applicato a tutte le card NON ultime del giorno (anche da
  espansa: separa il pannello dalla card successiva). Il bordo ALTO delle card NON prime
  (`.shift-grouped-t`) è `border-top-width: 0` (4° fix, 25/08/2026): ATTENZIONE non basta
  il colore trasparente — un bordo alto di 1px (anche trasparente) mostra il bg del wrapper
  sotto ogni separatore e crea una STRISCIA SCURA a tutta larghezza (più scura del divisore
  #2e2e2e, visibile nella colonna data fra separatore e #202020): la "doppia linea" in ogni
  giunzione (collassata e pannello→card successiva). Con width 0 il divisore resta il bordo
  basso della card SOPRA (una sola linea) e la riga parte esattamente sotto. La striscia
  di 1px con i colori della PROPRIA colonna data la ridipinge la RIGA, NON il wrapper —
  `.shift-grouped-row-strip` sulla riga (stesso `linear-gradient(to right, <bg> 0 51px,
  <border> 51px 52px, transparent 52px)`, 52px allineati a `w-[52px]`). ATTENZIONE: il
  gradiente NON deve stare sul wrapper, perché dipinge TUTTA l'altezza della card e da
  espansa la colonna data invadeva il pannello (sovrapposizione #202020 a sinistra del
  bottone). NIENTE più `margin-top: -1px` (overlap): nasconderebbe il divisore.
  PANNELLO ESPANSO COME CARD A SÉ (25/08/2026, 3° fix): il pannello NON estende più il
  pattern data/corpo della riga — è full-width (niente colonna data a sinistra) e separato
  dalla riga da un divisore orizzontale `.shift-expand-panel { border-top: 1px solid
  var(--shift-others-date-border) }` (stesso colore dei divisori fra card). Prima card del
  giorno: bordo alto di stato (top del gruppo); ultima: bordo basso di stato + angoli bassi
  (bottom del gruppo); le intermedie: divisore basso.
  Colonna data sub `.shift-date-sub-others` (ordinali 2°, 3°): sfondo opaco dedicato +
  border-right PIENO → divisore verticale continuo. Riquadro TUO (Variante A) invariato:
  MAI toccato dalle giunzioni (guard `!isOwn`), completo su 4 lati anche da espansa.
- **Sala:** `colored_persons` scritto via RPC atomico `set_person_color` (migration 013) —
  colori PER PERSONA dei desk (board /turnisala, admin o manager), diverso dall'ex-funzionalità
  colori tema. Upload PDF / cancellazione mese: admin O manager (route + RLS allineati).
- **Sala /turnisala — highlight card + separatori NMP (25/08/2026):** `.desk-card-highlight` =
  bordo card nel colore `--sala-highlight-border` (nero in chiaro / bianco in scuro) + anello
  `box-shadow: 0 0 0 1px` dello STESSO colore → contorno solido di 2px al bordo della card
  (distinguibile per spessore oltre che per colore). NON usare anelli con opacità ridotta
  (es. 25%): il primo fix con `0 0 0 2px` al 25% creava una banda grigia FUORI dal bordo che
  faceva sembrare l'highlight spostato DENTRO la card. Separatori toolbar NMP: `.sala-toolbar-sep`
  = `border-left: 1px solid var(--sala-toolbar-nav-border)` (stesso colore/spessore del bordo
  del contenitore); in desk-board.tsx la classe è applicata SOLO a un bottone non selezionato
  il cui vicino di sinistra è anch'esso non selezionato (mai a fianco della chip selezionata:
  con P selezionato il separatore sta tra N|M, con N tra M|P, con M nessuno). Colori titolo/corpo
  card tema scuro (26/08/2026): `--sala-card-title-bg` = `#454545` / `--sala-card-body-bg` =
  `#171717` (= bg-card, uniforme con /turniferie; prima `#2b2b2b`, inizialmente `#383838`).
  Nel chiaro lo stacco titolo↔corpo è marcato (`#dfe8f2` vs `#f8fbfd`, ΔRGB≈18); in scuro ora
  è più forte (Δ≈46). Il titolo card è `text-xs font-semibold` (12px/600) IDENTICO nei due temi.
  Card d'intestazione + selezione N/M/P (26/08/2026): la toolbar di /turnisala usa `--sala-toolbar-bg`
  = `var(--sala-card-body-bg)` (nel chiaro coincideva già col corpo delle card; nello scuro ora
  è #171717 come i corpi = bg-card, uniforme con /turniferie). La chip
  N/M/P selezionata usa i colori della banda TITOLO delle card (`--sala-toolbar-chip-bg` =
  `var(--sala-card-title-bg)` = #dfe8f2 chiaro / #454545 scuro, testo #1c1c1c / #f5f5f5, bordo =
  sfondo) in ENTRAMBI i temi (prima era invertita: nera in chiaro / bianca in scuro). In /turniferie
  la card d'intestazione è GIÀ uguale al corpo delle card periodo (`bg-card`) in entrambi i temi:
  nessun intervento necessario.
- **Changelog popup (25/08/2026) — DB-backed:** alla prima apertura della PWA dopo un
  aggiornamento viene mostrato un dialog "Novità di questa versione" con le entry non ancora
  viste. PERSISTENZA SERVER-SIDE: tabella `changelog_entries` (version, date, title, changes
  jsonb) + `changelog_reads` (user_id PK, last_seen_version) — migration 016 (seed v1/v2) poi 017 (unifica: elimina v1–v3, resta la sola v4 della release 26/08/2026, idempotente).
  API: `GET /api/changelog` (entry + lastSeen dell'utente, RLS authed/own-row),
  `POST /api/changelog/read` (upsert last_seen), admin: `GET/POST/DELETE /api/admin/changelog`
  (crea/aggiorna/elimina entry; POST con `{ forceNew: true }` crea version = max+1 → TUTTI gli
  utenti la vedranno), `GET /api/admin/changelog/reads` (join users → changelog_reads per la
  tabella letture admin). UI: `components/providers/changelog-dialog.tsx` (montato in
  `app/(app)/layout.tsx`, ritardo 1.5s per non sovrapporsi alla boot splash; ascolta l'evento
  `changelog:show-all` per riaprirsi con TUTTE le entry — voce "Novità" nella sezione
  "Info app" di `components/settings/settings-page.tsx`, accanto alla riga versione/
  ultimo aggiornamento), gestione in `components/admin/changelog-manager-dialog.tsx`
  (tile "Changelog" nell'admin: editor entry, forza nuova versione, tabella letture per utente).
  **REGOLE COMPORTAMENTALI:** SOLO il pulsante "Continua" marca la versione come vista
  (POST read): un dismiss del dialog (Escape/backdrop) o la chiusura dell'app NON flagga nulla
  → il popup riappare al prossimo avvio finché l'utente non preme Continua. L'utente vede solo
  le entry con version > last_seen (con 2+ release accumulate ne vede tutte le non viste).
  A ogni release: dal pannello admin "Forza nuova versione" + compilazione entry (NON più nel
  codice) e aggiornare il version footer in `settings-page.tsx`.
- **Statistiche admin (26/08/2026) — REGOLA: aggregare SEMPRE in Postgres, MAI scaricare righe**
  nel server via REST: `db-max-rows` tronca a 1000 righe (bug storico: le stats contavano un
  campione arbitrario di 1000 eventi su 9328). Fix: migration 018, RPC unica `get_admin_stats(p_days)`
  (security definer, SOLO service_role — la route verifica ADMIN_ID; anon/authenticated revocati)
  che restituisce JSONB: `overview` (utenti, attivi, accessi, turni, interessi — periodo o da sempre
  con p_days=0), `activity` (settimanale), `users` (all-time: eventi + turni reali + M/P/N +
  ultimo accesso), `shiftModes`. UI `/admin/statistiche`: `stats-page.tsx` (periodi 30/90/365/Tutto,
  card panoramica, sezione N/M/P con le pill semantiche esistenti, skeleton/errore/retry) +
  `stats-activity-chart.tsx` (barre SVG custom, ZERO nuove dipendenze, toggle Accessi/Turni) +
  `stats-user-table.tsx` (ricerca, filtro Tutti/DCO/Noni, ordinamento, riga espansa M/P/N,
  badge DCO/NONO/DCO+/MGR, "—" per chi non è mai entrato). Il selettore periodo agisce su
  panoramica/attività/NMP; la tabella utenti è sempre all-time. Numeri reali dev: 88 utenti,
  9328 eventi, payload ~27 KB, ~160-180 ms. Applicare migrazioni ai DB anche via Management API
  (api.supabase.com/v1/projects/{ref}/database/query, token `Supabase CLI:supabase` nel Credential
  Manager di Windows, User-Agent browser richiesto) + registrare la versione in
  `supabase_migrations.schema_migrations` per tenere la history allineata ai file locali.
- **Bottone congedo (25/08/2026):** in `/dashboard` accanto al titolo "Turni Sala C.C.C."
  c'è un bottone circolare con icona palma (`Palmtree`, lucide) che apre un dialog
  "Congedo" con il testo "Non hai trovato il cambio di cui hai bisogno? Chiedi congedo qui."
  — "qui" è un link (target=_blank, rel=noopener noreferrer) al modulo
  `https://forms.office.com/e/aQWL0B86kC` (costante `CONGEDO_FORM_URL` in
  `app/(app)/dashboard/page.tsx`); il link non è mostrato per esteso. Il bottone usa lo
  STESSO stile del tasto Esci delle impostazioni: `variant="destructive"` (sfondo rosso
  traslucido + testo `--destructive`) + bordo `border-destructive/40` (1px) — il tasto
  Esci ha lo stesso bordo (aggiunto 25/08/2026). La scritta "Chiedi congedo" è SEMPRE
  visibile (NON nasconderla con breakpoint `hidden sm:inline`/`max-sm:size-8`: c'è spazio
  ampiamente anche sotto 640px). Sotto ~330px di viewport (es. 319px) il contenitore
  interno del titolo ha `flex-wrap`, quindi il BOTTONE scende su una riga propria sotto il
  titolo, che resta su UNA SOLA riga (143px, non troncato su 3) — verifica 25/08/2026.
  Header con `flex-wrap` + `min-w-0` + bottone `flex-shrink-0` e titolo `leading-snug`;
  campanella (`NotificationBell`, fixed top-right) sempre visibile, nessun overflow X.
- **Responsiveness orizzontale (25/08/2026):** tutte le schermate usano `max-w-lg mx-auto px-4`
  e la campanella è `NotificationBell` **fixed top-right**. Regole: gli header delle pagine
  (`/dashboard`, `/turnisala` header data+NMP, `/turniferie`, `/vacanze`) hanno `flex-wrap`
  + `min-w-0`/`min-w-[120px]`/`flex-shrink-0` sui controlli così su schermi stretti la riga va
  a capo invece di straripare (la campanella e i controlli restano sempre visibili).
  Diviso: `mr-14` (o `pr-12`) su ogni header lascia spazio alla campanella fissa.
  `/turnisala` forza landscape (`useLandscapeLock`): a viewport landscape-radio l'header
  data (min ~185px) + N/M/P (~79px) richiede ~292px, quindi sta comodo; `flex-wrap`
  garantisce che sotto quella soglia vada su 2 righe. Nessuna pagina genera scroll orizzontale
  (bodyOverflowX false) a viewport 651 (landscape). Le card sala sono `grid-cols-3` (design previsto).

- **Pannello Admin (12/09/2026):** l'header di `components/admin/admin-panel.tsx` ha un bottone X
  (`router.back()`): da PC/preview la pagina admin è fuori dal gruppo `(app)` quindi SENZA bottom
  nav e senza la X si restava bloccati (le statistiche admin hanno già la freccia indietro).

- **Bottom nav (25/08/2026):** `components/nav/bottom-nav.tsx`. Struttura a 4 slot + FAB centrale
  (sinistra→destra): (1) **"Cambi"** (icona `ArrowLeftRight` — frecce-scambio) UNICO bottone che
    gestisce /dashboard (cambi turno) e /vacanze (cambi ferie): il tapping alterna tra le due
    pagine e salva l'ultima in `localStorage['cambi-last-page']` (dal 12/09/2026 le letture
    «ultima pagina» passano da `useSyncExternalStore` con snapshot primitivo + evento
    `nav-lastpage`: niente setState-in-effect, stesso schema della palette); il bottone "Cambi" ha un layout
    COMPATTO: due frecce ORIZZONTALI (→ 'Turni' `ArrowRight`, ← 'Ferie' `ArrowLeft`) impilate
    una sopra l'altra, 'Cambi' sotto. Si illumina SOLO la freccia della pagina attiva
    (foreground+bold+stroke 2.5): su /dashboard →'Turni', su /vacanze ←'Ferie'; l'altra resta
    muted (stroke 1.5). "Cambi" evidenziato quando si è su una delle due. Compatto (2 righe +
    etichetta), sta dentro nav h-16;
    (2) **"Il tuo turno"** (icona
    `Calendar` singola) → pagina `/tuoturno` (rotte nuova, SEGNAPOSTO: piantina personale da
    definire); (3) **FAB centrale** (`+`) che crea nella pagina corrente (Nuovo turno su
    /dashboard, Nuova richiesta ferie su /vacanze); (4) **"Turni"** (doppia icona
    `Calendar`+`Palmtree`) che alterna /turnisala↔/turniferie; (5) **Impostazioni**. Le icone
    sono volutamente DISTINTE: Cambi=frecce, Il tuo turno=calendario singolo, Turni=calendario+palm.
    Rimossi `CalendarSwitchIcon`/`PalmSwitchIcon` (ex-icone dei due bottoni separati) e le vecchie
    voci "Cambi turno"/"Cambi ferie".
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
- **Migrations 001–018 completano lo schema** (turni, vacanze, sala, app_settings, RLS,
  realtime publication, RPC, DCO+). NON riscrivere le policy RLS, NON aggiungere colonne/tabelle duplicate.
- **Next.js 16:** API e convenzioni diverse dalle versioni precedenti (`proxy.ts` ecc.).
  In caso di dubbio leggere `node_modules/next/dist/docs/` prima di scrivere codice.

---

## Workaround INTENZIONALI — non "correggerli"

- **Backdoor dev (NECESSARIA):** `components/providers/pwa-guard.tsx` —
  `DEV_BYPASS_TOKEN = 'rootkind-dev-2026'`; visitando `?dev=rootkind-dev-2026` si salta il gate PWA.
  Il token è volutamente nel bundle client. NON rimuoverla, NON flaggarla come vulnerabilità.
  Il bypass è salvato in **localStorage** (chiave `__dev_bypass__`), NON sessionStorage: al reload
  la sessionStorage si svuota e il bypass si perdeva → reindirizzo a /installa che sembrava una
  sessione persa (in realtà il cookie auth `sb-...-auth-token` sopravvive). Con localStorage il
  reload non richiede più il ri-login nel dev server.
  **Attenzione pratica:** aprendo il dev server da browser normale (non PWA installata) la guard
  reindirizza a `/installa` — per navigare serve `?dev=rootkind-dev-2026` sulla PRIMA URL
  (persiste in localStorage). Vale anche nei test automatici headless (Edge/CDP):
  navigare a `/login?dev=rootkind-dev-2026`.
- **Service worker in dev (25/08/2026):** `public/sw.js` NON intercetta nulla su localhost/127.0.0.1
  (early return nel fetch handler): i chunk `/_next/static/` arrivano sempre freschi dal dev server,
  niente più CSS/JS vecchi serviti dalla cache-first che rendevano il debug ingannevole.
  In produzione (hostname diverso da localhost) il comportamento cache-first è invariato.
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
- **Truncate sui codici anche nelle card lg di /tuoturno** (12/09/2026): il codice grande
  (14px) e il teorico barrato (11px) portano `max-w-full truncate`: a 320px le card scendono
  a ~37px e codici a 4 lettere (SPCA…) uscivano dalla card. L'ellipsis subentra solo sotto
  ~375px; a larghezze normali il testo ci sta sempre e non cambia nulla visivamente.

---

## Stato attuale (snapshot 26/08/2026)

- **Pulizia cambi turno (11/09/2026, nessuna migration — solo codice):** quando si carica un PDF reale
  (`/api/admin/parse-pdf`) il server calcola quali richieste di cambio (`shifts`) risultano **già
  esaudite** dal calendario appena importato — la persona ha davanti a sé uno dei `requested_shifts`
  (`offered_shift` è il turno che aveva prima) — e le ritorna nel campo `cleanup` della risposta.
  `sala-page-client` apre allora il dialog condiviso `components/admin/shift-cleanup-dialog.tsx`
  (elenco, conteggio e conferma a due passi «Sei sicuro? Conferma»). Lo stesso dialog si apre dal
  pannello admin con la tile **Pulizia cambi turno** (selettore mese, anteprima via
  `GET /api/admin/shift-cleanup?month=YYYY-MM`, eliminazione via `POST {ids}`); la route è
  admin/manager e usa il client service-role perché la RLS permette di cancellare solo le proprie
  richieste. Logica pura in `lib/queries/shift-cleanup.ts` (`findFulfilledShiftRequests`), che mappa
  i cognomi del PDF agli utenti con `matchesCognome` — estratto in `lib/utils.ts` e condiviso con
  `desk-board.tsx` (omonimi via `buildDuplicateCognomi`). Le richieste non esaudite non vengono toccate.
  **All'eliminazione** (solo la `POST`, unico percorso di cancellazione) partono push `type: 'system'`:
  (1) al **richiedente** — «Cambio turno già registrato», «La richiesta di cambio del gg/mm (Offerto →
  Richiesto) è stata eliminata: nel turno caricato risulti già in <turno reale>.»; (2) a **chi aveva
  mostrato interesse** (righe di `shift_interested_users`, lette PRIMA del delete perché la FK le cancella
  a cascata) — se dal calendario risulta nel turno che il richiedente cedeva, il cambio è stato fatto
  proprio con lui («Cambio turno completato: risulti in <offerto>»), altrimenti «Cambio turno non più
  disponibile». Una push per utente (se un interessato è anche autore di una richiesta ripulita vince il
  messaggio del richiedente). I turni reali di richiedente e interessati si ricavano da
  `loadShiftLookupContext` + `actualShiftsForUserDate` (utenti + calendari dei mesi coinvolti), non da
  `computeShiftCleanup` (che serve solo l'anteprima). Come le altre notifiche di sistema NON controlla le
  preferenze push dell'utente (stesso comportamento di «Cambio turno approvato»).
- **Parser PDF v2 — codici completi + celle gialle (11/09/2026):** `lib/pdf-parser.ts` riscritto sul
  modello `PersonaMese` del progetto gemello `D:\david\Download\Stipendi\webapp`:
  (a) NON butta più via i codici non-turno — prima `applyTokenToDay` scartava le assenze e il parser
  non le conservava, ora ogni persona ha `days[]` (effettivo) e `teorico[]` (riga base stampata sul
  PDF) con TUTTI i codici: `A`, `F.E.`, `VS`, `D`, `Sp*`, `ISp*`, `SPW`, `Dis*`, `RIC/PRIC/MRIC`,
  `PM3M40`/`MM3M40`, `TUTOR`, `Trasf`, `G`, `Tir`;
  (b) filtro legenda (`isLegendArtifact`, match sul TOKEN INIZIALE: «NAPOLI» non scarta «DI NAPOLI A.»)
  e nomi canonici (`nomeCanonico`: `RUGGIERO`→`RUGGIERO A.`, `ESPOSITO A.`→`ESPOSITO AU.`);
  (c) zona nome (`NAME_ZONE_MARGIN = 40px`): i frammenti di cella del giorno 1 che cadono fuori
  tolleranza non diventano più «persone fantasma» (prima nasceva un finto dipendente «MM3M40TIR» che
  rubava le correzioni della persona sotto);
  (d) **celle gialle**: la legenda del PDF dice «Sfondo Giallo = Turno da confermare». Il colore non
  esiste nel text layer, va letto dalla `getOperatorList()` (rettangoli riempiti, `OPS.constructPath`
  con path-type 19); serve `PDFJS.disableFontFace = true` altrimenti in Node crasha su `document`
  (il modulo si prende con `require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js')`, STESSA istanza
  usata da pdf-parse: le costanti OPS di `pdfjs-dist` sono diverse e non valgono). Il giallo è
  distinto dai colori-squadra (rosa/pesca/verde/azzurro) con soglia su R/G alti e B basso.
- **Formato compatto «colonnare» v2 dei turni reali (11/09/2026, in `sala_schedule.schedule`):**
  `{ v:2, days, codes[], names[], rows[{d[],t[],y?[]}] }` — dizionario di codici + due liste di indici
  per persona, `y` = giorni con sfondo giallo. NIENTE migration: il jsonb si autodistingue (`isSalaMonthData`),
  `getSalaSchedule` ricostruisce la vista per-giorno con `buildScheduleFromMonthData` (stesso
  `applyTokenToDay` di prima) quindi turnisala/desk-board/pulizia cambi funzionano invariate, e i mesi
  ancora in v1 (2026-08, 2026-09: i PDF non sono più disponibili) restano leggibili. Peso ~18-19 KB/mese
  contro ~90 KB/mese della v1, con MOLTI più dati. Modulo condiviso: `lib/sala-month.ts`
  (`encode/decodeSalaMonth`, `findMonthPerson`, `personDayShift`, `salaCodeInfo`).
- **«Il tuo turno» — codici completi (11/09/2026):** la cella mostra anche assenze/riposi/disponibilità/
  attività senza sezione, con la tinta per tipo di turno della «variante E» (vedi più sotto); i turni
  «da confermare» (cella gialla sul PDF) hanno il contorno solido ambra di 2px ESATTO sul bordo
  della card (non un anello interno: vedi nota stile più sotto), che è l'UNICO marcatore
  sulle card (12/09/2026).
  Nota (AGGIORNATA 12/09/2026, v2): il «teorico» della pagina NON è più solo la rotazione ricostruita
  dall'app (`generateTheoreticalMonth`): ha tre sorgenti in ordine di priorità — (1) la riga base del
  PDF (`teorico[]`) per i mesi caricati, che è il riferimento esatto; (2) per i mesi SENZA PDF, la
  predizione dalla STORIA dei PDF (lib/person-cycle.ts: ciclo rigido dedotto oppure rotazione a
  blocchi via macchina a stati); (3) la rotazione del DB come ultimo fallback. **LA CAUSA RADICE È
  STATA RIPARATA NEL DB (12/09/2026, scripts/apply-super-cycle.mjs su dev):** il ciclo del turno è
  28gg ma quello delle SEZIONI è 42gg («in terza»), quindi lo stato completo turno+sezione si ripete
  ogni LCM(28,42)=84 giorni: il seed a 28gg troncava la rotazione e copriva solo ~56% dei PDF. Ora
  le tipologie hanno cycle_days=periodo reale dedotto dai PDF («in terza» 28→84, le altre
  confermate: in seconda 84, Scorte 28, RIC/ASTER 84), pattern_start COMUNE = 2026-03-01 e pattern
  membri = codici completi turno+sezione per classe di resto (maggioranza, parità → la più recente;
  backup JSON in scripts/backup-rotation-*.json). Verifica (scripts/verify-tuoturno.mjs): MININO
  212/214 giorni (98,6%), BORRELLI 214/214, CETRANCOLO 210/214 — gli scarti restanti sono ritocchi
  di piano. ATTENZIONE BUG script: il match membro→utente deve iterare i membri DENTRO il proprio
  team (come findMemberForUser), un loop piatto abbinava MININO alla tipologia inattiva IAP. Lo
  strato (2) rimane per robustezza e per gli utenti senza storia. - **Mockup data/turno nella card (12/09/2026, NON parte dell'app):** `mockups/celle-data-turno.html`, 3 varianti per separare numero del giorno e codice turno nella card «variante E» (A oggi centrato-attaccato come riferimento, B distanziati alto/basso, C data piccola nell'angolo alto-sinistra stile Google Calendar, D data in badge chiaro nell'angolo) su dati reali MININO luglio 2026, con zoom delle card chiave e verifica tema scuro. **SCELTA (12/09/2026): la variante D** — implementata nella pagina vera: numero del giorno in badge chiaro nell'angolo alto-sinistra (`.cell-day .day-badge`: bianco al 78% nel chiaro, bianco traslucido al 16% nello scuro, radius 6px, padding 2×6px, position absolute con `relative` sulla card), testo centrale INGRANDITO per leggibilità (griglia: codice 11→14px extrabold, teorico barrato 10→12px; confronto: codice 10→12px, teorico 8→9px) e contenuto leggermente abbassato (pt-3/pt-1.5) per non finire sotto il badge. Il badge è negli override del pannello Colori? NO: resta su ogni tinta, anche personalizzata — è la sua funzione (contrasto garantito). **Stile definitivo (12/09/2026, variante D del mockup `mockups/bordi-badge-data.html`):** il badge veste i colori dei BOTTONI NAV (freccette) — nel chiaro superficie pagina `--background` + bordo `--border/60` + testo `--foreground`; nello scuro superficie rialzata `--card` + bordo bianco 16% (stessa ricetta dei bottoni). Sostituisce il bordo nero/bianco pieno della stessa mattina. Il bordo ambra «da confermare» e l'outline «oggi» non vengono coperti dal badge (padding interno, non toccano il bordo).
 - **Tabella di CONFRONTO de «Il tuo turno» (12/09/2026):** celle 44px di ALTEZZA, larghezza FLESSIBLE (`flex-1 basis-[34px] min-w-0`): i blocchi riempiono tutta la larghezza pagina invece di restare a 34px fissi. Data in chip INLINE (`.cmp-day`, NON assoluto: quello delle card 76px sovrapponeva il codice → illeggibile). Selettori CSS: `.cmp-day` da SOLO e `.cmp-table .cell-split` — sulle card split la classe `.cmp-cell` è sostituita da `.cell-split` (ternario) e i seletteri composti con `.cmp-cell` non matchano (bug: data senza stile 16px spingeva le metà fuori dalla cella). Card split (teorico/reale) attiva ANCHE nel confronto, stessa preferenza «Card divisa / Teorico barrato» del pannello Personalizza (store condiviso `mismatchStyleStore`) e stesse tinte personalizzate; CSS scalato per 44px (`.cmp-table .cell-split`: raggi 8px, barra 1.5px a bottom 5px). Chunking dei blocchi sensato alla LARGHEZZA viewport (`minChunks = ceil(days/maxByWidth)`) oltre che all'altezza: mobile 390 → 4 blocchi da 8 giorni senza scroll orizzontale; verificato simulando 390px e 320px (celle ≥38px uniformi).
 - **Mockup BORDO del badge data (12/09/2026, NON parte dell'app):** `mockups/bordi-badge-data.html`, 4 varianti del bordo/riempimento del badge della data nelle card de «Il tuo turno», su dati reali Minino luglio 2026 (split RC→P6T/RC→M10S, «da confermare» il 14) in entrambi i temi: **A** com'era prima (bianco 78%/16% senza bordo), **B** stato attuale (bordo nero chiaro / bianco+fill #171717 scuro), **C** come la selezione mese/anno (#dfe8f2+#b8c8dc / #454545+#5a5a5a), **D** come le freccette nav (superficie pagina+bordo --border/60 / rialzata+bordo bianco 16%). Con pro/contro per ciascuna. In attesa della scelta.
 - **Mockup card SPLIT teorico/reale (12/09/2026, NON parte dell'app):** `mockups/celle-split-teorico-reale.html`, anteprima della struttura richiesta: card divisa in due metà SOLO quando il reale differisce dal teorico — teorico sopra con tinta del proprio turno e SBARRATA diagonale, reale sotto con tinta del proprio colore; giorni normali invariati (card intera). Sei casi chiave (riposo lavorato, assenza, split+«da confermare» come il 23/9 di Minino, giallo senza variazioni), zoom barra singola vs tratteggio diagonale ripetuto, tema scuro. In attesa della scelta.
  **Aggiornato dopo feedback (12/09/2026):** (1) se cambia solo la SEZIONE e non il tipo di turno,
  le due metà hanno la STESSA tinta (quella del reale) e la modifica la racconta solo la sbarrata —
  due tinte solo quando cambia il tipo; (2) il teorico non è centrato nella sua metà ma ANCORATO
  alla linea di mezzeria (`justify-content: flex-end` + padding-bottom, barra sulla riga del codice):
  elimina l'accavallamento col badge della data sugli schermi stretti, verificato con una prova
  nativa a 360px dentro il mockup.
 - **Mockup celle (11/09/2026, NON parte dell'app):** `mockups/celle-turno.html`, 4 opzioni grafiche
  (A banda continua, B doppia banda 3/4+1/4, C reale pieno + teorico in angolo, D due righe etichettate)
  sulla stessa settimana reale (TROCCHIA, 1-7 luglio 2026) con pregi/limiti.**SCELTA (11/09/2026): la variante E** — `mockups/celle-colore-pieno.html` (card interamente tinta, numero del giorno compreso) — implementata nella pagina vera. Le tinte M/P/N replicano i colori delle pill dei turni della dashboard (var `--pill-mattina/pomeriggio/notte-*`), chiaro e scuro.
- **NOTA (11/09/2026) — asimmetria del ruolo manager (NON da sviluppare per ora, su richiesta):**
  se un manager **rifiuta** una richiesta di cambio (`POST /api/manager/shift-requests/[id]` con
  `action: 'reject'`) avvisa solo il richiedente; chi aveva mostrato interesse resta senza notifica.
  Il flusso `confirm` invece avvisa il vincitore e gli altri interessati. Il riconoscimento del
  partner ora disponibile in `lib/person-shift.ts` + `lib/queries/shift-cleanup.ts` permetterebbe di
  allineare anche il rifiuto, ma il ruolo manager resta fuori scope.
- **Pagina «Il tuo turno» (/tuoturno, 11/09/2026):** sostituito il segnaposto. `app/(app)/tuoturno/page.tsx`
  (server) carica profilo, elenco utenti, mesi caricati e l'albero delle squadre, poi li passa a
  `tuoturno-client.tsx`: intestazione «Il tuo turno» + nome della persona (tap → dialog con ricerca per
  scegliere QUALSIASI dipendente, default = utente loggato), calendario mensile con swipe orizzontale
  (touch, soglia 50px; le frecce ‹ › fanno lo stesso) e legenda. Celle «variante E» (min-h 76px): la card
  è INTERAMENTE tinta — numero del giorno compreso — blu Mattina, ambra Pomeriggio,
  lilla Notte (tinte = pill della dashboard), grigio riposi, rosso assenze, verde attività senza sezione
  (`.cell-day` + `.cell-tint-*` in `app/globals.css`; dal 12/09/2026 le tinte M/P/N puntano alle
  variabili `--pill-*` della dashboard). **Pannello COLORI (12/09/2026):** dialog apribile dal
  mini-Fab «Personalizza» — le azioni «Personalizza» e «Confronta» abitano dei mini-Fab che
  spuntano dal Fab principale in basso a destra (icona griglia `LayoutGrid`, ruota di 45° quando
  aperto) — con una riga per tipologia di contenuto
  (Pomeriggio, Mattina, Notte, Riposo, Disponibilità, Assenza, Senza sezione — `CARD_KINDS` in
  `lib/person-cycle.ts`), per ognuna si scelgono sfondo e testo (color input + anteprima) e si
  può ripristinare il default; palette persistita in localStorage (`tuoturno-colori`) via store
  esterno `cardPaletteStore` + `useSyncExternalStore` (niente setState in effect: il lint
  `react-hooks/set-state-in-effect` lo vieta). ATTENZIONE: `getSnapshot` deve restituire lo STESSO
  riferimento tra i render — un oggetto nuovo a ogni chiamata manda React in loop
  («The result of getSnapshot should be cached to avoid an infinite loop») e la pagina va in errore
  («this page couldn't load»): per questo la store usa una cache a livello di modulo, invalidata
  solo da set/reset (fix 12/09/2026; contratto verificato da `scripts/check-palette-store.mjs`). Gli override viaggiano come variabili CSS inline
  `--c-bg`/`--c-text`, che ogni `.cell-tint-*` consuma con fallback `var(--c-bg, var(--cell-*-bg))`
  — così il bordo `color-mix(currentColor 30%)` segue automaticamente il colore personalizzato.
  Ha sostituito il precedente selettore a tre modalità «Turno/Contenuto/Sezione» (visto e rimosso
  in giornata: la modalità «Sezione» non è piaciuta).
  **Bordo pill su TUTTE le card (12/09/2026):** ogni tinta `.cell-tint-*` porta
  `border: 1px solid color-mix(currentColor 30%)` nel colore del proprio riempimento, per tema.
  **RIMOSSI dalla pagina (12/09/2026):** la legenda sotto la nav del mese E tutti i testi
  esplicativi sotto il calendario (spiegazioni, suggerimento swipe, avviso «nulla da prevedere»):
  la pagina ora finisce con la griglia. Le «card vuote» prima del giorno 1
  (mese che non inizia di lunedì) sono INVISIBILI ma esistono ancora nel layout: sono sostegni vuoti
  (`div aria-hidden`, niente bordi) perché la grid NON salta celle da sola — rimuoverli del tutto
  fa partire ogni mese dal lunedì (bug 12/09/2026, fix `3ac8704`); gli skeleton di caricamento
  stanno dopo i sostegni, così cadono sulle colonne giuste. In evidenza c'è il codice REALE del
  PDF (slot T/S nascosto); se il reale manca (persona assente dal PDF, o mese non caricato) c'è il
  TEORICO. Quando i due differiscono il teorico compare BARRATO (10px) sopra il codice e il dettaglio
  sta nel tooltip del giorno (12/09/2026: il BORDO TRATTEGGIATO ROSSO `is-diff` è stato RIMOSSO —
  chi fa sempre turni diversi dal teorico vedrebbe tutte le card tratteggiate; rimaste le variabili
  `--cell-diff-*` sono state eliminate). L'evidenziazione «da confermare» (`is-pend`) è l'UNICO
  marcatore: segna i turni con sfondo giallo sul PDF = «da confermare» (dal 12/09/2026 compare SEMPRE
  quando il PDF lo indica, anche se il reale differisce dal teorico — prima veniva soppresso in quel
  caso e Minino 23/09 non risultava «giallo»; il barrato del teorico resta in aggiunta).
  **DUE STILI per i giorni real ≠ teorico (12/09/2026):** toggle nel pannello «Personalizza» —
  «Card divisa» (predefinita: card split in due metà, teorico sopra ancorato alla mezzeria con barra
  sottile 2px al 40%, reale sotto; stessa tinta se cambia solo la sezione) oppure «Teorico barrato»
  (card intera come un giorno normale, teorico barrato sopra il codice). Preferenza in localStorage
  (`tuoturno-mismatch`, `mismatchStyleStore`, snapshot primitivo: niente cache come per la palette).
  Il contorno ambra «da confermare» vale identico in entrambi gli stili.
  **BORDO DIVISO (12/09/2026, fix dopo il tentativo zoppo di `1244b57`, angoli rifatti due volte):** sulle card split il bordo
  si divide come i riempimenti ma le metà SONO il perimetro: la card ha `border-width: 0` (prima il
  bordo trasparente da 1.5px lasciava trapelare un anello del colore di fondo attorno alle metà) e
  NON dichiara raggi sulle metà — è `overflow: hidden` + il raggio `rounded-xl` (14px, prima 11px:
  disallineato) della card a ritagliare gli angoli, così le tinte arrivano esattamente al bordo
  arrotondato. Ogni metà porta il proprio bordo 1px `currentColor 30%` (teorico senza bordo in
  basso, reale senza bordo in alto: la mezzeria è pulita). «Da confermare» ha priorità: le metà
  ricolorano TUTTO il loro perimetro in ambra 1.5px (`.cell-split.is-pend > .cell-half`) e la card
  ripristina il proprio bordo ambra + spread shadow — un solo contorno, non tre linee concentriche
  (il vecchio codice sommava bordo-card ambra + bordi tinta delle metà).
  **STILE (12/09/2026, ricetta `.desk-card-highlight` di turnisala):** CONTOURNO SOLIDO di 2px ESATTO
  sul bordo della card — `border-color: var(--cell-pend-ring)` + `box-shadow: 0 0 0 1px` dello stesso
  colore — NON più un anello `inset` 3px: gli anelli inset partono DENTRO il bordo e l'evidenziazione
  non coincide con il perimetro della card (stesso bug già visto in turnisala/turniferie, vedi 25/08).
  **Selettore MESE/ANNO (12/09/2026):** l'etichetta «Settembre 2026» tra le frecce è un bottone:
  apre un pannello a due colonne (Mese | Anno) con scroll, il mese corrente in evidenza, un
  pallino sui mesi con PDF caricato e gli anni presi da quelli caricati + anno corrente.
  `MonthYearPicker` in `tuoturno-client.tsx`; chiusura con tap fuori o ESC. Il contenitore
  dell'etichetta DEVE essere `position: relative` (il pannello è `absolute top-full`): senza,
  si ancora al viewport e finisce FUORI SCHERMO (sembra che non si apra nulla).
  **FAB su /tuoturno (12/09/2026):** le azioni vivono nel FAB centrale della bottom-nav
  (`components/nav/bottom-nav.tsx`), che su /tuoturno diventa il bottone griglia `LayoutGrid`
  (X quando aperto) e apre i mini-Fab «Confronta» e «Personalizza» con etichetta, come gli
  overlay di turnisala/notifiche. La comunicazione col client usa lo schema CustomEvent del
  progetto: `tuoturno-open-confronta` / `tuoturno-open-personalizza`, ascoltati in
  `tuoturno-client.tsx` che apre i rispettivi dialog. I mini-Fab entrano con una pop «molla»
  (`.fab-mini-pop`: overshoot 1.07 con cubic-bezier(.34,1.56,.64,1)); anche il pannello
  mese/anno (`.month-pop`, i keyframe ricompongono la translate(-50%) di centratura).
  Rispettano `prefers-reduced-motion` (nessuna animazione).
  **Selezione nel picker mese/anno (12/09/2026, aggiornata a fine giornata):** colori richiesti
  esplicitamente dall'utente — `#dfe8f2` nel chiaro, `#454545` nello scuro (variabili
  `--picker-sel-bg/-border/-text`); voleva questi, NON le pill P/M/N di turnisala (prima versione).
  Stesse variabili usate dal calendario di turnisala (giorno selezionato, `.cal-panel`).
  **Navigatorazione LIBERA (12/09/2026, seconda iterazione):** il picker de «Il tuo turno» e le
  select del calendario di turnisala coprono TUTTO il millennio (2001–3000) con autoscroll
  all'anno selezionato; turnisala non limita più il calendario (rimossi `fromMonth`/`toMonth` e
  la guardia `navigableMonthsSet` sugli swipe). Il teorico si genera per QUALSIASI mese.
  **BUG FIX reload turnisala (12/09/2026):** in `handleMonthChange` i mesi NON caricati a mano
  si identificano con `availableMonths` (non con la lista finita `theoreticalMonths`, che copre
  solo mese−1..+12): per gli altri il fetch DB tornava null e SOVRASCRIVEVA il teorico generato
  (board vuota sui mesi lontani). Ora i mesi non caricati restano teorici; i caricati fanno
  fallback teorico se il fetch è vuoto. Nel calendario i giorni si disabilitano SOLO se il mese
  è in `availableMonths` (prima ogni mese fuori lista teorica risultava inagibile).
  Verifica: script `scripts/check-remote-theoretical.mjs` genera Febbraio 2025 dai dati veri
  (1327 presenze: M 517 / P 503 / N 307); end-to-end in preview la board 2025 mostra «Turno
  teorico» con le scrivane popolate.
  **BUG FIX `tokenForMember` (12/09/2026):** il periodo è la lunghezza del pattern DEL MEMBRO,
  non `cycle_days` del tipo: dopo il super-ciclo («in terza» 84gg) i membri senza storia PDF
  hanno pattern 28 — indicizzati con 84 producevano idx≥28 → token vuoto → persone SCOMPARSE
  dai mesi teorici lontani (board turnisala vuota su mesi fuori range). Ora ogni pattern cicla
  sulla SUA lunghezza (contratto in `scripts/check-token-member.mjs`).
  Il giorno corrente ha un outline interno `--primary`. Il reale compare SOLO
  per i mesi presenti in `sala_schedule`, gli altri restano teorici (etichetta «turni reali (PDF)» /
  «turni teorici» sotto il mese). La soglia di differenza è `realTheoreticalMismatch` su
  `tokenCompareKey` (turno + sezione; slot T/S e TIR ignorati), quindi «M4 vs M9» è una differenza
  mentre «M4S vs M4T» no. Nuovo `lib/person-shift.ts`:
  `findMemberForUser` + `theoreticalTokenFor` (→ `tokenForMember`) per il teorico, `realShiftFor` sul
  JSON del calendario per il reale, e `personNameMatches` che tollera i nomi del PDF con suffisso del
  nome («ESPOSITO AU.» → Esposito Aurora) — più permissivo di `matchesCognome` per gli omonimi con
  prefisso di 2 lettere. NB: `shift_team_members.user_id` è NULL per TUTTI i membri, quindi il
  collegamento utente↔membro avviene per nome.
- **Caricamento di «Il tuo turno» (11/09/2026):** come le altre pagine della PWA, `app/(app)/tuoturno/
  loading.tsx` (Skeleton: intestazione, nav mese, 7×5 celle da 76px, legenda) copre il primo render.
  In più, dentro la pagina, mentre si scarica il PDF di un mese caricato ma non ancora in memoria
  (`loadingReal`) la griglia mostra celle `Skeleton` invece dei turni — prima ci finivano i TEORICI
  tinti come se fossero reali. In confronto: righe skeleton (2 per dipendente).
- **Confronto fra più dipendenti (11/09/2026):** pulsante «Confronta» (icona `Users`) in alto a destra
  ne «Il tuo turno» — la riga ha `mr-14` per non finire sotto la campanella delle notifiche — che apre
  un dialog a SELEZIONE MULTIPLA (ricerca + checkbox, chip dei selezionati, «Azzera»; max 8 dipendenti)
  e conferma con «Confronta (N)»; con meno di 2 selezioni il pulsante diventa «Chiudi confronto» e
  riporta al calendario singolo. La vista di confronto è una TABELLA (`CompareTable`, stesso file):
  una riga per dipendente, giorni in orizzontale con giorno della settimana e numero, colonna nome
  sticky a sinistra, celle 34×34 tinte con lo stesso linguaggio della variante E (teorico barrato +
  tooltip se diverge — niente più bordo tratteggiato; anello ambra se «da confermare», unico marcatore).
  Il mese viene spezzato in più BLOCCHI contigui con regola ADATTIVA: `splitDays(totalDays, min(4,
  floor((window.innerHeight - 300) / (dipendenti*36 + 26))))`, così con 2-3 dipendenti e schermo alto
  l'intero mese entra in 4 blocchi (8 giorni ciascuno) SENZA scroll orizzontale, mentre con molti
  dipendenti o schermo basso i blocchi si riducono e la tabella scorre in orizzontale. Altezza finestra
  letta con `useSyncExternalStore` (niente setState in effect, nessun mismatch in SSR). In confronto lo
  SWIPE è disattivato (serve lo scroll orizzontale della tabella): si cambia mese con le frecce ‹ ›.
  Attenzione: `shift_team_members.user_id` è NULL per tutti, quindi i turni teorici dei confrontati
  vengono risolti per nome (`findMemberForUser`/`personNameMatches`).
- **Pannello admin compatto (11/09/2026):** le 10 azioni non sono più card orizzontali impilate ma una
  griglia `grid-cols-3` di pulsanti verticali (`PanelButton` in `components/admin/admin-panel.tsx`:
  icona + etichetta breve, descrizione completa come `title`/`aria-label`, badge feedback in alto a
  destra). Le sezioni impostazioni (anno minimo, limite cambio turno) restano invariate.
- **Turni teorici — riorganizzazione squadre + regola sezioni (10/09/2026, migrations 021+022, applicate SOLO a dev):**
  tipologie rinominate «Con notti»→**Squadra in terza**, «Senza notti»→**Squadra in seconda**;
  le due scorte sono ora UN solo gruppo **Scorte** con 6 squadre (Rilievo + Fase +0/+7/+14/+21 +
  Varianti, sort_order 1–6). Nuovo flag `shift_team_members.is_lead` = caposquadra: il nome
  visualizzato della squadra sono SOLO i cognomi dei capisquadra uniti da '-' (es. «D'ELIA-PASSANNANTI»,
  «ALBANO»), senza più le diciture «Squadra A»/«Squadra arancione»; le squadre senza capisquadra
  usano il proprio nome senza il prefisso «Squadra» (es. «Fase +0», «Varianti»). Resta allineato ai membri.
  RIC/ASTER e IAP invariati. In `components/admin/squadre-dialog.tsx`: RIMOSSO l'ordinamento
  manuale dei membri (resta `sort_order` in DB), la matita in Tipologie apre la scheda Membri di
  quella tipologia (niente più modifica di ciclo/pattern_start dalla UI), la stella imposta/rimuove
  il caposquadra.
  **REGOLA SEZIONI (022):** il Rilievo (i 9 non caposquadra) lavora M il **giovedì** e N il **venerdì**
  (rotazione sezioni 4-5-5-6-7-8-9-10-11, max 2 persone/sezione via slot T/S, notti MAI su 8/9/11);
  in quei giorni nessun'altra squadra lavora M/N sulle stesse sezioni → mai collisioni. Le scorte
  semplici (Fasi +0/+7/+14/+21 + Varianti) **NON hanno turni prefissati**: i loro pattern contengono
  solo riposi (RM/RC/RI) e disponibilità (D) — la 022 ha sostituito tutti i token M/P/N con 'D'.
  PRIMA della 022 il teorico aveva 38-44 collisioni/mese (es. 20/11 N7 con BOCCHETTI+GRECO rilievo
  + MINICOZZI+MAROTTA fasi = 4 persone); DOPO **0**. ATTENZIONE: `scripts/generate-seed.mjs` +
  migration 020 generano ancora la vecchia struttura (2 tipologie scorte, nessun is_lead, fasi con
  turni M/P/N): se il seed viene rigenerato va riallineato (021+022 sono idempotenti e lavorano per NOME).
- **Release 26/08/2026 — APPLICATA a dev E produzione:** migrations **014** (drop color_overrides),
  **015** (DCO+), **016** (changelog) e **017** (unifica changelog) applicate al DB di produzione/main
  (`zrbbzfingrdpdflkndgl`) via Management API il 26/08/2026 (su dev erano già applicate). Changelog
  unificato: solo **version 4 (5 voci)** su ENTRAMBI i DB. Merge `dev → master` pushato (`a4ddb69`),
  deploy Vercel produzione avviato. Footer versione: `v1.226 · 6eb0c28 — ultimo aggiornamento: 26/08/2026 13:10`.
  NOTA: il DB main ha l'history migrazioni a timestamp (non riconosce i file numerati 001-017) →
  per le prossime migrazioni su main usare SQL editor / Management API, NON `supabase db push`.
- **Pagina Statistiche rifatta (26/08/2026):** migration **018** (`get_admin_stats`) applicata e
  registrata SOLO su dev (history completa 001-018). Su main va applicata alla prossima release
  (SQL editor / Management API). In dev la pagina è testata con l'admin `d.minino@rfi.it`.
- **Password dev per test (04/08/2026):** per facilitare i test su dev, la password di alcuni
  utenti = email: Luigi Neri, Mariapia Di Napoli, Fortunato Di Monda, Ernesto Gagliotta,
  Nicola Romano, Maurizio Tammaro (es. `lu.neri@rfi.it` / `lu.neri@rfi.it`). Vale SOLO su dev.
  **Admin dev (25/08/2026):** anche `d.minino@rfi.it` (ADMIN_ID) è stato resettato a
  `d.minino@rfi.it` su dev (per test del pannello admin). Su main la password resta quella reale.
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
  clone di main, quindi il pannello admin si può testare anche su dev. Eseguire `supabase link`
  SEMPRE dalla root del progetto (mai da home: il 26/08/2026 da `C:\Users\david` ha creato un
  progetto orfano `C:\Users\david\supabase` collegato a MAIN).
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
