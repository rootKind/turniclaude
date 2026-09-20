import { test, expect, employeeLoginEnabled } from './fixtures'
import { E2E_BASE_URL } from './employee-session'
import { dismissChangelog } from './sala-board'
import type { Page } from '@playwright/test'

/**
 * LA BOARD E LA PWA (M5 del design system duale, 20/09/2026).
 *
 * Due famiglie di prove, entrambe dipendenti dal MOTORE che le esegue (le
 * girano i progetti `ios`, `android` e `chromium` — vedi playwright.config.ts):
 *
 *  1. LA CARD DELLA BOARD (`data-slot='desk-card'`, /turnisala): raggio e ombra
 *     arrivano dai token `--desk-card-*`. Il desktop resta COM'ERA (8px, nessuna
 *     ombra: la suite pixel-sensitive non deve muovere un pixel); su telefono la
 *     skin disegna: 12px con ombra tenera (iOS) o elevazione M3 (Android).
 *     Vengono misurate le card REALI della board di dev (autenticazione
 *     `?dev=rootkind-dev-2026` come le altre spec di sala): il valore atteso lo
 *     decide il progetto in esecuzione.
 *
 *  2. LA PAGINA /installa: il pulsante «Installa ora» compare SOLO dove il
 *     browser espone `beforeinstallprompt` (Android/Chrome e desktop Chromium);
 *     su WebKit/iPhone l'evento non esiste e la pagina resta sulle istruzioni —
 *     la verifica sul motore che NON ha l'API è la parte importante: è lì che un
 *     fallback finto si vedrebbe.
 */

/** Il raggio atteso della card dati, per il progetto che sta girando. */
function raggioAtteso(projectName: string | undefined): RegExp {
  if (projectName === 'ios' || projectName === 'android') return /(^12| 12)px|12px/
  return /^8px$/ // chromium desktop: il valore di sempre, com'era
}

/** L'ombra attesa: nessuna sul desktop, presente sulle skin mobile. */
function ombraAttesa(projectName: string | undefined): string | RegExp {
  if (projectName === 'ios' || projectName === 'android') return /rgba?\(0, 0, 0/
  return 'none'
}

async function apriBoard(page: Page) {
  await page.goto(`${E2E_BASE_URL}/turnisala?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.sala-card-bg', { timeout: 15_000 })
  await dismissChangelog(page)
  return page.locator('[data-slot="desk-card"]').first()
}

test.describe('board-piattaforma (M5)', () => {
  test('la card della board ha la forma della sua piattaforma', async ({ asEmployee }, testInfo) => {
    test.skip(!employeeLoginEnabled(), 'service-role assente: niente sessione dipendente')
    const page = await asEmployee('Di Monda')
    const card = await apriBoard(page)
    const atteso = raggioAtteso(testInfo.project.name)
    await expect(card).toHaveCSS('border-radius', atteso)
    await expect(card).toHaveCSS('box-shadow', ombraAttesa(testInfo.project.name))
  })

  test('installa: il pulsante nativo compare solo dove beforeinstallprompt esiste', async ({ page }, testInfo) => {
    await page.goto(`${E2E_BASE_URL}/installa`)

    const button = page.getByRole('button', { name: /Installa ora/i })
    if (testInfo.project.name === 'ios') {
      // WebKit non espone l'evento: il pulsante non deve ESISTERE nel DOM. Se
      // qualcuno aggiunge un fallback finto, questo test lo becca.
      await page.waitForTimeout(600) // tempo di eventuali redirect del guard
      await expect(button).toHaveCount(0)
      await expect(page.getByText('Safari su iPhone/iPad')).toBeVisible()
    } else {
      // Chromium: l'evento potrebbe non arrivare (headless, già in standalone),
      // quindi l'attesa è DI NON SUONARE, non di apparire: se compare, deve
      // essere un pulsante vero; se non compare, le istruzioni devono esserci.
      await page.waitForTimeout(600)
      const count = await button.count()
      if (count > 0) {
        await expect(button).toBeVisible()
        // Nessuna finestra nativa inattesa: il click usa l'API di sistema solo
        // se prompt() esiste davvero (qui non si clicca: la UI nativa in test
        // non è verificabile e il gesto appartiene all'utente).
      }
      await expect(page.getByText('Chrome su Android')).toBeVisible()
    }
  })
})
