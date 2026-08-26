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
  jsonb) + `changelog_reads` (user_id PK, last_seen_version) — migration 016 (seed v1/v2).
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

- **Bottom nav (25/08/2026):** `components/nav/bottom-nav.tsx`. Struttura a 4 slot + FAB centrale
  (sinistra→destra): (1) **"Cambi"** (icona `ArrowLeftRight` — frecce-scambio) UNICO bottone che
    gestisce /dashboard (cambi turno) e /vacanze (cambi ferie): il tapping alterna tra le due
    pagine e salva l'ultima in `localStorage['cambi-last-page']`; il bottone "Cambi" ha un layout
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
- **Migrations 001–015 completano lo schema** (turni, vacanze, sala, app_settings, RLS,
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

---

## Stato attuale (snapshot 04/08/2026)

- **⚠ AZIONE PENDENTE:** migration **014** (drop color_overrides) e **015** (DCO+) applicate
  SOLO al DB dev (`uokfixddsuqcjddbfkln`). Al MERGE su `master` vanno applicate ANCHE al DB di
  produzione/main (`zrbbzfingrdpdflkndgl`): `supabase db push` con progetto main linkato, o SQL equivalente.
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
