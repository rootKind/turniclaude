import { defineConfig } from '@playwright/test'
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
