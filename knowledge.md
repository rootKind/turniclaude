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
registry notifiche), `check-design-tokens.mjs` (contratto del design system duale: token
coerenti, contrasti AA, nessun token senza lettore), `check-motion.mjs` (contratto del moto:
molle generate, durate derivate), `sala-gialli-mese.mjs` (sonda manuale d'emergenza).

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

### Design system duale iOS/Android (M1–M11, 20–23/09/2026)

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
- **MOTO — la divisione che regge tutto (M7):** il moto GUIDATO dall'utente (un tocco, un
  pannello che si apre) prende una MOLLA; il moto OSSERVATO (velo, avanzamento, scheletro,
  increspatura di Material) resta durata + easing, perché là una molla non racconta niente:
  è il sistema che scorre, non la persona che agisce. Senza questa distinzione le molle
  rendono l'app stancante.
- **Le molle sono GENERATE, non scritte:** la fisica vive in `lib/motion.ts` (massa 1:
  `posizione()`, `rimbalzo()`, `assestamento()`) e diventa `linear(...)` (≈400 caratteri di
  numeri) nei blocchi di piattaforma via `node scripts/check-motion.mjs --write`; `--print`
  li mostra. **Una molla non sta mai da sola in CSS**: le durate `--motion-duration-enter`
  (pannello che sale), `--motion-duration-press` (pressione) e `--motion-duration-exit`
  (velo) sono il TEMPO DI ASSESTAMENTO della molla che governano — non numeri a parte, e il
  contratto `check-motion.mjs` pretende l'uguaglianza. Su desktop le molle sono l'easing di
  sempre e le durate 300/200: il desktop non si muove.
- **Due famiglie, due schemi:** `spatial` (posizione/dimensione) può rimbalzare, `effects`
  (colore/alpha) **mai** — un'alpha sopra il bersaglio si vede come sfarfallio, e il
  contratto lo misura. Schemi: `standard` (ζ 0.9, il Material sobrio) ed **espressivo**
  (ζ 0.7), quest'ultimo SCELTO per l'app; iOS esprime le sue tre molle nel linguaggio
  SwiftUI (risposta + smorzamento) via `daRisposta()`, non con una seconda tabella. `/admin/movimento`
  è la sonda di taratura: confronta gli schemi con le molle vere, con i controlli veri, e gira
  le due skin (nessun valore copiato lì dentro — mostrerebbe un confronto falso).
- **CHROME DI NAVIGAZIONE (M8):** la barra è un'**isola** su iOS (`--nav-inset` 8px,
  `--nav-radius: 999px`, capsula) e una **fascia** su Android; lo stato «c'è contenuto sotto»
  lo scrive il COMPONENTE (`data-scrolled`, `nav-bar.tsx`) e il CSS lo disegna col token giusto
  (filo di vetro su iOS, `--elevation-nav` su Android) — mai un bordo sempre presente. Il
  contenuto riceve lo spazio che la barra OCCUPA (`--nav-space`) e chi le fluttua sopra il suo
  bordo alto (`--nav-edge`): due token derivati, perché sull'isola i due valori non coincidono.
  **Sui 320px l'isola cede** (`@media (max-width: 20rem) { --nav-inset: 0 }`, unlayered e DOPO
  il blocco di piattaforma): misurato, gli 8pt tolgono 16px alla barra e «Cambi turno» a 10px
  chiede 63px contro i 60,8 disponibili. L'arrivo di pagina è `.pagina` (molla `pop`; il nome viene dalla View Transition di M8b).
- **LA RAIL (M12f, 23/09/2026): la barra diventa una COLONNA sopra i 600dp.** Su Android,
  `@media (min-width: 600px) and (min-height: 480px)` porta `--nav-rail-w: 80px` e la
  navigazione si sposta a sinistra, alta quanto la finestra, con le voci impilate e
  l'indicatore a 56×32 invece di 64×32. Quattro cose da non dimenticare:
  · **la decide la FINESTRA, quindi la decide il CSS** (niente ramo JS, niente `useState`):
    farla in JS significherebbe un primo disegno con la forma sbagliata, cioè il lampo di
    skin che il design system evita dall'inizio. I tre agganci (`nav-shell`, `nav-items`,
    `nav-item`) esistono in TUTTE le configurazioni e sono inerti dove la rail non c'è;
  · **spostare un elemento non è cambiare un valore**: l'involucro porta `bottom-0 left-0
    right-0` come utility, quindi servono REGOLE (unlayered: battono le utility) e non
    token. Ma la geometria che il componente scrive in `style` va resa TOKEN, altrimenti lo
    stile in linea vince su qualunque foglio: per questo l'involucro legge `--nav-shell-h` e
    la superficie `--nav-bar-h`;
  · **`--nav-start` deriva da `--nav-rail-w`** ed è l'unico numero che la pagina chiede
    (`.shell-nav`: `padding-left: calc(var(--safe-left) + var(--nav-start))`). Chi la usa non
    sa se la navigazione è in basso o a sinistra — è `--nav-space` girato di novanta gradi.
    In rail `--nav-space` e `--nav-edge` NON diventano zero: diventano `var(--safe-bottom)`
    (sulla barra gesti l'area sicura c'è comunque, e azzerarli ci farebbe finire il contenuto
    sotto il pollice);
  · **due condizioni, non una**: un telefono in orizzontale è largo 900dp ma alto 412, e lì
    una colonna ruberebbe 80dp alla board — che in orizzontale è la vista che conta (M6 le ha
    dato le safe area laterali per questo). Material stessa avvisa di guardare anche l'altezza.
  Insieme alla rail arriva il **layout largo della board** (`.board-largo`: tetto di 56rem e
  `margin-inline: auto`, come flex item di una colonna) e la toolbar che smette di andare a
  capo. Le prove sono in `tests/m12f-rail.spec.ts` (5 prove × 2 progetti) e il contratto
  difende le sei chiavi nuove come tutte le altre.
- **IL BACK DI SISTEMA CHIUDE L'OVERLAY — e il contratto è un hook solo:**
  `hooks/use-back-to-close.ts`, montato UNA volta nella primitiva (`components/ui/dialog.tsx`)
  e in `nav-action-surface.tsx`. Meccanismo: **Navigation API** (`navigate` con `preventDefault()`
  su `traverse`) più una voce di scorta che non si toglie mai. NON si usa `history.back()`:
  qualunque back scritto da noi sveglia il router di Next e rimonta la pagina (fallisce la prova
  E2E e l'overlay sotto ne esce). Un overlay nuovo quindi NON deve inventarsi il proprio back;
  su iOS l'hook è inerte (lì il back di sistema non esiste).
- **FOGLI TRASCINABILI (M8):** `hooks/use-drag-to-close.ts` — la maniglia è `.drag-handle`
  (`touch-action: none`, altrimenti il gesto diventa scorrimento di pagina) e `DialogContent`
  la disegna da sé; il rilascio decide uscita o ritorno dalla VELOCITÀ della strisciata; la
  traiettoria si INTEGRA mentre il dito si muove (Web Animations, stessa molla del token `pop`)
  perché una `linear()` campiona un tempo già deciso e non sa reagire al dito. Il dito prende
  il comando subito: un'animazione di ingresso che scrive `transform` scavalcherebbe il gesto.
  `setPointerCapture` è una comodità, non un requisito: su WebKit può lanciare.
- **LA TESTATA DI PAGINA (M8b):** `components/nav/testata.tsx`. Su iOS il **titolo grande**
  (34pt) vive nel CONTENUTO e scorre via; la barra compatta (44pt, 17pt semibold, vetro) entra
  quando la pagina si muove — `data-scrolled`, lo STESSO hook della barra in basso
  (`hooks/use-scrolled.ts`: una verità, non due). Su Android è la **top app bar** (64dp, titolo
  compatto 22sp) che scorrendo prende colore ed elevazione di Material (`--head-bar-bg`,
  `--head-bar-shadow`). Sul **desktop non esiste**: `--head-bar-height: 0px` e il titolo resta
  l'`<h1>` di sempre con le classi che la pagina si passa. Titolo e barra sono FRATELLI (la
  barra è `fixed`, la riga del titolo sta nel contenuto): dentro lo stesso blocco uno `sticky`
  si fermerebbe appena il titolo esce. Non c'è interpolazione continua legata allo scorrimento
  (`animation-timeline: scroll()` è solo Chromium): due stati, non un continuum.
- **IL GESTO DI RITORNO DAL BORDO (M8b), solo su iOS:** in una PWA standalone WebKit NON dà il
  gesto alle pagine, quindi l'unico ritorno era il pulsante. `hooks/use-swipe-back.ts`: nasce
  nei primi 20px dal bordo, si impegna solo se l'orizzontale vince il verticale, non parte sopra
  uno scorrimento orizzontale né con un overlay aperto (lì il back è di `use-back-to-close`) e
  **non parte sulle cinque destinazioni** — lì dietro non c'è una pagina dell'app ma la
  cronologia di prima, e un gesto che porta fuori dall'app è il difetto peggiore che un gesto
  possa fare. Al rilascio decide la molla `pop` integrata da `lib/motion.ts` (la stessa dei
  fogli): il dito comanda, la molla conclude.
- **LE TRANSIZIONI FRA PAGINE LE DISEGNA IL BROWSER (M8b):**
  `components/providers/transizioni-pagina.tsx` + `experimental.viewTransition` in
  `next.config.ts`. Il flag da solo NON basta (misurato: con il flag una navigazione client
  chiama `startViewTransition` ZERO volte), quindi la transizione si avvolge dove la navigazione
  nasce: un intercettatore di clic sul documento che chiama lo stesso `router.push` dentro
  `startViewTransition` (con `flushSync`). Su WebKit non parte affatto — la fotografia del
  motore fa CRASHARE la pagina se dentro c'è un discendente `position: fixed` (`usaWebKit`),
  quindi lì l'arrivo resta la molla di M8. Da qui viene anche il **predictive back** di Chrome
  Android, che per l'anteprima usa la transizione dichiarata per quel viaggio.
- **`animation-fill-mode: both` È VIETATO quando il fotogramma finale è lo stato naturale**
  dell'elemento (era la ragione per cui il foglio di Android non tornava mai a `transform: none`).
  `both` tiene vivo il `to`, e un `transform` permanente rende l'elemento il CONTENITORE di
  ogni figlio `position: fixed`. Si usa `backwards`; se il fotogramma finale deve invece
  divergere dallo stato naturale, quello va scritto a mano e giustificato. Corollario sulle
  molle: l'easing generato **chiude su `1 100%` esatto** (la molla si assesta
  asintoticamente, l'animazione no: un easing che non arriva è un'animazione che non finisce).
- **TRAPPOLA `.touch-expand` (M6) con i comandi posizionati:** la regola è fuori dai layer,
  quindi `position: relative` batte l'`absolute` delle utility e il comando finisce al centro
  della maniglia, rendendola non afferrabile (l'area da 44pt del comando copre quella del
  gesto). I comandi dentro la maniglia stanno in un contenitore posizionato.
- **TRAPPOLA `view-transition-name` PERMANENTE (M8b):** un elemento con un nome di transizione
  diventa un **contesto di impilamento**. Scritto sempre (`[data-slot='pagina'] {
  view-transition-name: pagina }`) il pannello dei minimi (`z-50`, DENTRO la pagina) finisce
  sotto il comando delle Azioni (`z-40`, fuori) e la sua «Salva» non è più cliccabile: nessuna
  prova di geometria lo vedeva, l'ha preso la suite dei minimi (che nessuna run completa
  eseguiva: vedi Testing E2E). Il nome vive quindi solo nella finestra `html[data-vt]`, che
  `transizioni-pagina.tsx` accende PRIMA di `startViewTransition` — e la prova E2E lo legge in
  quel momento, perché è l'unico che conta. Costo dichiarato: le transizioni fra DOCUMENTI
  (ricaricamenti, link esterni) non si animano.
- **La pressione risponde in modo diverso, ed è voluto:** su iOS il controllo si ritrae
  (`scale(.96)`), la luce sul bordo alto si accende (`::before`, libero perché su Android lo
  occupano increspatura e stato) e il RITORNO lo fa la molla (270ms, rimbalzo 1.5%); su
  Android la superficie si VELA con la molla delle effects (150ms, nessun rimbalzo) e
  l'increspatura resta a durata fissa — è fedeltà alla spec, non pigrizia. `prefers-reduced-motion`
  collassa tutte le molle sull'easing sobrio in UN punto solo (è la ragione per cui sono token).
- **FORME E VIBRAZIONI — M9/M10 (22–23/09/2026), solo dove la specifica le rende una lingua:**
  la **pressione deforma** ogni controllo che si dichiara `[data-gl]` (`scale .85` + raggio →
  pillola; 120ms all'andata, 350ms al ritorno, entrambi su `--m3-expressive`) e l'attributo
  `data-gl-press` lo scrive il componente al pointerdown — la regola è pura CSS e non conosce
  React. Lo switch M3 accende il pollice **a pillola**, l'indicatore attivo della barra prende
  la forma «a plenilunio» (`--pill-corners`) e l'**aptica** ha quattro accenti (`--aptica-*`:
  tocco, avviso a metà pressione lunga, conferma distruttiva, rifiuto) che leggono le durate
  dalla skin — su iOS sono 0ms e il canale resta muto (WebKit non distribuisce `navigator.vibrate`).
  Su iOS l'aptica *non* è un ramo mancante: HIG non ha il feedback a scatti nel vocabolario dei
  controlli, quindi non c'è nemmeno un uso nostro da coprire. Fuori restano (dichiarati nel
  piano): button group, FAB menu, toolbar, loading a 7 forme, taglie XS–XL, enfasi tipografica,
  angoli concentrici.
- **TRAPPOLA `var()` SENZA DICHIARAZIONE (M9, 23/09/2026):** `box-shadow: var(--nav-indicator-shadow)`
  con la chiave dichiarata in nessun blocco **non** vale «nessun effetto»: è una dichiarazione
  INVALIDA, che il browser scarta e la proprietà cade al valore iniziale. L'ombra di terzo
  livello dell'indicatore attivo non esisteva e nessuna guardia se n'era accorta (il contratto
  chiedeva che un token DICHIARATO fosse letto, non il rovescio). Ora `check-design-tokens.mjs`
  pretende che **ogni `var()` del progetto abbia una dichiarazione**: le deroghe sono poche,
  esplicite e con la ragione accanto (`next/font`, i token che il `<Button>` scrive a runtime,
  gli stili in linea del testo che si adatta).
- **TRAPPOLA geometria in stile IN LINEA (M9):** l'in-linea batte sempre i fogli di stile. Il
  raggio del FAB era un `style={{ borderRadius }}`: nel momento in cui la pressione lo cambia
  da CSS, quella dichiarazione lo vinceva e il controllo si scalava senza cambiare forma. Se un
  valore deve poter essere governato da una regola (e da `:active`), vive nel foglio — `
  [data-platform='android'] .nav-comando { border-radius: var(--fab-radius) }` — non su `style`.
- **M9 CHIUSA (23/09/2026) — le sei voci che restavano:**
  · **scala di taglie XS–XL**: il `<Button>` scrive `data-size`, e le altezze vengono da
    `[data-slot='button'][data-size=…]` nel foglio (i gradini piccoli con `min-height`, così non
    schiacciano chi si scrive più alto). Su Android i due PRIMARI crescono (lg 48, xl 56) perché lì
    il target di tocco è la taglia VERA (M6); altrove i valori sono quelli di oggi.
  · **il segno di attesa** (`components/ui/loading-shape.tsx`): sette forme da OTTO vertici in
    `clip-path` (con un numero di punti diverso il browser non interpola), su Android; altrove un
    quadrato che gira. `role="status"`: l'attesa si annuncia, e il segno è `aria-hidden`.
  · **l'enfasi tipografica**: l'asse `--type-emphasis-*` (peso 700, tracking −0,02em) entra nei
    titoli di Android tramite i token che il titolo già usa (`--head-title-*-weight`), non con una
    regola nuova.
  · **il FAB menu**: il comando, aperto, prende la forma ESTESA (`data-menu-open` → larghezza del
    menu + etichetta) — la geometria è nel foglio, non in linea, altrimenti nessuna regola potrebbe
    governarla.
  · **il segmented espressivo**: la voce premuta si tira verso il dito (`data-gl-press`).
  · **la toolbar della board**: raggio ed elevazione da `--toolbar-*` (28px e l'ombra del chrome su
    Android; 12 e nessuna ombra altrove).
  Fuori, dichiarati: il vicino che si sposta nel segmented, il FAB menu a pila (sostituirebbe il
  foglio che quattro spec pinnano), la scala tonale, l'increspatura estesa, e M10 che non è composito.
- **TRAPPOLA stessa specificità, ordine sbagliato (23/09/2026):** una regola
  `[data-platform='android'] .testata-compatta { font-weight: … }` NON batte
  `[data-platform='ios'] .testata-compatta, [data-platform='android'] .testata-compatta { … }` se
  sta PRIMA nel foglio: stessa specificità, vince l'ultima. Il peso dell'enfasi restava 600 e la
  prova lo diceva. La cura non è spostare la regola: è LEGARE IL TOKEN che quella proprietà già
  leggeva (`--head-title-*-weight: var(--type-emphasis-wght)`) — nessuna precedenza da indovinare.
- **TRAPPOLA misurare una forma TRASFORMATA (23/09/2026):** `getBoundingClientRect` di un quadrato
  che RUOTA è più grande del lato (48 → 54/65) e quello di un comando PREMUTO è scalato (168 → 143,
  cioè il FAB menu che funzionava accusato di non esistere). Le dimensioni si leggono dalla
  larghezza COMPUTATA (`getComputedStyle(el).width`), che né la rotazione né la scala toccano.

### M11 — PWA, chrome di sistema e offline (23/09/2026)

- **MANIFEST = installazione.** `app/manifest.ts` è la BASE comune dei due rami (prod `master`,
  altrimenti DEV) — il ramo DEV aveva un difetto di formattazione su `orientation` e non doveva
  più poter divergere per un campo che non riguarda il nome. Le scelte che contano:
  · **niente `orientation`**: la rotazione la decide il telefono. Era l'errore Android più
    visibile del piano: la board di sala si legge MEGLIO in orizzontale (M6 le ha dato le safe
    area laterali per questo).
  · **`id` e `scope` espliciti**: senza `id` l'identità dell'app è lo `start_url`, e cambiarlo
    un giorno creerebbe una SECONDA app installata (doppia icona, doppia dati).
  · **`shortcuts`**: pinnate da `tests/m11-pwa.spec.ts` contro le cartelle REALI di `app/(app)` —
    il menu dell'icona non è dentro l'app, e una rotta rinominata lì non rompe nessun altro test.
  · **maskable 192 accanto alla 512**: Android sceglie la taglia per densità; con la sola 512
    scala la tile (bordi morbidi).
  · **`screenshots`**: la misura dichiarata DEVE combaciare con l'header del PNG, altrimenti il
    browser la scarta in silenzio e il foglio di installazione torna a una riga di testo (la prova
    legge `readUInt32BE(16/20)`). Si rigenerano con `scripts/genera-screenshot-manifest.mjs`:
    **la LARGHEZZA della finestra decide il layout**, quindi il telefono è 393 CSS px a densità 3
    (1179×2556), non 1080 di lato — che mostrerebbe il layout desktop in cornice da telefono.
- **IL CHROME NON È IL META.** Su iOS 26 **Safari non legge più il meta `theme-color`**: il colore
  della fascia di stato è quello che la pagina disegna sotto di essa. Quindi il meta (mantenuto
  adattivo da `components/providers/theme-color.tsx`: `#f0f7fc` chiaro, `#0a0a0a` scuro) è il
  FALLBACK per i browser che ancora lo leggono, e la verità è `--background` sulla pagina.
  `statusBarStyle: 'default'` è una scelta, non un default: la barra piena (`black-translucent`)
  è stata ritirata nella 26.1 e `#0a0a0a` è esattamente lo sfondo dell'app.
- **EDGE-TO-EDGE SU ANDROID 15.** Android 15 lo ha reso OBBLIGATORIO: la finestra si disegna sotto
  la barra di stato e quella gesti. `viewport-fit=cover` (app/layout.tsx) dice che ACCETTIAMO il
  ritaglio; gli inset li consegna il sistema in `env()`, che M6 legge una volta in `:root`
  (`--safe-*`) e le skin compongono. **Nessun fallback inventato** (niente «se env è zero allora
  24px»): Chrome di Android 15 li consegna davvero — verificato con
  `Emulation.setSafeAreaInsetsOverride` via CDP — e un numero di riserva aggiungerebbe spazio dove
  il sistema non ne chiede. Chi sta ancorato a un bordo DEVE leggere i token: testata
  (`padding-top: var(--head-bar-safe)`), banda della barra (`--nav-height + --safe-bottom`),
  contenuto (`--nav-space`), avviso di rete (`max(var(--safe-top), 8px)`).
- **OFFLINE: LE PAGINE NON SONO IN CACHE, DI PROPOSITO.** Il service worker mette in cache SOLO gli
  asset statici (icone, manifest, chunk); un HTML stantio in un'app di turni mostrerebbe i turni di
  ieri come se fossero di oggi. Per questo `components/providers/offline-bar.tsx` non promette
  niente di più: dice che le modifiche non si salvano e quante risorse sono in cache.
  · vive nel layout di RADICE (fuori da `PwaGuard`): quando la rete manca, la prima pagina che
    deve poterlo dire è `/login`, che il guard protegge;
  · `role="status"` + `aria-live="polite"`: si annuncia, non ruba il fuoco, e non si disegna
    finché `navigator.onLine` non è stato letto (niente mismatch di idratazione);
  · **`navigator.onLine` può essere STORTO** (Wi-Fi che risponde ai ping di sistema senza
    internet): «Riprova» fa un `fetch` vero (`no-store` sul manifest, la risorsa più piccola) e
    ritira l'avviso solo se il ping riesce;
  · il conteggio della cache lo dà il SW con un messaggio `STATO_CACHE` (la pagina non può leggere
    `caches` del worker), risposto a TUTTE le finestre via `clients.matchAll`.
- **TRAPPOLA colore computato in un altro spazio (M11):** `getComputedStyle(body).backgroundColor`
  con un token oklch restituisce **`lab(2.75 0 0)`**, non `rgb(10,10,10)`: confrontarlo con
  l'esadecimale del manifest fallisce su due colori identici. Per confrontare due colori si
  portano entrambi in sRGB — un canvas da 1px e `getImageData` — con 2/255 di tolleranza.
- **TRAPPOLA la testata non esiste ovunque:** `[data-slot="testata-barra"]` è reso solo dalle
  pagine che montano `<Testata>` — `/dashboard`, `/notifiche`, `/vacanze`, **non** `/tuoturno`.
  Misurare la testata su una pagina che non ce l'ha dà `null`, non zero (e su desktop la barra è
  `display:none` ma il NODO c'è: il `null` è la spia di «pagina sbagliata»).
- **`CACHE_NAME` in `public/sw.js` va bumpato a ogni cambio del manifest o degli asset precachati**
  (v6 con M11: shortcuts/screenshots/maskable 192), altrimenti la copia vecchia resta in cache-first.

### M12 — Accessibilità, comodità e adattività (23/09/2026)

- **LA BOARD PARLA (il «punto peggiore» del piano).** La board di sala è una griglia densa
  dove l'informazione viaggia per POSIZIONE; con un lettore di schermo, fino a ieri, si sentiva
  una fila di cognomi e lettere. Ora:
  · la griglia è una **regione etichettata** (`role="region" aria-label="Board di sala — SAB 12
    Settembre 2026, turno Pomeriggio"`) e c'è una **live region** (`data-slot="sala-annuncio"`,
    `role="status"`) che dice giorno, turno e numero di card — comprese le variazioni, perché chi
    non vede la toolbar non ha altro modo di sapere che il turno è cambiato;
  · ogni **card** è un `role="group"` con l'etichetta «SEZIONE — N persone, M scoperti» e i nomi
    sono un **elenco** (`role="list"`/`listitem`: l'ordine è informazione);
  · i **tre turni** sono un gruppo di pulsanti con `aria-pressed` e il nome per esteso («N M P» non
    dice niente a una sintesi vocale); il **calendario** è `role="dialog"` dichiarato da
    `aria-haspopup`/`aria-expanded`; i comandi a icona hanno un `aria-label` (il `title` da solo non
    nomina un comando); i **pallini colorati** sono `aria-hidden` — sono un marcatore scelto
    dall'admin, non un dato (tradurli in parole significherebbe inventarli).
- **DUE LIVE REGION, DUE COSE DIVERSE.** `data-slot="sala-annuncio"` parla di **quello che stai
  guardando** (giorno, turno, card); `data-slot="realtime-annuncio"` (in
  `components/providers/realtime-invalidation.tsx`) parla di **quello che è cambiato altrove**
  («Dati aggiornati: turni, alle 14:32»). Il messaggio del realtime si SVUOTA dopo 6 secondi:
  una live region parla quando il TESTO cambia, quindi due eventi identici di fila senza lo
  svuotamento non verrebbero annunciati. **Non è coperto da prove**: servirebbe una scrittura sul
  DB più un evento realtime vero, e nessuna spec della suite scrive a quel livello — la verifica è
  a mano.
- **IL GRADINO DEL TESTO (Impostazioni → Testo).** Agisce sulla **misura di base del documento**
  (`html { font-size: 125% }`), non su `--type-scale`: la scala `--fs-*` è in `rem` come le classi
  di Tailwind, e una preferenza appoggiata al solo token avrebbe ingrandito le intestazioni
  lasciando piccoli i cognomi della board. Tre conseguenze da non dimenticare:
  · **`--type-scale` resta 1**: se seguisse anche lui il gradino, ogni `--fs-*`
    (`calc(0.75rem * var(--type-scale))`) scalerebbe DUE volte (una dal `rem`, una dal
    moltiplicatore);
  · è una **percentuale**, quindi compone con la preferenza di sistema del browser invece di
    sovrascriverla;
  · è una preferenza del **dispositivo** (`localStorage` `turni-text-scale`), e come tutte le altre
    la cancella `clearAllLocalData()` al logout: chi cambia utente se la ritrova da scegliere.
    È una conseguenza dichiarata, non un difetto.
- **TRAPPOLA stato esterno letto con `useState` + `useEffect` (M12):** la prima versione di
  «torna su» (`components/ui/torna-su.tsx`) aggiornava uno stato da un ascoltatore di scorrimento:
  funzionava solo per gli scorrimenti DOPO il montaggio, e una pagina che si apre già scorsa (o un
  dito veloce durante l'idratazione) lasciava il pulsante invisibile per sempre. La posizione di
  scorrimento è stato ESTERNO e si legge con `useSyncExternalStore` (snapshot al primo render +
  ascoltatore). Stessa medicina del `location.host` nella pagina di installazione (M11), e del
  gradino del testo. **Regola:** se il valore vive fuori da React, `useSyncExternalStore`;
  `useState` + `useEffect` è la strada che introduce il difetto e la cascata di render che il lint
  boccia.
- **TRAPPOLA il posto in basso a destra è già occupato (M12):** campanella delle notifiche e FAB
  delle azioni stanno lì (`--fab-offset`, `z-40`), quindi un controllo flottante NUOVO o va a
  **sinistra** o si **impila** (`bottom: calc(var(--nav-edge) + …)`). La prima versione di «torna
  su» finiva esattamente sotto la campanella: il pulsante c'era, visibile, e il tocco non arrivava
  mai — lo dice la prova (`intercepts pointer events`), non l'occhio.
- **BUDGET DEL VETRO = 3 superfici velate per schermata**, misurato da `tests/m12-comodita.spec.ts`
  contando gli elementi visibili con un `backdrop-filter` attivo su `/turnisala` e `/dashboard`.
  Ogni vetro è un livello di compositing che il telefono paga a ogni fotogramma: se ne serve un
  quarto, si discute, non si aggiunge. Per questo «torna su» e l'avviso di rete NON hanno vetro.
- **ORIZZONTALE:** la board in landscape (852×393) non sborda e il contenuto si sposta di quanto
  dice l'inset laterale (`--safe-left`), che è la promessa di M6 ora verificata. **Fuori,
  dichiarato:** la barra flessibile per i pieghevoli, il giro con VoiceOver/TalkBack su
  dispositivo vero (l'albero è corretto e provato, ma la lettura reale è un'altra cosa) e il
  layout largo su iPad. Il primo punto della lista — la rail — è arrivato in M12f (vedi la
  «CHROME DI NAVIGAZIONE» qui sopra).

### M12b — l'annulla e le vie d'uscita (23/09/2026)

- **L'UNDO NON È UN INTERRUTTORE, È UNA DOMANDA PER AZIONE.** `lib/undo.ts` (`avvisoAnnulla`)
  mostra lo snackbar con l'azione «Annulla» per 6s (dentro la finestra 4-10s che M3 dà agli
  snackbar con un'azione). Perché una sola funzione: l'istantanea la prende **chi muta** — ha in
  mano lo stato corrente, e catturarla dentro l'helper significherebbe catturare quella
  sbagliata (al primo render invece che al momento del gesto). E si rimette l'**elenco intero**,
  non la voce: `hooks/use-notification-history.ts` espone `ripristina(istantanea)`, perché
  ricostruire una voce cancellata pezzo per pezzo sbaglia un caso su dieci (l'ordine, la
  posizione, le voci arrivate nel frattempo).
- **DOVE l'undo, e dove resta la conferma.** Reversibile = **lo storico delle notifiche**, che è
  LOCALE (`localStorage`): la riga cancellata con lo swipe, «Segna tutte come lette», «Elimina
  tutte». Il resto dell'app scrive sul DATABASE, e un `delete` sul DB non si annulla con un array
  in memoria: lì resta la conferma, che è la rete giusta per ciò che non si può disfare. Lo
  svuotamento ha **entrambe** (conferma + annulla): il piano diceva «undo dove è reversibile e
  conferma dove no», e togliere la conferma a un'azione distruttiva sarebbe stato un favore a
  metà.
- **LE VIE D'USCITA (`components/ui/via-uscita.tsx`).** La passata ha trovato stati vuoti senza
  uscita in una decina di schermate; il componente esiste perché siano la STESSA cosa (testo
  primario, semibold, sottolineato al passaggio) e non sette modi di dire «prova da qui».
  La regola che conta: l'uscita **dipende dalla causa del vuoto** — con una ricerca attiva è
  «azzera la ricerca» (e il comando si offre SOLO se c'è una ricerca da azzerare: altrove sarebbe
  un pulsante che promette e non mantiene), con un filtro attivo è togliere il filtro, senza
  niente è «ricarica» (feedback, debug notifiche) o il periodo più largo (statistiche).
- **TRAPPOLA il lint vieta lo stato scritto da un effetto (M12b):** `void carica()` dentro un
  `useEffect` fallisce (`react-hooks/set-state-in-effect`) perché il setState è raggiunto
  sincronicamente; una catena `.then(...)` no, perché scrive quando ARRIVA la risposta. Per
  «ricarica» si usa quindi un **contatore nello stato** messo fra le dipendenze
  (`const [ricarica, setRicarica] = useState(0)`), non una funzione da chiamare nell'effetto.
- **TRAPPOLA due volte 320px nella stessa prova (M12f):** nel progetto `android` lo User-Agent
  del server è Android, quindi la metà «desktop non si muove» di una spec deve chiedere
  `?platform=desktop` ESPLICITO — senza override misura la rail (successo: 700 al posto di 64).
  E una voce di rail larga 80 mostra un contenuto di 79: il filo di separazione (`border-right`)
  sta DENTRO la larghezza (preflight: `box-sizing: border-box`), quindi le prove confrontano con
  la superficie, non con un numero scritto a mano.

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
- **Il mouse SINTETICO di WebKit è inaffidabile per i gesti:** dopo un trascinamento, il flusso
  del puntatore che segue si INTERROMPE dopo la prima mossa (misurato: 13 mosse in una pagina
  pulita contro 2 dopo un trascinamento; si sblocca ricaricando). Non è il codice: su Chromium
  con la stessa skin la stessa sequenza consegna 13 mosse su 13, e l'hook prende il gesto in
  entrambi i casi. Le due affermazioni di un gesto si scrivono quindi in DUE prove, con una
  pagina fresca ciascuna.
- **Un LAMPO non è un'accensione (23/09/2026):** l'evidenzia «vengo da qui» può sparire mentre
  il respiro corre, perché la board SOSTITUISCE la copia in cache con quella fresca e lì la
  persona può non essere più su quella card (misurato: 48ms di accensione su 3000). Un
  candidato vale solo se è ancora acceso mezzo secondo dopo — la stessa logica con cui un test
  deve distinguere «è successo» da «è passato».
- **I CRONOMETRI SI CAMPIONANO A TEMPO, NON A MUTAZIONI (23/09/2026):** un `MutationObserver` su
  `.desk-card-flash` misurava 409ms su una card accesa 3s, perché un re-render che stacca e
  riattacca l'elemento per un fotogramma viene letto come «finito». Un `setInterval` da 50ms con
  `begin`/`ultima`/`assenteDa` (assente ⇒ fine solo dopo 300ms di assenza) misura la durata vera.
- **La MISURA DI UNA TRANSIZIONE va attesa:** `data-gl-press` si accende all'istante, la
  geometria ci arriva in 120ms — letta subito, la larghezza è quella di riposo (56 invece di 48).
  Si aspetta che il RAGGIO si assesti e poi si legge; e i valori saturati (`rounded-full`) si
  confrontano per GEOMETRIA, non per stringa: il massimo rappresentabile non è lo stesso fra i
  motori (WebKit 3.35e7, Chromium 3.4e38).
- **Su iOS il rilascio del comando di dashboard NAVIGA** (il tap esegue l'azione primaria,
  «Nuovo turno» → `/dashboard?new=1`) e quella navigazione può interrompere il `goto`
  dell'iterazione successiva: il `goto` si riprova, e della skin giusta risponde la guardia
  `SKIN()` — mai il silenzio di un `catch`.
- **Le spec dei minimi sono le uniche che girano DOPO tutto e che SCRIVONO** (`minimi` project,
  `dependencies: ['chromium']`): una run filtrata per progetto può non eseguirle affatto, ed è
  così che per una milestone intera è rimasto invisibile il difetto del `view-transition-name`.
  Una prova che nessuna run completa esegue è una prova che non esiste.

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

- **M9 è CHIUSA (23/09/2026)**; di M10 resta composito (angoli concentrici, chiusa su un iPhone
  vero) e di M9 le deroghe dichiarate nel piano (vicino che si sposta, FAB menu a pila, scala tonale,
  increspatura su liste e card). Vedi `docs/piano-liquid-glass.md`, «M9 chiusa».
- Migration 034 `notify_vacation_filter` applicata su produzione (colonna presente e versione
  registrata in `schema_migrations`).

## Verifica visiva duale (24/09/2026) — regole restanti

- **L'AREA DI TOCCO si misura col `::after`**: il box visibile non basta — i `Button` di M6
  rispondono su 44pt anche quando sono 22px alti, e una sonda che legga il solo `getBoundingClientRect`
  segnala difetti inesistenti (e ne fa perdere di veri). La lettura giusta: `getComputedStyle(el,'::after')`,
  area = max(box, after) per asse.
- **`.touch-y` è la variante per i controlli AFFIANCATI** (segmented, stepper, ♡ nelle righe):
  espansione solo verticale fino a `--touch-min`, mai in larghezza — allargarsi lateralmente ruberebbe
  il tocco al vicino, stessa ragione di `.touch-dense`. Se una riga resta «stretta» in una dimensione
  è una scelta, non un dimenticato: controllare il vicino prima di «sistemare».
- **Un testo di STATO non va in `truncate`**: su 393px le due righe dell'offline-bar competevano col
  bottone «Riprova» e l'ellipsis tagliava il senso («finché non t…»). L'ellipsis è per le etichette
  a riga sola; un messaggio va a capo (banner da 71→89px, overflow resta 0).
- **Il confronto visivo fra due run è affidabile SOLO a dati fermi**: fra 23:00 e 01:00 la dashboard
  cambia giorno (e i turni pubblicati cambiano le liste) — il pixel-diff segnalava 20–30% su pagine
  identiche al 100% ricatturate dopo. Prima di attribuire una differenza al codice, ricatturare:
  se il diff crolla a 0, era il mondo, non il CSS.
- **Le basi `toHaveScreenshot` guardano il GUSCIO, non i dati**: l'elenco turni della dashboard è
  dato (cambia ogni giorno e col numero di righe cambia l'altezza pagina) — si fotografa la testata
  (clip 140px) o si mascherano le voci. E lo scroll torna a zero PRIMA della fotografia: il reload
  può ripristinare posizione diverse e far sembrare shiftata tutta la pagina.
- La suite visiva è `tests/visivi.spec.ts` (5 scenari × ios/android × chiaro/scuro, basi committate);
  si rigenera con `--update-snapshots`. Gli harness della verifica (matrice, diff, area di tocco)
  vivono in `tests/.probe-*` (git-ignored) — `node tests/.probe-matrici.mjs <url> <tag> [profilo]`.

## FIX PARSER v9 + picker mese (24/09/2026) — gialle ereditate dalla riga sbagliata

**Il bug (ottobre 2026, PDF del 23/9):** CIPOLLETTA risultava gialla nei giorni
[2,7,11,27,28,29] di MININO. Causa GEOMETRICA: il PDF disegna alcune celle gialle in DUE
rettangoli impilati (mezze celle h≈7-9px) e il centro della metà bassa cadeva a ~5px dalla riga
adiacente, dentro la vecchia tolleranza «centro ±6px» di `yellowDaysAtRow` (a marzo: 11 righe con
falsi positivi, es. CAVANNA g11 era di IORIO). La cura in `lib/pdf-parser.ts`:
`mergeStackedYellowCells` fonde i pezzi impilati (SOLO mezze celle: le intere adiacenti si toccano
di ~1px fra righe) e `rowOwnsYellowCell` assegna la cella alla riga la cui banda [y±7.7] è coperta
di più. Verificato su 18 PDF d'esempio (`scripts/confronta-gialli-v9.mjs`): nessun giallo NUOVO,
solo rimozioni; il vero `parsePdfSchedule` sull'ottobre reale
(`scripts/verifica-parse-ottobre.mjs`) restituisce Cipolletta=[30], Minino=[2,7,11,27,28,29].

**Picker mese di /turnisala:** la tendina scriveva il value dal mese della BOARD (`cm-1`) invece
che dal mese sfogliato: la griglia passava a ottobre ma la tendina tornava su «Settembre». Ora
value = `pickerMonth.getMonth()` e alla riapertura il calendario riparte dal mese della board.
Spec: `tests/sala-picker-mese.spec.ts` (usa le fixture del progetto, NON `@playwright/test`
diretto: senza `browserPronto` il changelog copre la pagina).
