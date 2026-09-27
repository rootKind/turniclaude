# 🧠 Memoria di progetto — Turni Sala C.C.C. (PWA)

> Memoria persistente del progetto per l'AI assistant (convenzione Freebuff: `knowledge.md`
> nella root, iniettato nel contesto a ogni sessione).
>
> **Igiene — la regola che vale per questo file:** qui stanno **solo regole durevoli** e
> **azioni pendenti**. La cronaca dei fix vive in `git log`; gli elenchi di file esistono
> nelle cartelle. **Non accumulare diario: riscrivi la regola, buttane la storia.** Una
> regola che non riporteresti più in `git log` non sta qui. Se una riga descrive un file
> che non esiste, è una regola morta: si cancella, non si aggiorna.

---

## Panoramica

PWA per la gestione dei turni della sala C.C.C.: turni giornalieri (DCO / Noni), scambi con
interessi, ferie/vacanze con rotazione e catene, layout sala con desk e pallini colorati
(anche da PDF), «Il tuo turno» (griglia personale + confronto), notifiche push con registry
e override admin, pannello admin (utenti, statistiche, changelog, debug notifiche).

**Stack:** Next.js 16 (App Router; il middleware si chiama `proxy.ts`), React 19, TypeScript,
Tailwind CSS v4, `@tanstack/react-query`, `zustand` (persist), Supabase (auth + Postgres +
realtime + storage), `web-push`, `framer-motion`, `sonner`, `react-day-picker`,
`@base-ui/react` (primitivi shadcn), `pdf-parse` (parser PDF sala).

**Package manager: pnpm.** Non usare npm: l'unico lockfile è `pnpm-lock.yaml`.

## Comandi

| Azione | Comando |
|---|---|
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `npx tsc --noEmit` |
| Test E2E | `npx playwright test` (dev server attivo su :3000, o `E2E_BASE_URL`) |
| Install | `pnpm install` (pnpm non è su PATH → `npx --yes pnpm@10 install`) |
| Sync lockfile | `npx --yes pnpm@10 install --lockfile-only` |

**Deploy:** Vercel, auto-deploy da `master`, regione `fra1`. Non toccare `vercel.json`
senza motivo. Si sviluppa su `dev`; release = merge `dev → master`.

## Struttura

```
app/            App Router: (app)/ protetto, (auth)/ login-OTP-reset, admin/, api/* (route handlers)
components/     admin, auth, nav, notifications, providers, sala, settings, shifts, ui, vacanze
hooks/          use-* (react-query): use-shifts, use-users, use-vacation-requests, use-push, ...
lib/            queries/* (accesso dati), supabase/*, push/*, cache, utils, pdf-parser, sala-month, shift-tokens
stores/         zustand: user-store (profilo persist), theme-inspector-store
types/          database.ts — tipi schema + ADMIN_ID + isAdmin/isManager
supabase/       migrations/ 001–036 (schema completo), functions/cleanup-shifts (ALTERNATIVA al cron SQL di migration 002)
public/         sw.js (solo push + click, cache statica minima) — registrato a runtime da sw-registrar.tsx / use-push.ts
tests/          suite Playwright (playwright.config.ts; progetti: auth, chromium, ios, minimi, perf)
scripts/        SOLO strumenti riusabili (vedi scripts/README.md); i one-off non vanno committati
```

In `scripts/` sono conservati **solo** gli strumenti riusabili, più le sonde di verifica
dei gialli (`confronta-gialli-v9.mjs`, `verifica-parse-ottobre.mjs`, `sala-gialli-mese.mjs`)
e i contratti ancora in uso (`check-notif-templates.mjs`, `verify-seed.mjs`).

---

## Regole architetturali (da non violare)

- **Ruoli:** `is_secondary=false` → DCO; `true` → Noni; `is_manager=true` → manager (né DCO né
  Noni). Ogni utente vede solo la propria categoria. `is_secondary` e `is_manager` sono
  INDIPENDENTI ma `is_manager` forza `is_secondary=false`; non reintrodurre l'accoppiamento.
- **DCO+ (`is_dco_plus`):** DCO formale che vede/appaia/interagisce con ENTRAMBE le categorie
  (regole di visibilità: `isShiftVisibleTo` in `lib/queries/shifts.ts`). Le richieste dell'altro
  gruppo portano solo il badge neutro NONO/DCO+, stessa card degli altri. Le FERIE restano DCO.
  `is_dco_plus` forzato `false` per manager e Noni (route create/update utente + dialog admin).
  Cache turni include `isDcoPlus` (`shifts-{isSecondary}-{isDcoPlus}`).
- **`ADMIN_ID`** hardcoded `fdd6c008-7a22-42d5-a75b-c44d9edfef12` in `types/database.ts` — NON spostarlo in env.
- **Write su tabelle RLS-protette (es. `vacation_assignments`) SOLO via route admin con service
  role** (es. `POST /api/admin/update-user`). Mai write diretti dal client: l'RLS li rifiuta e
  il catch generico maschera l'errore («Errore aggiornamento utente» anche se i flag sono salvati).
- **PostgREST:** query embedded con SEMPRE la FK esplicita (`user:users!shifts_user_id_fkey(...)`),
  altrimenti falliscono silenziosamente.
- **Cache user-scoped:** `lib/cache.ts` (chiavi `cache:{userId}:{suffix}`); `AuthCacheGuard`
  pulisce al cambio utente; su logout `clearAllLocalData()` svuota TUTTO DOPO il signOut
  (`notification-history` non è user-scoped ma è copiuta dal logout completo).
- **Cache react-query su IDB: una copia più VECCHIA non sostituisce un dato più NUOVO
  (27/09/2026).** `QueryProvider` ripristina `users` e `shift-team-tree` da IndexedDB con
  il loro `dataUpdatedAt` ORIGINALE, così la copia sopravvive alla chiusura dell'app «fresca
  quanto era» (staleTime 6 ore). Il restore passa da `ilRestoreVale`: se la query ha già
  dati più recenti, la copia viene scartata. Senza quella guarda era una CORSA — se la
  fetch client finiva prima della lettura da IDB, il restore buttava via la risposta fresca
  e la board mostrava per 6 ore un asset abolito (LONI A. con il ciclo da 252 delle rilievo
  invece che da 84 della rosa). `/turnisala` semina l'albero del SERVER dentro la cache di
  react-query al mount, quindi l'apertura a freddo resta senza attese e senza rete: quell'albero
  l'abbiamo già pagato con la pagina. Nota per il futuro: gli asset si cambiano con gli
  SCRIPT, fuori dall'app, quindi nessun realtime può invalidare la copia dei browser aperti
  in quel momento — la freschezza la deve garantire il codice, non l'evento.
- **Push:** unico path = route Next (`/api/push/notify|send|subscribe`) + `lib/push/send-to-user.ts`
  (service role: RLS own-row-only su `push_subscriptions`). `Notification.requestPermission()`
  in forma Promise (standard). Testi push: registry in `lib/notification-templates.ts` con
  override admin (migration 029) editabili dal pannello debug.
- **Colori: NIENTE override nel database.** Nessun `app_settings.color_overrides`, nessun
  `/api/admin/save-colors`, nessun cookie `co`, NON ricreare `public/color-studio.html`.
  I colori vivono solo in `globals.css` (`:root` chiaro, `.dark` scuro). Al loro posto la
  **Sonda colori** admin (`components/admin/theme-inspector.tsx`, `lib/theme-inspector*.ts`):
  si accende da /admin, il tocco SELEZIONA (non naviga), mostra la variabile d'origine, fa
  provare un colore in anteprima (solo dispositivo) e prepara la richiesta da copiare; la
  modifica definitiva si fa nel codice. Se un giorno servisse l'override globale, decisione
  da prendere con l'utente: la regola resta «non reintrodurlo».
- **Tema a 2 colori:** scuro = bianco/nero puro; chiaro = «negativo» (nero + celeste lieve).
  COLORATE solo le pill semantiche: fasce orarie (M/P/N), stagioni ferie P1–P6, pannelli
  match (verde)/chain (viola), badge DCO/NONI, banner impersonazione, «conferma» manager.
  Tutto il resto del chrome è NEUTRO (highlight bianco, my-period nero/bianco, chip
  selezionati nero/bianco, cuore interessato `text-interest-date`). Pill colorate con bordo
  1px `color-mix(in srgb, currentColor 30%, transparent)`; chip filtri con contatore `.chip-count`.
- **Parità di leggibilità WCAG AA (≥4.5:1) in ENTRAMBI i temi** — la scelta del tema dev'essere
  meramente estetica; audited con canvas-readback sulle variabili di `globals.css`.
- **Elevazione tema scuro:** la card resta PIÙ CHIARA della pagina (l'elevazione si esprime
  schiarendo, mai superfici nere pure); si inverte solo il rapporto titolo↔corpo (chiaro
  `titolo < corpo`, scuro `titolo > corpo`). Sfondo pagina scuro `#0a0a0a` scelto dall'utente.
- **Bordi card turni/ferie:** bordo+sfondo sul WRAPPER INTERNO (`shift-item.tsx` /
  `vacation-request-item.tsx`, primo div dopo l'outer) che contiene riga+pannello TRASPARENTI
  e senza bordo. Motivo: i bordi 1px di elementi impilati si antialiasano alla giunzione.
  Divisore fra card dello stesso giorno = bordo basso `.shift-grouped-b`
  (`--shift-others-date-border`); il bordo ALTO delle non-prime è `border-top-width: 0`
  (non trasparente: creerebbe striscie a tutta larghezza); la striscia della colonna data la
  dipinge la RIGA (`.shift-grouped-row-strip`), MAI il wrapper (invaderebbe il pannello);
  niente `margin-top:-1px`; pannello espanso full-width separato da `border-top` divisore;
  riquadro TUO mai toccato dalle giunzioni (guard `!isOwn`).
- **Sala:** `colored_persons` scritto via RPC atomico `set_person_color` (migration 013) —
  colori PER PERSONA dei desk, diverso dall'ex-funzionalità colori tema. Upload PDF /
  cancellazione mese: admin O manager (route + RLS allineati).
- **Vista admin «Teorico ≠ reale» in /turnisala:** mini-Fab (long-press FAB, SOLO admin) →
  motore `theoRealSectionCompare` in `lib/turni-teorici.ts`: una Map per giorno
  `{rows, extras, theoreticalOnly}`; teorico confermato = nessuna riga; il teorico NON si
  riscrive. Matching per chiave cognome (`surnameKey`) con «consumo» dei reali (Set `claimed`).
  Diff con sezione senza card a schermo non sono visibili. **ATTENZIONE RLS:**
  `fetchShiftTeamTree` dal client può tornare 0 righe — la pagina server passa
  `initialShiftTree` a SalaPageClient; NON ripristinare il solo fetch client. La modalità NON
  si auto-spegne (ricalcolo useMemo: il reset sui cambi contesto la spegneva mentre navigava).
- **Highlight card sala:** `.desk-card-highlight` = bordo nel colore + anello `0 0 0 1px`
  dello STESSO colore (mai anelli con opacità ridotta: creano banda grigia fuori dal bordo).
- **Changelog popup DB-backed:** tabelle `changelog_entries`/`changelog_reads` (migration
  016–017); API `GET /api/changelog`, `POST /api/changelog/read`, admin `GET/POST/DELETE
  /api/admin/changelog` (`{forceNew:true}` → version=max+1 → tutti la vedranno). **SOLO il
  pulsante «Continua» marca come letto**: dismiss/Escape/chiusura app non flagga nulla →
  riappare al prossimo avvio. A ogni release: admin «Forza nuova versione» + compilazione entry.
- **Statistiche admin: aggregare SEMPRE in Postgres, MAI scaricare righe** via REST (tronca a
  `db-max-rows` 1000): RPC `get_admin_stats(p_days)` (security definer, solo service_role, la
  route verifica ADMIN_ID; anon/authenticated revocati).
- **Badge sovrapposti a due strati** (`components/ui/notification-badge.tsx`): strato esterno
  opaco della superficie (`surface="card"` o bg esplicito) + badge vero sopra; il fill
  translucido da solo lascia trasparire le linee dell'icona sotto. Se un badge poggia su una
  nuova superficie, aggiungere la variante `surface`.
- **Responsive:** pagine `max-w-lg mx-auto px-4`; header con `flex-wrap` + `min-w-0`/
  `flex-shrink-0`: su schermi stretti si va a capo invece di straripare. Nessuna pagina deve
  generare scroll orizzontale. NON nascondere «Chiedi congedo» con breakpoint (sta largo
  anche sotto 640px).
- **Altezza pagina = min-height, MAI height fissa:** con `height` fissa i figli flex si
  comprimono e il contenuto resta sotto la bottom nav SENZA scroll. L'unico vincolo legittimo
  è `overflow-y:auto` su un contenitore interno esplicito (test: `tests/pages.spec.ts`).
- **Bottom nav** (`components/nav/bottom-nav.tsx`): cinque destinazioni — `/dashboard`,
  `/vacanze`, `/turnisala`, `/turniferie`, `/impostazioni`. Memoria dell'ultima pagina
  leggibile da `nav-lastpage` in localStorage. Il manager ha un ciclo di navigazione
  dedicato (`MANAGER_CYCLE`). Il pannello admin ha la X (`router.back()`): da PC è fuori dal
  gruppo `(app)`, senza bottom nav.
- **Anno minimo (gate + skeleton UNICO):** `min_year_turniferie`/`min_year_vacanze` da
  `app_settings`; skeleton `components/ui/year-gate-skeleton.tsx` (varianti turniferie/vacanze)
  finché `minYear === null` (mai flash dell'anno corrente); fetch con fallback
  `.catch(() => anno corrente)`; `minYear` come prop del dialog, niente costanti hardcoded.
- **Splash/manifest PWA:** splash in-app (`components/providers/boot-splash.tsx`) SOLO iOS via
  `@supports (-webkit-touch-callout: none)`; `apple-icon.png` bianco; icone `icon-192/512`
  TRASPARENTI + icone `icon-maskable-512(-dev)` con `purpose:'maskable'` (tela 80%, safe-zone
  40% — generate da `make-dev-icons.mjs` se cambia il logo). Bump `CACHE_NAME` in `sw.js` a
  ogni cambio icone/manifest (cache-first). Le istruzioni di installa stanno nella route
  `app/installa/page.tsx` (tab iOS/Android, niente `beforeinstallprompt`: l'evento non esiste
  su iOS e non va simulato).
- **Manifest «Turni DEV»:** il manifest è la route `app/manifest.ts` (`/manifest.webmanifest`):
  a build time `VERCEL_GIT_COMMIT_REF==='master'` → «Turni Sala C.C.C.» + icone originali;
  altrimenti «Turni DEV» + icone `*-dev.png` con banda gialla. Stessa env-check in
  `app/layout.tsx`.
- **Animazioni d'ingresso uniformi:** `opacity 0→1`, `y: 6→0`, durata 0.15s easeOut, stagger
  `index*0.04` (cap 0.3). Le animazioni FUNZIONALI (drag, expand, page-transition, filtri) sono
  volutamente diverse.
- **Migrations 001–036 completano lo schema.** NON riscrivere le policy RLS, NON aggiungere
  colonne/tabelle duplicate. Su produzione le migration si applicano con
  `scripts/apply-release-migrations.mjs` via Management API (la history prod è a timestamp:
  `supabase db push` NON si usa lì) + registrare la versione in `schema_migrations`.
- **Next.js 16:** API e convenzioni diverse dal passato (`proxy.ts` ecc.); in dubbio leggere
  `node_modules/next/dist/docs/` prima di scrivere codice.

### Sala — dati, parser e turni

- **Formato v2 di `sala_schedule.schedule`** (jsonb autodistinguibile con `isSalaMonthData`):
  `{ v:2, days, codes[], names[], rows[{d[],t[],y?[]}] }` — dizionario di codici + indici per
  persona, `y` = giorni gialli. La vista per-giorno si ricostruisce con
  `buildScheduleFromMonthData` (`lib/sala-month.ts`); i mesi ancora v1 restano leggibili.
  Le assenze esistono SOLO nella forma compatta (il calendario espanso le perde).
- **Parser PDF** (`lib/pdf-parser.ts`): ogni persona ha `days[]` (effettivo) e `teorico[]`
  (riga base stampata) con TUTTI i codici (A, F.E., VS, D, Sp*, ISp*, SPW, Dis*, RIC/PRIC/MRIC,
  PM3M40/MM3M40, TUTOR, Trasf, G, Tir). Celle gialle lette da `getOperatorList()` con la
  STESSA istanza pdf.js di `pdf-parse` (le costanti OPS di `pdfjs-dist` NON valgono) +
  `PDFJS.disableFontFace=true` in Node. Filtro legenda sul token iniziale («NAPOLI» non scarta
  «DI NAPOLI A.») e nomi canonici.
- **Celle gialle: assegnazione per SOVRAPPOSIZIONE DI BANDA, mai per distanza dal centro.**
  Il PDF disegna alcune gialle in DUE rettangoli impilati, e il centro della metà bassa può
  cadere a pochi px dalla riga **adiacente**: un criterio «centro ±tollera» assegna la cella
  alla persona sbagliata. Per questo esistono `mergeStackedYellowCells` (fonde i pezzi
  impilati solo se sono **mezze** celle, h≤10.5: le celle intere si toccano fra righe e NON
  si fondono, altrimenti una persona perderebbe il giorno) e `rowOwnsYellowCell` (ogni riga
  possiede la banda `[y−7.7, y+7.7]`, vince chi è coperto di più, minimo 4px). Le righe in
  contesa sono TUTTE le righe del gruppo, persone e righe-mod. NON tornare a un criterio
  geometrico sul centro: è la ragione per cui esistono queste due funzioni.
  Prove: `scripts/confronta-gialli-v9.mjs`, `scripts/verifica-parse-ottobre.mjs`,
  `tests/sala-picker-mese.spec.ts`.
- **Omonimi / bare-owner (caso NEVANO):** cognome OMONIMO fra utenti + membro legato via
  `shift_team_members.user_id` → la riga PDF con il solo cognome è SOLO del legato («NEVANO»
  → Pietro), gli altri matchano solo con l'iniziale («NEVANO G.» → Giuseppe).
  `buildBareOwners` in `lib/shift-teams-matching.ts`; il binding via id ha priorità in
  `findMemberForUser`. In UI gli omonimi mostrano l'iniziale. Chiave cognome: `surnameKey`
  toglie l'ultimo token SOLO se è un'iniziale — MAI `split(' ')[0]` (collassava DI*/DE*).
- **Rotazione teorica:** il ciclo del turno è 28gg, quello delle SEZIONI 42gg → lo stato
  completo si ripete ogni LCM=84gg (`shift_cycle_templates`, pattern_start comune 2026-03-01,
  pattern con codici turno+sezione). Il «teorico» di /tuoturno ha tre sorgenti in ordine di
  priorità: riga base del PDF (mesi caricati) → predizione dalla storia
  (`lib/person-cycle.ts`, per mesi senza PDF) → rotazione DB (fallback).
  **Il pattern di un membro e quello del suo template di catalogo devono restare IDENTICI.**
  Se il catalogo è copiato dal membro, un tap dal pannello non può reintrodurre un guasto
  già corretto sul membro.
- **Orari veri dei turni:** M 6–14, P 14–22, N 22–6. La notte di data D corre dalle 22 di D−1
  alle 6 DI D: diventa passata ALLE 6 DI D, non la sera prima. `turnoPassato`
  (`lib/sala-minimi.ts`, `FINE_TURNO_ORA`), `giornoPassato` in desk-board. Orari sbagliati
  (M≥7 / N≥21) sbagliano di un'ora e fanno sparire i turni.
- **Minimi della sezione J:** il vincolo («zero prima di ottobre, poi 1 in M e P, 0 di notte»)
  si esprime con DUE voci di storia in `SalaLayout.minimums`: una che ACCENDE la regola dal
  suo `from` e una con J M=1 P=1 N=0. Nessuna voce = nessuno scoperto, così i mesi vecchi non
  si riempiono di allarmi. L'«In vigore da» del pannello parte da OGGI: va editato.
  Prove: `tests/sala-scoperto.spec.ts`.
- **I cicli hanno una DATA DI INIZIO VALIDITÀ (migration 037, 26/09/2026):** un asset cambia
  nel tempo (dal 01/10/2026 la 5ª sezione diventa la JOLLY, quindi `P5T`/`M5T` → `PJ`/`MJ`; le
  scorte di rilievo passano da un ciclo di 28 a uno di 252 giorni; le tre squadre «in seconda»
  prendono un ciclo nuovo). Sono cambi di CONTENUTO, non di fase: nessuna rotazione del ciclo
  precedente li produce, quindi `shift_adjustments` (che sposta solo i giorni) non basta.
  `shift_member_patterns` è lo STORICO: più righe per membro, ognuna valida dal proprio
  `from_date`; `patternInVigore` (`lib/turni-teorici.ts`) sceglie la riga in vigore nella data e
  `shift_team_members.pattern` resta il ciclo di BASE (quello valido dal `pattern_start`).
  **PERCHÉ ESISTE:** scrivere il nuovo ciclo nella colonna avrebbe riscritto anche luglio,
  agosto e settembre, che hanno i PDF loro (accordo 98,3% → 81,5% a settembre); con lo storico
  ottobre è passato dal 77,9% al 98,7% e i mesi passati sono rimasti intatti. Nel pannello
  squadre il campo «Valido dal» (default oggi) fa esattamente questo: salvare senza data non
  tocca il passato, salvare sul ciclo di base lo riscrive.
  **Regola operativa:** un nuovo asset si scrive con `node scripts/ricava-pattern-ottobre.mjs
  --apply --dal=YYYY-MM-DD` (backup automatico in `scripts/backup-pattern-*.json`, rollback con
  `--annulla=YYYY-MM-DD`), MAI con un UPDATE diretto di `shift_team_members.pattern`.
  **Due avvertenze, entrambe costate una ora:** (a) il backfill della 037 ha creato per ogni
  membro una riga `from_date = pattern_start` con il contenuto della colonna, e quella riga
  **ombreggia** la colonna — se le due divergono vince la riga, quindi ogni correzione del
  ciclo di base deve aggiornare ENTRAMBE le copie (l'API lo fa: salvare sul ciclo di base,
  cioè con data ≤ `pattern_start`, aggiorna colonna e riga insieme); (b) il testo «Valido dal»
  del pannello mostra la validità di **oggi**, non quella relativa alla data scelta.
- **Il rilievo è un SUPER-CICLO da 252 giorni, e lo era già prima del 01/10/2026:** nei PDF di
  luglio–settembre il jolly delle scorte è `M5T` (12 celle su 12), non `MJ` — cambia solo il
  significato del `*` del template, non la struttura. I 9 membri sono 9 slot distanti 7
  giorni, e **lo slot può cambiare**: COCOZZA sta sullo slot 37 fino al 30/09 e sul 226 da
  ottobre, gli altri 8 restano; MAROTTA fino al 30/09 ha un ciclo da 28 proprio (100% su
  luglio–settembre, il 252 non gli arriva oltre il 55%) e prende lo slot 16 solo da ottobre.
  Il ciclo di base era una **approssimazione da 28** che azzeccava solo settembre; corretta
  con `scripts/cicli-base-rilievo-252.mjs`, il gruppo è al 100% su tutti e quattro i mesi.
- **LONI A. ↔ MAROTTA, lo scambio del 1° ottobre 2026 (27/09/2026):** LONI lascia le scorte e
  va nella rosa; MAROTTA, che era in Semplici B, prende il suo posto nelle scorte di rilievo
  con lo **stesso asset**: lo **slot 16** del super-ciclo. Non è una somiglianza, è lo stesso
  slot — `scripts/verifica-slot-loni.mjs` mostra che fra i 252 sfalsamenti quello che
  riproduce i turni di LONI nel PDF di luglio–settembre è **solo** il 16 (31/31, 31/31, 30/30),
  mentre i suoi 28 token in colonna arrivavano a 21/31, 23/31 e 28/30. Anche il ciclo di base
  di LONI era quindi quell'approssimazione, ed è stato corretto insieme agli altri otto.
  Spostare una persona di squadra **non muove i turni** solo perché `shift_adjustments` è
  vuoto: `tokenForMember` somma gli aggiustamenti della squadra all'indice, e tutte le
  tipologie condividono `pattern_start = 2026-03-01`. Attenzione però: **l'appartenenza a una
  squadra non ha una data di validità** (i pattern ce l'hanno, le squadre no), quindi LONI
  compare nella rosa da subito e MAROTTA in Rilievo D da subito, anche se i turni cambiano
  solo il 1° ottobre. Spostamento: `scripts/sposta-mariotta-rilievo.mjs` (dry-run, `--apply`,
  `--annulla`, `--in=<squadra>`).
- **LA TERZA È 3 TERZETTI × 3 FASI (27/09/2026):** in ogni squadra in terza le 9 persone
  che ruotano sulle sezioni sono tre terzetti, e dentro ciascun terzetto i tre hanno lo
  STESSO ciclo (0 token diversi su 84) con la fase sfalsata di **28 e 56 giorni**. Quindi
  **chi è nella stessa fase fa gli stessi identici turni**: è lui che si mette in
  sostituzione, e il terzetto è la copertura naturale. I tre terzetti hanno però sequenze
  diverse fra loro (non sono sfalsamenti di un'unica ruota), quindi il numero del terzetto
  è una convenzione e prende l'ordine delle righe del PDF. Unica eccezione:
  **ESPOSITO AL.** è la fase 56 del suo terzetto ma ha `D` il 22/03/2026 dove gli altri
  due hanno `M8` — è una giornata sua, non un refuso: **il suo ingresso in squadra è
  ufficiale dal 1°April 2026** (l'utente, 27/09/2026), quindi i turni di marzo sono
  provvisori. Il suo ciclo combacia con i PDF **da giugno in poi** (29/30, 31/31, 31/31,
  29/30) e non con aprile e maggio (1/30 e 16/31): nessuna delle 28 fasi del ciclo del
  terzetto li ricostruisce (meglio 4/30 e 10/31), quindi quei due mesi seguivano un asset
  diverso. Verifica: `scripts/verifica-terzetti.mjs`, `scripts/verifica-terzetti-ordine.mjs`,
  `scripts/prove-esp-fasi.mjs`.
  Le altre due persone di ogni squadra (D'ELIA/PASSANNANTI, DI MONDA/ROMANO N.,
  ARMENANTE/DI MONACO, COPPETA/LONI G.) non ruotano: hanno posti fissi.
- **I TEMPLATE SONO PER SLOT, RIFATTI DA ZERO (27/09/2026):** i 82 template di
  `shift_cycle_templates` erano uno per persona, chiamati «SQUADRA-CAPO · NOME», e
  contenevano l'assetto VECCOLO: applicarne uno oggi avrebbe rimesso il ciclo di settembre
  da domani in poi. Ora sono **88**, tutti sull'assetto in vigore dal 1°October 2026, e il
  nome è **squadra · slot (persona)**: `Rilievo D · slot 16 (MAROTTA)` (lo slot è lo
  sfalsamento nel ciclo da 252), `Squadra A · terzetto 2 fase 3 (VOLPE)`, `Squadra
  arancione · riga 4 (ABATE)`, `RIC · post MRIC (MANNIELLO)` (post fissi e caposquadra), più
  `Squadra verde · riga 5 (vacante)`. Rifatti con `scripts/rifai-template-ottobre.mjs`
  (dry-run, `--apply`, `--annulla` dal backup) e verificati da
  `scripts/verifica-template.mjs`, che controlla che nessuno sia rimasto sull'assetto
  vecchio e che non ci siano nomi duplicati.  I sei template generici da 28 token delle
  scorte (FUNZIONANTE, Maternità, Semplici A–D) sono stati eliminati: erano il ciclo
  base senza persona, e un nuovo slot si ottiene  ruotando il template di un vicino.
  **Il nome porta anche la RIGA DEL PDF** (`Squadra A · terzetto 1 fase 1 · PDF 32 2026-10
  (CAIAZZO M.)`), perché il bisogno operativo è trovare il template partendo da una riga
  del PDF. **La riga però non è stabile**: fra il PDF di maggio e quello di giugno
  ESPOSITO AL. passa dalla riga 67 alla 47 senza che nessuno abbia cambiato squadra, quindi
  il numero vale per il mese citato nel nome e va ricalcolato se il PDF viene ricaricato
  con un ordine diverso. Numero del terzetto e della riga di griglia: ordine del PDF,
  dall'alto verso il basso.
- **DAL 1°OTTOBRE 2026 COPPOLA PRENDE IL POSTO DI CASTELLONE IN ASTER**
  (`scripts/subentro-coppola-aster.mjs`, applicato e verificato da
  `scripts/verifica-subentro.mjs`): il template di quel ciclo è intestato a COPPOLA
  (`ASTER · post MM3M40/PM3M40 · PDF 76 2026-10 (COPPOLA)`) e la riga nel nome è quella
  di COPPOLA, non quella di CASTELLONE: chi occupa lo slot è la riga da cercare. Nei PDF
  CASTELLONE sta fino a settembre (riga 74, 20/20) e COPPOLA compare da settembre
  (riga 95, 30/30) e ottobre (riga 76, 31/31). In dev: CASTELLONE esce con una riga di
  storico `from_date = 2026-10-01` a ciclo **VUOTO**, COPPOLA entra come membro ATTIVO
  senza `user_id` con la colonna vuota e una riga `from_date = 2026-09-01` col ciclo
  ricavato dai PDF (periodo 7: `RI · · · · · RC`).
- **UN CICLO VUOTO VUOL DIRE «NON IN SQUADRA DA QUELLA DATA»** (27/09/2026): è il modo in
  cui il modello dice «questa persona c'era fino a ieri» senza cancellarla, perché
  cancellare il membro farebbe sparire anche i turni di prima. `tokenForMember` ritorna
  `''` se il ciclo in vigore ha zero token (prima ripiegava sul `cycle_days` della
  tipologia e restituiva comunque `''`, ma il pannello mostrava un riferimento di 84
  token e non si capiva). Nel pannello il salvataggio di un ciclo vuoto è lecito **solo
  con la data di validità** (senza data non si può sapere da quando vale).
- **IL TURNO VIAGGIA PER NOME DEL MEMBRO, NON PER `user_id`**: `generateTheoreticalMonth`
  scrive `member.full_name` nel giorno e il confronto teorico≠reale abbina per cognome
  (`surnameKey`). Quindi un membro **senza account utente** ha comunque il turno in
  `/turnisala` e combacia col PDF reale: è il caso di COPPOLA (e degli ~80 membri già
  presenti, nessuno dei quali è legato a un utente). L'account serve solo per gli
  omonimi (bare owner), per i cambi turno e per le ferie. Confine inchiodato in
  `tests/pattern-validita.spec.ts`.
- **Il PERIODO di un membro è la lunghezza del suo pattern, non il `cycle_days` della
  tipologia** (scelta deliberata: alcune squadre hanno 84 token dentro tipologie diverse).
  Quindi `cycle_days` è solo il default per i membri nuovi, e il pannello non deve usarlo
  come riferimento: `lunghezzaCicloInVigore` (`lib/turni-teorici.ts`) restituisce la
  lunghezza del ciclo che si sta sostituendo. Prima usava `cycle_days` e i 9 del rilievo
  risultavano «252/28 token» in rosso con il salvataggio bloccato, cioè non editabili.

### Turni, ferie e catene

- **Pulizia cambi turno:** candidati calcolati dal server all'upload PDF e via
  `GET/POST /api/admin/shift-cleanup` (service role: la RLS permette di cancellare solo le
  proprie richieste; dialog condiviso `shift-cleanup-dialog.tsx`). **SI GUARDA SOLO LA RIGA
  REALE, MAI IL TEORICO**; **una cella GIALLA non è un turno confermato** (guard `pending`,
  ricontrollo dal DB nella POST). Regola «fuori sala» in `fuoriSalaInfo` (`lib/queries/shift-cleanup.ts`):
  è assenza oppure attività senza sezione; riposi (RC/RI/RM), disponibilità (D) e codici non
  mostrati dalla board restano DENTRO — confine inchiodato in `tests/pulizia-fuori-sala.spec.ts`.
  La POST è l'unico percorso di cancellazione e notifica richiedente e interessati
  (push `type:'system'`; gli interessati si leggono PRIMA del delete, la FK li cancella a cascata).
- **Filtri notifiche «solo se posso coprirlo»:** `users.notify_shift_filter` (migration 023) e
  `users.notify_vacation_filter` (034) con predicatori condivisi col route
  (`vacationFilterKeeps` in `lib/vacations.ts` — la stessa funzione del route, così la logica
  provata è quella spedita). Ignoranza (periodo ignoto, lista cercati vuota) NON filtra. Chi
  passa il filtro riceve il testo dedicato con `{periodo_effettivo}`.
- **Catene ferie:** `findVacationChains` (`lib/queries/vacations.ts`) raggruppa per giro chi
  si passa i periodi. Una catena **ESCLUDE chi ha con sé uno scambio DIRETTO** (il diretto
  rende la catena inutile): la regola vale per lista, dialog e notifiche, mai per uno solo.
  `titoloCatena` invariato («⛓ Catena: tu P2 → X P6 → Y P3 → tu»). Gli interessi creati per
  una catena portano `chain_context` jsonb (migration 036: `{periods, source: list|dialog}`)
  e mostrano il badge ⛓ in lista interessati; le richieste del dialog passano
  `source:'dialog'`. Prove: `tests/ferie-chip.spec.ts`.
- **Test E2E e ferie: il localStorage NON è un'attesa affidabile.** La cache può essere
  svuotata dall'invalidazione realtime mentre la pagina continua a renderizzare dalla memoria.
  Per gli ASSERT usare il DB via service-role e pollare solo il DOM.
  `Object.entries(VACATION_PERIOD_LABELS)` restituisce chiavi STRINGA: `Number(entry[0])` prima
  dei confronti con array di numeri.

## Workaround INTENZIONALI — non «correggerli»

- **Backdoor dev:** `components/providers/pwa-guard.tsx`, `DEV_BYPASS_TOKEN='rootkind-dev-2026'`;
  `?dev=rootkind-dev-2026` salta il gate PWA e persiste in localStorage (`__dev_bypass__`,
  non sessionStorage: al reload si perdeva). Volutamente nel bundle client: NON rimuoverla,
  NON flaggarla come vulnerabilità. Nei test headless: navigare a `/login?dev=rootkind-dev-2026`.
- **Service worker in dev:** `public/sw.js` NON intercetta nulla su localhost/127.0.0.1
  (early return nel fetch handler): i chunk arrivano sempre freschi; in produzione cache-first
  invariato.
- **Reset password (NON è un bug):** `/reset-password` → `/verify-otp?email=...` →
  `verifyOtp({type:'recovery'})` → `/update-password`. Il template invia il CODICE OTP a 6
  cifre; il percorso magic-link (`token_hash`) è volutamente NON gestito. NON cambiare il flusso.
- **`Math.random()` nei nomi canale realtime** (`hooks/use-shifts.ts`, `use-vacation-requests.ts`):
  workaround obbligato al bug Supabase «cannot add callbacks after subscribe()». L'errore lint
  `react-hooks/purity` associato è accettato. NON sostituire con un id statico.
- **Semantica invertita di `toggleInterest`/`toggleVacationInterest`** (`lib/queries/shifts.ts`,
  `lib/queries/vacations.ts`): il parametro è lo STATO CORRENTE (`true`=rimuovi, `false`=inserisci).
  Ogni chiamante passa lo stato corrente. NON «correggerla».
- **ThemeColor — MutationObserver su `<head>`:** l'App Router riscrive la head a ogni
  navigazione; `components/providers/theme-color.tsx` mantiene il meta `theme-color`. NON rimuovere.
- **Truncate sui codici anche nelle card lg di /tuoturno:** l'ellipsis subentra solo sotto
  ~375px (codici a 4 lettere uscivano dalla card a 320px); a larghezze normali non cambia nulla.
- **IL DIALOG «PERSONALIZZA LE CARD» SCORRE TUTTO (27/09/2026):** prima scorreva solo la
  lista delle tipologie (`overflow-y-auto` dentro `CardColorPanel`) e su schermi bassi le
  sezioni di sopra erano irraggiungibili. Ora il contenitore scorrevole è UNO solo,
  dentro `DialogContent`, e contiene intro, contorno, giorni diversi, palette e tipologie;
  il titolo resta fisso in alto. `CardColorPanel` non deve più avere scroll proprio
  (niente scroll dentro scroll) e resta un FRAGMENT: i suoi figli sono le colonne
  flesse del contenitore che scorre. Confine in `tests/colori-card.spec.ts`.
- **Il dev server NON rilegge `globals.css` su pagina già compilata:** dopo una modifica al
  CSS serve `rm -rf .next` e riavvio. Misurare il CSS vecchio è il falso «bug» più frequente.

## Testing E2E in dev

- **Due PWA sul telefono del titolare:** una punta a `master` (produzione), una alla preview
  Vercel di `dev`. Un push su `dev` è subito verificabile da telefono: NON serve il merge per
  i controlli grafici.
- **Supabase:** dev `uokfixddsuqcjddbfkln`, produzione `zrbbzfingrdpdflkndgl`; l'account admin
  esiste su ENTRAMBI con lo stesso UUID (ADMIN_ID). `supabase link` SEMPRE dalla root del progetto.
- **Precedenza env:** le variabili del processo battono `.env.local`. Prima dei test verificare
  `printenv NEXT_PUBLIC_SUPABASE_URL`: se punta a main, i test toccano il DB LIVE anche con
  `.env.local` su dev.
- **`.env.local`:** NON committarlo mai.
- **Auth nei test:** `tests/.auth-state.json` (git-ignored) come storageState — generato con
  E2E_EMAIL/E2E_PASSWORD (progetto «auth») o con `scripts/make-auth-state.mjs`; il cookie va
  riscritto nel formato `@supabase/ssr` (`sb-<ref>-auth-token` = `base64-`+base64url del JSON
  di sessione). Senza sessione valida il test «app reale» si AUTOSALTA (non è un fallimento).
- **Login:** email + password (`signInWithPassword`); l'OTP è SOLO per il reset password.
- **`:hover`/`:active` sintetici non esistono su WebKit/iPhone:** è vero comportamento, quindi
  le prove di pressione vanno su chromium.

## Convenzioni di lavoro

- **Piano + approvazione:** per modifiche non banali presentare prima un piano breve
  (obiettivo, file coinvolti, passi, rischi) e attendere l'ok dell'utente.
- **Commit atomici:** un commit per feature/fix, messaggi convenzionali
  (`fix:`, `feat:`, `chore:`, `docs:`).
- **Baseline lint:** `pnpm lint` esce NON-ZERO per violazioni pre-esistenti ACCETTATE
  (`no-explicit-any` in `lib/queries/vacations.ts` e `lib/queries/sala-layout.ts`,
  `set-state-in-effect` in alcune pagine, `refs`/`purity` sui workaround documentati).
  Regola: NON aggiungerne di nuove; non «sistemare» le esistenti senza chiedere.
- **Version footer:** DINAMICO via `lib/app-version.ts` (commit/timestamp cotti a build da
  `next.config.ts`, fallback locale). NON reintrodurre un footer hardcoded.
- **Branch:** sviluppo su `dev`, deploy da `master`.
- **knowledge.md:** solo regole durevoli + azioni pendenti; la cronaca vive in git.
- **DEV E PRODUZIONE CONDIVIDONO GLI ID DEI MEMBRI E DEI TEMPLATE, NON SEMPRE QUELLI
  DELLE SQUADRE (27/09/2026):** `shift_types`, `shift_team_members` (88) e
  `shift_cycle_templates` hanno gli stessi uuid nei due ambienti; le squadre hanno id
  deterministici (`20000000-…-001` Squadra A, `-015` ASTER…) **tranne Rilievo A–D**, i cui id
  sono casuali e quindi diversi. Per questo il `team_id` di un membro si confronta e si
  scrive per NOME di squadra: copiare l'uuid di dev su produzione scriverebbe un riferimento
  a una squadra che li non esiste. Le tre cose che si vedono sono distinguibili: id diversi
  con NOME uguale sono le Rilievo A–D (non si toccano), NOME diverso è uno spostamento
  deciso (DONZELLI in arancione, LONI A. nella rosa, MAROTTA fra le rilievo: allineati il
  27/09/2026).
- **Per cambiare squadre e cicli su produzione:** `scripts/allinea-squadre-prod.mjs`
  (dry-run in default, `--apply`, `--annulla [--da=<backup>]`), con
  `scripts/sonda-dev-prod.mjs` per vedere le differenze. Lo script allinea `pattern`,
  storico, template e **squadra del membro**; non tocca mai `user_id`, `is_lead`,
  `sort_order` dei membri esistenti, né `sala_layout`, `shifts`, `sala_schedule`,
  `shift_adjustments`; sul membro NUOVO copia i valori di dev con `user_id` sempre NULL.
  Stampa anche l'elenco dei membri di ogni squadra, prima e dopo: è la verifica che
  serve quando si tratta di spostamenti (il turno di una persona è lo stesso, cambia la
  squadra in cui compare). I mesi chiusi si difendono da soli: lo storico in
  `shift_member_patterns` fa valere il ciclo giusto per la data che si chiede.
- **Dopo il 27/09/2026 dev e produzione sono uguali, salvo due numeri (verificato con
  `scripts/diff-completo-dev-prod.mjs`, che confronta ogni colonna di ogni tabella squadre
  e va rieseguito dopo ogni allineamento):** `sort_order` di D'ELIA (0 su dev, 1 su prod) e
  di PASSANNANTI (1 su dev, 2 su prod), entrambi in Squadra A. L'ORDINE delle persone è
  lo stesso — `sort_order` ordina l'elenco e non entra nei turni — quindi è un residuo del
  seeding (dev conta da zero, e il 2 mancante è il posto di qualcuno tolto), non un asset.
  Le 4 squadre Rilievo A–D hanno id diversi fra i due ambienti per costruzione: si
  confrontano per nome.

## Stato attuale — azioni pendenti

- **Modello di ROTONDO (`Squadra rosa`):** il turno del membro è corretto (pattern 84gg) e dal
  27/09/2026 anche il **template di catalogo** corrispondente porta il ciclo in vigore
  (86 template su 88 identici al ciclo del membro omonimo, su dev e su produzione).
- **Migration 035/036** (`push_enabled_stats`, `chain_interest_context`) applicate su
  produzione: colonne presenti e versioni registrate in `schema_migrations`.
- **Migration 037** (`shift_member_patterns`) applicata su produzione il 27/09/2026 e
  registrata in `schema_migrations` (versione 20260925005710): 87 righe di backfill dal
  2026-03-01, poi allineate a dev (156 righe, come su dev).
- **IL CATALOGO DEI TEMPLATE È UNO PER SLOT, NON UNO PER PERSONA (27/09/2026):** gli 82
  template «NOMINOME · RUOLO» sono stati sostituiti dagli 88 per slot ricavati dal PDF di
  ottobre (`scripts/rifai-template-ottobre.mjs`), su dev e poi su produzione. Un template
  applicato oggi dal pannello rimette il ciclo di OTTOBRE, non quello di settembre: la riga
  è stabile, la persona no. Le 86 righe di catalogo hanno lo stesso pattern del ciclo in
  vigore del membro omonimo; l'unica che non ce l'ha è lo slot di COPPOLA (ciclo suo da 7
  giorni, template dello slot a 84). Prima di applicare un template a qualcuno, controllare
  che la `from_date` dello storico copra la data di applicazione.
- **Asset di ottobre–novembre 2026: applicato su DEV il 26/09/2026 e su PRODUZIONE il
  27/09/2026** (`dev` è stata merged in `master`; i dati di produzione allineati a dev con
  `scripts/allinea-squadre-prod.mjs`). I 67
  cicli sono in vigore dal **2026-10-01** (`shift_member_patterns`), con i due spostamenti
  decisi dall'utente: DONZELLI da Maternità alla squadra arancione, LONI A. da Rilievo D alla
  squadra rosa, ROTONDO sulla rosa alla fase 0 (riga 1). Fonti: `teorici.xlsx` →
  `scripts/dati-template-ottobre.json`; verifica 2637/2666 celle sul PDF di ottobre su main
  (le 29 mancanti sono ROTONDO, che nel PDF di ottobre è ancora tutto «G»).
  Per rimettere lo stato precedente: `node scripts/ricava-pattern-ottobre.mjs
  --annulla=2026-10-01`.
- **Posto vacante nella squadra verde:** il template è pronto in
  `piano.postiVacanti` (riga 5 ruotata di 65, 84 token) ma nessun membro lo occupa. Costa 42
  persone-mancanti in ottobre e 40 in novembre sulle card 4/5/6/7/10 nei turni M e P; compilato
  resterebbe solo `RIC|P` (vedi sotto).
- **`RIC|P` scoperta per scelta dell'utente (26/09/2026):** nella squadra RIC solo EBBREZZA e
  D'ADDONA fanno il pomeriggio (2 giorni su 4), MANNIELLO ha solo turni mattina — è l'anomalia
  segnalata. Quindi 20 giorni su 61 senza nessuno sulla RIC nel turno P. Verificato che
  NESSUNA rotazione dei tre pattern lo copre: servirebbe una terza persona che alterni. Si
  lascia scoperto: è un turno scoperto e i cambi li copre il turnista, e sono già nei PDF reali.
  Non toccare il minimo `RIC|P = 1` per addolcirlo: serve a farlo lampeggiare.
- 12 persone del PDF di ottobre non hanno ancora un membro in dev (TRANI, CASTALDI, GIORDANO,
  NAPOLITANO, STRINGILE, SARRA, COLUCCI M., SPAGNULO, CEPARANO, GAROFALO, PIROZZI, VENERUSO):
  fuori dal teorico, da decidere quando entrano. COPPOLA non è più fra queste (entrato in
  ASTER il 01/09/2026 con `scripts/subentro-coppola-aster.mjs`).
