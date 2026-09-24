import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

// Playwright non legge i file .env: carica .env.e2e (git-ignored) se presente,
// senza sovrascrivere variabili già presenti nell'ambiente.
if (existsSync('.env.e2e')) {
  for (const line of readFileSync('.env.e2e', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

/**
 * Smoke test del CONFRONTO (mockups + app): il dev server DEVE già girare su
 * localhost:3000 (o su `E2E_BASE_URL`). Niente webServer: qui non vogliamo
 * avviare Next (lento e a rischio conflitto di porte col preview del thread).
 *
 * AUTENTICAZIONE del test «app reale»: supabase-js tiene la sessione in
 * localStorage; se tests/.auth-state.json esiste (contiene il token esportato
 * dal browser con la sessione valida — file LOCALE, git-ignored), il progetto
 * lo inietta come storageState e il test nasce autenticato. Due modi per
 * generarlo: (a) il progetto «auth» fa il login con E2E_EMAIL/E2E_PASSWORD;
 * (b) copiare il token dal browser con la sessione (vedi tests/README.md).
 * Senza storageState il test «app reale» si autosalta (skip, non fallimento).
 */
const authState = 'tests/.auth-state.json'

/**
 * VELOCITÀ (17/09/2026): i test erano tutti in fila su UN worker e ognuno
 * apriva la board con attese FISSE (8 s per navigazione, misurati con
 * `tests/probe-nav.spec.ts`). Ora:
 *
 * - le attese fisse sono diventate condizioni (vedi tests/sala-board.ts) e i due
 *   popup dell'app che coprono la pagina sono spenti dal contesto di test
 *   (tests/browser-setup.ts) — sono anche la ragione per cui la suite, il 17/09,
 *   si piantava sul primo test della board;
 * - i file girano in PARALLELO (`fullyParallel` + `workers`): sono quasi tutti
 *   letture su persone diverse, e la board è la stessa pagina per tutti.
 *
 * UNICA ECCEZIONE, per non pestarsi i piedi: `minimi.spec.ts` è l'unico spec che
 * SCRIVE (salva e ripristina la piantina dei minimi in `sala_layout`) e per
 * giunta in modo GLOBALE (un minimo «valido dal 17/9» vale anche per i giorni
 * che gli altri spec leggono). Per questo vive in un progetto suo, dichiarato
 * DOPO gli altri: la dipendenza lo fa partire quando il resto ha finito.
 *
 * IL MOTORE DI iOS (25/09/2026): il progetto `ios` rifà su WebKit — il motore di
 * Safari/iPhone — le spec del SALTO IN SALA e della BOARD. Non è pignoleria: su
 * WebKit cambiano proprio le cose su cui si giocano i difetti segnalati dai
 * telefoni (IndexedDB cancellato da ITP, timer sospesi della pagina in pausa,
 * navigazioni di storia), e senza questo progetto quelle strade erano coperte da
 * una config temporanea, una volta sola. Si installa con
 * `npx playwright install webkit` (una volta per macchina) e i file elencati
 * girano su ENTRAMBI i motori (chromium e ios): è la stessa spec, due engine.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  use: {
    headless: true,
    viewport: { width: 320, height: 640 },
    ...(existsSync(authState) ? { storageState: authState } : {}),
  },
  projects: [
    { name: 'auth', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: [/auth\.setup\.ts/, /minimi\.spec\.ts/, /perf\.spec\.ts/],
      use: { browserName: 'chromium' },
    },
    // M12f/M12b (23/09/2026) NON hanno un progetto proprio: girano in `chromium`
    // (come le altre spec dell'app) e la rail anche in `android`, perché lì
    // esiste davvero. La spec dell'annulla è della piattaforma neutra —
    // `localStorage` non ha skin.
    {
      // SALTO IN SALA + BOARD sul motore di iOS (vedi l'intestazione): WebKit con
      // un iPhone emulato. Le stesse spec girano anche in `chromium` — un
      // comportamento che regge solo su un motore è un difetto che non abbiamo.
      name: 'ios',
      testMatch: [
        /card-cambio-to-sala\.spec\.ts/,
        /sala-mese-da-cache\.spec\.ts/,
        /sala-card-presence\.spec\.ts/,
        /dipendente\.spec\.ts/,
        /chip-gialle\.spec\.ts/,
        // Il datepicker del dialog dei cambi turno: l'incolonnamento delle sigle
        // «lun mar mer» con le colonne dei giorni si rompe SOLO su WebKit (una
        // <tr> con display:flex dentro una table display:block viene ignorata),
        // quindi questo file gira anche qui — è il motore che ha il difetto.
        /shift-dialog\.spec\.ts/,
        // La piattaforma e i token del design system (M1, 20/09/2026): il valore
        // atteso dipende dal MOTORE, quindi questa spec ha senso solo girando su
        // tutti e tre (desktop, iPhone, Android).
        /design-piattaforma\.spec\.ts/,
        // La BARRA a due skin (M2, 20/09/2026): anche qui l'atteso lo decide il
        // motore del progetto — su WebKit la pill del comando deve nascere GIÀ
        // nell'HTML del server, senza scivolare da un FAB.
        /nav-piattaforma\.spec\.ts/,
        // Gli OVERLAY (M3, 20/09/2026): su iPhone il task è un foglio che sale
        // dal basso, l'allarme resta centrato e la conferma scritta prende il
        // posto della ×. Sono gesti e misure della piattaforma: si provano lì.
        /overlay-piattaforma\.spec\.ts/,
        // I CONTROLLI (M4, 20/09/2026): switch, campo, chip, state layer. Il
        // confronto fra skin usa l'override di QA (?platform=) sullo stesso
        // motore — ma il pollice che cresce e il ripple dal dito sono GESTI:
        // si provano sul motore vero, e WebKit è quello con gli eventi pointer
        // più severi.
        /controlli-piattaforma\.spec\.ts/,
        // La BOARD e la PWA (M5, 20/09/2026): la card dati cambia raggio/ombra
        // col motore (desktop com'era, 12 + ombra su telefono) — l'atteso lo
        // decide il progetto, come per le altre spec di piattaforma.
        /board-piattaforma\.spec\.ts/,
        // L'APTICA (M10): su iOS la prova è il SILENZIO — il canale non spara
        // mai, perché la skin decide 0ms. Il vetro contrasto dei fogli è la
        // skin di iOS: anche quella si prova lì.
        /aptica-vetro\.spec\.ts/,
        // M9 CHIUSA (23/09/2026): scala di taglie, segno di attesa a sette
        // forme, enfasi del titolo, FAB menu, segmented e toolbar. Ogni prova
        // ha la sua affermazione su «la skin che NON deve muoversi», quindi
        // gira dove la forma esiste E dove non deve esistere.
        /m9-completa\.spec\.ts/,
        // L'ASPETTO VISIVO (24/09/2026): le basi `toHaveScreenshot` della skin
        // iOS — pagine e sheet in chiaro e scuro. Le basi si rigenerano con
        // `--update-snapshots` e si committano: poi ogni scostamento del guscio
        // oltre la soglia fallisce qui.
        /visivi\.spec\.ts/,
      ],
      // `serviceWorkers: 'block'` NON è un dettaglio: su WebKit il service worker
      // dell'app (quello delle push) prende il controllo della pagina e le sue
      // richieste NON passano da `context.route` — quindi il blocco di
      // `/api/changelog` che in `tests/browser-setup.ts` spegne il popup «Novità di
      // questa versione» NON lo spegneva: il popup si apriva, il suo overlay rendeva
      // inerte la pagina e i click dei test restavano appesi fino al timeout
      // (25/09/2026, tre spec di `dipendente.spec.ts` bloccate così). Le push non
      // sono coperte da queste spec: il worker si può bloccare senza perdere niente.
      use: { ...devices['iPhone 13'], browserName: 'webkit', serviceWorkers: 'block' },
    },
    {
      /**
       * ANDROID (M1 del design system duale, 20/09/2026): Chromium con un Pixel 7
       * emulato — User-Agent Android vero, quindi `data-platform="android"` scritto
       * dal server e token M3 al loro posto. Non è pignoleria: era il motore che
       * NESSUNA spec copriva (la suite girava su chromium desktop e su WebKit per
       * iPhone), quindi ogni differenza di piattaforma era dedotta, mai provata.
       */
      name: 'android',
      testMatch: [
        /design-piattaforma\.spec\.ts/,
        /nav-piattaforma\.spec\.ts/,
        /overlay-piattaforma\.spec\.ts/,
        /controlli-piattaforma\.spec\.ts/,
        /board-piattaforma\.spec\.ts/,
        // Le FORME espressive (M9) e la sonda visiva del moto expressivo: sono
        // la skin Android — su iOS le regole non esistono, e provarle lì
        // significherebbe pretendere un difetto.
        /espressivo-sonda\.spec\.ts/,
        // L'APTICA e il vetro contrasto (M10): il canale spiato funziona su
        // entrambi i motori (il silenzio di iOS è parte della prova).
        /aptica-vetro\.spec\.ts/,
        // M9 chiusa (23/09/2026): Android è la skin che INDOSSA la scala, il
        // segno a sette forme, l'enfasi, il FAB menu esteso e la toolbar
        // espressiva — è qui che si pretende la forma.
        /m9-completa\.spec\.ts/,
        // L'ASPETTO VISIVO (24/09/2026): come sopra, con le basi della skin M3.
        /visivi\.spec\.ts/,
        // LA RAIL (M12f, 23/09/2026): è la forma larga di ANDROID — una colonna a
        // sinistra sopra i 600dp. Girando anche qui, oltre che in `chromium`
        // dove la prova controlla che iOS e desktop NON si muovano, la stessa
        // spec dice le due cose: che la rail esiste dove deve e che non esiste
        // dove non deve.
        /m12f-rail\.spec\.ts/,
      ],
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
    {
      // Scrive nel database: seriale e dopo tutto il resto (vedi sopra).
      name: 'minimi',
      testMatch: /minimi\.spec\.ts/,
      fullyParallel: false,
      dependencies: ['chromium'],
      use: { browserName: 'chromium' },
    },
    {
      // Misura un TEMPO: da sola e dopo il resto, altrimenti quattro worker che
      // compilano insieme la sporcano (vedi tests/perf.spec.ts).
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      fullyParallel: false,
      dependencies: ['chromium'],
      use: { browserName: 'chromium' },
    },
  ],
})
