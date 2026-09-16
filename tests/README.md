# Test E2E (Playwright)

Smoke test del Confronto di `/tuoturno`: nessun testo di card troncato e nessuna
barra di scorrimento orizzontale, a 320px e 390px.

```bash
npx playwright test
```

## Prerequisiti

- **Dev server su porta 3000** per i test «app reale» (`.freebuff/run.md`):
  `npm run dev` in questo worktree. Per usare un'altra porta basta
  `E2E_BASE_URL=http://localhost:56540 npx playwright test` — la rispettano tutti
  gli spec sulla board (`employee-session.ts`), incluso il vecchio
  `pages.spec.ts` che prima aveva `:3000` scritto dentro. I test sui MOCKUP
  invece sono file statici (`file://`): girano anche senza server.
- **Browser**: `npx playwright install chromium` (una volta per macchina).

## Cosa copre

| Test | Bersaglio | Copre |
|---|---|---|
| mockup 320px (peggior caso) | `mockups/confronta-320px.html` | sezioni larghe (TUTOR, DCIF, F.E., Trasf), cap colonne, zero overflow |
| mockup dashed + due righe | `mockups/confronta-dashed-e-due-righe.html` | card split/strike (bordo 0 + tratteggio sulle metà), card sm due righe |
| app reale | `http://localhost:3000/tuoturno` | tabella Confronto dal vivo: apertura FAB → dialog → selezione 2 persone, zero clipping, zero scroll |
| gialli + evidenzia | `http://localhost:3000/turnisala` | `dipendente.spec.ts`: entrando COME il dipendente, la sua card si evidenzia (giallo richiedente e sostituto) e niente falsi positivi |
| codici lunghi | `http://localhost:3000/tuoturno` | `tuoturno.spec.ts`: MM3M40/MDCCM… non tagliati nella griglia dei giorni, da 320px a 1280px |
| chip gialle + scroll | `http://localhost:3000/turnisala` | `chip-gialle.spec.ts`: le chip non escono dalla card (320→1280px) e la pagina scorre sui display bassi |
| pannello notifiche | `http://localhost:3000/admin` | `notifiche.spec.ts`: il registry mostra anche i messaggi ferie decisi dal manager (etichette, variabili e anteprima). Sola lettura. Il contratto (`scripts/check-notif-templates.mjs`) copre anche il push «novità» del changelog e l'interesse compatibile (23 messaggi) |
| card scoperte (regola) | nessuno — logica pura | `sala-scoperto.spec.ts`: sotto il minimo è scoperta, il giallo non si somma al minimo, storia datata dei minimi (1 s, nessun DB) |
| minimi per card (admin) | `http://localhost:3000/turnisala` | `minimi.spec.ts`: dal mini-Fab admin al salvataggio fino alla segnalazione «— scoperto» (chip o testo); include il caso PERIODO per casella (a 0 = scoperta da programma). SCRIVE e RIPRISTINA la piantina |
| card scoperte (logica T/S) | nessuno — logica pura | `sala-scoperto.spec.ts` (sezione «titolare o sussidio» e «periodi per casella»): quale POSTO manca, confini dei periodi (inizio dal proprio turno, fine inclusa), precedenza periodo > voce > default |
| rotazione della squadra | nessuno — dati veri (service-role) | `squadra-rosa.spec.ts`: ROTONDO gira come i compagni (56 turni su 84, zero «G», riposi allineati), la griglia copre 4/6/7/10 e il pattern riproduce il teorico dei PDF 71/71 |

## Autenticazione del test «app reale»

Il test carica `/tuoturno?dev=rootkind-dev-2026`: il parametro è la backdoor
ufficiale del PwaGuard (un browser non-PWA verrebbe altrimenti rimandato a
`/installa`). Il bypass viene salvato in localStorage dal guard stesso; oltre a
quello serve una **sessione Supabase**, in uno di due modi:

1. **Credenziali E2E (raccomandato in CI)**: crea `.env.e2e` (git-ignored) con
   `E2E_EMAIL=...` / `E2E_PASSWORD=...` e lancia
   `npx playwright test --project=auth --project=chromium`: il progetto «auth»
   fa il login dal form reale e salva `tests/.auth-state.json`.
2. **Export della sessione da un browser già autenticato**: apri l'app, copia
   il cookie `sb-<ref>-auth-token` (valore `base64-<base64url(JSON)>`), decodificalo
   in `tests/.sb-session.json` (oggetto sessione di supabase-js), poi:
   `node scripts/make-auth-state.mjs` (legge il ref da `.env.local` e riscrive
   il cookie nel formato esatto di `@supabase/ssr`, bypass PWA incluso).

`tests/.auth-state.json` è LOCALE e git-ignored (contiene token validi). Senza
sessione il test «app reale» si AUTOSALTA (skip, non fallimento); i mockup sono
la rete di regressione affidabile perché replicano lo stesso markup/classi.

## Fixture «entra come dipendente» (`tests/fixtures.ts`)

Per i test che devono vedere l'app **come la vedrebbe quella persona** (es. la
card evidenziata col proprio turno giallo) non serve né la sua password né un
`storageState` rigenerato:

```ts
import { test, expect } from './fixtures'
import { openBoard, boardCards, cardByTitle } from './sala-board'

test('la mia card si evidenzia', async ({ asEmployee }) => {
  const page = await asEmployee('Barra')        // cognome, o { cognome, nome }
  expect(await openBoard(page, { month: 9, day: 24, shift: 'M' })).toBe(true)
  expect(cardByTitle(await boardCards(page), 'DCCM')!.highlighted).toBe(true)
})
```

Come funziona (`tests/employee-session.ts`): col service-role si genera un
**link magico** (`admin.generateLink`) per l'email del dipendente — ricavata
dall'anagrafica `users` — e lo si verifica con `verifyOtp` su un client
`@supabase/ssr` con cookie-jar in memoria: i cookie di sessione escono nel
formato/chunk ESATTI dell'app e si iniettano nel contesto del test. Serve
`SUPABASE_SERVICE_ROLE_KEY` (in `.env.local`, git-ignored): senza, i test
«come dipendente» si SALTANO. Base URL: `E2E_BASE_URL` (default 3000).

> Il link magico NON va fatto consumare al browser: `/auth/confirm` scambia
> solo `?code` (PKCE) e il link admin torna coi token nel fragment — atterrerebbe
> su `/login?error=auth-error`. Da qui il cookie-jar.

`tests/sala-board.ts` chiude il resto: aprire un giorno+turno (`openBoard`, che
ritorna `false` se la pagina non è autenticata così il test può saltare),
cambiare turno senza ricaricare (`selectShift`), leggere le card con evidenzia e
chip (`boardCards`), i titoli evidenziati (`highlightedCards`) e le misure delle
chip gialle (`boardChips`: testo, larghezza, righe, `overflowing`, `clipped`).

## Chip gialle e scorrimento verticale (`tests/chip-gialle.spec.ts`)

```bash
npx playwright test tests/chip-gialle.spec.ts
```

La board è a 3 colonne FISSE: la card misura 411px su desktop ma **114px a
390px**, e la card ha `overflow-hidden` → quello che non entra viene tagliato.
La chip gialla «cognome + sigla» è la più esposta: il 23/9 turno P, con
«SmeragliuoloSPCA» (142px) in 98px di riga utile, **8 chip su 28 uscivano dalla
card**. Il test passa da 320, 390 e 1280px sul giorno più pieno del mese (30 chip
su 12 card) e pretende che nessuna chip esca dalla card, che nessun testo finisca
dietro l'ellipsis e — a 1280px — che le chip restino su UNA riga: su desktop lo
spazio c'è e la resa non deve cambiare.

Altri tre test dello spec difendono i COLORI della chip e la lettura del nome
dell'utente (richiesta 16/09/2026), confrontando i canali RESI dal browser
(`boardChipColors`):

- in `light` e in `dark` il **bordo** della chip deve avere gli stessi canali del
  suo **testo** (è il 30% del testo, `currentColor`): prima il bordo prendeva la
  tinta TRASFERTE (ambra) mentre il testo veniva dalla tinta ASSENTI, e in tema
  scuro le due famiglie si vedevano come due colori sulla stessa pillola;
- nel chiaro il testo è un **rosso vero** (componente rossa > 150, verde < 60),
  non il marrone `#8c2a24` di prima.

Controllo negativo fatto: rimettendo il bordo sulla tinta trasferte, ENTRAMBI i
temi vanno rossi — la prova non passa a vuoto.

Dalla sera del 16/09/2026 lo stesso test pretende anche che il bordo sia il
colore **pieno** della scritta e non il 30% (a metà strada fra il riempimento
giallo e il testo si leggeva come un terzo colore): basta che la stringa del
colore reso non porti alpha (`/ 0.3`, `rgba(`).

Altri due test dello spec (uno per tema) difendono che la card abbia UNA SOLA
tinta sotto il titolo: la coda delle chip vive fuori da `.sala-card-body`, quindi
senza la classe la card mostrava il proprio FONDO sotto il corpo — due tinte
diverse nella stessa card, visibili solo in scuro (#171717 contro #262626).
La verifica è **strutturale**, non sui colori: `cardBodyGaps` (`tests/sala-board.ts`)
scorre le fasce a tutta larghezza della card e pretende che dalla fine del titolo
all'ultimo pixel non resti scoperta nessuna riga. Vale nei due temi, quindi non
può tornare nemmeno cambiando le tinte. Controllo negativo fatto: prima del fix
il test è rosso in entrambi i temi, elencando le card col buco (DCO 8°, DCCM,
DCP, DCO 9°/11°).

Il secondo test risponde a una domanda diversa: su un display verticalmente
piccolo /turnisala **scorre**. A 380px e 500px di altezza il documento è più alto
del viewport e lo scroll arriva in fondo; nessun antenato ha `overflow-y: hidden`
(il layout dell'app è `min-h-screen`, quindi è il documento a scorrere). Il test
lo verifica invece di darlo per scontato, perché un `overflow: hidden` introdotto
per sbaglio su un contenitore lo romperebbe in silenzio.

> Trappola del dev server (Turbopack): una modifica a `app/globals.css` può NON
> comparire nel CSS servito (cache del modulo CSS). `touch` non basta — serve una
> modifica di CONTENUTO. Se un test CSS passa/finisce senza motivo, controlla che
> la regola sia nella pagina: `grep <selettore> .next/dev/static/chunks/*.css`.
> Verificato il 15/09/2026, dopo un'ora persa a misurare regole mai applicate.

Due trappole già risolte da `openBoard`, da tenere presenti se si scrivono
altri test sulla board:

- il dialog **«Novità di questa versione»** si apre ~1,5 s dopo l'avvio per gli
  utenti che non l'hanno mai visto e rende INERTE la pagina sottostante: senza
  chiuderlo, i click su trigger/turni vengono intercettati dal suo overlay.
  Viene chiuso con Escape/backdrop e **non** con «Continua», che scriverebbe
  `markChangelogSeen` sul profilo di una persona vera;
- la board è uno schema a 3 colonne: a 320px (viewport degli altri test) il
  pannello del calendario copre tutto lo schermo e non resta backdrop da
  cliccare — per questi test serve un viewport desktop (`test.use`).

## Minimi per card: dal mini-Fab alla chip (`tests/minimi.spec.ts`)

```bash
E2E_BASE_URL=http://localhost:3000 npx playwright test tests/minimi.spec.ts
```

Il giro completo, che è l'unica cosa che le prove di logica non possono dire:
mini-Fab admin → evento → pannello precompilato → salvataggio su Supabase → la
board ricaricata segnala la card sotto il minimo. Il giorno scelto è il **6/9
turno P**, dove la DCO 6° (doppia) ha una persona sola: manca esattamente di una,
quindi UNA chip.

**Attenzione: questo spec scrive nel database reale.** La configurazione dei
minimi vive nella riga `sala_layout` id=1 insieme alla piantina — è un dato
dell'utente. Per questo `tests/sala-layout.ts` ne prende una copia esatta in
`beforeAll` e la rimette com'era in `afterAll` (Playwright lo esegue anche se il
test fallisce); il test che salva ripristina la copia anche all'inizio, così la
precondizione «nessun minimo configurato» non dipende dall'ordine dei test.

Due dettagli che fanno perdere tempo se non si sanno:

- il menu dei mini-Fab di /turnisala si apre con una **pressione lunga di 500 ms**
  (timer su `onPointerDown`), non con un click: `openSalaAdminFab` in
  `tests/sala-board.ts` fa `dispatchEvent('pointerdown')` e attende. **Non**
  mandare il `pointerup` dopo: quando il menu è aperto la label del Fab diventa
  «Chiudi menu», il locator non trova più niente e l'attesa si mangerebbe il
  timeout del test;
- l'utente autenticato è l'**admin vero** (Minino Davide: la sua anagrafica porta
  l'uuid di `ADMIN_ID`), perché il pannello è riservato a lui. La fixture
  `asEmployee` lo copre come chiunque altro.

Il terzo test dello spec copre il **turno di partenza** di una voce (richiesta
16/09/2026): salva «Valido dal 27/9, Dal turno P» e pretende che la **mattina del
27 non cambi** (le chip «scoperto» sono le stesse di prima del salvataggio —
attesa ricavata dal DOM, non scritta a mano) e che il pannello stesso lo dica:
«la prima voce parte dal 2026-09-27, turno P» in mattina, «In vigore da
2026-09-27, turno P» dal pomeriggio. Il 27/9 non è scelto a caso: è un giorno in
cui la regola dei minimi, se valesse da tutta la giornata, segnalerebbe una card
in mattina. Controllo negativo fatto: ignorando `fromShift` nella risoluzione, il
test diventa rosso (la mattina cambia).

## La rotazione della squadra: il caso ROTONDO (`tests/squadra-rosa.spec.ts`)

```bash
npx playwright test tests/squadra-rosa.spec.ts
```

Tre test che leggono il DATABASE VERO (service-role via `tests/supabase-admin.ts`;
si saltano se le chiavi non ci sono) e difendono la rotazione teorica della
Squadra rosa. Servono perché la regressione che li ha motivati — ROTONDO con un
pattern di 84 giorni fatto di **46 «G»** e un solo passaggio sulle sezioni,
mentre i compagni girano regolarmente su 4/6/7/10 — **non stava nel codice
dell'app**: era un dato, prodotto da una passata di
`scripts/apply-super-cycle.mjs` che derivava i pattern per maggioranza contando
anche i codici che non sono turni. Una classe di bug che nessun test sulla UI
può vedere, e che il prossimo `--apply` può rifare.

| caso | cosa pretende |
|---|---|
| 84 giorni di rotazione | 56 turni di sezione su 84, **zero** «G», nessuna classe vuota, e i giorni di riposo negli STESSI indici dei compagni che ruotano |
| la griglia di 12 giorni | in ognuno dei 56 giorni di lavoro del ciclo le quattro sezioni 4/6/7/10 coperte una volta sola (le quattro persone che ruotano) |
| il teorico dei PDF | il pattern riproduce il teorico del PDF **giorno per giorno, 71/71, dal 1/3 al 10/5/2026** (dall'11/5 l'ufficio non lo pianifica più a rotazione: lì il confronto si ferma) |

Il terzo è il più importante: dice che il pattern non è un'invenzione dell'app
ma la rotazione che l'ufficio pianificava davvero. Il secondo esclude il caso
degenerato «tutti nella stessa sezione». Il primo cattura il sintomo originale
(i «G»).

CONTROLLO NEGATIVO fatto: rimettendo il pattern rotto nel DB i tre test diventano
ROSSI e il ripristino torna verde — sonda
`scripts/.dbg-controllo-negativo-rotondo.mjs` (scrive con try/finally, quindi
ripristina anche se qualcosa va storto).

## La regola delle card scoperte (`tests/sala-scoperto.spec.ts`)

Un test che **non apre il browser**: importa `scopertiForDay` da
`lib/sala-month.ts` e la prova su casi sintetici. Gira in un secondo, senza dev
server e senza service-role, quindi non si salta mai.

Serve perché la scopertura dipende dal PDF caricato e dal periodo: nel mese in
archivio (15/09/2026) la vecchia regola — solo gialli — segnala **0 card**,
quindi il controllo dal vivo su `/turnisala` restava verde senza verificare
niente. Qui la regola si fissa su casi costruiti a mano.

Dal 15/09/2026 la regola ha **due cause** (vedi `lib/sala-minimi.ts`):

1. le persone reali sono meno del **minimo** previsto per quella sezione e turno
   — il caso ROTONDO, che nessuna cella gialla spiega;
2. un **giallo** ha spostato la persona altrove (la vecchia regola).

I due numeri NON si sommano (`mancanti = max(sottoMinimo, daGiallo)`, altrimenti
la stessa persona conterebbe due volte). Casi coperti: 2 attese/1 reale →
scoperta; il **richiedente** non svuota la sua card; senza giallo e senza minimi
niente scopertura; il sostituto che resta nella stessa card non la scopre; minimo
e giallo sulla stessa card → `max`, non somma.

Il secondo blocco prova `lib/sala-minimi` senza browser: i default (doppia → 2,
singola → 1 in M/P; la tabella della notte), la **storia datata** (il 10 vale la
voce del 1, il 20 quella del 15), il **turno di partenza** (richiesta
16/09/2026: «dal 20/9, turno P» lascia la mattina del 20 alla voce precedente, dal
21 vale su tutti i turni, e due voci dello stesso giorno con turni diversi
convivono) e il fatto che **finché nessuna voce copre il giorno e il turno la
regola non si applica** — è quello che evita di riempire di «scoperto» i mesi
vecchi, dove le sezioni non erano presidiate.

Controllo negativo fatto: togliendo il guard «solo il sostituto lascia la card»
da `scopertiForDay`, il test sul richiedente diventa rosso.

## Il nome dell'utente loggato: grassetto e pill spessa (`tests/dipendente.spec.ts`)

Due test dello spec, entrambi «come la vedrebbe quella persona»:

- **in card** va in grassetto SOLO il cognome dell'utente (chip gialle comprese:
  lì il grassetto prende anche la sigla, «MininoSPCA»). `boldTexts` in
  `tests/sala-board.ts` raccoglie le foglie con lettere di tutta la card — le
  chip di coda delle card a riga vivono FUORI da `.sala-card-body`, quindi
  guardare solo il corpo le perderebbe — e ogni voce porta con sé la chip di
  appartenenza: è così che «SPCA» resta il codice dell'utente e non un estraneo;
- **nelle «altre presenze»** la pill dell'utente (`desk-own-badge`, che c'era già)
  prende `.desk-own-badge-strong`: grassetto e anello interno a 2px (`ownPills`).
  Cosenza compare nei gruppi in più giorni (12, 13, 21…): il test prende il primo
  che ne ha uno, così sopravvive al ricaricamento del PDF, e il controllo è che
  chi NON è in quei gruppi non abbia nessuna pill propria.

## Calendario personale (`tests/tuoturno.ts`)

Helper per la griglia dei giorni di `/tuoturno`, usati da `tuoturno.spec.ts`:

```ts
import { LARGHEZZE, cellCodes, openCalendar } from './tuoturno'

await openCalendar(page, 'Smeragliuolo', { year: 2026, month: 9 })  // mese + persona (selettore «Turni di chi?»)
const codici = await cellCodes(page)   // { label, font, lines, clipped, cellW } per ogni codice
```

`openCalendar` fissa mese e anno (così il test non dipende dal mese corrente) e
sceglie la persona dal selettore, quindi **un solo login** basta a guardare le
celle di chiunque. `cellCodes().clipped` (`scrollWidth > clientWidth`) è la
spia della regressione: significa che il codice è finito dietro l'ellipsis.

Perché serve: la griglia è a 7 colonne fisse in `max-w-lg` (cella 65px su
desktop, 37px a 320px) mentre i codici del PDF arrivano a 6-7 caratteri
(`MM3M40`, `NDisSal`, `MDCCM`): a 14px `MM3M40` misura 67px e non entra **mai**,
nemmeno a schermo intero. La classe `.cell-fit` (globals.css) adatta il font
alla cella con una container query e sotto i 44px di cella manda a capo.

## Pannello notifiche (`tests/notifiche.spec.ts`)

Il contratto del registry vive in `scripts/check-notif-templates.mjs`
(`node scripts/check-notif-templates.mjs`, secondi, nessun browser): chiavi uniche,
override applicati/ripristinati, variabili, e il **legame registry ↔ route** —
ogni chiave usata dai route esiste nel registry, ogni voce del registry è usata da un
route, e chi importa `send-with-template` non ha titoli scritti a mano (era il caso
dei 4 messaggi ferie lato manager, invisibili al pannello).

Lo spec E2E guarda quello che il contratto non può vedere perché serve il browser:
l'intestazione («21 messaggi push dell'app · N modificati»: il conteggio è un intero,
non la metà delle chiavi di override) e l'editor di un messaggio ferie con le sue
variabili (`{periodo} {anno}`, mai `{turno}`) e l'anteprima coi valori d'esempio.
È in **sola lettura**: non salva override (sarebbero globali per tutti gli utenti).

## Limitazioni note

- **I test dei gialli NON hanno più giorni fissi (16/09/2026, sera).** Dopo la
  ricarica del PDF vero di settembre (23/9 passato da ~30 chip a 1, i candidati
  dell'evidenzia nei Corsi) i giorni si scelgono dal DATO: `tests/sala-gialli.ts`
  legge `sala_schedule` e restituisce i giorni più ricchi di celle gialle
  (`giorniGialli`) e i giorni in cui una persona sta su una card
  (`giorniSuCard`, turno di sezione o cella gialla). `scripts/sala-gialli-mese.mjs`
  resta la sonda manuale d'emergenza.

- La sessione esportata SCENDE (exp di ~1h, standard Supabase): se il test
  «app reale» salta improvvisamente, rigenera `tests/.auth-state.json`.
- Il mockup «320px» scarica le colonne oltre il cap con la STESSA formula
  dell'app (`compareChunks.maxByWidth`): se cambi la formula in
  `tuoturno-client.tsx`, aggiorna anche lo script nel mockup.
