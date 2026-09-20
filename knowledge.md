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
- **Colori (sistema di override RIMOSSO 03/08/2026 — e mai tornato).** Niente
  `app_settings.color_overrides` (migration 014), niente `/api/admin/save-colors`, niente
  cookie `co`: **nessun colore si salva nel database**. I colori reali sono solo in
  `globals.css` (`:root` = tema chiaro, `.dark` = scuro) e arrivano agli elementi per
  variabile o per classe. `public/color-studio.html` è stato ELIMINATO (04/08/2026) — NON
  ricrearlo. Il cookie `co` residuo nei browser è INERTE.
  AL SUO POSTO, dal 17/09/2026, c'è la **SONDA COLORI** (`components/admin/theme-inspector.tsx`,
  `lib/theme-inspector*.ts`, `stores/theme-inspector-store.ts`): si accende da /admin
  (pulsante «Colori»), il tocco SELEZIONA invece di navigare, mostra da quale variabile
  viene il colore, fa provare un colore in anteprima (solo su quel dispositivo, un `<style>`
  iniettato) e prepara la RICHIESTA da copiare (pagina, elemento, selettore, origine,
  `da → a`). La modifica definitiva si fa nel codice, come sempre. Se un giorno servisse
  l'override globale nel database, è una decisione da prendere con l'utente: la regola
  resta «non reintrodurlo».
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
  strato (2) rimane per robustezza e per gli utenti senza storia. **AGGIORNAMENTO 16/09/2026 (i «G» e la fase di squadra):** quella «maggioranza per classe»
  aveva un difetto grave — contava QUALSIASI token non vuoto, quindi un mese di teorico
  scritto con codici che non sono turni (la famiglia «G», invisibile per decisione
  dell'utente) poteva vincere la maggioranza e cancellare la rotazione. È il caso ROTONDO
  (vedi l'entry in fondo): ora lo script conta solo i token INFORMATIVI (turni M/P/N con/senza
  sezione, riposi RI/RC/RM, disponibilità D, assenze) e, per chi nella propria storia non ha
  PIÙ una rotazione, RICOSTRUISCE il pattern dalla griglia comune della squadra (fase + riposi
  di squadra) invece di lasciargli un pattern incoerente. Vedi `--only=<nome>` per applicarlo a
  un solo membro. - **Mockup data/turno nella card (12/09/2026, NON parte dell'app):** `mockups/celle-data-turno.html`, 3 varianti per separare numero del giorno e codice turno nella card «variante E» (A oggi centrato-attaccato come riferimento, B distanziati alto/basso, C data piccola nell'angolo alto-sinistra stile Google Calendar, D data in badge chiaro nell'angolo) su dati reali MININO luglio 2026, con zoom delle card chiave e verifica tema scuro. **SCELTA (12/09/2026): la variante D** — implementata nella pagina vera: numero del giorno in badge chiaro nell'angolo alto-sinistra (`.cell-day .day-badge`: bianco al 78% nel chiaro, bianco traslucido al 16% nello scuro, radius 6px, padding 2×6px, position absolute con `relative` sulla card), testo centrale INGRANDITO per leggibilità (griglia: codice 11→14px extrabold, teorico barrato 10→12px; confronto: codice 10→12px, teorico 8→9px) e contenuto leggermente abbassato (pt-3/pt-1.5) per non finire sotto il badge. Il badge è negli override del pannello Colori? NO: resta su ogni tinta, anche personalizzata — è la sua funzione (contrasto garantito). **Stile definitivo (12/09/2026, variante D del mockup `mockups/bordi-badge-data.html`):** il badge veste i colori dei BOTTONI NAV (freccette) — nel chiaro superficie pagina `--background` + bordo `--border/60` + testo `--foreground`; nello scuro superficie rialzata `--card` + bordo bianco 16% (stessa ricetta dei bottoni). Sostituisce il bordo nero/bianco pieno della stessa mattina. Il bordo ambra «da confermare» e l'outline «oggi» non vengono coperti dal badge (padding interno, non toccano il bordo).
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
  REALE su localhost:3000 (dev server già attivo; porta alternativa via `E2E_BASE_URL`). «Troncato» =
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
- **Ferie: i messaggi del manager entrano nel registry (16/09/2026):** i 4 casi di
  `app/api/manager/vacation-requests/[id]` erano testo HARDCODED nel route — gli stessi casi
  dei cambi turno (pending/approvata/rifiutata/superata), ma invisibili al pannello: non
  modificabili, non testabili, non censiti. Ora sono 5 voci del registry
  (`vacation_pending`, `vacation_approved.creator`, `vacation_approved.winner`,
  `vacation_rejected`, `vacation_others`) e il route usa `messageFor(overrides, key, …)`:
  **testo inviato identico a prima** (provato dal contratto con le stesse variabili).
  Dettagli che contano:
  - `varsForTemplate` sceglie il vocabolario dal TESTO, non dal `type` (queste voci sono
    `type: 'system'` come i messaggi dei cambi turno): con {periodo} nel corpo suggerisce
    {periodo}/{anno}/{periodo_cercati}, non {turno}/{data}.
  - I corpi usano «{periodo} {anno}» con uno spazio: nel flusso reale {anno} arriva già fra
    parentesi (« (2026)») e il valore d'esempio del pannello è il solo numero — lo spazio in
    più fa leggere bene l'anteprima e `renderFlowTemplate` comprime gli spazi, quindi il
    testo spedito non cambia.
  - **Contratto registry ↔ route** in scripts/check-notif-templates.mjs: ogni chiave usata dai
    route (regex `messageFor(…)`) deve esistere nel registry, ogni voce del registry deve
    essere usata da un route, e i file che importano send-with-template **non** devono avere
    titoli letterali (`title: '…'`) — è proprio il modo in cui un messaggio resta invisibile
    al pannello. Controllo negativo fatto: un titolo hardcoded rimesso nel route → script rosso
    con il nome del file.
- **Pannello notifiche: intestazione corretta (16/09/2026):** diceva
  `Object.keys(overrides).length / 2` modificati, ma gli override sono UNA chiave per template
  (con {title, body} dentro): un solo testo modificato mostrava «0.5 modificati». Ora
  `countModifiedTemplates(templates, defaults)` (lib/notification-templates.ts) conta i
  template che differiscono davvero dal default e la stringa è unica
  (`21 messaggi push dell'app · 2 modificati`) — il testo reso era anche senza spazio
  («21messaggi»), sistemato con la stringa singola. Test E2E `tests/notifiche.spec.ts`.
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
  REWORK v7 (26/09/2026): la chip INGLOBA anche il COGNOME (testo rosso
  dentro la chip, niente nome fuori) e la sigla sta dentro SOLO per
  assenze (A/AG/FE/VS) e attività senza sezione (corsi Sp/ISp, trasferte
  Dis/NDis, TUTOR — yellowShowsCode in sala-month): per i turni di
  sezione (cambi RC/D→P6T, spostamenti P7S→P4S) la card su cui sta la
  persona dice già dove lavora → chip col SOLO nome. showCode è per-voce
  (assenza su teo=true, real=false, ecc.). Verificato live 25/9: Barra
  «Barra A» su DCCM (assenza, sigla in chip), Di Meo/Langione chip senza
  sigla (sezione), nome rosso rgb(140,42,36); 16/16 test, tsc ok.
  REWORK v8 (26/09/2026, caso DI MEO 24-25/9): IL GIALLO = proposta NON
  definitiva (chiarito dall'utente). SOLO le celle gialle generano la
  chip — una divergenza senza giallo è un fatto normale del foglio (DI
  MEO 24/9 MDCP vs teo PDCIF, nessun giallo: si vede come riga normale
  in teorico≠reale, NON si segnala — prima versione della v8 che la
  includeva è stata RETTIFICATA dall'utente: «solo quelle gialle devono
  essere segnalate»). La chip sta su UNA SOLA card: teorica per il
  richiedente, di DESTINAZIONE per il sostituto (ESPOSITO M5T→P10T non
  è più su entrambe; DI MEO 25/9 teo MDCIF→real NDCP giallo: chip SOLO
  sulla notte DCP, il turno M non lo mostra affatto). Verificato live
  24/9 (riga normale, niente chip) e 25/9 (solo DCP|N); contratto v8;
  16/16 test, tsc ok.
  FIX PARSER v8b (26/09/2026, seguito della v8): la chip mancante il 24/9 su
  BARRA/DI MEO non era nella UI ma A MONTE, nel parser. Il PDF evidenzia DUE
  giorni adiacenti con UN SOLO rettangolo (w 50.8 = due colonne, es. y 378.3
  di DI MEO) e yellowDaysAtRow assegnava il giorno col CENTRO del rect: quel
  centro (669.9) cade nella SECONDA colonna → il PRIMO giorno spariva (BARRA
  [22,25], DI MEO [25], quindi nessuna chip il 24/9). Ora il giorno va a OGNI
  colonna il cui header x sta DENTRO l'estensione del rect (tolleranza 3px):
  le celle singole (w 25.4, header a 2.4px dal centro) restano identiche, le
  doppie danno entrambi i giorni. Rete di sicurezza:
  scripts/.dbg-yellow-regress.mjs riparseggia i 21 PDF d'esempio col parser di
  HEAD e con quello di lavoro e diffa i gialli; l'unica differenza oltre ai
  guadagni attesi (BARRA e DI MEO 24, SENATORE 22, CAIAZZO I. 21, D'AURIA e
  LUCIGNANO 30 — ognuno è UN rect doppio, verificato con
  scripts/.dbg-rect-map.mjs) è la PERDITA dei falsi positivi del giorno 1: la
  swatch gialla della LEGENDA (x 24.0..65.4, a sinistra della colonna 1 il cui
  header sta a 76.6) cadeva più vicina al giorno 1 che a ogni altro, quindi
  TRANI/CASTALDI/GIORDANO/NAPOLITANO/STRINGILE avevano un giallo al giorno 1
  in OGNI mese. Dopo il re-ingest settembre ha 0 persone col giallo il giorno
  1 (erano 5) e quei nomi restano persone vere coi loro turni (TRANI PIAP,
  CASTALDI A, GIORDANO GIAP…). Verificato live 24/9 e 25/9
  (scripts/.dbg-verify24-25.mjs): DCCM «BarraA» (richiedente, sigla assenza
  dentro la chip) e DCP «Di Meo» (sostituto), nessuna chip su altre card;
  tsc + eslint ok. TRAPPOLA nelle verifiche DOM: nome e sigla della chip
  stanno in UN UNICO span di testo (textContent «BarraA») → un filtro sui soli
  elementi foglia NON vede la chip e dà falsi negativi (è così che il primo
  dump aveva «perso» BARRA); cercare span[style*=altri-pill] o i text node.
  CARD SCOPERTE + SIGLA nella chip (27/09/2026, richieste utente): (a) nelle
  card di /turnisala che perdono la persona prevista dal teorico perché un
  giallo l'ha spostata ALTROVE (chip sulla card di DESTINAZIONE) e nessuno l'ha
  rimpiazzata compare una chip gialla col testo rosso «scoperto» — casi reali
  24/9 P DCIF e 25/9 M DCIF, da cui DI MEO è stato chiamato sulla DCP. Logica
  in scopertiForDay (sala-month): per ogni card «SEZIONE|TURNO» conta le persone
  ATTESE (teorico) e REALI e marca solo le card che hanno PERSO qualcuno per un
  giallo (sostituto spostato) con attese > reali: vale quindi anche per «2
  attese e 1 reale», non solo per le card vuote. Fuori: i RICHIEDENTI
  (assenza/corso sul proprio turno — la chip resta in elenco, es. BARRA A sulla
  DCCM del 24/9) e tutte le divergenze SENZA giallo (v8). (b) la sigla dentro la
  chip era text-[10px] e sembrava più piccola e più in basso del cognome: ora è
  text-sm come il nome (semibold) e sulla stessa riga di base — «Barra A» con la
  A di pari misura (misurato: 14px vs 14px, scarto riga di base 1px = metrica
  del font, non disallineamento). La chip sta in coda all'elenco e il TRATTINO
  del posto libero sta DENTRO di lei («— scoperto», richiesta 27/09/2026):
  sulla card scoperta il placeholder «—» non si disegna più (le DCIF del 24/9 P
  e del 25/9 M leggono «DCIF | — scoperto»), mentre le card vuote NON scoperte
  tengono il loro «—» (verificato: la DCIF del 25/9 N). Gli slot si filtrano
  sulle voci VUOTE tenendo gli indici originali (slot T/S e colori intatti).
  Verificato live 24/9 e 25/9 sui turni M/P/N (scripts/.dbg-verify24-25.mjs:
  chip attese, nessuna chip su card inattese, «—» solo dove deve stare, misure
  del font; con l'argomento «all» stampa tutte le card) + caso sintetico
  2-attese-1-reale e card ricoperta (scripts/.dbg-scoperti.mjs); tsc + eslint
  ok (2 warning preesistenti).
  EVIDENZIA della card + turno GIALLO (27/09/2026): l'evidenzia
  (desk-card-highlight) nasceva dal match sui COGNOMI della card, ma
  card.surnames si ricostruisce dai CODICI REALI (buildScheduleFromMonthData):
  un giallo RICHIEDENTE ha reale di assenza/corso (A, SpCA…) e NON è più nei
  cognomi della sezione, pur restando sulla card con la sua chip → la card non
  si evidenziava (verificato: BARRA il 24/9, cognomi DCCM = [SENATORE]). Il
  SOSTITUTO funzionava GIÀ, perché lavora davvero nella sezione di destinazione
  (DI MEO 24/9 e 25/9: reale MDCP/NDCP, «DI MEO» nei cognomi della DCP). Fix:
  la board passa all'evidenzia anche i NOMI DEI GIALLI della card
  (yellowNamesByCard, chiave card.id dalla mappa yellowByCard) → l'evidenzia
  copre sia l'elenco sia la chip. Verifica: scripts/.dbg-highlight.mjs rifà
  l'espressione della board con l'helper vero (matchesCognome) e gli stessi
  ingressi (buildScheduleFromMonthData + yellowForDay) sui dati del DB — BARRA
  «solo cognomi NO → con i gialli SÌ», DI MEO SÌ in entrambi, TUTTO OK. NB: la
  sessione di test non è una persona della board e il dev backdoor non ha
  impersonazione, quindi il caso giallo NON è osservabile dal vivo: la prova
  resta a livello di predicato + dati. tsc + eslint ok.
  VERIFICA DAL VIVO con GLI UTENTI VERI (27/09/2026): l'evidenzia gialla è
  stata confermata end-to-end. Come si entra senza toccare le password:
  `admin.generateLink({type:'magiclink', email})` col service-role e poi
  `verifyOtp({type:'magiclink', token_hash})` su un client `@supabase/ssr`
  (createServerClient con cookies getAll/setAll su una Map) → i cookie di
  sessione escono nel formato/chunk ESATTI dell'app e si iniettano nel
  contesto Playwright (scripts/.dbg-highlight-live.mjs, non stampa mai i
  token). NB: il link magico fatto CONSUMARE AL BROWSER NON funziona
  (atterra su /login?error=auth-error) perché /auth/confirm scambia solo
  «?code» (PKCE) mentre il link admin torna coi token nel fragment.
  Esiti (24/09): BARRA Fabrizio <f.barra@rfi.it> con giallo richiedente →
  card DCCM EVIDENZIATA (turno M) e NESSUNA evidenzia sul turno P (controllo
  negativo: lì c'è solo la chip «— scoperto» della DCIF, non sua); DI MEO
  Maurizio <m.dimeo@rfi.it> giallo sostituto → DCP evidenziata. tsc/eslint ok.
  RETTIFICA sull'«assenza vera»: era un falso allarme — le assenze
  (A/AG/F/VS…, non gialle) NON stanno dentro le card ma nel blocco «Assenti:»
  in testa alla board, che segue la chip del turno, e la pill dell'utente
  loggato usa GIÀ `desk-own-badge` (invece di cell-tint-abs): verificato dal
  vivo con DI MONDA Fortunato <f.dimonda@rfi.it> (assenza A il 24/09) →
  «fuori dalle card», classe `text-xs px-2 py-0.5 rounded-full desk-own-badge`.
  Quindi per le assenze non manca nulla: non c'è nessuna card da evidenziare.
  FIXTURE E2E «ENTRA COME DIPENDENTE» (27/09/2026): quella tecnica è diventata
  infrastruttura dei test. `tests/employee-session.ts` = motore (env da
  `.env.local`, `findEmployee` cognome/nome/email dall'anagrafica `users`,
  `sessionForEmployee` = generateLink + verifyOtp su client `@supabase/ssr` con
  cookie-jar, `asPlaywrightCookies`); `tests/fixtures.ts` = fixture Playwright
  `asEmployee('Barra')` che svuota i cookie del contesto, inietta la sessione
  del dipendente e rende la pagina (usa context/page del test, quindi eredita
  viewport e bypass). `tests/sala-board.ts` = helper `openBoard` /
  `boardCards` / `highlightedCards`. `tests/dipendente.spec.ts` è la prova
  END-TO-END: BARRA 24/9 M → solo DCCM evidenziata (e chip «BarraA»), DI MEO
  24/9 M → solo DCP, più il controllo negativo (turno P: nessuna evidenzia, ma
  la chip «— scoperto» della DCIF) — 3/3 verdi con `E2E_BASE_URL`.
  Due trappole scoperte scrivendo lo spec (documentate in tests/README.md):
  (a) il dialog «Novità di questa versione» (changelog-dialog.tsx) si apre ~1,5s
  dopo l'avvio agli utenti che non l'hanno mai visto e rende INERTE la pagina
  sottostante → senza chiuderlo ogni click su trigger/turni viene intercettato
  dall'overlay (falso «il turno non si seleziona»); si chiude con Escape/backdrop,
  MAI con «Continua» che chiama markChangelogSeen (scriverebbe sul profilo di
  una persona vera); (b) la board è a 3 colonne e a 320px (viewport degli altri
  test) il calendario copre lo schermo senza backdrop cliccabile → lo spec usa
  `test.use({ viewport: 1280x800 })`. tsc + eslint ok.
- **CODICI LUNGHI nelle celle di /tuoturno (15/09/2026)**: la griglia dei giorni
  è a 7 colonne FISSE dentro `max-w-lg` → cella 65px su desktop (anche a 1280px),
  37px a 320px; i codici reali del PDF arrivano a 6-7 caratteri (MM3M40/PM3M40
  ~110 celle, MDCCM/PDCCM/NDCCM ~180, MDCIF/PDCIF ~118, DisNa, MTUTOR, M11TIR,
  NDisSal) e a 14px «MM3M40» misura 67px: finivano SEMPRE con l'ellipsis, anche
  a schermo intero. Fix: `.cell-day.cell-fit` = `container-type: inline-size` e
  `.cell-fit-text` con `font-size: clamp(8px, (100cqw − 2px)/(--fit-chars ×
  0.83), --fit-max)` — misure da `codeFit()` in tuoturno-client (14px reale,
  11px teorico, 12px barrato; `--fit-chars` = lunghezza del codice). 0.83
  em/carattere è la misura reale in Geist extrabold (MDCCM 0.81, MM3M40 0.80,
  MTUTOR 0.72, NDisSal 0.57) arrotondata per ECCESSO: il font può risultare un
  filo più piccolo del necessario, mai tagliato; i 2px tolti coprono i bordi
  delle metà sulle card split. Sotto i 44px di cella (schermi ≤345px) una regola
  FUORI DAI LAYER manda il codice a capo — dentro @layer components la
  `truncate` di Tailwind (layer utilities) vincerebbe. La card da 76px assorbe
  la seconda riga SENZA crescere (verificato: cardMax 76px e pagina 596px a
  tutte le larghezze). Misure dal vivo: desktop MDCCM 14px (13.6 nelle card non
  split), MM3M40 12.6px; a 375px 8.9/8.6px; a 320px 2 righe a 8px. Il CONFRONTO
  (size sm) NON è cell-fit: lì le celle si allargano sulla misura canvas
  (compareCellWidth) e non tagliano mai.
  Test: `tests/tuoturno.spec.ts` + helper `tests/tuoturno.ts` (`openCalendar`
  fissa mese/anno e sceglie la persona dal selettore, `cellCodes` restituisce
  label/font/righe/clipped) → per Di Monda e Smeragliuolo, da 320 a 1280px,
  ZERO codici con `scrollWidth > clientWidth` e nessuno sotto gli 8px se non
  andato a capo. Controllo NEGATIVO fatto: togliendo `cell-fit` dalla card il
  test fallisce a 320px elencando i codici tagliati. NB: GAROFALO (l'unico con
  `NDisSal`, 7 caratteri) non ha un utente in anagrafica → il suo calendario non
  è visibile in /tuoturno; il codice più lungo raggiungibile da un utente è a 6
  caratteri. tsc + eslint ok.
- **CHIP GIALLE LUNGHE nelle card di /turnisala + SCROLL verticale (15/09/2026)**:
  la board è a 3 colonne FISSE e la card ha `overflow-hidden`: misura 411px su
  desktop ma 114px a 390px, 91px a 320px. La chip «cognome + sigla» è la più
  esposta e il 23/9 turno P (il giorno più giallo del mese: 30 chip su 12 card)
  ne uscivano 8 su 28 — «SmeragliuoloSPCA» = 142px in 98px di riga utile → 22px
  di cognome tagliati. Fix (desk-card + globals.css): (1) la SIGLA è un item a sé
  della chip (`flex-wrap` + `max-w-full`): quando non ci sta scende sotto il
  nome, che resta a misura piena; (2) se nemmeno il solo cognome entra il testo
  si RIMPICCIOLISCE — `.sala-card-fit` sulla card = container query,
  `.sala-fit-text` = `clamp(9px, (100cqw − --fit-pad) / (--fit-chars × --fit-em),
  14px)` con i parametri da `fitText()` (nome: pad 16 em 0.62; dentro la chip:
  pad 28 em 0.62/0.72). Le em sono MISURATE in Geist (nomi 0.577, sigle 0.689) e
  arrotondate per eccesso: il testo può risultare un filo più piccolo, mai
  tagliato. Misure: desktop INVARIATO (chip da 142px su UNA riga, nessuno shrink),
  a 390px la sigla va a capo e al massimo il nome si riduce a 11.3px, a 320px
  9-13px. `container-type` NON va sulla card dell'overlay di trascinamento (lì è
  shrink-to-fit e collasserebbe). Test: tests/chip-gialle.spec.ts (helper
  `selectShift`/`boardChips` in tests/sala-board.ts) → da 320 a 1280px nessuna
  chip esce dalla card, nessun testo dietro l'ellipsis, e a 1280px le chip
  restano su una riga. Controllo NEGATIVO fatto: senza `sala-card-fit` il test
  fallisce a 320px su «SmeragliuoloSPCA» (card DCO 6°) — la prima versione
  dell'helper guardava solo il TESTO e non la pillola, e il controllo passava a
  vuoto: ora confronta il rettangolo della CHIP col padding box della card.
  SCROLL VERTICALE: sì, /turnisala scorre sui display bassi — il documento è
  alto 586px contro un viewport di 380px e lo scroll arriva in fondo, a 1280px
  come a 390px di larghezza (`html`/`body` non hanno `overflow-y: hidden`;
  l'app-layout è `min-h-screen`). Il secondo test dello spec lo verifica.
  TRAPPOLA DEV SERVER (Turbopack): una modifica di app/globals.css può NON
  comparire nel CSS servito (cache del modulo CSS) e `touch` non basta — serve
  una modifica di CONTENUTO. Sintomo: le regole nuove assenti dalla pagina mentre
  quelle di un'ora prima ci sono (`.cell-fit-text` sì, `.sala-card-fit` no);
  diagnosi: `grep <selettore> .next/dev/static/chunks/*.css`. Documentata in
  tests/README.md. tsc + eslint ok.
- **TEST E2E INDIPENDENTI DAL PDF + REGOLA DELLE CARD SCOPERTE (15/09/2026)**:
  il PDF del mese viene ricaricato spesso, e i test che citavano un caso
  specifico («BARRA il 24/9») diventano rossi da soli al primo caricamento
  nuovo. `tests/dipendente.spec.ts` ora ricava l'ATTESA dal DOM: l'invariante è
  `card evidenziate == card che nominano la persona` (nel suo elenco o in una
  chip), senza date né nomi scritti a mano.
  Inoltre le card SCOPERTE non si possono provare dal vivo in modo affidabile:
  nel mese in archivio NON ce n'è nessuna (0 su tutti i giorni di settembre),
  quindi il controllo sulla board resta verde senza verificare niente.
  `tests/sala-scoperto.spec.ts` le prova sulla LOGICA: importa `scopertiForDay`
  da `lib/sala-month.ts` e usa casi sintetici su 1 giorno (2 attese/1 reale →
  scoperta anche se la card non è vuota; richiedente → no; senza giallo → no;
  sostituto che resta nella stessa card → no). Gira in ~1 s, senza dev server
  né service-role, quindi non si salta mai. Controllo NEGATIVO fatto: togliendo
  il guard `role !== 'sostituto'` da `scopertiForDay` il caso «richiedente»
  diventa rosso. NB Playwright: `test.use` vale solo a livello di FILE o di
  `describe` — dentro il corpo di un test lo rifiuta (`did not expect test.use()`),
  quindi i test che vogliono un viewport desktop vanno avvolti in un describe.
- **MINIMI PER CARD: la regola «scoperto» generica (15/09/2026)**: la regola del
  27/09 vedeva solo le card svuotate da una CELLA GIALLA, quindi non vedeva chi
  abbandona una sezione per un'altra causa. Il caso che l'ha smascherata è
  **ROTONDO** (Squadra rosa, tipo «Squadra in seconda», ciclo 84 gg): i compagni
  girano su 4/6/7/10 (`M4T×7 P4T×7 M6T×7 P6T×7 M7T×7 P7T×7 M10T×7 P10T×7`),
  il SUO pattern è **46 G su 84** con un solo passaggio sulle sezioni → non è più
  una cella gialla, non è nemmeno una divergenza teorico↔reale (il teorico è G),
  ma la card perde una persona lo stesso.
  REGOLA: una card è scoperta quando le persone REALI sono meno del MINIMO
  previsto per quella sezione e turno, **oppure** un giallo ha spostato la
  persona altrove. Le due cause si sommano come segnalazione ma NON nel numero:
  `mancanti = max(sottoMinimo, daGiallo)` — altrimenti la stessa persona verrebbe
  contata due volte (`scopertiForDay` ora torna `Map<chiave, mancanti>`, non un
  Set). In card: UNA CHIP «— scoperto» PER OGNI PERSONA MANCANTE (doppia con 1
  reale → una, doppia a 0 → due).
  MINIMI DI DEFAULT (`lib/sala-minimi.ts`): in M/P escono dalla PIANTINA
  (`type: double` → 2, `single` → 1; le doppie sono esattamente 6/7/10/4/5), di
  NOTTE da `NIGHT_MIN_DEFAULTS`: RIC/DCIF/8/9/11/ASTER M3M40 a 0, il 4° a 1,
  DCCM e DCP a 1, le altre doppie a 2. NB: la tabella data dell'utente dava DCP
  a 0 di notte, ma su 7 mesi di PDF (214 notti) è la **DCP** a essere presidiata
  (codice NDCP: D'Elia, Senatore, Coppeta) ed è la **DCIF** a restare vuota in
  tutte — corretto con l'utente prima di implementare.
  STORIA DATATA: sta in `SalaLayout.minimums` (`SalaMinimoEntry[]`, chiave
  «cardKey|TURNO»), NON in una tabella nuova — scelta deliberata per non dover
  applicare una migration al progetto di produzione; il documento della piantina
  è già quello che l'admin modifica e `onSave` lo scrive in una volta sola (la
  piantina non modificata non viene pubblicata: si salvano `savedCards`). Il
  minimo di un giorno è l'ultima voce con `from <= giorno`; **finché nessuna voce
  lo copre la regola NON si applica** (resta solo quella sui gialli): è il senso
  di «dal giorno in cui lo modifico in poi», e serve perché i minimi cambiano nel
  tempo — verificato sui PDF: l'8° è a 0 in TUTTE le 122 giornate di marzo-aprile
  e presidiata da maggio, il 9° a 0 nella prima metà di agosto, il 4° a 0 tutto
  giugno. Il pannello admin (mini-Fab «Minimi per card», evento
  `sala-admin-minimi` → `components/sala/minimi-panel.tsx`) è per card × TURNO
  (39 valori) con la data di efficacia, e accanto a ogni casella mostra le
  presenze reali del giorno (in rosso se sotto).
  Effetto a settembre 2026: la vecchia regola segnala 0 card, con i minimi 11
  (6/P 6°; 10/P 6°+5°; 13/P 5°; 24/M 7°; 25/N DCP; 27/M 10°; 29/P 4°+M3M40;
  30/M 10°+4°) — sonda: `node scripts/.dbg-minimi-live.mjs 2026-09`.
  La funzione resta dormiente finché non esiste una prima fotografia: prima di
  quella data non cambia niente sulla board. La PRIMA è stata scritta dal 1/9/2026
  (39 valori, tutti i default) — sonda: `node scripts/.dbg-minimi-seed.mjs`
  (prova a vuoto; `--scrivi` per salvare).
- **NOTIFICHE: changelog + interesse filtrato + promemoria permessi + bordo «qualsiasi periodo» (16/09/2026, sera II):** quattro cose in fila.
  (1) NUOVA VERSIONE DEL CHANGELOG → PUSH: la POST admin con `forceNew` (crea la
  entry `version = max+1`) ora manda `changelog_new.title` («Novità nell'app»,
  corpo con `{versione}`) a TUTTI i `notification_enabled` via
  `pushTemplateToUsers` (admin/changelog/route.ts). Solo la CREAZIONE: l'update di
  una entry esistente non spammà. Il fallimento push non invalida la entry. NB
  contratto: la regex del check-notif-templates ora pesca le chiavi da
  `pushTemplateToUsers?` oltre che da `messageFor` (il changelog non usa
  `messageFor`); il titolo di default della ENTRY del DB è una costante
  (`DEFAULT_ENTRY_TITLE`) per non far sembrare che sia un template push.
  (2) INTERESSE FILTRATO SUL TURNO: il proprietario con `notify_shift_filter`
  («Solo se posso coprirlo») riceve l'interesse al suo cambio SOLO se il SUO
  turno del giorno offerto (reale dal PDF, altrimenti teorico via
  `getUserShiftOnDate`) è fra i turni cercati — la stessa nozione del filtro sui
  nuovi turni — e riceve il messaggio DEDICATO `interest.compatible.title`, che
  dice anche il turno effettivo: «il 23/09 sei in Pomeriggio». Messaggi in
  registry: 23. Nota: `filtered: true` nella risposta quando il filtro scarta.
  **RIMOSSO il 25/09/2026** per decisione dell'utente: sull'interesse la
  compatibilità è implicita nel gesto (chi si interessa alla mia proposta mi dà
  uno dei turni che ho chiesto), quindi non c'è niente da filtrare né da
  spiegare — l'interesse torna a essere SEMPRE generico e il filtro
  `notify_shift_filter` vive solo sui nuovi turni altrui
  (`new_shift.compatible.title`).
  (3) PROMEMORIA PERMESSI: `components/providers/push-permission-prompt.tsx`,
  montato nel layout (app): a 2,5 s dall'avvio, se `Notification.permission` è
  `default` o `denied` (con snooze 7 giorni via localStorage
  `push-reminder-dismissed`), popup con due bottoni. «Attiva» chiama
  `requestPermission()` (solo per default: con denied il dialog del browser non
  parte, il testo lo dice e indica l'icona 🔒/ⓘ). Rimando a Impostazioni →
  Notifiche per disattivarle dall'app. NON appare con granted, e riprova se il
  dialog del changelog è ancora aperto (il suo overlay intercetta). Verificato
  via E2E (sonda rimossa: popup visibile + rimando presente con permesso
  simulato denied e snooze pulito).
  (4) IL BORDO DI «qualsiasi periodo»: la classe di ricaduta `.offered-box`
  (globals.css) impostava solo `border-color` — senza spessore il bordo NON si
  disegna, diversamente dalle p1..p6-pill (1px currentColor 30%). Ora
  `border: 1px solid var(--offered-box-border)` e la pill è come le sorelle
  (tema scuro compreso, variabili già presenti).
  (1) TURNO DI PARTENZA dei minimi: `SalaMinimoEntry` ha `fromShift?` («M»
  assente = tutta la giornata, come le voci scritte prima) e il minimo di un
  giorno+turno è l'ultima voce che li copre — la voce del giorno `from` vale solo
  DAL PROPRIO turno (`effectiveEntry(entries, giorno, turno)`, ordine M<P<N),
  quindi «dal 27/9, turno P» lascia la mattina del 27 alla voce precedente e dal
  giorno dopo vale su tutti i turni. `withMinimoEntry` deduplica sulla COPPIA
  data+turno (due voci dello stesso giorno convivono), `nextEntry` dice al
  pannello qual è la prima voce NON ancora in vigore (niente più «ancora nessun
  minimo configurato» quando invece ne esiste uno che parte dopo). Nel pannello
  admin: caselle M/P/N «Dal turno» accanto a «Valido dal» (aria-label «Turno X di
  partenza», per non rubare il label «Valido dal» al campo data).
  (2) CHIP GIALLE di /turnisala, COLORI: nel chiaro il testo è `#b3261e`
  (`--sala-yellow-chip-text`, variabile SUA: il rosso delle celle Assenti resta
  `--cell-abs-text`, `#8c2a24` che l'utente leggeva come «marrone»); nel buio
  resta `#fbd9d6`. E il BORDO ora si ricava dal TESTO (`currentColor` 30%), come
  ogni altra pillola dell'app: prima veniva da `--altri-pill-trasferte-text`
  (ambra) mentre il testo veniva dalla tinta assenze — era l'UNICA pillola col
  bordo che non seguiva il proprio testo e in tema scuro le due famiglie
  (ambra #fbbf24 vs rosa #fbd9d6) si vedevano come DUE colori sulla stessa chip
  (il «doppio colore» segnalato sulla DCIF del 19/9 P e sulla 8° del 23/9).
  Verificato sui PIXEL, non a occhio: screenshot 6× della chip e mappa dei
  colori resi (`node scripts/.dbg-chip-pixel.mjs file.png`) — prima il bordo
  misurava `#75520b` (ambra) sotto un testo `#fbd9d6`, ora ha gli stessi canali
  del testo in entrambi i temi (chiaro: fill `#fef3c7`, bordo `#e7b494`, testo
  `#b3261e`); il bordo si compone col riempimento della chip (trasparente al
  70%), per questo la tinta resa non è il puro 30%.
  **AGGIORNAMENTO (16/09/2026, sera): il bordo è il rosso PIENO della scritta.**
  Il 30% era a metà strada fra il riempimento (giallo) e il testo, e si leggeva
  come un TERZO colore; ora è `1px solid var(--sala-yellow-chip-text)` — chiaro
  `rgb(179,38,30)`, scuro `rgb(251,217,214)`, gli STESSI valori del testo (prima
  in scuro il bordo usciva `color(srgb 0.984 0.851 0.839 / 0.3)`). Nella spec
  l'asserto sui canali resta, con in più che il colore del bordo NON deve portare
  alpha (`/ 0.3` o `rgba(`).
  (3) EVIDENZIA dell'utente loggato: dove la board nomina l'utente il testo va in
  GRASSETTO — nomi in card, chip gialle (nome E sigla), tirocinanti, righe
  teorico≠reale — e nelle «altre presenze»/assenti la sua pill (già
  `desk-own-badge`) prende anche `.desk-own-badge-strong`: `font-weight: 700` e
  anello interno a 2px. Un solo predicato in board (`isOwn` = `matchesCognome`,
  omonimi e nomi «posseduti» compresi) alimenta tutto, così grassetto e bordo
  spesso cadono ESATTAMENTE dove cade l'evidenzia della card.
  TEST: `tests/sala-scoperto.spec.ts` (+4 casi sulla logica: turno di partenza,
  voci vecchie senza turno, due voci nello stesso giorno, `snapshotForDay` per
  giorno+turno); `tests/minimi.spec.ts` (+1 end-to-end: salva «27/9 turno P» e
  verifica che la MATTINA del 27 non cambi, che il pannello dica «la prima voce
  parte dal 2026-09-27, turno P» in mattina e «In vigore da 2026-09-27, turno P»
  dal pomeriggio); `tests/chip-gialle.spec.ts` (+3 casi: bordo e testo con gli
  STESSI canali nei due temi, e nel chiaro un rosso vero non il marrone di
  prima); `tests/dipendente.spec.ts` (+2 casi: in card in grassetto solo il
  cognome dell'utente, e la pill dell'utente in grassetto con anello 2px mentre
  chi non è nei gruppi non ne ha nessuna). Helper nuovi in `tests/sala-board.ts`:
  `boardChipColors`, `boldTexts` (foglie con lettere, con la chip di
  appartenenza), `ownPills`.
  CONTROLLI NEGATIVI fatti (le prove non passano a vuoto): rimettendo il bordo
  sulla tinta trasferte → rossi ENTRAMBI i temi; e ignorando `fromShift` in
  `effectiveEntry` → rosso l'end-to-end sui minimi (il 27/9 mattina cambia, cioè
  la voce verrebbe applicata mezza giornata prima).
  NB posizionale: le chip di CODA delle card a riga vivono FUORI da
  `.sala-card-body` (stanno sul fondo card, non sul corpo) — per questo
  `boldTexts` guarda tutta la card e non solo il corpo.
  **LA CARD HA UNA TINTA SOLA SOTTO IL TITOLO (16/09/2026, sera):** proprio per
  quella posizione, nelle card a RIGA con chip in coda (gialle o «scoperto») la
  card mostrava DUE tinte — il corpo `#171717` e, sotto, il FONDO card `#262626`
  (in tema scuro ben visibile, nel chiaro le due tinte differiscono di 3 unità su
  255 e non si vedeva). Fix: la coda porta anche lei `sala-card-body` (una riga in
  `desk-card.tsx`). MISURATO, non a occhio: la DCCM del 23/9 P rendeva corpo
  `rgb(23,23,23)` per 34px e poi fondo `rgb(38,38,38)` per 41px; ora le due fasce
  sono entrambe `rgb(23,23,23)`. Il test è STRUTTURALE e sta in `chip-gialle.spec.ts`
  in entrambi i temi: `cardBodyGaps` (helper in `tests/sala-board.ts`) pretende che
  sotto il titolo ogni riga di pixel sia coperta da una fascia a tutta larghezza
  (corpo, coda, tir, teorico≠reale) — nessuna riga lasciata al fondo card. Così la
  regressione non può tornare nemmeno cambiando le tinte. Controllo negativo fatto:
  prima del fix il test è ROSSO in ENTRAMBI i temi indicando le card giuste (DCO 8°
  a 110-148px, DCCM, DCP, DCO 9°/11°). Suite completa
  46 passed / 3 skipped (gli skip sono preesistenti), tsc + eslint ok (2 warning
  preesistenti).
- **SCOPERTO A TESTO + PERIODI PER CASELLA (16/09/2026, sera):** due richieste
  sul filo dei minimi.
  (1) LA RIGA «— SCOPERTO» PUÒ ESSERE TESTO invece di chip gialla: nei GIORNI
  PASSATI (l'assenza è un fatto, non un allarme) e dove il minimo in vigore è 0
  (sezione scoperta DA PROGRAMMA — è il senso dei periodi al punto (2)). Lo stile
  segue lo SLOT che manca: titolare = nome normale, sussidio = corsivo
  attenuato (`italic text-muted-foreground`), come i nomi veri della card; le
  misure sono quelle dei nomi (`.sala-fit-text`, 16px). Quale posto manca esce da
  `scopertiDetailForDay` (lib/sala-month.ts, al posto di `scopertiForDay` che
  resta per compat): dai posti PREVISTI dalla piantina (doppia → T+S, singola →
  noSlot; `expectedSlots` costruito in desk-board) si tolgono gli occupati
  nell'ordine, e la causa gialla sa di suo il posto del teorico (`parseShiftCode().slot`,
  «M6S» → S). La decisione è in desk-board (`giornoPassato = dayISO < today`,
  `minByKey.get(key) === 0`), la resa in `desk-card.tsx` (`scopertoAsText`,
  `scopertoSlots`). Con minimo 0 e nessuno mancante NON compare niente.
  (2) PERIODI per singola CASELLA (sezione × turno): `SalaLayout.minimumPeriods`
  (`SalaMinimoPeriod`: card, shift, from, fromShift?, to?, toShift?, value).
  L'inizio vale DAL PROPRIO turno, la FINE è INCLUSA fino al turno `toShift`
  (assente = «N», tutto il giorno): «dal 15/10 turno P al 20/10» copre anche il
  pomeriggio del 20. PRECEDENZA in `minValuesForDay`: periodo in vigore → suo
  valore; casella con periodi ma nessuno in vigore → DEFAULT della piantina (il
  periodo è l'eccezione); altrimenti la voce di storia come prima. La regola si
  accende se copre una voce OPPURE esiste almeno un periodo per il turno. Nel
  pannello (minimi-panel.tsx) si apre dal TITOLO della sezione (▾): tre caselle
  M/P/N con i loro periodi (valore + «dal … al …»), «+ periodo» con data e
  pastiglie M/P/N per inizio e fine, la casella in vigore oggi ha il bordo
  evidenziato; il salvataggio passa da `onSave(values, from, fromShift, periods)`
  e desk-board salva i periodi SEMPRE insieme alla piantina (il salvataggio
  sostituisce l'intero jsonb: ometterli li cancellerebbe).
  TEST: `tests/sala-scoperto.spec.ts` (+13: posti mancanti T/S/noSlot, confini
  dei periodi, precedenza, storia, sostituzione per stessa coppia inizio),
  `tests/minimi.spec.ts` (+1 end-to-end: periodo a 0 su DCIF|P il 24/9 → la
  scopertura passa da chip a testo). Helper `scopertiIn` in `tests/sala-board.ts`
  (chip OPPURE testo, per i test che contano le scoperte).
  **I TEST DEI GIALLI NON HANNO PIÙ GIORNI FISSI:** la ricarica del PDF vero
  (23/9 da ~30 chip a 1, i candidati dell'evidenzia finiti nei Corsi) aveva
  reso rossi i test tarati sul dato vecchio. `tests/sala-gialli.ts` legge
  `sala_schedule` e fornisce `giorniGialli` (i giorni più ricchi di celle) e
  `giorniSuCard` (i giorni in cui una persona ha turno di sezione o cella
  gialla): `chip-gialle.spec.ts` e `dipendente.spec.ts` scelgono i giorni dal
  DATO e sopravvivono a ogni ricarica. Suite completa 62 passed / 5 skipped,
  tsc + eslint puliti.
- **LA CAUSA A MONTE DI ROTONDO: la rotazione della squadra (16/09/2026)**: il
  lavoro sui MINIMI aveva *curato il sintomo* (la card «scoperta»), qui si è
  riparata la causa — il pattern teorico di ROTONDO nel DB. Era «46 G su 84 con
  un solo passaggio sulle sezioni»: ora è la rotazione regolare della squadra,
  **56 turni di sezione su 84 e zero G**, con i riposi negli stessi giorni dei
  compagni (gli indici ≡ 1 mod 3, 28 riposi come TURCO/D'AURIA/LUCIGNANO).
  CHANGE SET: (1) `shift_team_members.pattern` di ROTONDO e (2) il ciclo di
  catalogo «LANGIONE · ROTONDO» di `shift_cycle_templates` — era la COPIA esatta
  del pattern rotto, quindi dal pannello si sarebbe potuto riapplicare il guasto
  con un tap. La stessa cosa in migration `032_fix_rotondo_rotation.sql` per un
  progetto ricreato da zero. Backup JSON in `scripts/backup-rotation-*.json`.
  LA CAUSA VERA, e la sua riparazione: `scripts/apply-super-cycle.mjs` derivava
  ogni pattern per MAGGIORANZA per classe di resto su tutta la storia dei PDF,
  contando QUALSIASI token non vuoto. Il teorico di ROTONDO da maggio è una serie
  di «G» (5 mesi su 7), un codice che l'app considera INVISIBILE (non turno, non
  riposo, non assenza): il G ha vinto la maggioranza in 46 classi su 84 e la
  rotazione è sparita. Due correzioni nello script: (a) nella logica di
  derivazione (`informative`) contano solo i token che dicono qualcosa sulla
  rotazione — turni M/P/N con o senza sezione (anche a maiuscole miste) e i
  codici visibili RI/RC/RM/D/A/F/VS/AG*/F.E.; (b) nuova passata di ALLINEAMENTO
  DI SQUADRA (`alignTeam`, `gridPhase`): la rotazione è della SQUADRA, non del
  singolo — i compagni coprono le 4 sezioni sulla STESSA griglia a fasi diverse
  (12 giorni, fase +0 TURCO, +3 ROTONDO, +6 D'AURIA, +9 LUCIGNANO). Chi nella
  propria storia non ha più una rotazione la ricostruisce dai compagni: griglia
  alla SUA fase per i turni, e sui giorni di RIPOSO (che sono di tutti, sempre
  gli indici ≡ 1 mod 3 qualunque sia la fase) il token che la maggioranza dei
  rotanti mostra davvero (RM mensile, D disponibilità). Chi invece gira già bene
  NON si tocca, e chi non è ricostruibile (storia troppo corta o fuori griglia)
  resta com'è con un avviso nel report. Con `--apply --only=ROTONDO` si applica a
  UN SOLO membro: la stessa passata, oggi, proporrebbe anche 4 cambi su altri
  (CAVANNA, DE ROSA, DONNARUMMA, NEVANO P. del gruppo Scorte) che NON sono stati
  applicati perché non validati.
  LA PROVA CHE NON È UN'INVENZIONE: il pattern ricostruito riproduce il teorico
  dei PDF di ROTONDO **giorno per giorno, 71/71, dal 1/3 al 10/5/2026** (il 11/5
  compare il primo «G»: da lì l'ufficio non lo pianifica più a rotazione, quindi
  non fa testo), e la griglia torna a coprire 4/6/7/10 una volta sola in ognuno
  dei 56 giorni di lavoro del ciclo. Validazione: `scripts/.dbg-rotondo-valida.mjs`
  (confronto col teorico dei PDF + copertura + giorni di riposo).
  PERCHÉ /tuoturno «girava già bene»: la pagina personale NON legge il pattern
  del DB — ha tre sorgenti in ordine di priorità (vedi l'entry del 12/09 più
  sopra): la riga base del PDF del mese, la predizione dalla STORIA dei PDF
  (lib/person-cycle.ts), e SOLO come ultimo fallback la rotazione del DB. Nei
  mesi senza PDF (da ottobre in poi) la macchina a stati ignora i «G» (non sono
  token di lavoro e non spezzano i blocchi), quindi la predizione usciva già
  come rotazione regolare: il difetto si vedeva solo dove il teorico si prende
  dal DB, cioè la board teorica di /turnisala. Ecco perché la sua card era
  «scoperta» mentre il suo calendario personale sembrava a posto.
  TEST: `tests/squadra-rosa.spec.ts` (3 casi sui dati veri, service-role: 84
  giorni senza G e 56 turni + riposi allineati ai compagni; la griglia di 12
  giorni che copre 4/6/7/10 una volta sola per giorno di lavoro; il teorico dei
  PDF riprodotto 71/71). È l'unico modo di accorgersi se un'altra passata di
  `apply-super-cycle.mjs --apply` rifà il danno: è una classe di bug che NON sta
  nel codice dell'app. Nuovo helper `tests/supabase-admin.ts` (client
  service-role per i test sui dati; senza chiavi si saltano). CONTROLLO NEGATIVO
  fatto: rimettendo il pattern rotto (46 G) nel DB i 3 test diventano ROSSI, e
  il ripristino torna verde — sonda
  `scripts/.dbg-controllo-negativo-rotondo.mjs` (try/finally: ripristina anche
  se qualcosa va storto).
- **LA SUITE E2E DA 6-8 MINUTI A 55 SECONDI (17/09/2026) — e prima ancora non
  partiva.** Tre cose, in ordine di guadagno:
  (1) LE ATTESE FISSE DI `openBoard` (tests/sala-board.ts): ogni navigazione
  costava 400 ms (mese/anno) + 1300 ms (dopo il giorno) + 800 ms (dopo il turno) +
  il sondaggio del dialog «Novità» (400 ms × fino a 5 × 2 chiamate) = **8,0 s**
  MISURATI (sonda usa-e-getta `tests/probe-nav.spec.ts`, 3 navigazioni). Ora è
  **1,5 s**: il giorno è confermato dal TESTO del trigger della data, il turno dal
  marcatore `sala-toolbar-chip` del bottone prescelto, e le misure aspettano due
  frame (`riposa`). Il mese che cambia aspetta la risposta di `sala_schedule` con
  un tetto di 400 ms (i mesi teorici si generano in locale e non fanno richieste).
  (2) DUE POPUP DELL'APP RENDEVANO LA SUITE IMPOSSIBILE, non solo lenta: il
  promemoria permessi notifiche (a 2,5 s, con `Notification.permission` che in
  headless è SEMPRE 'denied' — anche con `grantPermissions(['notifications'])`,
  verificato) e il changelog (a 1,5 s). Il loro overlay copre la pagina e
  intercetta i click: il 17/09 il primo test di `chip-gialle.spec.ts` moriva a 5
  minuti sul click del giorno. Ora `tests/browser-setup.ts` li spegne dal contesto
  (chiave di snooze `push-reminder-dismissed` + blocco di `GET /api/changelog`),
  installati dalla fixture AUTOMATICA in `tests/fixtures.ts` — così valgono per
  ogni spec, anche futura, e `dismissChangelog` diventa un no-op immediato.
  (3) PROCESSI: `fullyParallel` + `workers: 4` (i test sono letture su persone
  diverse) e i due script `test:logic` / `test:boards` per le corsie rapide.
  `minimi.spec.ts` è l'eccezione: è l'unico che SCRIVE (piantina) e per giunta in
  modo globale (un minimo «valido dal 17/9» vale anche i giorni che gli altri
  spec leggono) → vive in un progetto suo, `mode: 'serial'` e `dependencies:
  ['chromium']`, così parte quando il resto ha finito. Esito: **62 passed / 5
  skipped / 0 failed in 55 s** (erano 62/5 con test che si piantavano).
  DUE INSIDIE TROVATE STRADA FACENDO, entrambe coperte:
  · il giorno GIÀ selezionato non si può cliccare: react-day-picker in modalità
  «single» risponde `undefined` (deselezione) e la board ignora quel click, quindi
  il pannello restava APERTO col suo backdrop sopra i bottoni del turno. Succede
  quando il giorno cercato è oggi (17/09/2026). Ora si legge il marcatore del
  calendario (`data-selected-single`) e in quel caso si chiude il pannello dal suo
  backdrop (`element.click()`, senza hit-test);
  · IL LINK MAGICO È A POSTO UNICO PER UTENTE (GoTrue ne conserva uno solo): con 4
  worker che entrano come lo STESSO dipendente, i token si invalidavano a vicenda
  («Email link is invalid or has expired», vista davvero in una run). Ora la
  sessione si crea UNA VOLTA per dipendente per run: cache in memoria per processo
  + FILE condiviso fra worker (`tests/.sessions/`, git-ignored, vale mezz'ora) + LOCK
  fra processi (`mkdir` atomico) — chi arriva secondo legge la sessione già pronta
  invece di rigenerare un link che invaliderebbe quello del primo.
- **GUARDIA DI VELOCITÀ (`tests/perf.spec.ts`, progetto `perf`) — 17/09/2026:** una
  misura di TEMPO, che è l'unica cosa che difende le ottimizzazioni di cui sopra.
  3 navigazioni di `openBoard` (più un riscaldamento non misurato), si prende la
  MEDIANA e si fallisce sopra **3,5 s** (misurato ~1,3-1,5 s: margine per una
  macchina lenta, non per un `waitForTimeout` rimesso). Vive nel progetto `perf`,
  seriale e in `dependencies: ['chromium']` perché quattro worker che compilano e
  navigano insieme sporcherebbero la misura; per lanciarla da sola serve
  `--no-deps` (`npx playwright test --project=perf --no-deps`) — senza, Playwright
  esegue anche la dipendenza, cioè tutto il progetto chromium. CONTROLLO NEGATIVO
  fatto: con un `waitForTimeout(3000)` rimesso in `openBoard` la guardia diventa
  ROSSA con mediana 4285 ms e il messaggio dice dove guardare; tolto quello, verde.
- **NIENTE TEXTURE SUL CORPO DELLA CARD DEL PROPRIO PERIODO (/turniferie):**
  l'highlight della card in cui compare l'utente loggato era bordo + testata + una
  TINTA del corpo (`--my-period-content-bg`, `#eaf3fb` nel chiaro e
  `rgba(255,255,255,0.06)` nello scuro) che velava i nomi della sezione. La tinta
  non c'è più: via la classe `my-period-content` dal corpo (app/(app)/turniferie/
  page.tsx) e via la regola CSS e le due variabili (nessun uso altrove). Restano
  l'highlight sul BORDO `.my-period-border` (colore + anello box-shadow 1px, la
  stessa tecnica di `.desk-card-highlight` di /turnisala) e la TESTATA tinta.
  Verificato dal vivo su /turniferie come Smeragliuolo (il suo periodo è il 4):
  `.my-period-content` = 0 elementi, bordo `rgb(28,28,28)` con anello 1px, fondo
  del corpo `rgba(0,0,0,0)` (cioè quello della card, una tinta sola).
- **ELIMINARE IL PROPRIO CAMBIO FERIE NON FUNZIONAVA (17/09/2026): mancava la
  policy di DELETE.** La card cancella lato client (`vacation_requests.delete()`
  con chiave anon e sessione dell'utente), ma la 011 aveva dato a quella tabella
  solo SELECT, INSERT (own) e UPDATE (own): senza policy di DELETE la RLS non
  toglie NESSUNA riga e — questa è la parte che ha ingannato tutti — PostgREST NON
  restituisce errore, quindi la card diceva «Richiesta eliminata» su una richiesta
  ancora in elenco. Riprodotto dal vivo con `scripts/.dbg-ferie-delete.mjs`
  (crea una richiesta di prova per l'utente, prova a cancellarla come fa l'app e
  la rimuove): `data=[]`, `error=nessuno`, riga ancora in tabella. FIX su due
  livelli: la migration **033_vacation_request_delete_policy.sql** (delete della
  PROPRIA richiesta; l'admin che cancella quella altrui continua a passare dalla
  route server) e — perché un errore così non possa più nascondersi — la card ora
  usa `.select('id')` e tratta «zero righe» come errore (`Errore eliminazione`)
  invece di annunciare un successo. **DA APPLICARE la 033 al progetto Supabase**,
  altrimenti resta l'errore onesto ma la riga non sparisce.
- **RITOCCHI UX (17/09/2026):** (a) BORDO sul pulsante «Elimina» delle card di
  cambi turno e cambi ferie (`border-destructive/50`): la variante `destructive` è
  solo tinta di fondo + testo rosso, senza contorno non si distingueva nella card
  espansa (il bordo della pill di conferma del delete NON è stato toccato);
  (b) NIENTE TASTIERA AUTOMATICA in /tuoturno: tolti i due `autoFocus` dagli input
  di ricerca del selettore «Turni di chi?» e del dialog «Confronta i turni» — sul
  telefono la tastiera copriva metà lista proprio mentre si sceglie la persona. NB:
  togliere `autoFocus` NON BASTA, perché è il Dialog che porta il focus sul primo
  elemento focalizzabile: serve `initialFocus={false}` su entrambi i `DialogContent`
  (base-ui). Verificato dal vivo col focus: resta sul BOTTONE che ha aperto il
  selettore, e sul body per il confronto.
- **HOUSEKEEPING DEL REPO (17/09/2026):** `.gitignore` copre il rumore locale che
  VSCode mostrava fra i file non tracciati: `.freebuff/` (tutto: log, worktree,
  run doc — è stato del tool, non del progetto, e i file tracciati NON lo
  citavano più), `.agents/`, `skills-lock.json`, `package-lock.json` (il gestore è
  pnpm), `scripts/.dbg-*` (sonde usa-e-getta) e `Turni esempio/`, più
  `tests/.sessions/` (i cookie di sessione dei dipendenti condivisi fra worker,
  come `.auth-state.json`). Da 114 voci a 22.
  I file VERI che erano rimasti fuori perché non tracciati ora sono nel repo:
  `tests/notifiche.spec.ts`, `tests/browser-setup.ts`, `tests/perf.spec.ts`,
  `scripts/sala-gialli-mese.mjs` e la migrazione
  `supabase/migrations/033_vacation_request_delete_policy.sql`. Obiettivo: aprendo
  il progetto in VSCode non si vede NESSUN file non tracciato o modificato a
  vuoto (le sonde `tests/probe-*.spec.ts` e `scripts/.dbg-*.mjs` si cancellano
  appena finito, non si committano: è la ragione per cui sono in `.gitignore`).
- **LA «X» DEL DIALOG DEI CAMBI TURNO NON STA (PIÙ) SUL DATEPICKER (17/09/2026):**
  lo `ShiftDialog` è un popup `p-0` col contenuto che arriva fino ai bordi e
  scorre, mentre la X arrivava dall'involucro come elemento ASSOLUTO in alto a
  destra (`components/ui/dialog.tsx`: `absolute top-2 right-2` sulla X di
  `DialogContent`). La X cadeva sulla freccia «mese successivo» del calendario —
  misurato a 390 px: X a x 351-379 / y 121-149, freccia a x 330-358 / y 142-170,
  cioè 7×7 px di intersezione, quindi la freccia perdeva l'angolo in alto a destra
  — e scorrendo finiva sui numeri dei giorni. FIX: `showCloseButton={false}` sul
  `DialogContent` dello shift dialog e una X NOSTRA (`DialogClose` + `Button`
  `variant="ghost" size="icon-sm"`) in una RIGA SUA, fuori dall'area che scorre;
  il contenuto passa da `pt-5` a `pt-2` e il `gap-0` annulla il `gap-4` ereditato,
  così l'altezza spesa in più resta ~10 px. Per costruzione la X sta sopra il
  bordo superiore dell'area che scorre, quindi nessun elemento scorrendo può più
  arrivarle sotto.
  GUARDIA `tests/shift-dialog.spec.ts` (a 320 e 390 px, ~4 s): (a) intersezione
  fra il rettangolo della X e quello dei controlli TAGLIATO su ciò che si vede
  (catena dei contenitori che scorrono + finestra — senza taglio la guardia
  accuserebbe elementi invisibili, e con un controllo «chi c'è sotto il CENTRO»
  non vedrebbe mai un difetto di 7×7 px sull'angolo); (b) sonda sui 5 punti della
  X con `elementFromPoint` (la X non deve essere coperta). Le misure si ripetono
  col contenuto scorrato in fondo e il test finisce cliccando la X. CONTROLLO
  NEGATIVO fatto: rimettendo la X dell'involucro il test diventa ROSSO con «Go to
  the Next Month … 7×7 px» a entrambe le larghezze; con il fix, verde.
- **ANTEPRIME DEI MESSAGGI PUSH: DUE TESTI CHE NON AVEVANO SENSO (17/09/2026).**
  Segnalazione: nel pannello debug l'esempio dell'interesse leggeva «Bianchi è
  interessato al tuo Mattina del 15/05 (cerca Pomeriggio/Notte)». Il «cerca» era
  SENZA SOGGETTO e si leggeva come se a cercare fosse l'interessato, mentre
  `{turno_cercati}` sono i turni cercati dalla richiesta del DESTINATARIO (nel
  modello chi prende il tuo turno te ne dà uno che avevi chiesto tu). Ora i due
  messaggi dicono di chi è la ricerca: «(tu cerchi {turno_cercati})» e «uno dei
  turni che cercavi ({turno_cercati})». Era un difetto del testo VERO, non solo
  dell'esempio: lo stesso messaggio partiva così anche in produzione.
  LA CAUSA A MONTE DEGLI ALTRI ESEMPI ROTTI è che il pannello rende il testo con
  UN SOLO dizionario di valori d'esempio (NOTIF_VARS.sample) mentre alcuni route
  passavano valori con separatori dentro: `anno: ' (2026)'`, `motivo: ' per: …'`,
  `extra: ' (e altre 2 richieste)'`. Con `{periodo}{anno}` l'anteprima leggeva
  «16–30 Giu2026» (e `vacation_rejected` «(2026)per: …»), testo che non veniva mai
  inviato: l'anteprima raccontava un ALTRO messaggio. CONVENZIONE NUOVA, scritta
  accanto a NOTIF_VARS: **i valori arrivano «nudi» dal flusso e parentesi e spazi
  li mette il TEMPLATE** (`{periodo} ({anno})`, `{dettaglio} {extra}`). Dove
  l'anno è fra parentesi il flusso lo prende SEMPRE da una fonte non vuota
  (colonna NOT NULL o anno già validato dal route), perché un valore vuoto toglie
  il segnaposto ma non la punteggiatura: «Lug `{anno}`» diventa «Lug ()».
  Guardie: il contratto (`scripts/check-notif-templates.mjs`) ora rende TUTTE le
  anteprime con i valori d'esempio e pretende nessun segnaposto residuo, nessuno
  spazio doppio o ai bordi, nessun valore attaccato (lettera+numero, parentesi+
  parola), l'attribuzione della ricerca nei messaggi d'interesse, e che anteprima
  del pannello e testo inviato COINCIDANO (`renderNotifTemplate` ==
  `renderFlowTemplate` sugli stessi valori — prima non era garantito). In più:
  i valori d'esempio non possono iniziare con uno spazio e nessun route può
  incapsulare anno/motivo/extra/dettaglio in parentesi o spazi (scan del sorgente).
  CONTROLLO NEGATIVO fatto: rimettendo «(cerca {turno_cercati})» il contratto
  diventa ROSSO citando proprio la frase segnalata; tolto, verde. E il testo
  INVIATO non cambia (le prove di non-regressione ferie passano con l'anno nudo:
  «Il cambio 16–30 Giu (2026) con …» è identico a prima), tranne i due messaggi
  d'interesse, che è il fix richiesto. La spec del pannello
  (`tests/notifiche.spec.ts`) controlla l'anteprima dell'interesse nel browser.
- **COLORI DELLE CARD: PRESET, SELETTORE NOSTRO E DEFAULT PER TEMA (17/09/2026).**
  Tre pezzi, tutti in `/tuoturno` → FAB → «Personalizza»:
  1. **Selettore nostro** (`components/ui/color-picker.tsx`) al posto di
     `<input type="color">`: quello apriva la finestra del SISTEMA (diversa su
     Windows/Android/iOS), senza tinte pronte. Ora c'è tinta rapida
     (`QUICK_SWATCHES`), campo esadecimale validato, «Contrasto basso» con
     rapporto WCAG e «Testo leggibile». La matematica sta in `lib/color.ts`
     (funzioni pure, provate senza browser).
  2. **Palette pronte** (`lib/card-palettes.ts`, pannello
     `components/sala/card-color-panel.tsx`): Tema, Pastello, Fluo, Carta, Notte,
     Contrasto — complete (sette tipologie) e leggibili AA, tranne `tema` e
     `notte` che SONO il tema dell'app. `cardPaletteStore.apply()` le scrive in
     un colpo solo (set() sette volte = sette scritture e sette render).
     Da una palette pronta ogni singola tipologia resta modificabile.
  3. **DEFAULT CHE SEGUE IL TEMA:** in chiaro le card mostrano `tema`, in scuro
     `notte` — senza scrivere nulla in `tuoturno-colori` (il default non è una
     personalizzazione, e il pannello lo dice: badge «predefinita» sulla palette
     in vigore, `themePaletteFor(modo)`/`defaultPresetId(modo)`). «Notte» non è
     una tinta a piacere: sono i colori del tema scuro di `globals.css`
     (`--cell-*-bg/text`), e `tests/palette-colori.spec.ts` lo fissa così se il
     tema cambia ce ne accorgiamo. Verificato dal vivo: in scuro
     `Palette Notte`→`aria-pressed=true`, il badge su Notte (non su Tema),
     `localStorage` vuoto e la cella di riposo a `rgb(36,40,46)`.
  **EFFETTO COLLATERALE DA SAPERE, nel test:** aprire il menu del FAB e subito
  dopo la voce non è un'operazione sola. Il menu è di `bottom-nav`, l'ascoltatore
  del `CustomEvent` che apre il pannello è di `tuoturno-client`: se il click
  arriva mentre l'effetto della pagina non è ancora agganciato (dev server
  FREDDO, più browser che compilano), l'evento cade nel vuoto — menu chiuso,
  niente pannello, falso rosso. Gli aiuti `apriVoceFab` /
  `apriVoceFabConRitentativo` in `tests/tuoturno.ts` riprovano la voce fino a che
  il pannello non c'è (controllo negativo: buttando via il primo evento, il
  pannello si apre al secondo tentativo). Vale la pena ricordarlo perché è una
  corsa vera anche per l'utente: due tap entro l'idratazione e il pannello non si
  apre. Una soluzione di prodotto sarebbe uno store condiviso (come
  `cardPaletteStore`) invece del `CustomEvent`.

## 17/09/2026 — Sonda colori (l'admin tocca un elemento e sa da dove viene il colore)

Richiesta: «non sono bravo coi colori, voglio individuare gli elementi, vedere di che colore
sono e comunicarteli, o provarli». Ricognizione: QUESTA FUNZIONALITÀ ERA GIÀ ESISTITA e fu
rimossa di proposito il 03/08/2026 (commit `824f689`, migration 014: `app/admin/colori`,
`color-inspector`, `/api/admin/save-colors`, `ColorThemeProvider`, colonna `color_overrides`).
Era un buon impianto (override di variabili per tema, iniettati come `:root{}`/`.dark{}`) e
`knowledge.md` diceva di non reintrodurlo: il tema era stato ridotto a 2 colori e gli override
sporcano quel patto.
DECISIONE CON L'UTENTE (due domande, due risposte): **niente override nel database** — la
sonda ANTEPRIMA sul dispositivo e PREPARA LA RICHIESTA, i colori definitivi restano in
`globals.css`; e l'accensione è **un interruttore in /admin che resta acceso mentre si
naviga** (il tocco è anche il modo di navigare la PWA, quindi catturarlo va dichiarato).
Come funziona, in breve:
- `lib/theme-inspector.ts` (puro): nomi leggibili delle variabili (`--cell-rest-bg` → «Cella
  rest — sfondo», da una mappa di AREE/PARTI e non da una tabella di 323 voci che invecchia),
  colori leggibili, `previewCss`, `richiestaTesto`, selettore leggibile, filtro delle classi
  Tailwind (per FORMA, non per lista: `my-period-border` sopravvive a `my-*`, cosa che un
  filtro a prefissi si mangiava).
- `lib/theme-inspector-dom.ts` (browser): legge l'elemento e dice **da dove viene** ogni
  colore — 1) la regola che lo imposta, `var()` compresi (shorthand come `border: 1px solid …`);
  2) la classe che lo porta (`bg-primary/10` → `--primary`); 3) un token con lo stesso valore,
  ma SOLO se è l'unico (in questa app `--card-foreground` e `--popover-foreground` sono lo
  stesso nero: sceglierne uno a caso manderebbe a cambiare il token sbagliato).
  Mostra solo i colori che si VEDONO (bordi a larghezza 0, outline senza stile, caret fuori
  da un campo, i `--tw-*` di Tailwind: tutti fuori). Colori fuori gamma (oklch/lab/color-mix)
  → un pixel di canvas, che è sempre sRGB, perché `getComputedStyle` risponde `lab(…)`.
- `components/admin/theme-inspector.tsx`: **vedi la seconda versione qui sotto** — quella del
  mattino prendeva i tocchi (banner in alto, pausa, barra in basso): cancellata la sera.
  L'anteprima si legge sempre SENZA il foglio addosso (`leggiPulito`): altrimenti i colori
  nuovi verrebbero letti come fossero quelli di partenza e il «da» sparirebbe.
- Montata nel layout dentro il `QueryProvider` (usa `useCurrentUser`) ma dietro `armata`: chi
  non la usa non paga né la query del profilo né i listener. NIENTE toast all'accensione: i
  toast dell'app stanno in alto al centro, cioè sopra il banner, e si mangerebbero il tocco.
- `Colori · variabili come`, dal pannello /turnisala **non** è questa sonda: quella è la
  personalizzazione per-card già esistente. Questa è diagnostica + richiesta.
Prove: `tests/sonda-colori-logica.spec.ts` (contratto puro, 0,7 s) e `tests/sonda-colori.spec.ts`
(4 prove browser: controllo negativo «senza la sonda il tocco naviga», accensione + pausa che
libera la pagina, dal colore alla richiesta con azzeramento, e in tema scuro l'anteprima che
finisce in `.dark` e non in `:root`). Suite completa verde, 97 passed / 5 skipped in ~65 s.

### 17/09/2026 (sera) — seconda versione: la sonda NON prende più i tocchi

Feedback dell'utente: «questo sistema è scomodo perché non mi permette di navigare all'interno
delle pagine (premere bottoni, estendere card, aprire popup) e dovendo modificare a mano i
colori devo ricordarli a memoria, quando il mio focus è verificare la coerenza di un tema fra
pagine diverse». Due difetti di impostazione, due correzioni:

1. **Il tocco torna all'app; la cattura è una PRESSIONE LUNGA (650 ms).** La prima versione
   fermava gli eventi in fase di cattura sul `document` (`stopPropagation` + `preventDefault`):
   per usare l'app bisognava «sospendere» la sonda — cioè il gesto che serve a guardare un tema
   (navigare e confrontare) era proprio quello tolto. Ora non si ascolta più niente in
   cattura: si guarda `pointerdown`/`pointerup`/`pointercancel`/`pointermove` per contare la
   pressione (annullata da uno scorrimento oltre 12 px) e si cattura al timer. **L'unica cosa
   che si toglie all'app è il `click` che segue una cattura** (al rilascio il browser lo manda
   comunque, e si navigherebbe per sbaglio). La soglia è 650 ms e non 450 per non pestare i
   500 ms che l'app usa da sé sul pulsante «Turni Sala e Ferie». Con la pressione lunga
   spariscono il banner, la pausa, la barra in basso e lo stato `pausa` (via anche dallo store:
   `partialize` tiene solo `armata`/`voci`/`campioni`), perché non c'è più nessuna modalità da
   dichiarare. Resta una **pillola** in basso a sinistra (conta le modifiche e i campioni,
   apre il pannello, spegne la sonda): è l'unico ingombro fisso, e sta fuori dalla barra di
   navigazione e dal pulsante flottante, che ora funzionano sempre.
   Nota per usarla: la pressione non deve diventare «seleziona testo» né aprire il menù di
   sistema — mentre la sonda è accesa un `<style>` spegne `-webkit-touch-callout` e
   `user-select`, lasciandoli accesi a `input`/`textarea`.
2. **Il CAMPIONARIO: guardare invece di modificare.** Un pulsante ＋ su ogni riga di colore
   fotografa il colore (nome, pagina, tema, valore, variabile, selettore) e lo tiene scritto
   fra una pagina e l'altra — così il confronto non è a memoria. `campioneDaSlot`,
   `confrontoCampione` e `raggruppaCampioni`/`campionarioTesto` stanno nella logica pura; la
   riga di colore mostra da sé il confronto con la stessa etichetta vista altrove («= #f8fbfd
   su /turnisala» oppure «≠ … ») e il pannello ha la vista che raggruppa per nome+tema,
   segnala i gruppi con più valori e permette di rinominarli (rinominare un campione = dire
   «questi sono la stessa cosa»). Il tema fa parte della chiave del gruppo: chiaro e scuro sono
   due insiemi di variabili diversi, confrontarli sarebbe rumore.
Prove: la logica cresce di tre test (campione, confronto, raggruppamento) e il browser di due
(«con la sonda accesa il tocco naviga ancora» e «il campionario confronta lo stesso elemento
fra due pagine», che usa la barra di navigazione perché è l'unico elemento identico su tutte le
pagine). Le prove della prima versione (pausa, banner) sono state riscritte.

## 18/09/2026 — Le preferenze di /tuoturno sono UNA PER TEMA (chiaro e scuro)

Richiesta: «ogni utente abbia per il tema scuro e il tema chiaro una config di personalizzazione
di /tuoturno diversa… per evitare che ciò che va bene visto col tema chiaro diventi illeggibile
col tema scuro». Prima la personalizzazione era UNA SOLA e valeva in entrambi i temi: chi
sceglieva una tinta leggibile sul chiaro se la ritrovava — identica — sul fondo scuro.

COSA È CAMBIATO (`lib/person-cycle.ts`), tutte e tre le preferenze di aspetto:
- **palette dei colori** (`cardPaletteStore`): `getFor(modo)` / `setFor(modo, kind, colors)` /
  `applyFor(modo, palette)` / `resetFor(modo)` / `resetAll()`;
- **stile dei giorni diversi dal teorico** (`mismatchStyleStore`) e **contorno «da confermare»**
  (`pendingRingStore`): `getFor(modo)` / `setFor(modo, v)` / `resetAll()`. Sono state incluse
  perché sono scelte che si fanno GUARDANDO lo schermo (una cornice gialla su fondo chiaro e su
  fondo scuro non è la stessa cosa da vedere), e il pannello è uno solo.
- `modo` = `resolvedTheme` di next-themes (segue la preferenza del sistema). Il tema **non** è
  una chiave dell'utente: è la chiave con cui si leggono le preferenze di questo dispositivo.

FORMATO SU DISCO (una busta per chiave): `tuoturno-colori`, `tuoturno-mismatch`,
`tuoturno-pending-ring` contengono `{ light: …, dark: … }`. Un tema senza voce vuol dire «non ho
scelto niente, vale il default» — e in quel caso la chiave non si scrive affatto: il default non
è una personalizzazione, è quello che l'app mostra comunque (in chiaro la palette «Tema», in
scuro «Notte», `themePaletteFor`/`defaultPresetId`). Le tre `resetAll()` tolgono le chiavi.
MIGRAZIONE dal formato vecchio (una preferenza sola, valida in entrambi i temi): si legge e si
copia nei due, così chi aveva già personalizzato non perde niente. DUE TRAPPOLE vere, entrambe
coperte da un test: (1) la palette vecchia è una mappa piatta (`{rest: {bg, text}}`): si
riconosce perché NON ha le chiavi `light`/`dark`; (2) le due preferenze a stringa sono state
scritte per anni come valore NUDO (`localStorage.setItem(k, 'strike')`, non `JSON.stringify`) e
`JSON.parse` ci va in errore: se il testo non è JSON si usa il testo così com'è (è il caso che
tests/pages.spec.ts usava da sempre con `addInitScript`).

EFFETTO PRATICO: cambiando tema, il pannello cambia configurazione (e lo dichiara: «tema scuro ·
predefinita Notte»), «Ripristina i colori di questo tema» tocca SOLO il tema che si sta
guardando, e le celle portano gli override inline solo dove quel tema è personalizzato.
Prove: `tests/colori-card.spec.ts` — «una per tema, e non si pestano» (in chiaro Contrasto, in
scuro Fluo, e le due scelte convivono), «il formato vecchio si legge ancora» (palette piatta +
stringhe nude, applicate in entrambi i temi) e il default che segue il tema.

### La riga di versione in Impostazioni (`lib/app-version.ts`)

Era una riga scritta a mano («v1.226 · 6eb0c28 — ultimo aggiornamento: 26/08/2026 13:10») e
invecchiava in silenzio. Ora è `V5 · <commit> · ultimo aggiornamento: <data e ora>`, con commit e
momento della **build** cotti in `next.config.ts` (`env`: `NEXT_PUBLIC_APP_COMMIT` da
`VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_APP_BUILD_TIME` = adesso): su Vercel la riga dice la verità
da sola, su entrambi i deploy. Ora di Roma dichiarata (`Intl.DateTimeFormat` con
`timeZone: 'Europe/Rome'`), non quella del dispositivo: la riga dice quando è stato pubblicato
l'aggiornamento. Il fallback scritto a mano serve solo a chi compila in locale (verificato: sul
dev server la riga a schermo mostra l'ora di avvio del server, non il fallback → l'iniezione
delle env funziona anche con Turbopack). Prova: `tests/versione.spec.ts` (formattazione pura,
comprese ora legale e solare, + la riga vera su /impostazioni che non deve più contenere «v1.226»).

## 18/09/2026 — RELEASE V5: merge in master

`dev → master` mergiato e pushato (merge `240870f`, «Merge branch 'dev' into master — release V5»):
**131 commit** da agosto, 206 file, ~56.000 righe. La PWA live prende: turni teorici con squadre
e catalogo dei cicli, gialli del PDF (chip, evidenzia, card scoperte coi minimi per card e la
storia datata), cache-first su IndexedDB con riconvalida realtime, notifiche (registry con
override admin, push «novità del changelog», filtro «solo se posso coprirlo», promemoria
permessi), il pannello colori di /tuoturno (selettore nostro, palette pronte, **una config per
tema**), la sonda colori dell'admin col campionario, la riga di versione presa dalla build e la
suite E2E (106 prove, ~72 s).

BRANCH: il branch `freebuff/voglio-creare-le-basi-di-logica-di-turni-mi-spiego-…` era
**incluso in dev** (antenato, diff vuoto) ed è stato eliminato su GitHub e in locale — su
origin restano solo `master` e `dev`. Restano due branch `freebuff/*` **solo locali**:
`avvia-l-app-…` (incluso in dev, si può togliere) e `in-quanti-sottogruppi-…` (NON incluso:
contiene lavoro non mergiato — non cancellarlo senza guardarlo).

⚠️ **MIGRATION DA APPLICARE SU PRODUZIONE: 018–033** (16 file). Il DB main ha la history delle
migration a timestamp, quindi `supabase db push` NON si usa lì: si passa dalla Management API
(come per la release di agosto). Preparato lo script `scripts/apply-release-migrations.mjs`:
verifica cosa manca, applica un file per volta in transazione registrando la versione in
`supabase_migrations.schema_migrations`, si ferma al primo errore, e con `--bundle` scrive il
file da incollare nell'SQL editor. Serve `SUPABASE_ACCESS_TOKEN` in `.env.local` (Supabase →
Account → Access Tokens, oppure Credential Manager di Windows → «Supabase CLI:supabase»).
Senza quel token le funzioni che usano le novità (statistiche admin 018, squadre/cicli
019-028, filtro notifiche 023, override testi push 029, realtime 030-031, cancellazione della
propria richiesta ferie 033) NON funzionano in produzione.

## 18/09/2026 — Migration 018–033 APPLICATE su produzione (release V5 completata)

Con il token fornito dall'utente, `scripts/apply-release-migrations.mjs --prod --apply` ha
applicato **tutte e 16** le migration mancanti su produzione: 018–024 (già verificate),
025–033 (applicate ora). Verifica finale: le versioni `025`–`033` sono registrate in
`supabase_migrations.schema_migrations` (versioni a 3 cifre: in ordine testuale vengono prima
dei timestamp, NON cercarle in cima alla history), `shift_cycle_templates` ha **81 template**
seedati e tutte le squadre collegate per nome.

⚠️ **Fix necessario in volo (025):** il seed aveva gli UUID delle squadre del progetto di dev
(`255226bf…` Rilievo A, `8198d38b…` Rilievo B, `521d3c94…` Rilievo C, `f4f910ff…` Rilievo D —
non esistevano in produzione, FK violata). Corretto: il file ora risolve la squadra **per nome**
(`(select id from public.shift_teams where name = 'Rilievo A')`), così il seed vale su ogni
ambiente. In produzione le squadre si chiamano «Rilievo A/B/C» + «Rilievo D» (il secondo
«Rilievo A» del catalogo è in realtà Rilievo D: LONI A. e NEVANO).

BRANCH: eliminati anche gli ultimi due `freebuff/*` locali (`avvia-l-app-…` e
`in-quanti-sottogruppi-…` — verificati entrambi **inclusi** in master, diff vuoti): la cartella
specchia GitHub, restano solo `master` e `dev`. La cartella progetto ora è pulita: nessun file
non tracciato.

## 17/09/2026 — Rotazione teorica: prod allineata a dev + priorità delle sorgenti in /tuoturno

**Il bug** («il ciclo di Borrelli riparte dal giorno 1 a ottobre»): la riparazione della
rotazione fatta su dev (apply-super-cycle.mjs: anchor comune 2026-03-01, ciclo 84gg «in terza»
con pattern completi, pattern 024 da consenso) NON era mai passata su produzione — le migration
018-033 non toccano cycle_days/pattern_start/pattern, quindi prod restava al seed 020
(pattern_start=2026-07-01): con quell'ancora il 01/10 cadeva sul giorno 9 invece di proseguire
settembre (13/09 = giorno 1 → 01/10 = giorno 19 per i cicli 28gg).

**Fix dati su PRODUZIONE:** `scripts/allinea-rotazione-prod.mjs` (dry-run di default, backup
automatico, verifica post-apply, idempotente: pianifica dal backup pristine e salta le righe
uguagli al target) ha allineato prod ← dev: 4 tipologie, 75 membri per id, 4 membri solo-prod
(COLUCCI M./PELOSI/SPAGNULO/STRINGILE — fase preservata con rotazione del pattern), 81 template.
Verifica: match col teorico del PDF di settembre 72,1% → 93,8%; BORRELLI 01/10 = giorno 19 ✓.
I mesi PDF 2026-03…08 di prod sono ANCORA v1 (solo 2026-09 è v2): NON rilanciare
apply-super-cycle su prod senza prima convertirli (dedurrebbe pattern da un solo mese).

**Secondo bug, nella stessa indagine (segnalato dall'utente: «ottobre di Minino sbagliato su
dev E main, tutti i DCO, i Noni a posto»):** /tuoturno per i mesi SENZA PDF usava la predizione
dalla storia dei PDF (lib/person-cycle.ts) PRIMA della rotazione del DB — ordine scritto quando
il seed del DB era rotto (~56%). Con il seed riparato la gerarchia è girata: la rotazione
replica il teorico dei PDF al 92-100% su TUTTI i gruppi, la predizione (macchina a stati dei
blocchi) deraglia sui DCO (1-17% su «in terza», catene di riposi slittate di un giorno:
RM RC RI → RC RI P5T). Su /tuoturno la priorità ora è: PDF → **rotazione DB** → predizione
(solo per chi non è nell'albero), sia nella griglia personale (`theoreticalFor`) sia nel
confronto (`compareRows`). I Noni restano perfetti (cicli rigidi, 100%). La predizione NON è
toccata in lib/person-cycle.ts: resta disponibile e le sue regressioni si misurano con
`node scripts/verify-tuoturno.mjs`.

**Riposi «D» vs «RC» nei pattern (17/09/2026, terzo segnalazione dell'utente: «Cavanna il
10/10 dovrebbe essere un riposo, non D»):** il seed 024 deduceva i riposi dalla MAGGIORANZA
del REALE nei PDF (soglia 50%, altrimenti 'D' = disponibilità). Ma il TEORICO PRE-STAMPATO
dei PDF è la verità di pianificazione: per CAVANNA e DONNARUMMA (Scorte, ciclo 28,
anchor 2026-03-01) l'indice 27 del ciclo (28/03, 25/04, 23/05, 20/06, 18/07, 15/08, 12/09)
porta RC in TUTTI i mesi (7/7 su dev, 6/6 su prod) mentre il reale è misto → il pattern
aveva 'D' e il 10/10/2026 generava D. Le ALTRE D del pattern delle Scorte sono LEGITTIME
(il teorico stampato dice davvero D lì). Fix: `scripts/ripara-riposi-pattern.mjs` — piano
calcolato sui PDF di dev e applicato IDENTICO a dev e prod (id membro uguali), backup
di prod, verifica post-apply, idempotente; SOLO posizioni rest→rest (D/RM/RC/RI/''),
supporto ≥60% con ≥3 campioni, bersagli confermati dall'utente. **ROTONDO (in seconda,
ciclo 84) VOLUTAMENTE escluso:** la sua teoria stampata cambia schema da fine maggio
(RC sabato + RI domenica, giorni lavorativi in 'G' da confermare) mentre il pattern 84gg
del DB è fedele a marzo-aprile (riposi ogni 3gg) — divergenza strutturale che richiede una
decisione di pianificazione, non un fix puntuale.

## 18/09/2026 — Pannello mese/anno di /tuoturno: mezza fuori dallo schermo a sinistra

**Il bug** (segnalato dall'utente: «il datepicker in /tuoturno e nel confronta invece di
essere a centro pagina è per metà fuori sul lato sinistro»): il pannello `.month-pop`
(`MonthYearPicker`) si centrava con `left-1/2 -translate-x-1/2` mentre l'animazione
`@keyframes month-pop` (globals.css) porta anche lei una traslazione orizzontale
(`transform: translate(-50%, …) scale(…)`) per «ricomporre» il centraggio.

**Perché si rompe ADESSO (Tailwind 4):** in v4 la utility di traslazione non scrive più
`transform` ma la proprietà `translate` (`translate: var(--tw-translate-x) var(--tw-translate-y)`,
verificato in `node_modules/tailwindcss/dist/lib.js`). Le proprietà individuali si
COMPONGONO con `transform` (ordine: translate → rotate → scale → transform), quindi il −50%
entrava due volte e il pannello finiva spostato di un'INTERA larghezza (240px) a sinistra:
misurato a 320px, `[-80, 160]` con il bottone centrato a 160. Con Tailwind 3 la utility
scriveva `transform` e l'animazione lo sovrascriveva: il centraggio reggeva per caso.

**Fix** (`app/globals.css` + `app/(app)/tuoturno/tuoturno-client.tsx`): il pannello si
centra con la GEOMETRIA (`-ml-[120px]` = metà dei suoi `w-[240px]`), i keyframe animano solo
opacità, translateY e scala. Regola generale: **mai far coesistere una utility `translate-*`
di Tailwind 4 con keyframe che scrivono `transform: translate(…)`** — si sommano.

**Regressione E2E:** `tests/month-picker-centrato.spec.ts` — entra come dipendente, apre il
pannello e verifica a 320/360/375/390/414/512/768/1280px che sia dentro la finestra e
centrato sul bottone (scarto ≤2px). Verificato anche in modalità CONFRONTO (stesso header,
stesso pannello): 390px → `[75, 315]`, centro 195 = centro del bottone. Il selettore mese di
/turnisala (desk-board) usa `<select>` nativi: non era toccato.

## 18/09/2026 — Bacheca notifiche: ogni tipo ha la sua sezione (il changelog era invisibile)

**Il dubbio dell'utente** («le notifiche del changelog non ci sono in bacheca?»): confermato,
ed era un intero tipo di notifica a sparire. Il push «novità» del changelog
(`app/api/admin/changelog/route.ts`) partiva col tipo `'changelog_new'`, mentre la bacheca
(`components/notifications/notification-list.tsx`) raggruppava SOLO cinque tipi e **senza
alcun fallback**: `system`, `interest`, `new_shift`, `vacation_interest`, `new_vacation`.
La catena è: il route invia la push → il service worker copia il tipo nella voce salvata in
localStorage (`public/sw.js`, `type = 'system'` di default) → la bacheca filtra per tipo.
Con un tipo fuori elenco la notifica arrivava sul telefono e poi **spariva dall'elenco in
silenzio**: nessun errore, nessuna traccia (è anche il motivo per cui il registro
`lib/notification-templates.ts` dichiarava quella voce come `type: 'system'` mentre il route
mandava `changelog_new`: due elenchi di tipi scollegati).

**Prova che il test lo cattura:** rilanciato `tests/bacheca-notifiche.spec.ts` con la bacheca
VECCHIA (stash temporaneo del solo componente) → fallisce su `changelog_new: la voce deve
comparire` (elemento inesistente); con la nuova passa.

**Fix, tre pezzi:**
1. **una lista sola** — `NOTIF_TYPES` + `NotifType` in `types/database.ts` (l'elenco che chi
   invia, chi dichiara e chi mostra devono condividere); il registro dei messaggi lo importa
   invece di ridefinirlo;
2. **la bacheca non può più dimenticare un tipo** — le sezioni sono una mappa
   `Record<NotifType, {label, Icon}>`: un tipo nuovo senza sezione NON COMPILA. Il changelog ha
   la sua sezione **«Novità dell'app»** (nuova, con l'icona Sparkles) e resta una **rete di
   sicurezza** («Altre notifiche», icona Bell) per le voci con un tipo SCONOSCIUTO — quelle
   salvate da una build più nuova dell'app non spariscono più;3. **il contratto nei check** — `scripts/check-notif-templates.mjs` ora pretende tre cose:
   (a) ogni `type:` letterale passato a una push (app/, lib/, components/) e ogni tipo
   dichiarato dal registro stiano in `NOTIF_TYPES`; (b) in ogni file, i tipi MANDATI dalle push
   siano quelli DICHIARATI dal registro per i messaggi che quel file usa — è il legame che era
   rotto (la rotta del changelog mandava `changelog_new` mentre il registro diceva `system`);
   (c) la bacheca usi la lista condivisa con la mappa esaustiva e la sezione di sicurezza.
   Controprova fatta: rimettendo `type: 'system'` sulla pulizia, il check fallisce con
   «manda il tipo «system» ma i messaggi del registro che usa sono di tipo «cleanup»».

**Nomi:** il tipo del changelog resta `'changelog_new'` (come la chiave del template
`changelog_new.title` e come le voci già salvate sui dispositivi): così quelle già in giro
diventano visibili subito, senza migrazione.

### Le categorie: QUATTRO sezioni larghe (scelta dell'utente, 18/09/2026)

`'system'` era un contenitore generico: ci finivano 13 messaggi di natura diversa (esiti dei
cambi, esiti delle ferie, pulizia dei turni e le comunicazioni vere dell'admin). Primo passo:
visto che il tipo era fuori elenco, il changelog si è preso il suo tipo e la pulizia pure,
con una sezione per tipo → NOVE sezioni. L'utente le ha giudicate subito troppo confuse
(«penso che dobbiamo creare meno sezioni») e ha indicato la direzione: Admin / Sistema /
Cambi turno / Cambi ferie.

**Come è fatto adesso:** i TIPI del filo restano precisi (dicono cosa è successo: servono a
preferenze, deduplica e test), il RAGGRUPPAMENTO è una mappa a parte in
`components/notifications/notification-list.tsx`:

```
SEZIONE_DI: Record<NotifType, SezioneId>   // ogni tipo → UNA sezione (esaustivo per costruzione)
type SezioneId = 'admin' | 'sistema' | 'turni' | 'ferie'
```

| sezione | tipi che ci finiscono | chi li manda |
|---|---|---|
| Comunicazioni admin | `system` | dialog notifiche admin, push generica |
| Sistema | `changelog_new` | `app/api/admin/changelog` (novità della versione) |
| Cambi turno | `new_shift`, `interest`, `shift_outcome`, `cleanup` | pubblicazione, «Mi interessa», esiti del manager, pulizia |
| Cambi ferie | `new_vacation`, `vacation_interest`, `vacation_outcome` | pubblicazione, interessi/catena, esiti del manager ferie |
| Altre notifiche | *(tipo sconosciuto)* | rete di sicurezza: mai nascondere una voce |

Conseguenza da sapere: **aggiungere un tipo NON aggiunge una sezione** (basta assegnarlo in
`SEZIONE_DI`: se manca, non compila). La pulizia dei cambi è in «Cambi turno» perché parla di
richieste di cambio (se la si vuole altrove, è una riga della mappa). Attenzione alle voci GIÀ
salvate sui dispositivi: la storia vive in localStorage, quindi una notifica arrivata PRIMA di
questo cambio porta ancora il tipo vecchio (`system`) e si vede sotto «Comunicazioni admin»
finché non viene riscritta da una push nuova.

**Il test difende il NUMERO di sezioni**: `tests/bacheca-notifiche.spec.ts` legge le
intestazioni da `[data-notif-sezione-titolo]` e pretende l'elenco ESATTO in ordine
(«Comunicazioni admin», «Sistema», «Cambi turno», «Cambi ferie», «Altre notifiche»), oltre a
verificare che ogni voce stia nella sua sezione; `scripts/check-notif-templates.mjs` controlla
che la mappa resti `Record<NotifType, SezioneId>` e che le sezioni siano 4. Verifiche: `tsc`,
`eslint`, `check-notif-templates` e i 3 spec Playwright verdi.

---

## 19/09/2026 — Dalla card di un cambio al SUO posto in sala (`/turnisala`)

Richiesta dell'utente: nella dashboard dei cambi, la colonna della DATA (o l'ordinale «2°» del
secondo cambio dello stesso giorno) non apre più la card ma porta in `/turnisala` sul giorno e
sul turno M/P/N del turno OFFERTO («cedo Mattina» → turno M), facendo «respirare» per 3s la card
della persona che cede il cambio. È il modo in cui si verifica a occhio una richiesta: «chi prende
questo turno cosa trova in sala quel giorno?».

**MA SE QUEL TURNO NON RISULTA, LA DASHBOARD NON SI MUOVE (revisione 19/09/2026).** Prima di
navigare si chiede ai turni (`getUserShiftOnDate` di `lib/shift-compat`, la stessa fonte che
alimenta la board: PDF del mese, altrimenti rotazione teorica) se quella persona ha davvero quel
turno quel giorno; se non ce l'ha si resta QUI e si dice «**Dai turni non risulta che Piccirillo
abbia Mattina il giorno 19**» (toast sonner, `toast.info`). Mandare l'utente su una board che non
illumina niente era peggio che non muoversi. Costo: il tap aspetta la risposta (~0,5-0,9s), e la
card mostra `aria-busy`/`opacity-60` nel frattempo. La rete di sicurezza dentro `/turnisala`
(l'avviso «non è in sala…») resta: serve a chi ci arriva da un URL condiviso o da una push.

**Il contratto vive in UN posto: `lib/shift-tokens.ts`.**

```
SHIFT_TO_SALA: Record<ShiftType, SalaShiftType>   // Mattina→M, Pomeriggio→P, Notte→N
SALA_SHIFT_LABEL: Record<SalaShiftType, ShiftType> // M→Mattina (per i messaggi)
SALA_FLASH_MS = 3000                               // durata del «respiro»
buildSalaFocusUrl({shiftDate, offeredShift, cognome, nome, from})  // chi MANDA (dashboard)
parseSalaFocus(searchParams): SalaFocus | null                     // chi RICEVE (/turnisala)
```

Parametri URL: `m=YYYY-MM`, `d=giorno`, `t=M|P|N`, `c=cognome`, `n=nome`. La persona viaggia per
COGNOME (non per `user_id`) perché la board riconosce le persone coi nomi del PDF
(`matchesCognome`): è l'unica chiave che sa usare. `from` porta dietro i parametri di contesto
della pagina di partenza (bypass `dev=…` del guard PWA, impersonazione `as=…`): un salto non deve
far perdere il contesto in cui si stava lavorando. `SalaFocus.token` è l'impronta della
richiesta: serve a non riapplicarla a ogni render (e a non ripetere l'avviso).

**Chi fa cosa:** la pagina (`sala-page-client`) cambia MESE (è l'unica che sa caricare un mese dal
DB/cache); la board (`DeskBoard`, prop `focus`) applica GIORNO e TURNO, illumina la card e avvisa
se la persona non c'è. La URL si ripulisce da sola dopo il flash (`SALA_FLASH_MS + 1,5s`): chi
ricarica o torna indietro non rientra «da una card» senza spiegazione.

**Tre trappole trovate facendo questo lavoro (tutte verificate in browser):**

1. **LA CORSA DEL RESET MESE→OGGI (la più insidiosa).** In `DeskBoard` un effetto su
   `[currentMonth]` riporta la board al giorno/turno «iniziali» (oggi) a ogni cambio mese. Il
   giorno/turno lo applica invece l'effetto del `focus`, al MOUNT — cioè quando il mese della card
   non è ancora a schermo: bastava che il reset passasse dopo e si finiva sul mese giusto al
   GIORNO SBAGLIATO. Succede in DUE modi: in sviluppo React invoca gli effetti due volte (la
   seconda passata del reset arriva dopo l'arrivo), e nel passaggio a un ALTRO mese il reset del
   mese di partenza gira quando la URL è già stata ripulita. Il rimedio è `focusHonoredRef`
   (`{month, consumed}`): l'arrivo è «onorato» una volta, e finché non è consumato l'effetto di
   cambio mese NON tocca giorno e turno — né sul mese di destinazione né su quello di partenza.
   Consumato, i cambi mese tornano a comportarsi come sempre. **Non semplificare quella guardia:**
   senza, l'utente atterra sul giorno di oggi (9 ottobre → 19 ottobre).
2. **I 3s partono quando il MESE È A SCHERMO**, non quando arriva la richiesta: se il caricamento
   è lento, il flash non si consuma mentre la board mostra ancora il mese precedente (l'utente
   non vedrebbe niente). Tetto di 12s se il mese non arriva mai.
3. **«Non succede niente» è il modo in cui questa feature fallisce in silenzio.** Se la persona non
   compare in nessuna card del giorno/turno (richiesta vecchia, PDF cambiato, persona non in sala)
   esce un avviso sonner che lo dice; la card che contiene la persona si illumina altrimenti.
   La ricerca copre gli STESSI posti dell'evidenzia della card propria: equipaggio, tirocinanti e
   chip gialle.

**Gli ordinali («2°», «3°»… fino a «5°»):** dal secondo cambio di una data il blocco non mostra il
giorno ma `{dateIndex + 1}°`. È lo STESSO bottone (l'ordinale è solo l'etichetta dentro) e il
gestore del click non legge mai l'indice: usa `shift_date` e `offered_shift` della card, quindi il
salto è corretto per qualunque ordinale. **Verificato con 5 richieste sulla stessa data**
(22/09/2026, create ad hoc sul DB di dev con `scripts/richieste-demo.mjs` e poi rimosse):
blocco-data, «2°», «3°», «4°», «5°» → ognuno ha aperto il SUO turno. L'aria-label porta comunque
la DATA vera («turno Pomeriggio del 22 set di Cicia»): l'ordinale da solo non direbbe il giorno.
Attenzione: l'indice si calcola sulla lista FILTRATA (`components/shifts/shift-list.tsx`), e un DCO
normale vede solo una parte dei cambi — per vedere gli ordinali in dashboard serve un DCO+ (vista
completa), ed è così che li verifica lo spec.

**Dati DEMO per provare le schermate che chiedono più cambi sulla stessa data:**
`node scripts/richieste-demo.mjs --crea --apply` (dry-run senza `--apply`, `--giorno=`/`--quante=`
per scegliere) e `--pulisci --apply` per toglierle. Rifiuta di scrivere se il progetto configurato è
quello di PRODUZIONE, non tocca le righe che non ha creato (le tiene in
`scripts/.dbg-richieste-demo.json`) e nessuna push parte da qui (le notifiche le manda l'app, non il DB).

**Stile del flash — «RESPIRO» di 3s, TRE volte (revisione 19/09/2026):** `.desk-card-flash`
(app/globals.css) = contorno di 2px nel colore dell'evidenzia (bordo ricolorato + anello 1px, la
ricetta di casa) con attorno un alone morbido che si allarga e si dissolve (`box-shadow` con
blur+spread, `color-mix(… 40%, transparent)`): UNA animazione da 3s (`animation: desk-card-flash
3s ease-in-out both`) con 7 fotogrammi = 3 respiri (picchi di blur a 16,6%, 50% e 83,3%) e
l'ULTIMO fotogramma che porta a zero alone **e contorno insieme**. Due cose da non disfare:
(a) il contorno NON è nella regola di base ma solo DENTRO i keyframes — così, quando React toglie
la classe, non resta niente da spegnere a mano (prima il bordo sopravviveva al respiro, in un
momento separato: il difetto che l'utente ha visto); (b) `fill: both` tiene l'ultimo fotogramma
finché la classe è lì. Verificato DAL VIVO con la Web Animations API
(`el.getAnimations()[0].effect.getKeyframes()`): blur dei tre picchi 14px e anello 0px a offset 1.
Controprova strutturale nello spec: i fotogrammi si leggono dal CSSOM (ricerca RICORSIVA dentro i
`@layer` di Tailwind 4) e si pretende che i picchi siano TRE e che l'ultimo spenga anello e alone. **NIENTE `@media (prefers-reduced-motion:
reduce) { animation: none }` su questa classe**: la PRIMA versione lo aveva e l'utente — che ha
«riduci animazioni» attivo sul dispositivo (verificato: `matchMedia('(prefers-reduced-motion:
reduce)').matches === true` e `animation: none` applicato) — non vedeva alcun movimento, solo un
contorno fisso per 3s, che sembrava un difetto. Il respiro è un movimento lento e continuo
(nessun lampeggio, nessuno strobo): resta anche lì, ed è coperto da uno spec che emula
`reducedMotion: 'reduce'`.

**Avviso ROSSO e «istantaneo» (richiesta 19/09/2026).** Il messaggio «Dai turni non risulta che X
abbia Y il giorno N.» è un `toast.error` (non `info`): con `richColors` acceso su `<Toaster>`
(`app/layout.tsx`) l'errore è l'unico tono rosso e porta il fondo della libreria — in CHIARO
`rgb(255,240,240)` con testo `rgb(230,0,0)`, in SCURO `hsl(358 76% 10%)` con testo
`hsl(358 100% 81%)`: nessun CSS nostro. In tema chiaro il rosso di sonner è un rosa TENUE: è la
scelta della libreria, e lo spec pretende «rosso e non neutro» (R sopra G e B di almeno 8 punti)
su fondo E testo, in ENTRAMBI i temi (`emulateMedia({ colorScheme })`). Il testo dei popup ha
`text-wrap: balance` (`toastOptions.classNames.title/description` in `components/ui/sonner.tsx`):
se la frase ci sta resta su UNA riga (verificato: 299px in 356px di popup), se non ci sta va a capo
in due righe PARI invece di lasciare l'ultima parola da sola.

**UNA SOLA REGOLA PER «STA SU UNA CARD» (revisione 19/09/2026, dal caso del collega col giallo).**
Un collega (Romano Raffaele) vedeva il VECCHIO avviso GIALLO («…la persona non compare in questa
sezione») su OGNI card, anche su richieste di settembre col PDF caricato. Non era una versione
vecchia dell'app: erano due domande diverse. `salaCodeInfo` (lib/sala-month) chiama `work` — quindi
`salaTokenToShiftType` risponde M/P/N — anche token che la board NON mette su nessuna card:
`MTUTOR`/`PTUTOR` (attività TUTOR), i turni «nudi» `M`/`N`/`P` (es. SPAGNULO), le trasferte `NDis*`.
Verificato coi moduli REALI (`scripts/.dbg-kinds.mjs`, caricati con `scripts/.dbg-alias-loader.mjs`
che risolve `@/` e le estensioni .ts: niente più copie a mano delle funzioni), token per token:
`MTUTOR → work/Mattina` per l'app ma `«altri presenti»` per la board. Così la verifica diceva «sì»,
il salto partiva, e la board rispondeva col giallo. Stesso buco per chi sta in una sezione SENZA
card nella piantina (`IAP`, `5T10`: la board rende solo le chiavi `card.sectionKey ?? card.title`).
Rimedio: UNA definizione in `lib/shift-tokens.ts` — `sectionTurnOf(token)` / `isSectionTurnToken` —
presa dallo STESSO ramo di `applyTokenToDay` che decide dove la board scrive un nome (nudo, `Sp*`,
`Dis*`/`NDis*`, `TUTOR` restano fuori). `getUserShiftOnDate` riporta anche `sectionTurn` e `section`;
la card in dashboard naviga solo se il turno torna E la board avrebbe una card
(`lib/sala-jump.ts` → `boardSectionKeys`: la piantina, una volta per sessione; `null` = illeggibile →
comportamento di prima, così un errore di rete non blocca i salti legittimi). Se non c'è card la
dashboard resta e dice il vero: «X il giorno N è in sala senza sezione: non c'è nessuna card da
mostrare.» oppure «X il giorno N è in sezione «IAP», che non ha una card sulla board.» — coprire una
sezione resta una decisione dell'admin (basta aggiungere una card col sectionKey giusto).
**L'AVVISO GIALLO NON È STATO RIMOSSO — e non va rimosso.** È il messaggio della BOARD
(`desk-board.tsx`, `toast.warning`, l'unico dell'app) e resta la rete di sicurezza per chi arriva su
una persona che la board non sa mostrare: link condiviso, push, URL scritto a mano. La revisione del
19/09 ha tolto la VIA più comune (la dashboard non manda più in board se non ha una card da
illuminare), non il messaggio.

**IL MESE DALLA CACHE NON DECIDE (19/09/2026 — seconda causa del giallo, quella che spiegava «stesso
commit, due dispositivi diversi»).** La board disegna SUBITO la copia del mese in IndexedDB e
riconvalida in background (`handleMonthChange` → `readCachedSchedule` → `getSalaSchedule`): se quella
copia è più vecchia del PDF — basta un ricaricamento del mese fatto dopo la sua ultima visita, e i PDF
si ricaricano spesso — il nome cercato non c'è. Risultato: «non è in sala» su una persona presente, e
il respiro di 3s partito su dati vecchi (consumato prima che arrivasse il mese vero). Il dispositivo
dell'utente, con la copia fresca, non vedeva niente. Ora `SalaPageClient` passa `scheduleFresco` a
DeskBoard (unico punto che mette un mese a schermo: `mettiMese(m, fresco)`, `false` SOLO per la copia
da cache; SSR, rete e mesi teorici generati sono freschi): con la copia non riconvalidata la board non
giudica — né avvisa né fa partire il timer — e quando la riconvalida arriva l'effetto rigira e decide
sul dato vero. Se la rete fallisce la copia resta a schermo e il giallo NON esce (meglio il silenzio di
un «non è in sala» falso). Test: `tests/sala-mese-da-cache.spec.ts` (apre il mese fresco → la card
deve accendersi; CORROMPE la copia in cache togliendo la persona dal giorno; rallenta la rete di 1,5s;
riapre la URL → nessun avviso nella finestra sulla copia vecchia, e la card si accende col mese vero).
Verificato che morda: con la guardia disattivata fallisce con «la board ha dichiarato «non è in sala»
guardando la copia in cache non riconvalidata».

**E il flash non dipende più dagli input fragili del browser (stessa revisione).** Il match del flash
usava la regola STRETTA (`matchesCognome`): per gli omonimi serve l'iniziale del nome e `bareOwners`
decide chi possiede la riga col solo cognome — ma `bareOwners` nasce dall'albero squadre, che nel
browser può tornare vuoto (documentato in `useShiftTeamTreeData`: RLS «authenticated»). Senza albero,
«ROMANO» (riga bare) non era trovato mentre la verifica (`personNameMatches`, che accetta la riga col
solo cognome) lo riconosceva → giallo su una persona presente. Ora il flash usa `matchesFocusPerson`
(lib/person-shift): regola stretta + ripiego con la regola della verifica, cioè la stessa domanda che
autorizza il salto. Effetto collaterale accettato: riga bare + due omonimi in sala → si accendono
entrambe le card (il PDF non dice quale). Nel DB dev gli omonimi sono Loni, Esposito, Romano, Nevano,
Caiazzo, Di Napoli, Esposito A. Coperto in `tests/sala-card-presence.spec.ts`.

Prove: `tests/sala-card-presence.spec.ts` (5 spec di logica) pretende che `sectionTurnOf` coincida
con `applyTokenToDay` su 29 token rappresentativi — è il contratto che impedisce la deriva — e che
`MTUTOR`/`M`/`NDisNa` restino turni per il resto dell'app ma non per il salto;
`scripts/.dbg-classifica.mjs` classifica TUTTE le richieste del DB (in dev: 59 casi «turno letto ma
non su una card» + 3 sezioni senza card). Prova dal vivo, fatta e poi rimossa: richiesta demo su
NERI Luigi 28/09 (`PTUTOR`) → la card resta in dashboard con «Neri il giorno 28 è in sala senza
sezione…», mentre la board aperta sulla stessa URL risponde
`warning (rgb(255,252,240)) «Luigi Neri non è in sala nel turno Pomeriggio del 28…»` — cioè
esattamente il popup del collega.

**Il salto è ISTANTANEO (`lib/sala-jump.ts`).** La verifica del turno costa ~0,5-0,6s (misurato:
561ms dal click) e prima si pagava TUTTA dopo il tap. Ora: (a) parte già al
`onPointerDown` della colonna data (più l'equivalente da tastiera), (b) la promessa è CONDIVISA fra
pointerdown e click, (c) l'esito resta in memoria per `userId|giorno` con TTL di 60s
(`SHIFT_LOOKUP_TTL_MS`) — non «per sempre»: un cambio confermato sposta la persona e un PDF nuovo
riscrive il mese. Gli ERRORI non si memorizzano (il prossimo tap riprova). Se l'esito è già in
memoria la card NON mostra nemmeno l'opacità di attesa. La memoria vive nel modulo, quindi è per
sessione di pagina. Nello spec si contano le richieste `sala_schedule?select=schedule` (questa forma
è SOLO di `getUserShiftOnDate`: board e «il tuo turno» chiedono `month, schedule, …`, URL diversa):
una parte al pointerdown, ZERO al click, e l'effetto (navigazione o messaggio) entro 600ms.

**Test:** `tests/card-cambio-to-sala.spec.ts` (5 spec). Difendono: (a) la DECISIONE del click —
naviga solo se quella persona è in sala in quel turno — confrontata con una lettura INDIPENDENTE
della board (aperta da zero sulla stessa URL): se la board accende, la dashboard deve navigare con
quei parametri; se non accende, la dashboard deve RESTARE e mostrare il messaggio ROSSO col punto
(il ramo «resta» verifica fondo e testo in chiaro e scuro). È il test che vale di più, perché le due
strade sono indipendenti (altrimenti una dashboard che dice sempre «non risulta» passerebbe);
(b) la persona presa DALLA BOARD si accende davvero — contorno nel colore dell'evidenzia,
`desk-card-flash 3s x1` misurato sul computed style CON `reducedMotion: 'reduce'` emulato, alone che
si allarga, ancora acceso dopo 1,2s e spento entro 5s, e i TRE picchi + l'ultimo fotogramma a zero
letti dal CSSOM; (c) un blocco con l'ORDINALE porta al giorno giusto o dice perché (entra come DCO+,
è l'unico che vede tutta la lista); (d) una persona inesistente su URL diretto produce l'avviso in
board e nessuna card accesa; (e) il salto è ISTANTANEO (prefetch al pointerdown, nessuna seconda
richiesta al click, effetto entro 600ms, secondo tap sulla stessa card senza nuove richieste).
Verifiche: `tsc`, `eslint` (nessun problema nuovo), 61 spec
esistenti verdi (tuoturno, dipendente, chip-gialle, month-picker, notifiche, bacheca, sala-scoperto,
confronto, colori-card, shift-dialog, pages). Dopo la revisione del 19/09 sulla regola «sta su una
card» la suite completa è **116 passati / 8 saltati** (`tsc` + `eslint` puliti; restano i 2 `any`
preesistenti del lock landscape in sala-page-client).

**LA PILLOLA DELLE «ALTRE ATTIVITÀ» RESPIRA (richiesta 19/09/2026 — il giallo del collega: la
causa che RESTAVA, dopo la cache e i match fragili).** Chi il PDF registra come presente SENZA
sezione — turno «nudo» `M`/`N`/`P` (SPAGNULO), corsi `Sp*`/`SPW`, istruttori `ISp*`, trasferte
`Dis*`/`NDis*`, `TUTOR`/`MTUTOR`/`GTUTOR` — non ha nessuna card, ma la board lo MOSTRA: è la
pillola della riga «Trasferte / Corsi / Istruttori / Altre attività». Lì non si accendeva niente,
quindi la board non aveva altra scelta che avvisare («la persona non compare in questa sezione») su
persone che nel PDF c'erano — anche su richieste di settembre col PDF caricato (caso reale del
collega). Ora la pillola riceve la STESSA `.desk-card-flash` della card (ha già un bordo di 1px →
anello + alone identici, nessun CSS nuovo oltre al commento) e la board considera «trovata» la
persona con `displayCards.some(isFocusPerson) || flashInAltri`: l'avviso esce SOLO quando la board
non mostrerebbe la persona da nessuna parte. Dettaglio che serviva: i nomi dei GIALLI restano fuori
dai sottogruppi (il pallino sulla loro card li rappresenta già), ma se la persona del flash è un
giallo la sua pillola DEVE esserci — l'eccezione è nel filtro (`!yellowPeople.has(...) ||
isFlashGroupName(...)`), altrimenti lo stesso buco si sarebbe riaperto per i gialli.

**Regola unica ampliata: DOVE LA BOARD METTE UN TOKEN.** `boardPlacementOf(token)` in lib/shift-tokens
(`{kind:'card', section}` | `{kind:'altri'}` | `null`) replica ramo per ramo `applyTokenToDay`;
`sectionTurnOf`/`isSectionTurnToken` sono ora suoi casi particolari (contratto invariato per i
chiamanti). `getUserShiftOnDate` riporta `placement` (al posto di `sectionTurn: boolean`) e la
dashboard, quando il turno combacia, va in sala ANCHE se la destinazione è la pillola; resta ferma
solo se la board non mostrerebbe la persona in nessun posto — sezione senza card nella piantina,
codice invisibile per decisione utente (`G`, `MSb`, `12.14`, `Na`) — col messaggio nuovo «… il giorno
N non compare in nessuna sezione della board.» (prima «… è in sala senza sezione: non c'è nessuna
card da mostrare.», che per questi casi era diventato falso).

**Test.** `tests/sala-card-presence.spec.ts` (8 spec): `boardPlacementOf` deve coincidere con
`applyTokenToDay` su 29 token rappresentativi (card / pillola / nessun posto), i presenti-senza-sezione
devono risultare `altri` (mai `card`), gli invisibili `null`, e i token in pillola che PORTANO un
turno (`MTUTOR`, `PTUTOR`, `M`, `N`, `P`) devono restare raggiungibili dalla dashboard mentre i
codici senza turno (`SpN`, `ISpNw`, `DisCas`, `GTUTOR`) no. In `tests/card-cambio-to-sala.spec.ts` la
spec nuova «chi è presente senza sezione si accende nella PILLOLA e l'avviso giallo non esce»: prende
dai mesi veri una persona con token senza sezione (nella dev di oggi: PASSANNANTI `SpN` al 18/03),
apre la URL del focus, pretende che l'evidenzia sia la pillola (non dentro `.sala-card-bg`,
`animationName` = `desk-card-flash`) e che in TUTTA la vita della pagina nessun avviso dica «non è in
sala» (vedi «COME SI GUARDA UN POPUP CHE SPARISCE» qui sotto). Morso verificato: con `flashInAltri`
disattivato la spec fallisce proprio su quell'elenco, mostrando anche il testo dell'avviso («quel giorno
ha «SpN» in turni, un codice che la board non mostra»).

**COME SI GUARDA UN POPUP CHE SPARISCE (lezione di test, 19/09/2026).** Le due letture puntuali
(`expect(await avviso.count()).toBe(0)`) NON bastavano: l'avviso poteva uscire in un istante non
campionato (è quello che è successo: falliva 1 volta su 4, e non sempre allo stesso punto). Ora la spec
della pillola installa un **MutationObserver PRIMA che l'app parta** (`page.addInitScript`) che registra
OGNI `[data-sonner-toast]` inserito, con una seconda lettura a 200 ms; alla fine si pretende che
nessuno di quelli registrati dica «non è in sala». Due trappole già pagate: (a) `innerText` di un nodo
STACCATO è vuoto — sonner smonta il popup e la raccolta resterebbe muta (falso verde): si legge
`textContent`; (b) il popup può essere inserito prima del testo — da qui la seconda lettura. La stessa
spec rallenta di 1,2 s la richiesta del mese (caso vero: link condiviso, mese mai aperto, rete lenta).

**L'AVVISO RESIDUO DICE DOVE LA PERSONA È (richiesta 19/09/2026, stesso giro).** Quando la board non
ha niente da accendere, la frase non è più il generico «la card è quella del cambio, ma la persona non
compare in questa sezione»: nomina il CODICE del giorno tradotto in parole. La traduzione vive in una
funzione PURA, `spiegaCodiceNonMostrato(code, suUnaCard)` in `lib/sala-month.ts` (accanto a
`salaCodeInfo`, da cui prende l'etichetta), così ogni forma è coperta da test di logica e non serve un
browser: `RI`/`RC`/`RM` → «quel giorno è di riposo (RI)», `D` → «in disponibilità (D)», `A`/`AG7` →
«assente (A)» (NIENTE «assente per assenza», che non dice niente: «Altre presenze» e «Assenza» non
prendono il «per»), `F`/`F.E.` → «assente per ferie (F)», `VS` → «assente per visita sanitaria (VS)»,
sezione con card → «è in sezione «7» (M7S)» (la persona c'è ma sotto un ALTRO turno, o con un nome che
la board non ha riconosciuto), sezione SENZA card → «…, che non ha una card sulla board», codice che la
board non disegna (`G`, `GIAP`, `MSb`, `12.14`, `Na`) → «ha «G» in turni, un codice che la board non
mostra». Se il codice non c'è affatto (mese teorico, nome non trovato): «quel giorno non risulta in
turno in questo mese».

Il codice si legge dai dati del MESE A SCHERMO (`decodeSalaMonth(schedule.data)`, la stessa fonte di
gialli e assenti) con la regola della VERIFICA (`personNameMatches`): così la frase non è mai più
severa del salto che ha portato lì, e un omonimo che la board non ha saputo evidenziare viene comunque
nominato con la sua sezione. `suUnaCard` lo calcola la board dai `displayCards` (`sectionKey ?? title`),
cioè la piantina. Prove: `tests/sala-card-presence.spec.ts` (9 spec: la nuova
«quando la board non disegna la persona, l'avviso dice DOVE la persona è» copre tutte le forme, incluse
le due della sezione e i codici invisibili) e in `tests/card-cambio-to-sala.spec.ts` la spec E2E
«quando non c'è niente da accendere, l'avviso dice DOVE la persona è davvero», che prende una richiesta
VERA la cui persona non è disegnata dalla board (nella dev di oggi: Piscopo, 29/09, codice `A`) e
pretende il codice fra parentesi, nessuna frase generica e il punto finale — misurato dal vivo:
«Nicola Piscopo non è in sala nel turno Notte del 29 — quel giorno è assente (A).» Per un mese
GENERATO dal tree (`schedule.data` assente) la frase cambia: «nel mese teorico quel giorno non
risulta in turno» — è una previsione, non un fatto del PDF.

**UNA COPIA INVENTATA NON GIUDICA (19/09/2026 — trovato inseguendo un test instabile, ed è la causa
più insidiosa del giallo).** La spec della pillola falliva 1 volta su 4, sempre alla PRIMA lettura,
con la pillola accesa E l'avviso a schermo. La sonda con i log della decisione (`found`, `flashInAltri`,
`pills`, `fresco`) ha mostrato la sequenza: `{found:false, fresco:true, mese:'2026-03', selectedDay:18,
pills:0}` seguito da `{found:true, flashInAltri:true, pills:4}`. Cioè: la board ha giudicato su un
mese TEORICO **generato per un mese che ha il PDF** — `useShiftTeamTreeData` risolve mentre il mese
vero (cache/DB) è ancora in volo, e l'effetto «il mese corrente è teorico e non è ancora stato
generato: rigenera ora» dipingeva una copia PREVISTA di 2026-03, con `mettiMese(...)` fresco=true →
l'effetto dell'avviso trovava 0 pillole e diceva «non è in sala» su una persona che nel PDF c'è (e la
frase era quella nuova, «non risulta in turno in questo mese»). Il rimedio è una riga in
sala-page-client: quell'effetto rigenera SOLO se `!isUploaded(currentMonthRef.current)` — è il caso per
cui esiste; per un mese caricato la copia vera sta arrivando. (Le altre strade del teorico restano
fresche: il ramo «mese non caricato» di `handleMonthChange`, il fallback dopo un `data === null`
— mese cancellato — e la cancellazione del mese: lì il generato È la risposta finale.)
REGOLA DA NON DIMENTICARE: la copia in IndexedDB già non decideva (`scheduleFresco`), una copia
INVENTATA non deve decidere ancora di più. **CACCIA CHIUSA il 25/09/2026: la corsa È riproducibile a
comando.** Basta togliere la guardia e rilanciare la spec della pillola (`--repeat-each=3`, che rallenta
di 1,2 s il mese): **3 fallimenti su 3**, sempre con la stessa frase — «PASSANNANTI non è in sala nel
turno Pomeriggio del 18 — **nel mese teorico** quel giorno non risulta in turno», su un 2026-03 che ha
il PDF. Il `nel mese teorico` nella frase è la firma del difetto: se un utente legge quella parola su un
mese che ha il PDF, la board sta giudicando una copia inventata. Con la guardia: 3 su 3 verdi. (La
versione precedente di questa nota diceva che la corsa non era forzabile: era sbagliata, e il modo per
provarla era disattivare la riga invece di cercare di indovinare i tempi.)

---

## 25/09/2026 — Due difetti dai telefoni: il giallo dopo lo swipe-back e il testo del turno «che puoi coprire»

Segnalazione dell'utente, la prima su iOS (Android da verificare): (1) si tappa la data di un cambio, si
arriva in `/turnisala` e — facendo swipe-back per tornare in dashboard — compare il popup GIALLO «non è in
sala» per un cambio che esiste; (2) il filtro «solo se posso coprirlo» sui NUOVI turni agisce, ma la
notifica che arriva è quella GENERICA, non il messaggio dedicato ai cambi compatibili.

**(1) IL GIALLO DOPO IL RITORNO — due cause, due rimedi.** La board non è mai stata la pagina che
sbagliava: sbagliava il MOMENTO in cui giudicava e il FATTO che l'avviso vivesse più della board.

- *Giudizio su un mese inventato* (la causa vera, quella già sospettata il 19/09): mentre il mese del PDF
era in volo, l'albero squadre risolveva e la board dipingeva una copia TEORICA dello stesso mese, marcata
fresca, e ci giudicava sopra. Su iOS è molto più probabile che su Android: Safari **cancella** la cache
IndexedDB (tetto ITP a 7 giorni di storage script-writable), quindi `readCachedSchedule` torna vuoto
(`mettiMese(null)`) e la finestra senza dati veri è larga. Guardia: l'effetto rigenera solo se
`!isUploaded(...)` (vedi la sezione qui sopra). Rinforzo dello stesso giro: anche il FALLBACK teorico per
un mese che il DB dà per caricato (riga mancante, elenco mesi vecchio) ora è `mettiMese(gen, false)` — è
una previsione, non può accusare nessuno.
- *L'avviso sopravvive alla pagina*: il toaster di sonner vive nel layout RADICE, quindi un «non è in sala»
emesso dalla board resta a schermo sulla pagina in cui si va — ed è esattamente quello che l'utente
vede: «torno in dashboard e il giallo c'è». Su iOS è peggio: la pagina in pausa **sospende i timer**, così
il popup resta congelato oltre la sua durata e riappare al ritorno. Rimedi in `desk-board`: l'avviso ha un
id FISSO (`SALA_FOCUS_WARNING_ID`) e viene SPENTO quando la board si smonta (`toast.dismiss`) — un avviso
sul posto di una persona in sala è un'informazione di QUELLA pagina; e la board NON giudica mentre la
pagina è nascosta (`visibilitychange` → stato `pageVisible`), perché in quel momento non ha un lettore:
al ritorno visibile l'effetto rigira e il giudizio ARRIVA (se il respiro è ancora in vita: se è già
scaduto, l'avviso non ha più contesto e non esce — scelta voluta).

Prove (chiave `SUPABASE_SERVICE_ROLE_KEY`, server dev su :58922, suite intera dopo le modifiche: **124
passati / 8 saltati**):
- `tests/card-cambio-to-sala.spec.ts` — **«tornando indietro dal salto non esce nessun «non è in sala»»**:
dalla dashboard si tappa la data di una richiesta VERA (delle prime tre persone con una card visibile),
si aspetta l'arrivo in `/turnisala` (con il mese rallentato di 1,2 s) e si torna indietro col gesto di
sistema — `page.goBack`, cioè la stessa navigazione di storia dello swipe — in DUE momenti: subito (300
ms, mese ancora in volo) e dopo il respiro. Un MutationObserver registra ogni popup comparso: nessuno
deve dire «non è in sala», e sulla dashboard non deve restare nessun avviso.
- **«la board non giudica mentre la pagina è nascosta: lo fa quando torna visibile»**: lo stato di
visibilità è finto con `addInitScript` (come lo legge la board) — la pagina nasce `hidden`, il mese
arriva (rallentato di 1,5 s), la board tace; poi `__vis('visible')` e l'avviso ARRIVA. Verificato che
morda: con la guardia disattivata fallisce con «la board ha dichiarato «non è in sala» mentre la pagina
era nascosta».
- La spegnitura alla partenza è provata dentro la spec «quando non c'è niente da accendere, l'avviso dice
DOVE la persona è davvero»: dopo l'avviso si esce da `/turnisala` con una navigazione CLIENT (Link
«Cambi» della bottom-nav, click DISPACCIATO: in `next dev` l'indicatore di Next copre la bottom-nav e
intercetta i click veri) e si pretende che il popup sparisca entro **0,8 s** — ne vive 4 e il click è ~1 s
dopo la sua comparsa, quindi una finestra così corta non può essere soddisfatta dalla scadenza naturale:
solo dalla spegnitura. Verificato che morda: con `toast.dismiss` disattivata fallisce.
- Il giallo-su-mese-inventato è provato dalla spec della pillola con la guardia tolta: **3/3 fallimenti**
(vedi la sezione precedente).

**(2) IL NUOVO TURNO COMPATIBILE HA IL SUO MESSAGGIO.** Il filtro `notify_shift_filter` sceglieva bene i
destinatari ma il testo era UNO per tutti: `new_shift.title`, «X cede Y il gg/mm, cerca …». Chi lo
riceveva non sapeva perché lo stava ricevendo. Ora in `lib/notification-templates.ts` c'è
`new_shift.compatible.title` — titolo «Nuovo turno che puoi coprire», testo «{cognome_attore} cede {turno}
il {data}: quel giorno sei in {turno_effettivo}, uno dei turni che cerca ({turno_cercati})» — e
`app/api/push/notify/route.ts` sceglie il messaggio **PER DESTINATARIO**: chi è passato dal filtro
riceve il dedicato, gli altri il generico (con caduta «senza data»). La variante su cui si era copiata,
`interest.compatible.title`, è stata **RIMOSSA nello stesso giro** perché era codice morto: sull'interesse
la compatibilità è implicita nel gesto (chi si interessa alla mia proposta mi dà uno dei turni che ho
chiesto), quindi l'interesse è sempre generico e il filtro vive SOLO sui nuovi turni altrui. Registry:
23 messaggi (+1 nuovo turno compatibile, −1 interesse compatibile). Per farlo basta che la mappa della compatibilità porti anche QUALE
turno è (`{ copre, shift }` invece del solo booleano) — niente query in più. Contratto:
`scripts/check-notif-templates.mjs` verifica il testo reso con i valori d'esempio e che il route risolva
INSIEME generico e dedicato (se qualcuno riscrivesse l'invio per destinatario, la variante sparirebbe in
silenzio e il difetto tornerebbe). Messaggi in registry: **24**.

**IL GIRO RIFATTO SUL MOTORE DI iOS (25/09/2026, WebKit 26.6 via Playwright).** Le due guardie
«engine-agnostiche» sono state provate sul browser vero di iPhone, non solo a 320px su Chromium.Prima WebKit non era nemmeno installato (`npx playwright install webkit` → `webkit-2359` nella cache di
Playwright, fuori dal repo) e `playwright.config.ts` aveva un solo progetto, chromium: il giro era stato
fatto con una config temporanea, cancellata dopo la corsa. Adesso è un PROGETTO VERO (vedi la sezione
«Il motore di iOS entra nella suite»), così non è più una prova una tantum. Risultato: le **quattro**
spec dello stesso cantiere verdi su iPhone 13 emulato (pillola, «dove la persona è davvero», «tornando
indietro», «nascosta») — e le controprove mordono anche lì: con `toast.dismiss` disattivata fallisce con
«l'avviso della board è sopravvissuto all'uscita da /turnisala» (il sintomo esatto dell'utente), con la
guardia di visibilità disattivata fallisce con «la board ha dichiarato «non è in sala» mentre la pagina
era nascosta».

**Nota onesta sulla CORSA del mese inventato: su WebKit NON si riproduce** (con la guardia tolta e il
mese rallentato prima 1,2 s e poi 3 s: 1 verde su 1, contro 3 fallimenti su 3 su Chromium). La ragione è
che la corsa è un fatto di ORDINE: serve che l'albero squadre (ripristinato da IndexedDB + staleTime
6h) risolva DOPO che il mese di destinazione è stato azzerato dal cache-miss (`mettiMese(null)`). Su
WebKit l'albero è già lì al primo render, quindi l'effetto gira quando a schermo c'è ancora il mese
dell'SSR (non nullo) e non dipinge mai la copia inventata; su Chromium (e su iOS vero, dove Safari
CANCELLA l'IndexedDB col tetto ITP di 7 giorni) l'ordine è l'altro. Questo è coerente con la
segnalazione «succede su iOS»: non è una differenza di codice ma di quando arrivano i due dati. Quindi:
la guardia è provata su Chromium e dai log reali del 19/09, su WebKit è « innocua e tutto verde» — non
«riprodotta».

**IL MOTORE DI iOS ENTRA NELLA SUITE (25/09/2026).** Nuovo progetto `ios` in `playwright.config.ts`:
WebKit con `devices['iPhone 13']`, `testMatch` sulle spec del SALTO IN SALA e della BOARD
(`card-cambio-to-sala`, `sala-mese-da-cache`, `sala-card-presence`, `dipendente`, `chip-gialle`). Le
stesse spec restano nel progetto `chromium` (un comportamento che regge su un solo motore è un difetto
che non abbiamo): suite intera **155 passati / 8 saltati in 3,2 minuti**, di cui **31 su WebKit in 1,3
minuti**. Serve `npx playwright install webkit` una volta per macchina (documentato in tests/README.md).

**IL SERVICE WORKER MANDAVA IN TILT IL BANCO DI PROVA (trovato proprio qui, e vale la pena saperlo).**
Tre spec di `dipendente.spec.ts` su WebKit morivano a 180 s sul click della linguetta del turno:
`<div data-slot="dialog-overlay" data-base-ui-inert …>` intercettava i click — il popup «Novità di
questa versione». Eppure `tests/browser-setup.ts` blocca `/api/changelog` con `context.route(...)`:
su WebKit il dialog si apriva lo stesso (verificato con una sonda: chromium 0 overlay, WebKit 1, con il
testo del changelog). La causa è che il service worker dell'app (quello delle push) **prende il
controllo della pagina** e le richieste che fa lui NON passano da `context.route` — quindi il blocco
non c'era più. Rimedio: `serviceWorkers: 'block'` sul progetto `ios` (le push non sono coperte da
quelle spec). Lezione generale: quando un test si pianta su un overlay che non dovrebbe esserci, la
prima domanda è «chi l'ha riportato in vita?» — e con un SW di mezzo la risposta può essere «non il
codice, ma il fatto che l'intercettazione non lo vede».

**RIMOSSO `interest.compatible.title` (25/09/2026, decisione dell'utente).** Era codice morto:
sull'INTERESSE la compatibilità è implicita nel gesto (chi si interessa alla mia proposta mi dà uno dei
turni che avevo chiesto), quindi non c'è niente da filtrare né da spiegare. L'interesse torna SEMPRE
generico (`interest.title` o la caduta «senza dettagli»), sparisce il ramo filtrato dal route (e la
colonna `notify_shift_filter` dalla select del proprietario), e il filtro «solo se posso coprirlo» vive
solo sui NUOVI turni altrui (`new_shift.compatible.title`). Registry: 23 messaggi — invariato rispetto
all'inizio della giornata (+1 nuovo turno compatibile, −1 interesse compatibile). Il contratto
(`scripts/check-notif-templates.mjs`) non chiede più la chiave rimossa e verifica la coesistenza, nel
route, di generico + dedicato + caduta per il nuovo turno.

Stato: modifiche NON committate (`app/api/push/notify/route.ts`, `lib/notification-templates.ts`,
`components/sala/desk-board.tsx`, `app/(app)/turnisala/sala-page-client.tsx`, `playwright.config.ts`,
`scripts/check-notif-templates.mjs`, i due spec, tests/README.md e questo diario) + il WIP preesistente
su `scripts/check-assenti.mjs` (crasha, fuori dai piedi). Su Android il gesto non esiste (back di sistema o
toolbar): la navigazione di storia è la stessa e le due guardie valgono lì come su iOS — verificato su
Chromium E su un Pixel 7 emulato (le due spec nuove verdi in entrambi i casi).

## 25/09/2026 (sera) — Quattro difetti segnalati dall'utente

**1. LE SIGLE DEL DATEPICKER SU iOS.** «lun mar mer» non stavano sopra le loro colonne. La riga
delle sigle di react-day-picker è una `<tr>` con `display:flex` dentro una `<table>` che il CSS di
`ios-dialog-fix` rende `display:block`: WebKit ci costruisce attorno una tabella ANONIMA, la riga
torna a essere una table-row e il flex viene IGNORATO — ogni `<th>` si stringe sul suo testo («lun»
17,2 px, «dom» ~25 px) mentre le colonne dei giorni sono 44,2 px. Misurato su iPhone 13: il primo
giorno cade 13,5 px a destra di «lun», il settimo 157 px. Chromium non ha il difetto (onora il flex
sulla `<tr>`): per questo si vedeva solo dal telefono. Rimedio: `.ios-dialog-fix thead { display:
block !important; }` (la riga resta un flex container in un contesto normale). La prova è in
`tests/shift-dialog.spec.ts` (ogni sigla centrata e larga come la colonna, tolleranza 1 px) e gira
anche nel progetto `ios`, che è il motore che ha il difetto: senza la regola fallisce con «lun»
fuori asse di 13,5 px. **Trappola dell'ambiente:** il dev server non ha ripreso la modifica a
`app/globals.css` (Turbopack) e la spec falliva su una copia vecchia del foglio — il foglio servito
si controlla con `curl http://localhost:3000/_next/static/chunks/*.css | grep`, e basta toccare il
file perché si ricompili. Una lezione per la prossima volta: quando una prova su stile non cambia
di una virgola, prima si guarda che il CSS servito sia quello su disco.

**2. LA VERIFICA PRE-PUBBLICAZIONE CHIEDEVA LA COSA SBAGLIATA.** Il popup «Richiesta non coperta
dal tuo turno» usciva su OGNI pubblicazione, anche su richieste in regola — segnalazione: «Pietro
Nevano ha offerto notte per mattina il 25 settembre e, pur avendo notte, ha avuto il warning». La
verifica riusava `userCoversRequest` — la domanda del FILTRO NOTIFICHE, dove il soggetto è CHI
RICEVE («posso coprire il tuo cambio solo se quel giorno ho uno dei turni che chiedi») — sul
richiedente: «il mio turno è fra quelli che cerco?». L'UI non lascia cercare il turno che si
offre, quindi quella condizione era insoddisfacibile per costruzione. Dati veri (Management API su
produzione, read-only): richiesta 2544, `offered_shift='Notte'`, `requested_shifts=['Mattina']`, e
la riga `NEVANO` del PDF di settembre il 25/09 vale `N5T` → Notte. La domanda giusta è di
POSSESSO: il turno OFFERTO è quello che quel giorno ho davvero? Ora `/api/shift-compat` prende
`offered=` (non più `requested=`) e risponde `{ myShift, source, token, certain, ok }`;
`ownShiftMatchesOffer` (lib/shift-compat) NON avvisa quando il dato non c'è o non è attribuibile, e
il dialog mostra il popup solo su `ok === false` (non `!ok`: un contratto rotto non deve accusare
nessuno). Il popup dice il vero: «Offri un turno che quel giorno non hai — il 25 settembre hai
*notte* (dal turno reale), ma offri *mattina*».

**3. L'OMONIMO CHE L'ALBERO NON LEGA.** Marchiare `UserShiftOnDate.certain` è servito subito: su
PRODUZIONE `shift_team_members.user_id` è NULL per TUTTI gli 87 membri (il legame «NEVANO P.» →
Pietro esiste solo su dev, fatto a mano: nessuna migration lo porta) e il membro si chiama «NEVANO»
senza iniziale. Lì `buildBareOwners` torna vuoto, `findMonthPerson` restituisce la STESSA riga PDF a
Pietro e Giuseppe, e il turno di uno diventava il turno dell'altro: una verifica di possesso su
quei dati accusa la persona sbagliata. Da qui `omonimoSenzaLegame` (lib/shift-teams-matching):
cognome condiviso + nessun membro legato = nessun nome ridotto al solo cognome è suo con certezza,
quindi il dato si tratta come MANCANTE (nessun avviso) — sia dal PDF sia dalla rotazione teorica.
Su dev, dove il legame c'è, non cambia niente.

**4. L'EVINDENZIA GIUDICAVA UNA VISTA CHE L'UTENTE AVEVA LASCIATO.** «Si preme sulla data di una
card, si arriva in /turnisala e, con l'highlight ancora in corso, se si cambia turno P/M/N (o si
torna indietro) esce il giallo di utente non presente in sezione». Il giudizio della board ha senso
solo sulla vista dell'ARRIVO: `arrivoInVista` (month+day+shift uguali a quelli del flash) spegne il
flash in silenzio appena la vista cambia, e l'effetto del giudizio legge lo STESSO predicato. **Nella
stessa passata di effetti `flash` è ancora quello vecchio**: spegnere lo stato non basta, il
controllo va ripetuto nel corpo dell'effetto del giudizio (`if (!arrivoInVista) return`) — senza
quella riga l'avviso esce lo stesso, un istante prima della spegnitura. Riprodotto prima di
correggere (controllo negativo, disattivando il predicato): la spec fallisce con «Rosalia Piccirillo
non è in sala nel turno Mattina del 27 — quel giorno è in sezione «11» (M11)», il sintomo esatto.

**4b. DUE LEZIONI DALLE SPEC DEL RESPIRO** (il cantiere del 25/09 si è chiuso qui, e sono costate
più tempo del fix). *(i)* L'harness prendeva il primo cognome dalle card della board e costruiva la
URL con il solo `c=`: per un cognome OMONIMO quella URL non è quella che manda la dashboard (che
porta sempre anche `n=`), la board giustamente non accende niente e la spec falliva accusando la
card — con i log dell'app che dicevano `found: false`. Ora l'harness porta **anche l'iniziale**
(«Loni G.» → `c=Loni&n=G.`) e prova i primi tre candidati finché uno si accende. *(ii)* La durata
dei 3s non si misura con una pausa del test: dopo un pacco di letture DOM la `waitForTimeout(1200)`
cadeva **dopo** la fine dell'evidenzia (falliva «il respiro è finito troppo presto» su una card che
era durata esattamente 3s). Ora un `addInitScript` installa un `MutationObserver` PRIMA che l'app
parta e registra inizio/fine della classe: la durata si legge dal cronometro della pagina (3s ±
0,5), non dalla posizione del test. Trappola dentro la trappola: in uno script di init `document`
esiste ma `documentElement` no — osservare `documentElement` lancia «parameter 1 is not of type
'Node'» e il cronometro resta muto (il sintomo era un `waitForFunction` in timeout a 15s). E una
spec nuova, **«un salto verso un ALTRO mese accende lo stesso»**: la board si apre sul mese di oggi
e solo dopo raggiunge quello dell'arrivo, e l'evidenzia non deve morire in quell'istante. Onestà su
questa: passa anche con la versione precedente della guardia (il mese di destinazione cambia nella
stessa commit, quindi la finestra «non ancora arrivato» è di un istante), quindi NON è la spec che
dimostra il fix — è la rete che tiene fermo il caso. Il fix lo dimostra il controllo negativo su
`arrivoInVista`, e i numeri li dà il cronometro del respiro (3s, non 1s).

**5. L'ANNO DELLE FERIE NON EREDITA GLI OVERRIDE DI UN ALTRO ANNO.** «Impostando da admin primo
anno turniferie 2027 e andando nella pagina 2027, aggiornando più volte alcune persone cambiano
periodo». La pagina chiedeva gli override DUE volte per apertura (prima l'anno corrente, poi il
minimo che arriva dalle impostazioni) e NESSUNA delle due risposte si arrendeva: se vinceva la
2026, la pagina 2027 mostrava i SUOI override — periodo diverso a ogni aggiornamento. Tre rimedi in
`app/(app)/turniferie/page.tsx`: sotto il minimo non si chiede niente (la pagina è il gate), la
risposta vale solo se l'anno a schermo è ancora quello che l'ha chiesta (`annullato`), e l'anno
nuovo NON eredita la mappa di quello vecchio (si parte dalla cache di QUELL'anno o dal vuoto).
Riprodotto in `tests/turniferie-anno.spec.ts` con le risposte finte (la 2026 arriva 2 s dopo la
2027): senza la guardia, `ZZPROVA` finisce nel periodo del 2026.

**6. IL COGNOME NUDO LO GIUDICA IL ROSTER (25/09/2026, sera).** L'utente ha spiegato il caso:
NEVANO è l'unica omonimia dell'app, e nei PDF il nome resta NUDO perché il secondo utente
(Giuseppe) è **fuori dai turni** — non compare in nessun PDF caricato. Scelta dell'utente per il
segnale: **il roster delle squadre**. Quindi `omonimoSenzaLegame` (che guardava solo «cognome
condiviso + nessun bare owner») è stato sostituito da due funzioni in `lib/shift-teams-matching`: `buildRosterUserIds(tree)` (gli utenti con un membro ATTIVO legato — tipologie e membri spenti non
contano, come nel motore teorico) e `omonimiaInSala(cognome, users, rosterIds)`, che risponde:
`proprietarioId` se in turno c'è UN SOLO collega con quel cognome (la riga nuda è sua), `ambigua` se
in turno ce ne sono due o più **oppure** se in turno non ce n'è nessuno ma due utenti condividono il
cognome (roster non legato: non si sa chi lavora → si tace). In `getUserShiftOnDate` il roster si
legge UNA volta e vale per entrambi i rami (reale e teorico), e `certain` nasce lì.

La differenza sui dati veri, misurata il 25/09:

| | DEV | PRODUZIONE |
|---|---|---|
| roster | `NEVANO P.`, attivo, **legato a Pietro** (87 membri, 1 legato) | `NEVANO` (nudo), attivo, **senza legame** (87 membri, 0 legati) |
| riga del PDF (2026-09) | una sola, `NEVANO`, `N5T` il 25/09 | identica |
| Pietro, 25/09 | `N5T` reale, **certo** | `N5T`, non certo (si tace) |
| Giuseppe, 25/09 | **nessuna riga**, non certo | `N5T` (la riga di Pietro), non certo |

Prima di questa regola, su dev, Giuseppe risultava «certo» sul nulla (e la `certain` era l'unica
cosa che impediva a produzione di accusare). Su **produzione** la regola resta in astensione finché
quel membro non viene legato a Pietro (o rinominato con l'iniziale **e** legato: `buildBareOwners`
richiede `user_id`): da quel momento Pietro risponde da solo e l'ambiguità sparisce senza toccare il
codice.

**6b. DUE CORSE NELLE SPEC, TROVATE ENTRAMBE DALLA SPEC DEL SALTO FRA MESI.** *(i)*
`giornoTurnoBoard` leggeva il mese col primo nome che somigliava a un mese: ma la toolbar scrive
«**MAR** 4 Ago 2026», e per il *martedì* rispondeva MAR=marzo (la spec è morta con «la board non è
passata al 2026-08 (ricevuto 2026-03)»). Ora il mese si legge dalla DATA (`4 Ago 2026`), con il
vecchio metodo come ripiego — e succedeva solo di martedì: una trappola che si sarebbe ripresentata
una volta a settimana. *(ii)* Dopo il `goto` la board si apre sul mese di OGGI e passa a quello
dell'arrivo in due tempi (prima la toolbar, poi i nomi nei riquadri): leggere le card in mezzo
prende l'equipaggio del mese sbagliato. Ora si aspetta anche che le card abbiano nomi, si raccolgono
fino a tre candidati e si pretende che ALMENO UNO si accenda (un candidato può non accendersi per un
motivo legittimo: il PDF scrive il nome in un altro modo).

**6c. LA REGOLA DEL ROSTER VALE OVUNQUE SI LEGGA UN NOME NUDO (25/09/2026, notte).** Fino a qui il
roster decideva solo dentro la verifica (`certain`), mentre la MATCHING delle schermate della sala
usava ancora la regola vecchia: «cognome duplicato fra gli UTENTI + un membro legato», con il
proprietario pescato come *il primo membro legato* del cognome. Ora `buildBareOwners(tree,
duplicati, users?)` prende l'anagrafica e chiede al roster: il proprietario è l'unico collega IN
TURNO con quel cognome; se in turno ce ne sono due o più il nome nudo **non è di nessuno** (prima
vinceva l'ordine dell'albero — arbitrario); se il roster non è legato resta la regola del solo
legame (produzione: nessuna attribuzione). E l'attribuzione non dipende più solo dall'INIZIALE:
`ownsBareNameFor(user, bareOwners)` guarda l'**identità** (`user.id` contro `owner.userId`) e ripiega
sull'iniziale solo quando l'id non c'è. Serve al caso produzione: legando il membro «NEVANO» a
Pietro **senza rinominarlo** l'owner ha un userId e nessuna iniziale, quindi la verifica (che passa
un id) risponde lo stesso; la BOARD invece confronta nomi, quindi lì l'iniziale serve ancora — ed è
esattamente il rinomino che il dialog admin propone («NEVANO» → «NEVANO P.»).

I punti dove la mappa si costruisce ora passano tutti l'anagrafica: `lib/shift-compat`,
`app/(app)/tuoturno/page.tsx`, `components/sala/desk-board.tsx` (chip gialle, assenze, evidenzia),
`components/shifts/shift-dialog.tsx` (pillole del datepicker) e `lib/queries/shift-cleanup.ts` (la
pulizia dei turni). Misurato sui dati veri di dev dopo la modifica: owner `NEVANO P.` → Pietro,
Pietro possiede la riga nuda (25/09 → `N5T`, certo), Giuseppe no (nessuna riga, non certo) — cioè
il comportamento di prima, ma deciso dal roster invece che dall'ordine dei membri nell'albero.

**6d. IL FLASH FRA MESI AVEVA UN'ATTESA TROPPO CORTA, NON UN DIFETTO.** Due giri pieni di suite
(4 worker × WebKit × il DB di dev) hanno fatto cadere **una volta ciascuno** una spec diversa della
famiglia del salto, entrambe con «nessuno fra … si è acceso» e **nessun avviso**: cioè senza che la
board avesse ancora giudicato l'arrivo. Isolate durano 4,5s, sotto carico l'avvio della board
supera i 20s di attesa che avevo messo lì — insufficienza della PROVA, non della card (nessuna delle
tre persone del caso è un omonimo: con `bareOwners` vuoto per quei cognomi la regola del roster è
inerte, quindi il fallimento non poteva venire da 6c). Ora l'attesa è 45s, il timeout della spec
240s, e il messaggio di fallimento porta con sé la DIAGNOSI: il mese a schermo della toolbar e gli
avvisi presenti. Sul giro successivo: **180 passati / 8 saltati**, zero falliti.

Stato: i punti 1–5 e 6–6b sono in `e1b1f9d` (14 file), i punti 6c–6d in `df6c967` (11 file) —
entrambi **pushati su dev**, nessun merge su `master`. I file di 6c/6d sono:
`lib/shift-teams-matching.ts`, `lib/person-shift.ts`, `lib/shift-compat.ts`,
`app/(app)/tuoturno/page.tsx`, `components/sala/desk-board.tsx`,
`components/shifts/shift-dialog.tsx`, `lib/queries/shift-cleanup.ts`,
`tests/sala-card-presence.spec.ts`, `tests/card-cambio-to-sala.spec.ts` (6d) e questo diario.
Fuori da tutto resta il WIP preesistente su
`scripts/check-assenti.mjs` (crasha, fuori dai piedi).

**6e. IL LEGAME SU PRODUZIONE È STATO FATTO — E LA LISTA È UN'ALTRA COSA (26/09/2026).** L'utente ha
fatto il merge su `main` e in Admin → Squadre ha legato `NEVANO` della squadra Scorte/Rilievo D a
**Pietro** e l'ha rinominato `NEVANO P.`. Verificato in sola lettura sul DB di produzione: legame e
rinomina sono a posto (`NEVANO P.` → Pietro, attivo, tipo Scorte attivo). 

Poi la domanda: «non lo leggo più nella lista degli utenti in /tuoturno e nel confronta». **Non
c'entra il legame**: manca dalla lista perché sulla riga `users` di Pietro c'è
`show_in_compare = false` — il flag della migration 026, che l'admin governa dal dialog «visibilità
del confronto» — e la lista del selettore filtra proprio su quello (`buildCompareGroups`: `visible =
users.filter(u => u.show_in_compare !== false)`). Su produzione i nascosti sono 6 su 88, e Giuseppe
(il gemello) ce l'ha invece acceso: da qui l'effetto «sparito». Nessun codice da toccare: si
riaccende dalla scheda admin. Lezione da tenere: **legame di squadra e visibilità nelle liste sono
due interruttori diversi**, e cercare la causa nel primo è la strada sbagliata.

---

## 7. TRE FUNZIONI NUOVE (26/09/2026 sera)

**7a. TAP SU UN GIORNO DI /tuoturno → /turnisala.** La griglia personale di /tuoturno usa la STESSA
URL del salto dalla dashboard (`buildSalaFocusUrl`, lib/shift-tokens): tap sul giorno → mese, giorno,
turno P/M/N e persona nell'URL, e la board risponde col solito respiro di 3s (e con la solita
verifica). Il tap si accende **solo dove la board ha qualcosa da accendere**: la condizione è
`sectionTurnOf(token)` sul REALE del giorno (senza reale — mese solo teorico — vale il teorico).
Riposi, assenze, trasferte e codici senza card non sono bersagli: nessun `data-sala-day`, nessun
handler. In pratica la card ha `role="button"` + `data-sala-day` quando è tappabile (nello stile del
progetto: vedi `shift-item`), resta un `div` quando non lo è. Nel CONFRONTO le card restano celle di
lettura (la feature è della griglia personale).

**7b. LA PULIZIA DEI CAMBI GUARDA ANCHE I GIORNI FUORI SALA.** Una richiesta di cambio è inutile non
solo quando il cambio è già avvenuto, ma anche quando **quel giorno non c'è nessun turno da cedere**:
assenza (A, AG7, F, F.E., VS, Trasf…) o attività senza sezione (trasferte `Dis*`/`NDis*`/`Trasf`,
corsi `Sp*`, istruttori `ISp*`/`*TUTOR`, turni «nudi»). Il predicato è `fuoriSalaInfo(token)`
(lib/sala-month, accanto a `spiegaCodiceNonMostrato`): è **assenza** oppure la board la mette in
**«Altre attività»** (`boardPlacementOf` → `altri`).

**Il confine è deciso, non dedotto** (l'utente ha scelto fra tre opzioni): restano FUORI riposi
(RC/RI/RM), disponibilità (D) e i codici che la board non mostra (G, Na, MSb, TIR, 12.14…).
Allargare è cambiare una condizione in `fuoriSalaInfo` — ed è inchiodato in
`tests/pulizia-fuori-sala.spec.ts` (che elenca proprio quei codici come «non devono far scattare la
pulizia»), così se qualcuno allarga lo fa sapendo.

Il codice del giorno NON si può leggere dal calendario espanso (`DaySchedule`): lì ci sono sezioni,
altri presenti e presenze senza sezione, **non le assenze** — quelle vivono solo nella forma compatta
v2. Quindi `computeShiftCleanup` legge SEMPRE la riga `sala_schedule` (anche quando l'upload gli
passa la schedule appena decodificata) e ne ricava `realTokens` con
`dayTokensForRequests`/`loadRealDayTokens`. La conferma dell'admin (`POST /api/admin/shift-cleanup`)
non ha la schedule: ricostruisce gli stessi token dagli id con `loadRealDayTokens` e sceglie il testo
di conseguenza.

Due messaggi NUOVI nel registro (`cleanup.fuori_sala.title` al richiedente,
`cleanup.fuori_sala.gone.title` agli interessati — richiesta esplicita dell'utente: anche gli
interessati vanno avvisati), modificabili dal pannello debug come tutti gli altri. Nel dialog di
pulizia ogni riga dice il motivo (`fuori sala quel giorno: Ferie (F.E.)` oppure `già in Mattina nel
calendario`). Quando una persona ha più richieste ripulite di motivi diversi vince il motivo
«fuori sala» (spiega meglio la sparizione; il numero delle altre resta in `{extra}`).

Misurato sui dati veri di dev (sonda poi cancellata): sui mesi caricati marzo→settembre 2026 i
candidati sono **1** con la nuova regola — *Piscopo Nicola, 29/09/2026, offre Notte cercando
Pomeriggio, ma quel giorno il PDF lo dà «A» (Altre presenze)* — e **0** esauriti. Zero falsi
positivi sugli altri 200 giorni-persona.

**SI GUARDA SOLO LA RIGA REALE, MAI IL TEORICO** (richiesta utente 26/09/2026: «voglio che consideri
solo i turni reali, anche per la pulizia che avevamo già implementato»). Verificato prima di
rispondere, perché la risposta non poteva essere «sì, credo»: la pulizia non nominava mai `teorico`
(`grep` su `shift-cleanup.ts` e sul route: zero occorrenze), i token del giorno vengono da
`decodeSalaMonth(...).days` (la riga `d` del v2) e le sezioni da `buildScheduleFromMonthData`, che
applica anch'esso `days`. Le due righe però **non coincidono quasi mai**: nei mesi caricati
differiscono in ~**40% delle celle** (a settembre 1156 su 2910, a marzo 1265 su 3038) — quindi la
scelta conta davvero, non è teorica.

La prova che ha reso la regola concreta è il caso già noto: **Piscopo 29/09/2026, reale «A», teorico
«N7T»**. La sua richiesta offriva *proprio* Notte: con la riga teorica la pulizia non troverebbe
niente da fare (sembra che quel giorno il turno ce l'abbia), con la riga reale la richiesta è morta
(assenza) — ed è quella che si usa. La variante «tutto teorico» è stata calcolata per curiosità su
tutti i mesi caricati: **0 candidati** contro l'1 reale. Due prove nuove in
`tests/pulizia-fuori-sala.spec.ts` inchiodano la regola nei DUE versi (reale = assenza + teorico =
Notte → si ripulisce; reale = turno chiesto + teorico = riposo → si ripulisce come «già avvenuto»),
con la controprova che col teorico non uscirebbe nulla.

**E UNA CELLA GIALLA NON È UN TURNO CONFERMATO** (chiarimento dell'utente, stessa sera: «le celle
con sfondo giallo sono delle ipotesi di turno reale ma diverse dal teorico»). Quindi la pulizia —
che CANCELLA e NOTIFICA — non decide mai su un giallo: né «il cambio è già avvenuto» né «quel giorno
non sei in sala». La richiesta resta dov'è, in attesa della conferma. In termini di codice la riga
reale di un giorno è ora `{ token, pending }` (`RealDayState`, da `dayStatesForRequests` /
`loadRealDayStates`, col giallo da `person.yellow`), e `findFulfilledShiftRequests` esce subito se
`pending`: una guardia sola, perché le due strade della pulizia sbagliano allo stesso modo. La
conferma dell'admin ricontrolla lo stato DAL DB (`loadRealDayStates` nel POST) invece di fidarsi di
ciò che l'anteprima aveva visto: fra i due momenti possono passare giorni.

Attenzione a non confondere le due regole, che sono indipendenti: **il giallo non c'entra col reale
vs teorico**. Misurato sui dati di dev: la cella di Piscopo del 29/09 **non è gialla** (è un'assenza
vera), e delle 3 richieste presenti nel mese nessuna cade su un giorno giallo — quindi la regola del
giallo oggi non cambia NESSUN candidato (1 prima, 1 dopo), e serve per il futuro invece che per il
presente. `tests/pulizia-fuori-sala.spec.ts` prova che il blocco vale per entrambe le strade e che è
il giallo a decidere (gli stessi dati senza giallo finiscono ripuliti). **Controllo negativo
fatto**: disattivando la guardia (`if (false && state?.pending)`), falliscono esattamente le due prove
del giallo e le altre dieci restano verdi.

**7c. NUOVO CAMBIO FERIE, FILTRATO SUL MIO PERIODO.** Specchio di `notify_shift_filter`: nuova colonna
`users.notify_vacation_filter` (migration **034**, applicata su dev via
`scripts/apply-release-migrations.mjs --from 034 --to 034 --apply`; su PRODUZIONE non ancora), nuova
voce in Impostazioni («Solo se compatibile col mio periodo», attiva solo con «Nuovo cambio ferie
disponibile»), e il predicato `vacationFilterKeeps(filterOn, myPeriod, targetPeriods)` in
lib/vacations — **la stessa funzione che usa il route**, così la logica provata è quella spedita.
Il periodo del destinatario è il suo periodo dell'anno richiesto, rotazione applicata e **override
admin compresi** (`getEffectivePeriodForYear`); il filtro tiene chi ha un periodo fra quelli che la
richiesta cerca, cioè la condizione di permuta possibile (`findCompatibleVacationRequests` la
verifica nell'altro verso). Due uscite di cautela, deliberate: periodo IGNOTO (nessuna assegnazione,
o anno non noto) e lista dei cercati VUOTA non filtrano — l'ignoranza non è una ragione per non
avvisare. Chi passa dal filtro riceve il testo DEDICATO `new_vacation.compatible.title`, che dice il
proprio periodo (`{periodo_effettivo}`): senza, la notifica non spiegherebbe perché è arrivata.

**Prove.** `tests/tuoturno-salto-sala.spec.ts` (E2E: giorno dal PDF vero di dev, tap, URL e respiro),
`tests/pulizia-fuori-sala.spec.ts` (logica + il confine dei riposi), `tests/ferie-compatibili.spec.ts`
(logica del filtro e testo dedicato), più i tre nuovi controlli in `scripts/check-notif-templates.mjs`
(coesistenza generico/dedicato nel route e le due varianti della pulizia). **Controllo negativo
fatto**: togliendo l'`onOpen` dalle card, la spec del salto da /tuoturno fallisce (nessun
`data-sala-day`). Suite completa: **194 passati / 8 saltati**.

Stato (26/09/2026, tarda sera): le tre funzioni sono **su disco, non committate** —
`app/(app)/tuoturno/tuoturno-client.tsx`, `lib/queries/shift-cleanup.ts`,
`app/api/admin/shift-cleanup/route.ts`, `components/admin/shift-cleanup-dialog.tsx`,
`lib/sala-month.ts`, `lib/vacations.ts`, `app/api/push/notify/route.ts`,
`lib/notification-templates.ts`, `components/settings/settings-page.tsx`, `lib/queries/users.ts`,
`types/database.ts`, `scripts/check-notif-templates.mjs`, la migration
`supabase/migrations/034_notify_vacation_filter.sql` (applicata su dev, NON su produzione) e i tre
spec nuovi. La colonna su PRODUZIONE va aggiunta prima che il toggle funzioni lì:
`node scripts/apply-release-migrations.mjs --prod --from 034 --to 034 --apply`.

---

## 20/09/2026 — Design system duale iOS/Android, M1: la piattaforma esiste (e non si vede)

Prima milestone del design system a due skin (report `design-audit.md`, HIG + Material 3). Questa
milestone è **per costruzione invisibile**: i token di piattaforma hanno come valore di BASE quelli
di oggi, quindi nessuna componente cambia aspetto finché non adotta un token — ed è la suite E2E
verde (217 passati / 8 saltati) la prova che non si è rotto niente.

**1. La piattaforma la decide il SERVER, una volta sola.** `lib/platform.ts` è PURO (nessun
`navigator`, nessun DOM): `detectPlatformFromUA(ua, {maxTouchPoints})` → `'ios' | 'android' |
'desktop'`, e `app/layout.tsx` lo chiama sullo User-Agent di `headers()` scrivendo
`data-platform` sul `<html>`. Così l'HTML iniziale ha già la skin giusta: **niente script inline**
(che Next riscrive a ogni navigazione — vedi il workaround MutationObserver in questo file) e
niente flash di skin sbagliata. iPadOS 13+ in desktop mode si presenta come «Macintosh»: si
riconosce solo da `maxTouchPoints > 1`, che sul server non esiste, quindi lì resta `desktop` —
limite dichiarato, si recupera con l'override.
Conseguenza dichiarata: `headers()` rende dinamiche anche `/login` e `/installa` (le rotte
autenticate lo erano già).
**Prima di questo file la piattaforma si riconosceva in TRE copie della stessa regex**
(`app/installa/page.tsx`, `components/shifts/shift-dialog.tsx`,
`components/settings/notification-help-dialog.tsx`): il ratchet in `check-design-tokens.mjs` le
conta (oggi 3) e vieta che salgano.

**2. Override di QA.** `?platform=ios` (una apertura) o localStorage `turni-platform-override`
(persistente) riscrivono l'attributo dal client — `PlatformProvider` + `usePlatform()`. Serve a
guardare la skin dell'altra piattaforma dal proprio telefono, non è la strada dei test (che girano
sull'emulazione vera dei motori). Lo snapshot di `usePlatform` si legge DAL DOM (come
`nav-lastpage`), quindi non c'è stato duplicato che possa divergere dal CSS.

**3. Due livelli di token in `app/globals.css`.** LIVELLO 1 = nomi di RUOLO, neutri
(`--surface`, `--surface-container`, `--on-surface`, `--primary-action`, `--danger`,
`--separator`): sono **alias** (`var(--background)`…), non una seconda palette, quindi non cambiano
un pixel e il tema scuro continua a funzionare da sé. LIVELLO 2 = i valori per piattaforma
(`--font-ui`, `--touch-min`, `--radius-*`, `--elevation-*`, `--scrim`, `--motion-*`, `--fs-*`) in
`:root` (= valori di oggi) e nei blocchi `[data-platform='ios']` / `[data-platform='android']`.
Le Utility tipografiche (`--text-body`, `--text-title3`…) stanno in `@theme inline` e puntano ai
`--fs-*`: **senza `inline` Tailwind copierebbe il valore** e la piattaforma non potrebbe più
cambiarlo. Da qui in poi si scrive `text-body`, non `text-[15px]`.

**4. Contrasti misurati, non stimati.** Il report dava due misure sbagliate su due (la pillola
Pomeriggio è 5.39:1, quindi passava) e non vedeva le due peggiori: **cella Notte 2.94:1** e
**cella «vuota» 2.72:1**, entrambe testo di un codice di turno. Sistemate; il tema scuro passava
già tutto.

**Prove.** `scripts/check-design-tokens.mjs` (nessun browser, secondi): stesse chiavi nei due
blocchi e non orfane di base, **skin viva** (13 token DEVONO differire; `--radius-card` no, perché
12px è la misura di entrambe le guide e pretenderne la differenza sarebbe inventarla), utility
tipografiche collegate, contrasto AA sulle coppie sfondo/testo con la matematica di `lib/color.ts`
— 30 coppie verificate, 6 **saltate con motivo** (le pillole dei periodi in scuro hanno sfondo
traslucido: il contrasto dipende dalla superficie sotto, che lì non c'è) e l'elenco delle saltate è
bloccato perché una coppia nuova non si nasconda. `tests/design-piattaforma.spec.ts` gira su **tre
motori** (Chromium desktop, WebKit/iPhone, Chromium/Pixel — progetto Playwright `android` nuovo):
l'atteso è calcolato dallo User-Agent del motore che sta girando davvero, non scritto a mano.
**Due controlli negativi fatti**: skin copiata (stesso `--font-ui`) e contrasto scuro abbassato
(`--cell-n-text` a 3.24:1) → falliscono per la ragione giusta. TRAPPOLA trovata così: `indexOf('.dark')`
prendeva la riga 6 (`@custom-variant dark (&:is(.dark *))`) e confrontava due volte il tema chiaro
(36 coppie invece di 18 × 2, tutte verdi per finta): le regex ora sono ancorate a inizio riga, con
una guardia sull'estrazione.

**Ancora da fare (M4→M5):** primitive a doppia skin (ripple e state layer), board, PWA specifics,
iconografia e pulizia. Fatta la M3 (gli overlay — sezione in fondo al file).
---

## 20/09/2026 — Design system duale, M2: la barra (destinazioni) e le azioni (fuori dalla barra)

Seconda milestone. Chiude le issue **n. 1 e n. 2** del report, che erano la stessa
malattia: la barra mescolava DESTINAZIONI e AZIONI, e il pulsante centrale cambiava
mestiere da pagina a pagina (crea turno, crea ferie, segnalazione, pannello admin,
cambia vista, menu della sala) restando DENTRO la barra — dove né HIG né Material 3
lo vogliono.

**Cinque destinazioni, una per pagina.** `components/nav/nav-destinations.ts` è il
contratto (nomi, percorsi, ordine) ed è **puro**: niente icone, così si importa da
Node e le spec lo usano senza browser. Prima la barra aveva quattro voci ma due
erano gruppi che si scambiavano al tap («Cambi» → /dashboard *e* /vacanze, «Turni
Sala e Ferie» con l'etichetta a **7px**): ora ogni voce è una destinazione e non
cambia mai significato. `activeDestinationId()` risponde `null` per le pagine di
DETTAGLIO (/notifiche si apre dalla campanella, /admin da Impostazioni): accendere
una voce lì direbbe «sei qui» a chi non c'è. «Turni» resta l'unica con
`remembersLastPage` (due viste, una destinazione): la memoria è in
`components/nav/use-last-page.ts` (`turni-last-page`).

**Due skin, e la differenza è STRUTTURALE.** `components/nav/nav-bar.tsx`:
tab bar (iOS **e desktop**) contro navigation bar M3 (Android). Non è un tema: iOS
tinge icona ed etichetta della voce attiva (etichetta sempre visibile a 10pt);
Material lascia il testo neutro e mette una **pillola 32×64** dietro l'icona
(`--nav-indicator`, una velatura del testo al 12% che si adatta da sé ai due temi).
Altezze dai token di M1: 49pt iOS, 80dp Android, 64px desktop — e il fondo del
contenuto lo dice `var(--nav-height)`, non più un `4rem` scritto a mano.
**Il colore di brand che il report chiedeva NON è entrato**: HIG userebbe il blu di
sistema e M3 il primary, ma la regola di progetto «il chrome è neutro» (vedi «Tema a
2 colori») viene prima del report — la differenza fra le piattaforme sta nella forma,
nella misura e nel materiale, non in una tinta che il resto dell'app non ha.
Etichetta di M3 a 12sp: sotto i 360px scende a 10px (misurato: «Impostazioni» chiede
67px e ne ha 64) — media query DOPO il blocco della piattaforma, perché a pari
specificità vince l'ordine.

**Le azioni escono dalla barra.** `use-nav-actions.ts` è la matrice (pagina × ruolo)
e la prima voce è quella principale; `nav-action-surface.tsx` la disegna — pill su
iOS (HIG non ha FAB), **FAB 56dp con angoli a 16** su Android, 48px cerchio sul
desktop — in un contenitore ancorato sopra la barra. Regola del tap, dichiarata
perché è il contratto con le spec: **una** azione non distruttiva → il tap la esegue;
**più** azioni (o l'unica è distruttiva) → il tap apre l'elenco; **pressione lunga**
(500ms) → apre l'elenco in ogni caso (era il gesto della sala, e resta). L'elenco è
una superficie nativa: **action sheet** su iOS (raggio 14, «Annulla» separato) e
**bottom sheet** di Material altrove (scriminatura, righe 56dp, si chiude col tocco
fuori). Le etichette delle voci sono, parola per parola, le vecchie `aria-label`:
`apriVoceFab`, `openSalaAdminFab`, `getByLabel('Minimi di persone per card')` sono
la rete di protezione della board, e riscriverla insieme alla barra avrebbe reso il
commit illeggibile.

**Una trappola trovata dalla suite, non da me.** Il contenitore delle azioni era
`pointer-events-auto` sulla RIGA (`flex justify-end`): quella riga è larga quanto lo
schermo e diventava una **banda invisibile che mangiava i click** di tutto ciò che le
stava sotto. Su iPhone un pulsante di /dashboard cadeva esattamente lì: click mai
arrivato, tre test in timeout a 3 minuti (`card-cambio-to-sala.spec.ts` 179/833/937).
Sul desktop quelle card non arrivano a quell'altezza, quindi il difetto sarebbe
passato inosservato. Ora `pointer-events-none` su tutti i contenitori e `auto` solo
sul pulsante e sulla sheet.

**`bottom-nav.tsx` è un dispatcher** (leggi percorso e ruoli → chiedi le azioni →
disegna barra e superficie). Il resto è sparito: `fab-mini-pop` (CSS) era l'unico uso
dei mini-FAB e non esiste più, `cambi-last-page` non si legge più (le due «cambiali»
sono destinazioni dirette). La voce «Turni» continua a coprire /turnisala E
/turniferie, quindi il passaggio fra le due viste resta in coda all'elenco azioni: al
segmented control DENTRO le pagine (`turni-switch.tsx`) ci pensa la M2b, subito sotto.

**Prove.** `tests/nav-piattaforma.spec.ts`: contratto puro, cinque voci con
l'accensione esatta, etichette non tagliate e barra non scorrevole a 320px e 390px,
comando delle azioni **fuori dal `<nav>`** e geometricamente sopra la barra, tap che
esegue/che apre, e la skin giusta — altezza, pillola, forma del comando, superficie
dell'elenco — verificata sul MOTORE VERO (WebKit/iPhone, Chromium/Pixel, desktop),
più l'override di QA. Gira nei tre progetti. `tests/pages.spec.ts` non prova più
l'etichetta «Turni Sala e Ferie» (non esiste): la prova è stata **sostituita**, non
cancellata. `card-cambio-to-sala.spec.ts` clicca `a[aria-label="Cambi turno"]`.
---

## 20/09/2026 — Design system duale, M2b: la lingua sala/ferie dentro le pagine Turni

Chiude la M2 sul suo unico punto lasciato aperto. «Turni» è UNA destinazione con DUE
pagine (`/turnisala` e `/turniferie`) e il passaggio fra loro era rimasto un'AZIONE del
menu, «Vai a Turni ferie»: per un dipendente era l'UNICA azione di quelle pagine, cioè
un pulsante flottante che esisteva per cambiare pagina — lo stesso difetto del report
(un comando che significa cose diverse a seconda di dove sei), in piccolo.

**`components/nav/turni-switch.tsx`.** Un selettore in testa a ENTRAMBE le pagine, con
le due viste di «Turni» dichiarate una volta sola in `nav-destinations.ts`
(`TURNI_VIEWS`: `/turnisala` = «Sala», `/turniferie` = «Ferie», con i percorsi presi
dalla destinazione — una spec li confronta, perché due elenchi che possono divergere
sono due bug che aspettano). Sono `Link` veri con `aria-current="page"`: la vista è un
PERCORSO, quindi restano link, il gesto «indietro» continua a funzionare e il nome
accessibile è «Turni sala» / «Turni ferie» (da sola, «Ferie» in mezzo alla pagina non
direbbe a un lettore di schermo che è una vista dei turni).

**Il componente NON ha un ramo per piattaforma, ed è la parte interessante.** iOS
disegna un segmented control (contenitore di sistema + voce attiva rialzata, 32pt) e
Android le tab primarie di Material (fondo trasparente + barretta da 3dp, 48dp): due
strutture diverse ottenute cambiando solo i token `--seg-*` (otto chiavi nuove, tutte
nel contratto di `check-design-tokens.mjs`, tutte in `DEVONO_DIFFERIRE`). L'indicatore
da 3dp è lo stesso elemento su entrambe: su iOS è alto 0 e trasparente, quindi non
disegna niente — un ramo nel JSX sarebbe stato un secondo posto in cui sapere che
esiste un'altra piattaforma.

**TRAPPOLA: in tema scuro la scala delle superfici si CAPOVOLGE.** In chiaro `--card`
(0.985) è la superficie più chiara e la traccia `--muted` (0.935) sta sotto: il thumb
era giusto. Di notte i valori sono `--muted` 0.269 e `--card` 0.205, quindi LA STESSA
coppia dava un thumb più scuro della traccia — un «buco» invece di una voce rialzata
(visto in preview: `lab(7.8)` contro `lab(15.2)`). Il rimedio è uno scambio di token in
`.dark[data-platform='ios']` (traccia `--card`, thumb `--muted`), e il contrasto lo
dice: l'etichetta spenta sul tema chiaro sta a 5.4:1, sull'altra combinazione a 4.2
(sotto AA). Nota per chi tocca i token: `color-mix` di bianco sulla traccia NON basta a
sollevarla in scuro (in sRGB 14% di bianco su #404040 dà #444444, tre livelli — non si
vede), e per questo la soluzione usa due token esistenti invece di una mistura.

**Le azioni restano alle azioni.** `use-nav-actions.ts`: via `vai-ferie` e `vai-sala`.
Su /turnisala un dipendente non ha più NESSUNA azione e la superficie non si disegna
(una lista vuota è un caso vero, non un buco); restano l'upload e la cronologia per
admin/manager, e per un manager NIENTE cambio vista nel menu.

**Prove.** Tre casi nuovi in `tests/nav-piattaforma.spec.ts` (nei tre progetti): il
contratto puro, il salto sala→ferie→sala dal selettore con la verifica che NON sia
figlio della barra e che il menu non contenga più «Vai a Turni ferie», e la skin su
motore vero (iOS: fondo tinto, raggio 9, thumb 7, altezza 32, barretta 0 — Android:
trasparente, altezza 48, barretta 3 — desktop: valori di base). Suite intera verde:
**256 passati / 8 saltati**.

**Una trappola in più, trovata dalla suite di qualcun altro.** `sonda-colori.spec.ts`
campionava la barra con `page.locator('nav').first()`: da M2b le pagine Turni hanno un
SECONDO punto di navigazione e prendeva quello. Ora la barra si prende dal suo nome
(`nav[aria-label="Navigazione principale"]`), che è anche più preciso dell'ordine nel
DOM. E per chi lavora in questo worktree: il dev server NON rilegge `app/globals.css`
su una pagina già compilata — dopo una modifica al CSS serve `rm -rf .next` e riavvio,
altrimenti si guarda (e si prova) il CSS vecchio senza accorgersene.

---

## 20/09/2026 — Design system duale, M3: gli overlay a due forme (foglio iOS / dialog M3)

Terza milestone. Chiude le issue **n. 4, n. 5 e n. 6** del report: overlay centrati universali,
toast in alto su ogni dispositivo, conferme distruttive sbagliate. La forma degli overlay ora la
decide la piattaforma, con una distinzione che è del CONTENUTO e non della skin:

**1. Task ≠ allarme, su entrambe le piattaforme.** `DialogContent` (il primitivo dei 21 popup
dell'app) ha un prop `shape`:
 - `auto` (default): su iOS il popup è un **FOGLIO** che sale dal basso (max 92dvh, scriminatura
   36×4, «Chiudi» scritto in una riga sua al posto della × fluttuante — HIG: i task si fanno nei
   sheet, i dialoghi centrati sono per gli allarmi); su Android e desktop resta il dialog centrato
   (M3: raggio 28dp, velo al 32% senza sfocatura; desktop: valori di BASE, zero pixel spostati).
 - `dialog`: centrato SEMPRE — è la forma degli **allarmi** (`components/ui/alert.tsx`).

La geometria del foglio è inline e vince sulle classi del chiamante (i `max-w-*` dei popup non
hanno senso su un foglio a tutta larghezza). La scriminatura e l'uscita scritta sono le stesse
che `tests/shift-dialog.spec.ts` proteggeva per lo shift-dialog: quel caso è ora la regola, non
un'eccezione.

**2. L'ALLARME (`Alert`) è centrato ovunque e si risponde, non si chiude.** Azioni impilate a
intera larghezza su iOS (la distruttiva sopra, «Annulla» sotto e MAI rossa — HIG), pulsanti
testuali affiancati su Android/desktop (M3). Nessuna × su nessuna piattaforma. La distruttiva è
rossa solo se l'azione NON si annulla. L'ordine conta: la scelta pericolosa è la PRIMA (si
raggiunge senza attraversarla), «Annulla» resta l'uscita facile.

**3. Le conferme distruttive hanno un posto solo (`hooks/use-conferma.tsx`).** `chiedi({...})`
apre l'allarme, `{alert}` va nel JSX, l'azione parte SOLO dalla conferma: non esiste più un
secondo percorso che distrugge in silenzio. Lo stato si azzera PRIMA di eseguire, così una fetch
lenta non lascia la conferma ancora premibile. Migrati i tre difetti del report:
 - **card cambio turno** (`shift-item.tsx`): la conferma era in linea nella card → allarme che
   nomina turno e giorno;
 - **card ferie** (`vacation-request-item.tsx`): stesso difetto, stesso rimedio — l'allarme
   nomina periodo, giorno e anno;
 - **pannello notifiche** (`notification-debug-dialog.tsx`): tre `confirm()` del BROWSER (in una
   PWA su iOS compaiono come avvisi di sistema in inglese, scollegati dall'app) → allarmi
   dell'app. L'invio di prova dice a CHI e QUANTI (lo sa solo lui), e il ripristino dei testi
   dice quanto torna al testo di fabbrica. L'allarme dentro un dialog già aperto è il caso
   provato: due overlay distinti, la domanda sopra il pannello.
 Restano `window.prompt` in `team-member-binding.tsx` (non è una conferma: è un input — si
 sostituisce con un foglio nella M4) e nessun altro `confirm()` nativo: quello che resta in
 `squadre-dialog.tsx` è «Annulla» di un form inline, non una distruzione.

**4. Lo snackbar (Android) sta in basso, uno alla volta.** `components/ui/sonner.tsx` legge la
piattaforma: su Android `position: bottom-center`, 4 s, un solo toast alla volta, colori INVERSI
(superficie scura/testo chiaro in tema chiaro — M3), offset calcolato su `--nav-height` + safe
area così sta sopra la navigation bar; su iOS e desktop resta com'era (banner in alto). Il
colore dei TIPI (successo/errore) resta `richColors`: il rosso dell'avviso è informazione.

**Token (contratto in `check-design-tokens.mjs`):** `--dialog-radius` (12 base, 28 android),
`--dialog-scrim` / `--dialog-scrim-blur` (10% + blur 4px base e iOS, 32% + none android — HIG
40% e M3 32%: schermano senza sfocare), `--radius-sheet` (10), `--elevation-dialog`,
`--motion-dialog` / `--motion-sheet`. Le misure sono quelle delle guide, non «estetiche»:
l'assenza di sfocatura su Android è una regola M3, non un gusto.

**Prove.** `tests/overlay-piattaforma.spec.ts` (5 casi × 3 progetti): il task è foglio su
WebKit/iPhone e dialog centrato su Pixel/desktop (misure vere: distanza dal fondo del VELO, non
della finestra — su WebKit il viewport di layout è più alto di quello visuale); l'allarme è
centrato su ogni piattaforma, senza ×, e «Annulla» non cancella; la card ferie non ha più la
conferma in linea e «Annulla» non elimina (banco interamente finto via `page.route`, il DELETE è
intercettato); le conferme del pannello notifiche non sono più quelle del browser (il listener
dei dialog nativi conta: se ne compare uno, fallisce); lo snackbar sta in basso e sopra la barra.
Suite intera: **271 passati / 8 saltati**, `tsc` pulito, contratto dei token verde.

**TRAPPOLA per chi misura overlay in Playwright:** un locatore `.last()` si risolve A OGNI
verifica: dopo la chiusura della domanda puntava al pannello rimasto e la spec diceva «1 overlay
ancora aperto». La domanda chiusa si conta dal suo TESTO.
