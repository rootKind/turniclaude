# Test E2E (Playwright)

Smoke test del Confronto di `/tuoturno`: nessun testo di card troncato e nessuna
barra di scorrimento orizzontale, a 320px e 390px.

```bash
npx playwright test
```

## Prerequisiti

- **Dev server su porta 3000** per il test «app reale» (`.freebuff/run.md`):
  `npm run dev` in questo worktree. I due test sui MOCKUP invece sono file
  statici (`file://`): girano anche senza server.
- **Browser**: `npx playwright install chromium` (una volta per macchina).

## Cosa copre

| Test | Bersaglio | Copre |
|---|---|---|
| mockup 320px (peggior caso) | `mockups/confronta-320px.html` | sezioni larghe (TUTOR, DCIF, F.E., Trasf), cap colonne, zero overflow |
| mockup dashed + due righe | `mockups/confronta-dashed-e-due-righe.html` | card split/strike (bordo 0 + tratteggio sulle metà), card sm due righe |
| app reale | `http://localhost:3000/tuoturno` | tabella Confronto dal vivo: apertura FAB → dialog → selezione 2 persone, zero clipping, zero scroll |
| gialli + evidenzia | `http://localhost:3000/turnisala` | `dipendente.spec.ts`: entrando COME il dipendente, la sua card si evidenzia (giallo richiedente e sostituto) e niente falsi positivi |
| codici lunghi | `http://localhost:3000/tuoturno` | `tuoturno.spec.ts`: MM3M40/MDCCM… non tagliati nella griglia dei giorni, da 320px a 1280px |

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
leggere le card con evidenzia e chip (`boardCards`), i titoli evidenziati
(`highlightedCards`).

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

## Limitazioni note

- La sessione esportata SCENDE (exp di ~1h, standard Supabase): se il test
  «app reale» salta improvvisamente, rigenera `tests/.auth-state.json`.
- Il mockup «320px» scarica le colonne oltre il cap con la STESSA formula
  dell'app (`compareChunks.maxByWidth`): se cambi la formula in
  `tuoturno-client.tsx`, aggiorna anche lo script nel mockup.
