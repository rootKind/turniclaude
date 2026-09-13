import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { test as setup, expect } from '@playwright/test'

/**
 * Setup auth (opzionale): se esistono le variabili E2E_EMAIL / E2E_PASSWORD
 * (es. in un file .env.e2e locale, MAI committato), il progetto «auth» fa il
 * login REALE via form e salva i cookie in tests/.auth-state.json — il test
 * «app reale» nasce così autenticato. Senza credenziali lo setup si salta e
 * il test «app reale» salterà a sua volta (comportamento atteso).
 *
 * Uso:  crea .env.e2e (git-ignored) con E2E_EMAIL=... / E2E_PASSWORD=...
 *       npx playwright test --project=auth --project=chromium
 */
const STATE_FILE = 'tests/.auth-state.json'

setup('login (se ci sono credenziali E2E)', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password) {
    setup.skip(true, 'credenziali E2E_EMAIL/E2E_PASSWORD assenti: il test «app reale» salterà')
  }
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Accedi' }).click()
  // Il login reindirizza a /dashboard: aspetta che l'app risponda da autenticati.
  await expect(page).toHaveURL(/\/(dashboard|tuoturno)/, { timeout: 15_000 })
  mkdirSync('tests', { recursive: true })
  await page.context().storageState({ path: STATE_FILE })
})
