import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

/**
 * Smoke test del CONFRONTO (mockups + app): il dev server DEVE già girare su
 * localhost:3000 (vedi .freebuff/run.md). Niente webServer: qui non vogliamo
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

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    headless: true,
    viewport: { width: 320, height: 640 },
    ...(existsSync(authState) ? { storageState: authState } : {}),
  },
  projects: [
    { name: 'auth', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: /auth\.setup\.ts/,
      use: { browserName: 'chromium' },
    },
  ],
})
