# 🧠 Memoria di progetto — Turni Sala C.C.C. (PWA)

> Memoria persistente del progetto per l'AI assistant (convenzione Freebuff: `knowledge.md`
> nella root, iniettato nel contesto a ogni sessione). Aggiornarla quando cambiano
> convenzioni, architettura o stato noto. **Igiene:** qui vanno SOLO regole durevoli e
> azioni pendenti — la cronaca dei fix vive in git. Non accumulare diario: riscrivi la
> regola, buttane la storia.

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
supabase/       migrations/ 001–034 (schema completo), functions/cleanup-shifts (ALTERNATIVA al cron SQL di migration 002)
public/         sw.js (solo push + click, cache statica minima) — registrato a runtime da sw-registrar.tsx / use-push.ts
tests/          suite Playwright (playwright.config.ts; progetti: auth, chromium, ios, minimi, perf)
scripts/        SOLO strumenti riusabili (vedi scripts/README.md); i one-off non vanno committati
mockups/        HTML statici per scelte grafiche (i due usati dai test di confronto restano)
```

Script riusabili da CONSERVARE: `make-dev-icons.mjs` (icone «Turni DEV»), `make-auth-state.mjs`
(sessione E2E), `verify-tuoturno.mjs`, `verify-scorte-fix.mjs`, `generate-seed.mjs`
(rigenera la migration 020), `apply-release-migrations.mjs` (applica migration via Management
API), `allinea-rotazione-prod.mjs`, `apply-super-cycle.mjs`, `verify-seed.mjs`,
`measure-nav-prod.mjs`, `measure-cache-first.mjs`, `check-notif-templates.mjs` (contratto del
registry notifiche), `sala-gialli-mese.mjs` (sonda manuale d'emergenza).

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
  Separator toolbar NMP `.sala-toolbar-sep` solo tra due bottoni non selezionati.
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
- **Responsive:** pagine `max-w-lg mx-auto px-4`; campanella `NotificationBell` fixed
  top-right (header con `mr-14`/`pr-12`); header con `flex-wrap` + `min-w-0`/`flex-shrink-0`:
  su schermi stretti si va a capo invece di straripare. Nessuna pagina deve generare scroll
  orizzontale. NON nascondere «Chiedi congedo» con breakpoint (sta largo anche sotto 640px).
- **Altezza pagina = min-height, MAI height fissa:** con `height` fissa i figli flex si
  comprimono e il contenuto resta sotto la bottom nav SENZA scroll. L'unico vincolo legittimo
  è `overflow-y:auto` su un contenitore interno esplicito (test: `tests/pages.spec.ts`).
- **Bottom nav** (`components/nav/`): CINQUE destinazioni (una per pagina, contratto puro in
  `nav-destinations.ts`); «Turni» è l'unica con `remembersLastPage` (memoria in
  `use-last-page.ts`, chiave `turni-last-page`). Le AZIONI stanno fuori dalla barra:
  matrice pagina×ruolo in `use-nav-actions.ts`, disegnate da `nav-action-surface.tsx`
  (pill iOS / FAB 56dp Android / cerchio 48px desktop; tap esegue se UNA azione non
  distruttiva, altrimenti apre l'elenco; pressione lunga 500ms apre sempre). I contenitori
  dell'action-surface sono `pointer-events-none` tranne pulsante e sheet (una banda invisibile
  mangiava i click: 3 test in timeout). Il passaggio sala↔ferie è il selettore
  `turni-switch.tsx` in testa alle due pagine (Link veri con `aria-current`), NON un'azione.
  Il pannello admin ha la X (`router.back()`): da PC è fuori dal gruppo `(app)`, senza bottom nav.
- **Anno minimo (gate + skeleton UNICO):** `min_year_turniferie`/`min_year_vacanze` da
  `app_settings`; skeleton `components/ui/year-gate-skeleton.tsx` (varianti turniferie/vacanze)
  finché `minYear === null` (mai flash dell'anno corrente); fetch con fallback
  `.catch(() => anno corrente)`; `minYear` come prop del dialog, niente costanti hardcoded.
- **Splash/manifest PWA:** splash in-app (`components/providers/boot-splash.tsx`) SOLO iOS via
  `@supports (-webkit-touch-callout: none)`; `apple-icon.png` bianco; icone `icon-192/512`
  TRASPARENTI + icone `icon-maskable-512(-dev)` con `purpose:'maskable'` (tela 80%, safe-zone
  40% — generate da `make-dev-icons.mjs` se cambia il logo). Bump `CACHE_NAME` in `sw.js` a
  ogni cambio icone/manifest (cache-first). Install flow: `components/providers/pwa-install.ts`
  intercetta `beforeinstallprompt` (niente mini-infobar); /installa mostra «Installa ora» SOLO
  dove `canInstall` è vero, istruzioni a mano su iOS (l'evento NON esiste lì: niente fallback finto).
- **Manifest «Turni DEV»:** il manifest è la route `app/manifest.ts` (`/manifest.webmanifest`):
  a build time `VERCEL_GIT_COMMIT_REF==='master'` → «Turni Sala C.C.C.» + icone originali;
  altrimenti «Turni DEV» + icone `*-dev.png` con banda gialla (generate da
  `make-dev-icons.mjs` se cambia il logo). Stessa env-check in `app/layout.tsx`.
- **Animazioni d'ingresso uniformi:** `opacity 0→1`, `y: 6→0`, durata 0.15s easeOut, stagger
  `index*0.04` (cap 0.3). Le animazioni FUNZIONALI (drag, expand, page-transition, filtri) sono volutamente diverse.
- **Migrations 001–034 completano lo schema.** NON riscrivere le policy RLS, NON aggiungere
  colonne/tabelle duplicate. Su produzione le migration si applicano con
  `scripts/apply-release-migrations.mjs` via Management API (la history prod è a timestamp:
  `supabase db push` NON si usa lì) + registrare la versione in `schema_migrations`.
- **Next.js 16:** API e convenzioni diverse dal passato (`proxy.ts` ecc.); in dubbio leggere
  `node_modules/next/dist/docs/` prima di scrivere codice.

### Sala — dati e parser

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

### Design system duale iOS/Android (M1–M5, 20/09/2026)

- **La piattaforma la decide il SERVER, una volta sola:** `lib/platform.ts` (PURO, la sola
  regex UA dell'app — ratchet 0 regex fuori da lì, contrato in `check-design-tokens.mjs`);
  `app/layout.tsx` scrive `data-platform` sul `<html>` da `headers()`: niente script inline,
  niente flash di skin. Override QA: `?platform=ios` o localStorage `turni-platform-override`
  (per guardare l'altra skin, NON per i test: quelli usano i motori veri). iPadOS 13+ in
  desktop mode resta `desktop` (limite dichiarato).
- **Token a DUE livelli in `globals.css`:** LIVELLO 1 = ruoli neutri (`--surface`,
  `--primary-action`, `--danger`…): ALIAS delle variabili esistenti, non cambiano un pixel.
  LIVELLO 2 = valori per piattaforma (`--font-ui`, `--radius-*`, `--touch-min`, `--nav-height`…) in
  `:root` (base = desktop) e nei blocchi `[data-platform='ios'/'android']`. Le utility
  tipografiche (`text-body` ecc.) stanno in `@theme inline` — SENZA `inline` Tailwind
  copierebbe il valore e la piattaforma non potrebbe cambiarlo. Da qui si scrive `text-body`,
  non `text-[15px]` (ratchet tipografico). Il JSX NON ha rami per piattaforma: cambiano solo
  token e regole CSS su `[data-slot]` (contratto `scripts/check-design-tokens.mjs`:
  stesse chiavi nei blocchi, chiavi DEVONO-DIFFERIRE, contrasti AA misurati con la matematica
  di `lib/color.ts`, elenco coppie saltate bloccato).
- **Forme per piattaforma:** dialog = **foglio** su iOS (sale dal basso, «Chiudi» scritto) /
  centrato M3 su Android (`shape="auto"` di `DialogContent`; `shape="dialog"` = allarme,
  centrato OVUNQUE, azioni impilate iOS con «Annulla» non rossa e MAI ×). Le conferme
  distruttive hanno un posto solo: `chiedi()` in `hooks/use-conferma.tsx` (niente `confirm()`
  nativi, niente distruzioni in linea; `window.prompt` non esiste più). Snackbar Android in
  basso (uno alla volta, colori inversi), banner in alto altrove. Button: state layer+ripple
  M3 dal punto del dito (`transform: none`, niente translate-y) / contenuto che si spegne su
  iOS (`opacity .65`). Switch iOS: verde di sistema `#34c759`/`#30d158` (segnale, non brand).
- **TRAPPOLA nota:** il dev server NON rilegge `globals.css` su pagina già compilata — dopo
  una modifica al CSS serve `rm -rf .next` e riavvio (misurare il CSS vecchio è il falso
  «bug» più frequente). `:hover`/`:active` sintetici non esistono su WebKit/iPhone: è vero
  comportamento, le prove di pressione stanno su chromium/android.

### «Il tuo turno» (/tuoturno)

- La cella mostra codici completi (assenze/riposi/disponibilità/attività) con tinta per tipo
  di turno e badge data nell'angolo (stile bottoni nav, contrasto garantito su ogni tinta).
  I turni «da confermare» (giallo PDF) hanno contorno ambra 2px ESATTO sul bordo: UNICO
  marcatore sulle card.
- **Tap sul giorno → /turnisala** solo dove `sectionTurnOf(reale)` produce una card
  (`data-sala-day`); riposi/assenze/codici senza card non sono bersagli. Nel CONFRONTO le card
  restano di sola lettura. Preferenze del pannello: UNA config per tema (chiaro/scuro).
- **Confronto:** SOLO turni reali (fallback teorico con caption «turni teorici»), celle 44px,
  chunking adattivo misurato nel DOM (niente setState sincrono in effect), min 5
  giorni/colonna, larghezza minima uniforme calcolata con canvas `measureText`
  (`cmpTextWidth`, non stime px/char).
- **Salto card → sala (contratto in `lib/shift-tokens.ts`):** `buildSalaFocusUrl` (chi manda) /
  `parseSalaFocus` (chi riceve); parametri `m,d,t,c,n` + `from` (porta il contesto `dev=`/`as=`).
  La persona viaggia per COGNOME (l'unica chiave che la board sa usare). Prima di navigare si
  verifica il turno (`getUserShiftOnDate`): se non risulta, toast e NESSUNA navigazione.
  In DeskBoard la guardia `focusHonoredRef` evita la corsa col reset mese→oggi (sia in
  StrictMode sia cambiando mese): NON semplificarla. L'avviso «non è in sala» ha id FISSO e
  viene spento allo smount della board; la board NON giudica da pagina nascosta
  (visibilitychange) e riprova al ritorno.
- **Pulizia cambi turno:** candidati calcolati dal server all'upload PDF e via
  `GET/POST /api/admin/shift-cleanup` (service role: la RLS permette di cancellare solo le
  proprie richieste; dialog condiviso `shift-cleanup-dialog.tsx`). **SI GUARDA SOLO LA RIGA
  REALE, MAI IL TEORICO**; **una cella GIALLA non è un turno confermato** (guard `pending`,
  ricontrollo dal DB nella POST). Regola «fuori sala» in `fuoriSalaInfo` (`lib/sala-month.ts`):
  è assenza oppure attività senza sezione; riposi (RC/RI/RM), disponibilità (D) e codici non
  mostrati dalla board restano DENTRO — confine inchiodato in `tests/pulizia-fuori-sala.spec.ts`.
  La POST è l'unico percorso di cancellazione e notifica richiedente e interessati
  (push `type:'system'`; gli interessati si leggono PRIMA del delete, la FK li cancella a cascata).
- **Filtri notifiche «solo se posso coprirlo»:** `users.notify_shift_filter` (migration 023) e
  `users.notify_vacation_filter` (034) con predicatori condivisi col route
  (`vacationFilterKeeps` in `lib/vacations.ts` — la stessa funzione del route, così la logica
  provata è quella spedita). Ignoranza (periodo ignoto, lista cercati vuota) NON filtra. Chi
  passa il filtro riceve il testo dedicato con `{periodo_effettivo}`.

## Workaround INTENZIONALI — non «correggerli»

- **Backdoor dev:** `components/providers/pwa-guard.tsx`, `DEV_BYPASS_TOKEN='rootkind-dev-2026'`;
  `?dev=rootkind-dev-2026` salta il gate PWA e persiste in localStorage (`__dev_bypass__`,
  non sessionStorage: al reload si perdeva). Volutamente nel bundle client: NON rimuoverla,
  NON flaggarla come vulnerabilità. Nei test headless: navigare a `/login?dev=rootkind-dev-2026`.
- **Service worker in dev:** `public/sw.js` NON intercetta nulla su localhost/127.0.0.1
  (early return nel fetch handler): i chunk arrivano sempre freschi; in produzione cache-first invariato.
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

## Stato attuale — azioni pendenti

- Nessuna al 22/09/2026. (La migration 034 `notify_vacation_filter` è applicata su
  produzione: colonna presente e versione registrata in `schema_migrations`.)
