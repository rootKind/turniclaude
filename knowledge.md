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
public/         sw.js (solo push + click); il manifest è una ROUTE: app/manifest.ts → /manifest.webmanifest
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
- **vacation_assignments è WRITE-only-via-service-role (migration 011):** il dialog «Modifica utente» faceva l'upsert del periodo ferie base dal CLIENT → RLS lo rifiutava sempre e il catch generico mostrava «Errore aggiornamento utente» anche se i flag erano stati salvati. Fix (14/09/2026): l'upsert è passato a `POST /api/admin/update-user` (service role, campo `basePeriod`); nel dialog non fare MAI write diretti su tabelle protette da RLS — passa dalla route admin.
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
  a sfondo BIANCO `#ffffff` cotto. Bump `CACHE_NAME` in `sw.js` a ogni cambio icone/manifest (cache-first).
- **PWA «Turni DEV» (13/09/2026):** il manifest NON è più un file statico ma la route
  `app/manifest.ts` servita a `/manifest.webmanifest` (`public/manifest.json` rimosso):
  a BUILD time `VERCEL_GIT_COMMIT_REF === 'master'` → «Turni Sala C.C.C.» + icone originali;
  qualsiasi altro branch (e il dev locale, dove la env non esiste) → «Turni DEV» + icone
  `icon-192/512-dev.png` e `apple-icon-dev.png` con banda gialla/nera «lavori in corso» generata
  da `scripts/make-dev-icons.mjs` (codec PNG a mano, self-check dei pixel; rilanciare se cambia
  il logo). Stessa env-check in `app/layout.tsx` per title/appleWebApp/favicon. sw.js → v5
  (cachato `/manifest.webmanifest` invece di `/manifest.json`). Nota: l'install PWA legge il
  manifest della DEPLOY corrente — la live installata resta «Turni Sala» finché non si reinstalla
  da una deploy non-master.
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
- **Vista admin «Teorico ≠ reale» in /turnisala (15/09/2026):** mini-Fab (long-press FAB,
  icona `GitCompareArrows`, SOLO admin — il menu manager NON ce l'ha) che emette
  `sala-admin-theodiff`; DeskBoard toggle `showTheoDiff`. MOTORE: `theoRealDiffsForDay`
  in `lib/turni-teorici.ts` — per giorno/mese confronta i token SEZIONATI dell'albero
  (`M4`…, via tokenForMember) con la posizione reale nel PDF (day schedule ricostruito):
  diff se sezione/turno diversi, presente in altriPresenti (etichetta «presente») o assente
  dal PDF («—»); teorici NON sezionati (riposi, M nudi) non producono diff. L'output è  raggruppato per SEZIONE PREVISTA (parser condiviso `parseShiftCode`: **qualsiasi turno
  con sezione produce diff — digit M4/M9, con slot M6S/M6T e ALFABETICHE MDCIF/NDCP/MM3M40;
  fino al 17/09/2026 il regex `^(M|P|N)\d+$` scartava i token con slot/alfabetici e gli
  assenti previsti lì non apparivano MAI). **REWRITE COMPATTO (17/09/2026, `theoRealSectionCompare`):**
  le due API precedenti (`theoRealDiffsForDay` + `theoRealAnnotationsForDay`, strisce «≠»/«←»)
  sono state RIMOSE — troppo larghe per lo schermo stretto, criterio frecce/uguale poco chiaro.
  UNA funzione per giorno ritorna `Map<section|shift, {rows, extras, theoreticalOnly}>`:
  **rows** = una per membro teorico NON confermato → «Cognome <reale>» SOLO (dal
  18/09/2026 il teorico NON si riscrive: la card che contiene la riga mostra già
  sezione+turno previsti) dove
  <reale> è il codice PDF COM'È (assenza/riposo: A, AG7, F.E., D…), «assente» se senza
  traccia, «presente» se senza sezione, oppure turno+sezione alternativi (es. «N6»);
  teorico CONFERMATO (stesso turno+sezione, slot irrilevante) = NESSUNA riga (già nelle card).
  **extras** = persone REALI in sezione che il teorico non prevedeva lì → «Cognome da RC»
  / «da M4S» / solo nome se non in scheda (blocco «Nuovi», provenienza dei reali).
  I codici di assenza arrivano dal mese v2 (`SalaSchedule.data` → decodeSalaMonth,
  giorno `day-1`): il day-schedule li perde — da 18/09/2026 il codice v2 è letto
  ANCHE per gli assenti (prima chi non aveva posizione nella giornata mostrava il
  generico «assente» anche con A/AG7/F.E. nella cella; la mappa `realCodes` è
  ora indicizzata per nome esatto OLTRE che per cognome, vedi `normName`).
  **OMONIMI (DI NAPOLI M./A.):** match ESATTO
  su nome normalizzato quando il PDF distingue le iniziali, fallback cognome; le posizioni
  reali vengono «consumate» dai teorici confermati prima di scegliere quella da mostrare
  (Set `claimed`) — senza questo il secondo omonimo generava righe/extras sbagliate.
  **MATCHING per CHIAVE COGNOME:** `surnameKey` (esportata, riusabile) toglie l'ultimo token SOLO se è un'iniziale
  (`/^[a-z]\.?$/`): «DI NAPOLI M.» → «di napoli», «DE GIOVANNI» resta intero. MAI
  `split(' ')[0]`: collassava tutte le persone DI*/DE* sulla chiave «di»/«de» e matchava la
  persona sbagliata. Diff con sezione senza card a schermo (es. PRIC/NDCP/P11) NON sono visibili: se serve coprirle,
  aggiungere una card nel layout con sectionKey corrispondente. ATTIVABILE SOLO su mesi caricati da PDF (source !==
  'theoretical'). **ATTENZIONE RLS:** fetchShiftTeamTree dal CLIENT può tornare 0 righe
  anche autenticati (policy «to authenticated» + sessione browser) — la pagina server
  (`turnisala/page.tsx`) passa ora `initialShiftTree` a SalaPageClient (stato iniziale,
  refetch client solo fallback). NON ripristinare il solo fetch client.
  Il pattern «niente auto-spegnimento» della modalità: il ricalcolo è useMemo su
  giorno/turno/mese; un reset sui cambi di contesto LA SPEGNEVA mentre l'admin navigava.
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
  - **Badge notifiche (17/09/2026):** componente condiviso `components/ui/notification-badge.tsx`
  (`NotificationBadge`, usato da bottom-nav `NavItem`, campanella, pannello admin). Stile = tasto
  Esci (fill `destructive/10` scuro `/20`, bordo `destructive/40`, testo rosso) MA a DUE strati:
  esterno opaco del colore della superficie (`bg-background` o `bg-card` con `surface="card"`,
  stesso radius pieno) + badge vero sopra. IL FILL TRASLUCIDO ALONE lascia trasparire le linee
  dell'icona sotto: NON tornare al badge singolo translucido — se un badge poggia su una nuova
  superficie, aggiungere la variante surface opportuna (o passare bg esplicito) per mantenere il
  «taglio» della sovrapposizione.
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
- **ALTEZZA pagina = min-height, MAI height fissa (fix 15/09/2026):** /turniferie aveva
  `height: calc(100dvh - 4rem)` sul main: su schermi bassi (o elenchi ricchi) i figli flex si
  COMPRAIMEVANO nel riquadro e il resto restava sotto la bottom nav SENZA scroll (la pagina
  non cresceva oltre il viewport). Ora `minHeight` — la pagina si allunga col contenuto e lo
  scroll verticale torna naturale; a viewport alti il risultato è identico. NON reintrodurre
  height fissi sulle pagine (l'unico modo legittimo di vincolare l'altezza è su un contenitore
  con `overflow-y: auto` INTERNO esplicito). Test: `tests/pages.spec.ts` (scroll a viewport 300px).

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
    /dashboard, Nuova richiesta ferie su /vacanze); (4) **"Turni Sala e Ferie"** (dal 14/09/2026,
    prima solo "Turni"; doppia icona
    `Calendar`+`Palmtree`) che alterna /turnisala↔/turniferie; (5) **Impostazioni**. Le icone
    sono volutamente DISTINTE: Cambi=frecce, Il tuo turno=calendario singolo, Turni Sala e
    Ferie=calendario+palm. L'etichetta più lunga della barra resta dentro lo slot a 320px
    (verifica in `tests/pages.spec.ts`, nessun overflow né scroll del nav).
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
  richieste.  Logica pura in `lib/queries/shift-cleanup.ts` (`findFulfilledShiftRequests`), che mappa
  i cognomi del PDF agli utenti con `matchesCognome` — estratto in `lib/utils.ts` e condiviso con
  `desk-board.tsx` (omonimi via `buildDuplicateCognomi`). Le richieste non esaudite non vengono toccate.
  **BUG fix 13/09/2026:** `computeShiftCleanup` e `loadShiftLookupContext` leggevano la colonna
  `sala_schedule.schedule` RAW (formato compatto v2 {v,days,rows,codes,names}) senza decodificarla,
  quindi `schedule[day]` era sempre undefined e il bottone admin non trovava MAI candidati
  (funzionava solo nell'upload, dove la schedule arriva già espansa dal parser). Fix: helper
  `decodeScheduleRow` che passa da `isSalaMonthData`/`buildScheduleFromMonthData`. Test E2E su dev:
  richiesta soddisfatta trovata da GET e cancellata da POST, richiesta non esaudita risparmiata.
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
 - **Tabella di CONFRONTO de «Il tuo turno» (12/09/2026):** celle 44px di ALTEZZA, larghezza FLESSIBLE (`flex-1 basis-[34px] min-w-0`): i blocchi riempiono tutta la larghezza pagina. **SOLO turni REALI** (richiesta 12/09/2026: meno info, più chiarezza e spazio): il teorico NON si mostra più nel confronto (niente split/strike lì — le card split restano solo nella griglia personale); fallback: se la riga persona NON ha turni reali nel mese (o il mese è teorico) si mostrano i TEORICI (caption «turni teorici»). Chunking ADATTIVO: il numero di blocchi lo dettano larghezza E ALTEZZA reali — chrome MISURATO nel DOM (ref sulla nav mese + bottom nav via rAF, niente setState sincrono in effect; `CMP_CHROME_FALLBACK` 300 solo pre-misura) e NIENTE cap fisso a 4 blocchi: su schermi lunghi il mese si espande in vertica (settembre 2026, 2 persone, 756px → 4 blocchi 9/9/9/7 giorni, zero scroll né verticale né orizzontale). Min 5 giorni/colonna (sotto, MDCIF non ci sta).
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
  (touch, soglia 50px; le frecce ‹ › fanno lo stesso) e legenda. Dal 13/09/2026 lo swipe è su
  TUTTA la pagina (listener su document, come turnisala): funziona anche in modalità confronto;
  ignorato se il gesto parte da `.month-pop`, da un dialog `[role="dialog"]` o dal wrapper radix,
  o se è verticale/di meno di 50px. **NIENTE swipe-back dal confronto (17/09/2026, rimozione del
  15/09):** swipe destra in confronto cambia mese come ovunque; per USCIRE dal confronto si usa
  la NAVBAR: 1) tap su «Il tuo turno» (già così), 2) mini-Fab Azioni turno dove la voce
  «Confronta» diventa «Tuo turno» (icona calendario) mentre il confronto è attivo → evento
  `tuoturno-exit-compare` → setCompareIds([]). Lo stato compareId→navbar passa via evento
  `tuoturno-compare-state` + flag `window.__tuoturnoCompareActive` (snapshot primitivo letto con
  useSyncExternalStore in bottom-nav — stessa ricetta di nav-lastpage). **Headerr di gruppo
  «Noni» nel picker Confronta (17/09/2026):** la sezione noni di `buildCompareGroups` (compare-groups.ts)
  deve avere label='Noni' (con le sezioni per squadra era '' e la lista restava senza titolo).
  Celle «variante E» (min-h 76px): la card
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
  **FIX tratteggio su card SPLIT (15/09/2026):** la regola dashed `[data-pending-ring$='-dashed']
  .cell-day.is-pend` con `border-width: 2px` si applicava ANCHE alle card split (che hanno
  `border-width: 0` e si affidano alle metà per il contorno): ridisegnava un bordo doppio
  (card + metà) E riaccendeva la MEZZERIA (il `border-width: 0` della card è ciò che azzera la
  linea di taglio fra le due metà) — bordo tratteggiato doppio con riga in mezzo, visto su
  /tuoturno.  Fix: la regola dashed vale solo su `.cell-day.is-pend:not(.cell-split)`; le metà
  prendono `border-style: dashed` e la card split spegne anche il box-shadow solido (si vedeva nelle crepe
  del dashed). Mockup: `mockups/confronta-dashed-e-due-righe.html`.
  **SPESSORE tratteggio UNIFORME (15/09/2026):** le metà erano rimaste a 1.5px (l'ereditata
  dalla regola is-pend solida) mentre le card intere passano a 2px → tratteggio più gracile
  sulla variante divisa (richiesta utente). Ora anche le metà prendono `border-width: 2px`
  nella regola dashed, e i TAGLI tornano a 0 con regole di specificità PARI messe DOPO
  (`.cell-half-theo { border-bottom-width: 0 }` e `.cell-half:last-child { border-top-width: 0 }`):
  dare 2px a tutti e 4 i lati con specificità più alta delle regole di azzero riaccendeva la
  mezzeria. Test: `tests/pages.spec.ts` (verifica computed style 2px + taglio 0px sul vivo).
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
  Varianti [dal 14/09/2026, migration 028, rinominata **Maternità**], sort_order 1–6). Nuovo flag `shift_team_members.is_lead` = caposquadra: il nome
  visualizzato della squadra sono SOLO i cognomi dei capisquadra uniti da '-' (es. «D'ELIA-PASSANNANTI»,
  «ALBANO»), senza più le diciture «Squadra A»/«Squadra arancione»; le squadre senza capisquadra
  usano il proprio nome senza il prefisso «Squadra» (es. «Fase +0», «Varianti» [oggi «Maternità»]). Resta allineato ai membri.
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
- **Confronta (14/09/2026):** nomi su DUE righe (cognome+nome, colonna sticky 76px `bg-background` con `pl-3` DENTRO la cella — il contenitore `.cmp-table` NON ha padding sinistro, solo `pr-3`, così le celle in scorrimento non sfilano a vista a sinistra dei nomi). Larghezza minima UNIFORME celle = `compareCellWidth`: le card non si comprimono mai sotto (`minWidth` inline, anche su `ShiftDayCard` via prop `style`); i blocchi (`compareChunks.maxByWidth`) tengono conto della larghezza reale. Equità: la larghezza è la stessa per TUTTE le righe. **Cornice is-pend SEMPRE in primo piano:** `.cell-day.is-pend` ha `position: relative; z-index: 1` — nella tabella di confronto le celle si toccano e la card adiacente dipingeva lo sfondo SOPRA il lato destro della cornice (visto in preview 14/09). **Tratteggio VERO:** con `data-pending-ring='*-dashed'` la cornice È il bordo dashed (2px, `box-shadow: none`) — prima il box-shadow solido `0 0 0 1px` restava fuori dal dashed e il tratteggio sembrava un bordo interno. **(AGGIORNAMENTO 15/09/2026)**: chip data RIMOSSO dalle card del confronto — i giorni stanno SOLO nelle teste di colonna; la card 44px riempie su DUE righe, turno (P/M/N, 13px extrabold) sopra e sezione (4/5/6/DCIF…, `.cmp-sec` 8.5px) sotto (`shiftRowParts` in tuoturno-client; codici senza sezione — SPCA, riposi, assenze — restano centrati su una riga). **`compareCellWidth` misura CANVAS, non caratteri:** la stima px/char troncava («TUTOR» a 11px bold = ~36px, 7.2px/char, contro «DCIF» a 8.5px = ~19px, 4.7px/char — verificato a 320px con `mockups/confronta-320px.html`, script che misur scrollWidth dei render reali); ora `cmpTextWidth` usa `measureText` con i font veri delle due righe (turno 13px/800, sezione 8.5px/700, codice unico 11px/700) + chrome card 7px (padding 2×2 + bordi 1×2 + 1 sub-pixel). Verifica finale: zero truncate a 320px sul peggior caso (TUTOR, DCIF, SPCA, Trasf, F.E., M10, M11). Regola dashed `:not(.cell-split)` — vedi sotto.
- **Confronta: gruppi per squadra, Semplici A-D, IAP rimosso (13/09/2026, migrations 026+027 su dev):**
  il selettore «Confronta» di /tuoturno non elenca più tutti i nomi dei PDF in ordine alfabetico:
  (1) `users.show_in_compare` (bool, default true) — l'admin nasconde chi non ha l'account con lo
  switch «Visibile nel Confronta» nel Modifica utente o nell'editor di massa (pulsante «Confronta»
  del pannello admin: checklist unica con ricerca, contatore e salvataggio immediato a batch via
  PATCH `/api/admin/users`). (2) La lista ha DUE GRUPPI — «Noni» (is_secondary) e «DCO» — e il
  gruppo DCO ha UNA SEZIONE PER SQUADRA dei turni teorici, nell'ordine: in terza
  (D'ELIA-PASSANNANTI, DI MONDA-ROMANO N., ARMENANTE-DI MONACO, COPPETA-LONI G., ALBANO, DI MEO,
  LANGIONE) → in seconda → Rilievo (SENATORE-BARRA + mini-squadre A/B/C/D) → Semplici A/B/C/D →
  Maternità (ex Varianti) → RIC/ASTER → «Senza squadra» (senza account nei turni teorici). Stessa struttura
  nell'editor di massa. Il match utente↔membro usa la STESSA regola dei PDF (cognome, o
  «COGNOME Iniz.» per gli omonimi) in `lib/compare-groups.ts` (`buildCompareGroups`).
  BUG FIX (18/09/2026): `buildCompareGroups` filtra `show_in_compare === false` — l'editor di
  massa che lo chiamava SECCO vedeva sparire l'utente appena disattivato (impossibile
  riaccenderlo). Ora accetta `{ includeHidden: true }`: l'editor di massa passa TUTTI gli
  utenti (lo switch vive sulla riga), il selettore di /tuoturno resta filtrato.
  (3) Migration 027: squadre scorte semplici rinominate «Squadra fase +N» → **«Semplici A/B/C/D»**
  (rinominati anche i template builtin 025 «Fase +N» → «Semplici X»), e la tipologia **IAP è
  ELIMINATA** (i dipendenti IAP attivi non hanno accesso all'app; i codici IAP nei PDF storici
  restano interpretati correttamente da sala-month/shift-tokens — si rimuove solo la struttura
  teorica). L'utente aveva chiesto anche di togliere la dicitura IAP dai gruppi del confronto:
  risolto rimuovendo la tipologia alla fonte.
- **Catalogo cicli pronti (13/09/2026, migration 025 su dev):** tabella `shift_cycle_templates`
  (shift_type_id, team_id opzionale, name, description, pattern, cycle_days, pattern_start,
  is_builtin, unique(shift_type_id,name), RLS convenzione 019). Seed: 81 template GENERATI dai
  pattern attuali (scripts/gen-cycle-templates.mjs → output incollato nella migration; nome =
  etichetta squadra, capisquadra uniti da '-', con suffisso «· Cognome» se la squadra ha pattern
  distinti — tipico delle squadre con capi numerati). API: GET `/api/admin/shift-teams` ritorna
  `{templates}`; POST/DELETE con `kind:'template'` (la lunghezza del pattern è validata contro
  cycle_days della tipologia). UI (squadre-dialog): `CyclePicker` nel form nuovo membro e nella
  matita di modifica — raggruppa «Di questa squadra» / «Validi per tutta la tipologia» / «Altre
  squadre», anteprima token (riposo/disp grigi, lavoro in tinta), badge se la lunghezza ≠ ciclo,
  e campo «Salva questo ciclo come…» per memorizzare pattern nuovi (es. subentro) riutilizzabili.
  Clic su un template compila il pattern dell'editor. Verificato live end-to-end (creazione
  membro con pattern da template, salvataggio nuovo ciclo, pulizia righe di test).
- **Mini-squadre scorte + pattern di consenso (13/09/2026, migration 024 su dev):** verificando i
  cicli dai PDF (anchoring 28gg su pattern_start 2026-03-01) emerso che: (1) il Rilievo è diviso in
  MINI-SQUADRE con riposi sfalzati — ora la gestione squadre li separa in Rilievo A/B/C/D
  (phase_offset_days 0/7/14/21, sort_order 10–13): A=BOCCHETTI+COCOZZA+DE GIOVANNI, B=CENTOMANI+CORBI,
  C=GRECO+MUCCI, D=LONI A.+NEVANO; SENATORE e BARRA (capisquadra, cicli GENUINAMENTE diversi tra loro)
  restano in «Squadra rilievo». (2) I pattern delle FASI in DB erano SCAMBIATI tra membri (BORRELLI
  aveva il pattern di PRINCIPE ecc.): ricalcolati col CONSENSO dei PDF per posizione del ciclo 28gg
  (riposo se >=50% e >=4 occorrenze, altrimenti 'D') — ora tutti i membri di ogni fase condividono
  lo stesso pattern e il teorico di ottobre è coerente DENTRO ogni mini-squadra (verificato:
  script `scripts/verify-scorte-fix.mjs` backtesta i riposi teorici vs reali per ogni mese PDF e
  controlla la coerenza intra-squadra; `scripts/scorte-member-agreement.mjs` mostra il ciclo
  individuale per membro — residui di 1-3 gg per mese sono scambi/disponibilità reali, non errori
  di ciclo). Il generatore (`tokenForMember` in `lib/turni-teorici.ts`) indicizza il pattern del
  MEMBRO sulla sua lunghezza da pattern_start+adjustments: `phase_offset_days` delle squadre NON è
  usato alla generazione (solo informativo/gestione) — l'allineamento passa dall'identità dei pattern.
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
- **Filtro notifiche «solo se posso coprirlo» (12/09/2026, migration 023 APPLICATA a dev):**
  `users.notify_shift_filter` (default false = riceve tutto). Se attivo, `/api/push/notify` type
  `new_shift` notifica l'utente SOLO se il SUO turno del giorno offerto (REALE dal PDF del mese;
  in mancanza TEORICO dalle squadre DB via `getUserShiftOnDate` in `lib/shift-compat.ts`) è fra
  i `requested_shifts` della richiesta. La stessa lib serve `GET /api/shift-compat?date=&requested=`
  per la verifica PRE-pubblicazione in `shift-dialog.tsx`: se il mio turno non copre nessuno dei
  turni cercati → popup di conferma (amber, «Richiesta non coperta dal tuo turno» con il turno
  trovato e la sua fonte) con «Ho capito, correggo» / «Pubblica comunque». La verifica gira SOLO
  per pubblicazioni normali (non impersonate). Su PRODUCTION la 023 va ancora applicata (SQL
  editor/Management API, come da nota release).
- **Sigle turno nel datepicker della nuova richiesta cambio (13/09/2026):** il `Calendar`
  (`components/ui/calendar.tsx`) accetta il prop opzionale `dayInfo?: (date) => { code, cssClass }`:
  se presente, sopra la cifra di ogni giorno compare una mini-pillola M/P/N (`shiftCodePill`
  in `lib/sala-month.ts`, classi `.pill-*` già esistenti → stesse tinte delle pillole sala).
  Le attività senza sezione (SPCA/RIC/TUTOR: presenti senza turno da 8 ore, non oggetto di
  cambi) rendono la sigla «G» con `.pill-g` = tinta verde `--cell-duty-*` delle card duty
  (sigla rinominata da «U» a «G» il 18/09/2026 su richiesta dell'utente, classe pure)
  de «Il tuo turno». RIClassificazione (13/09/2026, su segnalazione dell'utente): M/N/P
  «nudi» senza sezione (SPAGNULO), le varianti a maiuscole miste del PDF (Mric, Miap,
  piaptir…) e AG7 NON sono più U — i primi due gruppi sono turni veri e propri (`isShiftWorkCode`
  in `lib/shift-tokens.ts`, usato da `salaCodeInfo`, `isWorkToken` di person-shift/person-cycle
  e dal path turnisala: presence senza sezione per i nudi, sezioni normalizzate uppercase
  in `parseShiftCode` così MRIC/Mric si fondono), AG7 è assenza (ABSENCE_LABELS). «Na» e
  NDis* restano turno N (comportamento preesistente), Sp*/ISp*/Dis*/G/TUTOR/12.14 restano U. Il dialog (`components/shifts/shift-dialog.tsx`) la alimenta a dialog
  aperto: riga REALE della persona per i mesi PDF (`getSalaSchedule` + `findMonthPerson`),
  TEORICO dalle squadre DB per i mesi senza PDF (`theoreticalTokenFor`, chiavi ISO sulla
  mappa `dayShiftCodes`). ATTENZIONE:
  il children JSX in `CalendarDayButton` SOSTITUISCE i children di react-day-picker (la cifra!) —
  vanno riusati esplicitamente (`{children}`); gli stili `.cal-day-shift`/`.cal-has-shift` stanno
  FUORI dai layer CSS perché la utilities `[&>span]:text-xs [&>span]:opacity-70` del bottone
  batterebbe. Desk-board (turnisala) non passa `dayInfo` → picker invariato.
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
- **Smoke test Playwright (13/09/2026):** `npx playwright test` (`tests/confronto-no-clipping.spec.ts`,
  config `playwright.config.ts`): NESSUN testo di card troncato e NESSUNA scroll orizzontale nel
  Confronto di /tuoturno, a 320px e 390px. Tre bersagli: i due mockup (`mockups/confronta-320px.html`,
  `confronta-dashed-e-due-righe.html` — statici via `file://`, la rete di regressione vera) e l'APP
  REALE su localhost:3000 (dev server già attivo, vedi `.freebuff/run.md`). «Troncato» =
  `scrollWidth > clientWidth` su una riga truncata. AUTH del test «app reale»: `tests/.auth-state.json`
  (git-ignored) iniettato come storageState — si genera con credenziali E2E_EMAIL/E2E_PASSWORD
  (progetto «auth», login dal form) oppure esportando la sessione dal browser e passando da
  `scripts/make-auth-state.mjs`; il cookie va riscritto NEL FORMATO `@supabase/ssr`:
  `sb-<ref>-auth-token` = `base64-` + base64url del JSON di sessione (nome sbagliato o JSON nudo →
  il client Supabase lo ignora e il test salta). Serve ANCHE il bypass PWA: il test naviga a
  `/tuoturno?dev=rootkind-dev-2026` (lo storageState lo pre-carica in localStorage). Senza sessione
  valida il test «app reale» si AUTOSALTA: NON è un fallimento (le exp Supabase scendono ~1h).
  ATTENZIONE ai locator nel dialog Confronta: i bottoni-persone si prendono con filtro
  `\S+ \S+` (nome+cognome) — un filtro generico «bottone con testo» becca anche i footer
  «Azzera»/«Scegli almeno 2» e la selezione non parte.

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

---

## Omonimi e bare-owner matching (caso NEVANO, 14/09/2026)

- **Dati:** Pietro Nevano è nelle scorte di rilievo, Giuseppe (omonimo, DCO) è «Senza squadra».
  Il membro di Rilievo D è rinominato `NEVANO P.` e LEGATO a Pietro con `shift_team_members.user_id`
  (il binding via id ha priorità in `findMemberForUser`). Nei PDF il cognome di solito è BARE
  («NEVANO» senza iniziale); quando compaiono entrambi il PDF distingue con l'iniziale.
- **Regola bare-owner** (`lib/shift-teams-matching.ts`): per un cognome OMONIMO fra gli utenti
  (`duplicateCognomi`) con un membro LEGATO via user_id, la riga PDF con il SOLO cognome appartiene
  SOLO al legato («NEVANO» → Pietro); gli altri omonimi matchano solo con l'iniziale («NEVANO G.» →
  Giuseppe). `buildBareOwners(tree, duplicateCognomi)` costruisce la mappa; il parametro è opzionale
  ovunque — senza mappa comportamento precedente. Consumatori: `matchesCognome`, `personNameMatches`,
  `findMonthPerson`, `realShiftFor`, `theoreticalTokenFor`, `theoRealSectionCompare` (+`theoByCognome`
  risolve la collisione assegnando la sigla al legato).
- **Iniziali in UI:** dove appare il solo cognome (card sala, «Altri presenti», righe teorico≠reale,
  chip del selettore Confronta) gli omonimi mostrano l'iniziale («Nevano P.» / «Nevano G.») via
  `formatDisplayName`/`lookupNameDisplay` con la mappa a TRE forme di desk-board («cognome nome»,
  bare per il SOLO proprietario, «cognome p.»).
- **Test:** `node scripts/check-nevano-matching.mjs` (contratto completo: bare→Pietro, iniziale→Giuseppe,
  mese/giorno/confronto, display). Script DB di verifica: `scripts/check-nevano-state.mjs`,
  `scripts/check-nevano-bindings.mjs` (convenzione REST fetch di `apply-super-cycle.mjs`, NON pg).
- **UI admin (14/09/2026):** nel dialog «Squadre e turni» → Membri, ogni membro in modifica ha
  `MemberBindingRow` (components/admin/team-member-binding.tsx): select del legame `user_id`
  (utenti già legati altrove disabilitati; guardia anti-doppio-legame anche in API PUT/POST
  shift-teams) e, se il cognome è omonimo fra gli utenti, suggerimento di rinomina con iniziale
  («NEVANO» → «NEVANO P.») con conferma. `buildBareOwners` ora propaga davvero `userId`.
  Audit superficie: unici residui bare-surname erano l'etichetta tirocinante in desk-card
  (ora via nameDisplay) — tutto il resto usa cognome+nome o è già mappato.
- **Debug notifiche (14/09/2026):** il pannello admin ha «Invia Notifiche» (broadcast a tutti,
  POST /api/admin/notifications audience 'all') e «Debug notifiche»
  (components/admin/notification-debug-dialog.tsx, sostituisce notification-test-dialog):
  - **Messaggi:** registry di TUTTI i testi push in lib/notification-templates.ts (chiave
    stabile, source, contesto); override salvati in app_settings.notif_template_overrides
    (migration 029) con «Ripristina default» per messaggio o globale.
  - **Variabili:** {nome} {cognome} {nome_attore} {cognome_attore} {turno} {turno_cercati}
    {data} {periodo} {periodo_cercati} {anno} — renderNotifTemplate sostituisce dal contesto,
    le mancanti restano letterali (debug-friendly). Nei flussi reali: buildTemplateVars dal
    profilo destinatario + attore/turno/data del route (convenzione «Cognome Nome» → primo
    token = cognome_attore).
  - **Invio di prova:** globale / gruppo DCO / Noni / selezione utenti, contesto variabile
    facoltativo, report per destinatario (delivered / nessun dispositivo / errore) con testo
    effettivo inviato. Bypassa le preferenze: l'admin decide esplicitamente.
  - **Dispositivi:** conteggio subscription push per utente + rimozione (DELETE
    /api/admin/notifications?userId=) per iscrizioni stale.
  - Da collegare (futuro): i route di push (notify, manager, cleanup, chains) leggono gli
    override con fetchNotifOverrides e sostituiscono i testi hardcoded.
- **Override attivi nei flussi reali (14/09/2026):** TUTTI i route di push ora leggono gli
  override admin e sostituiscono le variabili automaticamente:
  - `loadNotifOverrides()` + `messageFor()` (lib/push/send-with-template.ts): override →
    default → rendering con `renderFlowTemplate` (variabili non risolte RIMOSE con pulizia
    spazi, a differenza del pannello che le mostra). `pushTemplateToUser(s)` per invii con
    nome/cognome del destinatario nel contesto.
  - Flussi riconnessi: app/api/push/notify (new_shift con caduta senza-data, interest con
    caduta senza-dettagli, vacation_interest, new_vacation), manager shift-requests
    (pending/approve creator+winner/others/reject con {motivo}), admin shift-cleanup
    (cleanup.done con {dettaglio}+{extra}, partner, gone), vacanze join-chain e check-chains.
  - Nuove variabili registry: {motivo}, {turno_effettivo}, {dettaglio}, {extra}.
  - **Migration 029 APPLICATA al progetto dev (turniclaude-dev)** via `supabase db query
    --linked`; persistenza verificata con scripts/check-notif-overrides-persist.mjs
    (PATCH → read-back → reset). apply-migration-029.mjs automatizza il controllo.
- **Selettore utente /tuoturno = menu Confronta (19/09/2026):** «Turni di chi?» riusa la STESSA
  struttura del selettore multipto di confronto (compareVisibleGroups → buildCompareGroups):
  gruppi Noni/DCO, sezione per squadra dei turni teorici (terza → seconda → rilievo → semplici
  → varianti → altre) + «Senza squadra» ordinata per cognome. Vale quindi anche lì il filtro
  admin show_in_compare (nascosti assenti da ENTRAMBI i menu; l'utente corrente nascosto resta
  selezionabile come «tu» perché lo switch del confronto lo include comunque). filteredUsers
  (lista piatta alfabetica) eliminata.
- **Upload PDF multiplo /turnisala (19/09/2026):** il FAB admin accetta N PDF (input `multiple`).
  Flusso: input → POST /api/admin/detect-pdf-month (solo LETTURA testo con pdf-parse, niente
  parse completo) → dialog di RIEPILOGO con per ogni file: nome, mese/anno rilevati
  (lib/pdf-month-detect.ts: forme «Settembre 2026», «2026-09», «09/2026»; punteggi cumulati
  fra pagine; parimerito → null = scelta manuale), etichette «duplicato»/«bassa confidenza»/
  «mese già presente: sarà sovrascritto», menù mese/anno di correzione → bottone «Conferma e
  carica (N)» → onUploadBatch esegue in sequenza, salta sul primo mese caricato, mette in coda
  i popup di pulizia cambi uno per mese. Il vecchio prop onUpload è sostituito da
  onUploadBatch (il singolo file è il caso N=1). Falsi positivi cognomi (MARZANO, MAGGIO)
  evitati con match a forma esatta + confini di parola e segnale debole senza anno.
  Test: scripts/check-pdf-month-detect.mjs.

- **Cache-first /turnisala (20/09/2026)**: la board apre ogni mese caricato da IndexedDB
  («turni-sala-cache», store months, chiave cache:{userId}:sala-{month} — scoping per utente
  come lib/cache.ts) e riconvalida in background: a caldo ZERO download bloccanti, a freddo
  una chiamata. lib/sala-schedule-cache.ts: read/write/delete/prune (eviction: tiene i mesi
  uploaded + finestra teorica mese−1..+12, max 24) /wipe (invocato da clearAllLocalData su
  logout). Realtime su sala_schedule (migration 030, publication supabase_realtime): chi è
  sulla pagina vede pubblicazioni/cancellazioni al volo — payload jsonb GREZZO = forma
  compatta v2 → espanso con isSalaMonthData + buildScheduleFromMonthData PRIMA di setState
  e cache write; DELETE → deleteCachedSchedule + rigenerazione teorica. handleMonthChange:
  cache read → render → fetch → (race guard currentMonthRef) → cache write. I mesi teorici
  NON vanno in cache (generati dal tree, zero rete). localStorage evitato per gli snapshot
  (tetto ~5 MB per origine condiviso con auth/preferenze); IndexedDB è async e capiente.
  Test: scripts/check-sala-schedule-cache.mjs (fake IDB in-memory con eventi async realistici).

- **Cache-first fase 2 — anagrafiche + /tuoturno (20/09/2026)**: estensione del pattern a
  utenti/albero squadre. lib/query-idb-cache.ts persiste su IndexedDB («turni-query-cache»)
  SOLO le query whitelisted (prefissi ['users',…], ['shift-team-tree']): il QueryProvider
  le ripristina all'avvio con il LORO dataUpdatedAt (setQueryData options.updatedAt) e
  riscrive ogni fetch riuscita via queryCache.subscribe. hooks/use-users.ts: staleTime 6 ORE
  su tutti gli hook anagrafici + nuovo useShiftTeamTreeData (albero lato client, prima solo
  SSR/one-shot). hooks/use-realtime-invalidation.ts (montato da components/providers/
  realtime-invalidation.tsx nel layout app): UN canale supabase invalida ['users'] /
  ['shift-team-tree'] su eventi delle 5 tabelle (+ evizione IDB con removeQueryCacheByPrefix,
  cursor range JSON-prefix). Migration 031: users, shift_types/teams/members/adjustments in
  supabase_realtime. /tuoturno: i mesi PDF ora leggono readCachedSchedule PRIMA del fetch
  (stesso schema /turnisala; la copia si sana a ogni switch mese, realtime non necessario).
  /turnisala: l'albero squadre usa useShiftTeamTreeData → si aggiorna live quando l'admin
  modifica le squadre (prima: fetch once al mount, mai più). clearAllLocalData wipe anche
  turni-query-cache. NB le tabelle whitelisted sono IDENTICHE per tutti gli utenti (nessun
  namespacing utente necessario); il wipe al logout copre comunque il cambio account.
  Admin dialog che EDITANO squadre/utenti (squadre-dialog, shift-dialog, compare-visibility)
  tengono il loro refetch-on-open volutamente fresco. Test: scripts/check-query-idb-cache.mjs.

- **Misurazione A/B cache-first (20/09/2026)**: BEFORE=13a3bee vs AFTER=cbf2e7d, due server dev
  in parallelo (BEFORE su :3100 in worktree temporaneo, pnpm install via `npx pnpm@10`; package.json
  identici), Playwright headless con tests/.auth-state.json → scripts/measure-cache-first.mjs
  (riusabile; artefatti measure-before/after.json). Esiti (dev, StrictMode raddoppia i mount):
  cold start /turnisala 9→5 chiamate REST (118KB→68KB); reload a caldo 9→0 chiamate anagrafiche
  (da IDB); IDB = 1 mese dopo il cold start; mese rivisitato: stesso traffico (28KB, riconvalida
  BY DESIGN) ma paint immediato da cache; /tuoturno swipe 3→2 chiamate. In PROD (StrictMode off)
  il cold start è ~64KB→~68KB (+6%, payload users arricchito di show_in_compare ecc., una tantum).
  Su localhost il vantaggio latenza cache-first non è misurabile (rete ~0ms): valgono conteggi
  e byte. BUG TROVATO (pre-esistente): tendina «Scegli mese» /turnisala off-by-one (value 1-based
  usato come indice 0-based → «Settembre» mostra Ottobre) — CORRETTO il 21/09/2026: option ora
  0-based (value={cm-1}, value={i}); audit completo di tutti gli altri selettori mese dell'app
  (batch-upload dropdown e shift-cleanup dialog) = nessun altro caso; script misura aggiornato
  e verificato live (Settembre+15 → «MAR 15 SETTEMBRE 2026», prima del fix dava Ottobre).

- **Skeleton solo tecnici (20/09/2026)**: audit conferma NESSUN delay artificiale nei
  caricamenti (i due setTimeout 4s sono i timer di reset highlight URL, funzionali). Gli
  skeleton «macchinosi» venivano dal gate anno di /vacanze e /turniferie: min_year arrivato
  da getAppSettings SENZA cache → a ogni apertura fredda full-page skeleton finché la
  rete rispondeva. Fix: useAppSettings cache-first (staleTime 24h, initialData da
  localStorage cache:{userId}:app-settings, al primo giro assoluto DEFAULTS esportati da
  lib/queries/app-settings) + gate ridotto al SOLO caso «selectedYear < minYear reale»
  (praticamente mai). Realtime app_settings nelle pagine ora invalida la query react-query
  (prima duplicava lo stato in useState locale). /tuoturno, /turnisala, /dashboard,
  /notifiche, /impostazioni: i loro loading.tsx/skeleton sono SOLO attese tecniche SSR/fetch
  — già mitigati dal cache-first (messe IDB, anagrafiche 6h).

- **Misurazione click→contenuto su PROD (21/09/2026)**: script riusabile scripts/measure-nav-prod.mjs
  (artefatto measure-nav-prod.json) su `next build && next start`, viewport mobile, Fast 3G CDP
  (150ms RTT, 1.6Mbps/750Kbps), catena di click reali sulla bottom-nav. Cold: tutte le pagine
  ~0,8–1,4 s (il pavimento è 1 RTT documento + SSR + ~700ms JS/TTFB su Fast 3G; /turnisala
  +540ms di query SSR). Warm: gruppi a toggle ~0,8s (SSR per-query), selettori raggruppati
  0,2–0,4s, /impostazioni ~40ms (RSC prefetch), cache-first /tuoturno zero REST mes.
  Nota tecnica: throttling CDP è PER-PAGE (non per-context); i bottoni «Turni Sala e Ferie»/
  «Cambi» togglano nel gruppo se già dentro → per automatizzare serve re-seedare le chiavi
  turni-last-page/cambi-last-page a ogni passata. Le leve residue di ottimizzazione restano
  la transizione 200ms e il fetch speculativo del mese iniziale /turnisala.

- **Prefetch nav (21/09/2026)**: i bottoni gruppo «Turni Sala e Ferie»/«Cambi» della bottom-nav
  erano router.push (niente prefetch) → ogni navigazione SSR pagava l'intero round-trip (~830ms
  warm su Fast 3G). Convertiti in <Link prefetch> con href dinamico (stesso comportamento di
  toggle/last-page), aggiunto prefetch anche a «Il tuo turno» e alla campanella notifiche.
  RISULTATO (build prod, Fast 3G): warm 820-860ms → 30-63ms su TUTTE le pagine; cold: turnisala
  1362→62ms (prefetch serve l'RSC durante l'idratazione della pagina di partenza), turniferie
  resta ~830ms (prima della catena, niente prefetched), il resto cold 40-850ms. Leva residua:
  solo la transizione 200ms di PageTransitionWrapper.

- **FIX badge «PDF:/Turno teorico» /turnisala (22/09/2026)**: compariva a metà schermo e si
  «teletrasportava» in fondo a fine transizione — classico inset trapping: durante l'animazione
  di PageTransitionWrapper (translateY 7→0, 200ms) un transform su un antenato rinchiuso il
  position:fixed del badge nei bound del contenuto pagina (bottom:64px risolto contro il box
  pagina, non il viewport); a transform rimosso, snap in posizione. Fix: badge renderizzato
  con createPortal(document.body) in desk-board.tsx → mai più contenuto. Verificato con probe
  rAF su 5 navigazioni CPU-throttled 1×-9×: 267 frame col badge, 0 violazioni (bottom≈780,
  contained=false anche a transform attivo).

- **«Altri presenti» RAGGRUPPATI (22/09/2026)**: tassonomia decita con l'utente su catalogo
  reale del DB (scripts/catalog-altri-tokens.mjs, analisi scripts/analyze-altri-presenti.mjs).
  Gruppi (lib/altri-gruppi.ts, ordine): Trasferte (Trasf, Dis*, NDis* notti trasferta, M/N
  nude di Spagnulo) / Corsi SP (Sp*: SpN Napoli, SPCA Cancello, Sp@ e-learning, SPW webinar)
  / Istruttori SP (ISp*) / Tutor (MTUTOR/PTUTOR/GTUTOR) / Altre attività (fallback). RESTANO
  INVISIBILI per decisione: G, GIAP, GRicTir, GRICTIR, Na, TIR, 12.14, MSb/PSb/GSb,
  MSp@/GSp@/PSp@. Parser allargato: isShiftCode accetta sezioni a maiuscole miste
  (MDCIFTir→colonna DCIF tirocinante, Miap/piaptir→IAP) con esclusioni esplicite
  (NDis*, ?Sb, ?Sp@, na). DaySchedule.altriPresentiTokens opzionale (nome→token) popolato da
  applyTokenToDay per il raggruppamento; mesi v1 storici → fallback «Altre attività».
  F.E./AG7 restano assenze (utente). Test: scripts/check-altri-gruppi.mjs (moduli reali).
  Verificato live: gruppi per-giorno su mar2026 g2/g5/g12/g22 corretti.

- **Extra di GRUPPO nel teorico≠reale + TINTE (23/09/2026)**: (1) le persone reali presenti
  SOLO nelle «altre presenti» (trasferte/corsi/…) che il teorico NON prevedeva lì finiscono
  nei «Nuovi» — theoRealSectionCompare le raccoglie sotto la chiave RISERVATA
  GRUPPO_EXTRA_KEY='@gruppo' (isGruppo:true, mai in collisione con le sezioni reali), con
  tipologia (`TheoRealExtra.group` = classifica del TOKEN reale via classificaAltriToken) e
  provenienza (`theo`, anche di sezione: M7S→DisNa). Confermati in gruppo = attesi anch'essi
  tra le altre presenti (theoNoSection); cognome nudo di omonimo senza legato o in
  duplicateCognomi → non attribuibile, niente extra. (2) OGNI gruppo ha una tinta dedicata
  (ALTRI_COLORS in lib/altri-gruppi.ts → classi .altri-pill-* in globals.css, light+dark:
  trasferte=ambra, corsi=azzurro, istruttori=teal, tutor=viola, altro=neutro); la riga
  «Nuovi:» in testa ai gruppi usa la stessa tinta con la provenienza «da <token>».
  Test: check-theoreal-absences.mjs (bucket, omonimi, provenienza), check-altri-gruppi.mjs
  (classi coerenti). Verificato live su mar2026 g5/g12/g22 con teorico≠reale ON.

- **ASSENTI per turno teorico su /turnisala (23/09/2026)**: il blocco in fondo alla board
  mostra anche gli ASSENTI (famiglia isAbsenceCode in shift-tokens.ts: A/AG/RI/RC/RM/VS/F…),
  ognuno SOLO nel turno teorico (M/P/N) in cui era previsto — mai ripetuto sugli altri turni
  (richiesta utente). assentiPerTurno(month, day, tree, adjustments, realCodes, bareOwners,
  duplicateCognomi) in turni-teorici.ts risolve la chiave PDF (cognome nudo o con iniziale)
  contro l'albero squadre (convenzione nome completo O iniziale: cognomeCount sul cognome
  BASE, non sulla chiave). Regole omonimi: bare del legato → owner (bareOwnerOf); con
  iniziale → match prefisso unico (0 o 2+ match → non attribuito); bare di omonimo
  (cognomeCount>1 o duplicateCognomi) → NON attribuito. Dedup persona (realCodes ha 2 chiavi
  per persona: cognome + nome). Board: memo realCodesForDay condivisa con theo≠real, righe
  M/P/N condizionate, tinta cell-tint-abs, nome mostrato come nell'albero.  Test:
  scripts/check-assenti.mjs (moduli transpilati). Live mar2026 g3–14: 93 assenti, 0
  duplicati, iniziali risolte (Esposito Al., Loni G., Romano N.). UPDATE 24/09: la resa
  è UN sottogruppo «Assenti:» che segue la CHIP del turno selezionata in testa alla
  board (selectedShift) — non più tre righe M/P/N insieme; il resto dell'attribuzione
  è invariato. Verificato live mar2026 g3 N/M/P.

- **GRUPPI «altre presenti» v2 + codici nelle pill (24/09/2026)**: (1) il codice PDF
  compare accanto al nome in OGNI gruppo (entry {name, code} in AltriGruppo, da
  altriPresentiTokens; i «Nuovi» di @gruppo hanno TheoRealExtra.code) e nel blocco
  Assenti (come già prima). (2) FUSIONE Tutor→Istruttori (label «Istruttori») e
  RINOMINA «Corsi SP»→«Corsi»: 4 gruppi di presenza + Assenti. (3) TINTE ripuntate
  ALLE VARIABILI delle chip di /turnisala e della card verde di /tuoturno
  (globals.css: --altri-pill-trasferte → var(--pill-pomeriggio-*), --altri-pill-corsi
  → var(--cell-duty-*), --altri-pill-istruttori → var(--pill-notte-*),
  --altri-pill-altro → var(--pill-mattina-*); nessun hex duplicato, light+dark
  automatici; Assenti restano --cell-abs). Verificato live mar2026 g5/g12 con
  confronto computed-style ↔ variabili su entrambi i temi. RIFINITURA 24/09:
  (a) NIENTE più riga «Nuovi:» nel blocco gruppi — la provenienza teorica
  «da <token>» va DIRETTAMENTE sulla pill del gruppo dei non-previsti
  (gruppoProvenienza: Map normName→theo dal bucket @gruppo, solo con
  teorico≠reale attivo); i «Nuovi» di SEZIONE nelle card restano invariati.
  (b) Le classi .altri-pill-* hanno il BORDO color-mix(currentColor 30%)
  come .cell-tint-abs (classe .altri-pill-tutor rimossa, orfana).

- **CELLE GIALLE del PDF: congedo + sostituto (24/09/2026)**: il PDF segna in
  giallo una RICHIESTA di congedo e il PRESUNTO SOSTITUTO. Classificatore
  lib/sala-month.ts (classifyYellowCell su real/teo della cella): RICHIEDENTE =
  assenza congedo (isLeaveToken: A/AG/AG7/F/F.E./VS) oppure reale=teorico di
  sezione (richiesta pendente); SOSTITUTO = teorico «D» (chiamato dalla
  Disponibilità), teorico RC/RM/RI con reale lavorativo (lavora sul PROPRIO
  riposo, es. Caiazzo M. P6S/RI), o cambio TURNO (prima lettera diversa).
  Celle gialle spurie (festività, riposo su riposo, cambio sezione stesso
  turno) → NON classificate. Analisi DB:
  scripts/analyze-yellow.mjs (100 gialli, 23 cluster; g22/03: Sica+Mucci coppia
  completa sulla 10 P). Test: scripts/check-yellow.mjs.
  REWORK v2 (24/09/2026, stessa giornata): NIENTE blocco a fondo card —
  yellowForDay sparge i gialli DENTRO l'elenco persone della card per token
  «sezione|turno» (yellowTargetTokens): RICHIEDENTE → card della SEZIONE
  TEORICA (fallback reale se il teorico non è una sezione); SOSTITUTO → card
  del turno REALE e, se il teorico lo metteva su una sezione di un ALTRO
  turno, anche lì (Set per non duplicare). In desk-card: chi è già
  nell'elenco viene EVIDENZIATO (nome+codice in --cell-yellow-text via
  yellowForSlot, match tollerante normName/surnameKey/cognomeOf); chi manca
  viene AGGIUNTO in coda (blocco in fondo). Verificato live mar g22, entrambi
  i temi.
  REWORK v3 (25/09/2026): NIENTE testo/codice giallo — PALLINO giallo.
  yellowTargetTokens: card della SEZIONE TEORICA sempre (il PDF colloca lì
  la persona: i corsi SPCA del 23/9 con teorico P7S/P8 restano sulla LORO
  card) + card del turno REALE per il sostituto (cambio turno/sezione, da D,
  da riposo). Classificatore esteso: cambio SEZIONE a stesso turno (P7S→P4S)
  e attività SENZA sezione (SpCA/SpN/ISp*/Dis*/Trasf/TUTOR) con teorico di
  sezione → classificati (prima scartati); teorico «D» con reale senza
  sezione → null (nessuna card). In desk-card: renderDot mette il PALLINO
  giallo (var(--cell-yellow-text), precede i dot admin) accanto al nome;
  chi manca dall'elenco → blocco in fondo «● Sost. Nome» / «● Cong. Nome»
  (niente codici né sezioni: la posizione parla già). EXCLUSIONI (v3): i
  gialli escono da righe rosse del teorico≠reale, extra di sezione e di
  gruppo, blocco Assenti e SOTTOGRUPI della board (filter su entries;
  23/9: Corsi sparisce, resta solo Stringile/Spagnulo in Trasferte) —
  yellowPeople in desk-board è TUTTI i gialli del giorno (yellow.includes),
  il match è per nome E cognome (surnameKey, forme «Caiazzo M.»).
  Verificato live: mar g22 chip M (9 pallini su DCCM/DCO 10°/DCP/DCO 7°),
  set g23 chip P (Cong.Minino DCO 8°, Cong.Lucignano DCO 4°, Cong.Neri
  DCO 7° + pallini nelle card reali).
  REWORK v4 (25/09/2026, richiesta esplicita): SOSTITUITO vs SOSTITUTO
  invertiti rispetto alla v3. Nell'ELENCO della card: i 'teo' (sostituiti:
  teorico di sezione, reale SpCA/SpN/altro) col pallino giallo e la SIGLA
  REALE se diversa dal teorico (yellowForDay ora ritorna showCode + target;
  caso 23/9: Minino SpCA resta sulla card della P8, sopra Minicozzi). In
  FONDO alla card: SOLO i SOSTITUTI ('real', lavorano lì senza esservi
  previsti — Minicozzi D→P8), righe «● Nome Sigla» SENZA prefissi
  Cong./Sost. Se il sostituto è anche nell'elenco reale della sezione,
  renderName lo NASCONDE dalla lista (target 'real' → null). I pallini
  ADMIN tornano: giallo e colore-admin COESISTONO (renderDot li mette
  fianco a fianco; la v3 li nascondeva con la precedenza — segnalato).
  Tema CHIARO: --cell-yellow-text #713f12 (marrone) → #a16207 (giallo-700,
  leggibile su #fef08a); dark resta #fde68a su #3a2f0a. Helper:
  yellowSectionToken (solo sezioni M/P/N vere) + normCodeEq (case-insens.);
  yellowTargetTokens rimossa. Verificato live set g23 chip P: DCO 8°
  Minino (elenco) + Minicozzi P8 (fondo), stesso pattern su 4/5/6/7/9/10/11
  e DCCM/DCP; light rgb(161,98,7), dark rgb(253,230,138); pallini admin
  ok (  mag g6 chip M: 48 dot).
  REWORK v5 (25/09/2026,richieste sul colore e sul layout): il PALLINO giallo
  usa il RIEMPIMENTO delle chip trasferte (--altri-pill-trasferte-bg, cioè
  --pill-pomeriggio-bg) con contorno sottile del tinta-testo della chip
  (WebkitTextStroke 0.6px) per essere visibile in chiaro e scuro;
  --cell-yellow-bg/text ora puntano entrambe alle variabili chip (niente più
  #a16207/#713f12/#fef08a). IL NOME torna NORMALE (niente testo giallo): il
  solo pallino è il marker (sigla reale neutra accanto, tabular-nums).
  NIENTE BLOCCO a fondo card né slot vuoto: il sostituto ('real') PRESENTE
  nell'equipaggio è reso AL SUO POSTO come riga «● Nome Sigla» (caso Langione
  22/9 RC→PDCP sulla DCP); le aggiunte non previste stanno IN CODA
  all'elenco senza separatore (caso Principe 23/9 D→P6T, "basta che sta
  sotto gli altri in ordine di altezza"). NB dataset: il 25/09 16:30 un
  nuovo PDF settembre ha riscritto i gialli (prima 18 il 23/9, ora 1:
  Principe; il 22/9: Barra A + Langione) — le verifiche precedenti su
  Minicozzi/Cocozza/SPCA si riferiscono al PDF vecchio.
  Verificato live 22/9 chip P (Langione inline «● Langione PDCP», DCP) e
  23/9 chip P (Principe in coda col pallino); fill light rgb(254,243,199),
  dark rgb(59,35,0); 16/16 test, tsc, eslint ok.
  NOTA DEV: dopo un commit, il watcher CSS del dev server può restare su un
  chunk vecchio (variabili nuove assenti) → touch app/globals.css o restart
  del server. FIX highlight: le pill del blocco Assenti ora hanno il check isMe
  (desk-own-badge) come i gruppi.
  REWORK v6 (25/09/2026): il marker giallo diventa una CHIP DOPO il nome
  (niente più pallino prima): pill rotonda col fill trasferte
  (--altri-pill-trasferte-bg + bordo 30% del tinta-testo chip) che INGLOBA
  la sigla del turno reale in ROSSO (--cell-abs-text, come il testo dei
  pill Assenti: #8c2a24 chiaro / #fbd9d6 scuro). La sigla non è più testo
  separato neutro: sta DENTRO la chip. Verificato live 22/9 DCP
  (Langione PDCP) e 23/9 DCO 6° (Principe P6T), entrambi i temi
  (fill light rgb(254,243,199) / dark rgb(59,35,0), sigla rossa in
  entrambi); 16/16 test, tsc, eslint ok.
