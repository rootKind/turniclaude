import { test, expect, employeeLoginEnabled } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * I TEST VISIVI (consegna del confronto master→dev, 24/09/2026).
 *
 * Le regressioni di pagina che il confronto manuale ha catturato una volta
 * (offline-bar troncata, aree di tocco) devono d'ora in poi FALLIRE QUI.
 * La scelta degli scenari segue l'harness della Fase 1: le pagine con un
 * disegno proprio, su ENTRAMBE le skin (progetti `ios` e `android`) e in
 * ENTRAMBI i temi: il nome della base porta la piattaforma (il progetto la
 * scrive in `snapshot pathTemplate`) e il tema sta nel nome del file.
 *
 * COME SI RIGENERANO LE BASI: `npx playwright test tests/visivi.spec.ts
 * --update-snapshots` col dev server acceso; si committano. Dopo, ogni
 * differenza oltre la soglia fa fallire la prova.
 *
 * LE MASCHERE. Le pagine mostrano dati veri (turni, nomi, contatori) che
 * cambiano ogni giorno: senza maschere le basi sarebbero stantie da domani.
 * Si copre il contenuto, si guarda il GUSCIO: barre, testate, card, sheet —
 * che è ciò che il design system disegna.
 *
 * PERCHÉ QUESTE MISURE. Sono quelle dell'harness (il telefono è il telefono)
 * ma con `deviceScaleFactor: 1`: basi leggere e niente antialiasing di scala
 * nel confronto. Le soglie lasciano fuori l'antialiasing dei font, non un
 * layout che si sposta.
 */

const DEV = 'dev=rootkind-dev-2026'
const TEMI = [
  { id: 'chiaro', ls: 'light' },
  { id: 'scuro', ls: 'dark' },
] as const

/** La pagina pronta: dev server a caldo (reload), skin dal server, tema fisso. */
async function pagina(page: Page, path: string, tema: string) {
  await page.addInitScript(`try { localStorage.setItem('ui-theme', '${tema}') } catch {}`)
  await page.goto(`http://localhost:3000${path}?${DEV}`, { waitUntil: 'load', timeout: 45_000 })
  await page.waitForTimeout(1_200)
  await page.reload({ waitUntil: 'load' }).catch(() => {})
  await page.waitForTimeout(1_000)
  await page.waitForFunction(() => !!document.documentElement.dataset.platform, null, { timeout: 10_000 })
  // Il reload può ripristinare uno scroll leggermente diverso: la base è la
  // pagina DALL'INIZIO, e il confronto non deve giudicare la barra compatta.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
}

async function maschera(page: Page, selettori: string[]) {
  // Niente locator.mask() (non esiste nella versione del progetto): una volta
  // pronta la pagina si copre il contenuto con un <style> che rende opachi e
  // neri i testi dinamici — il guscio (barre, card, raggi, colori) resta.
  await page.addStyleTag({ content: selettori.map(s => `${s}{visibility:hidden !important}`).join('\n') })
}

for (const { id: nomeTema, ls } of TEMI) {
  test.describe(`aspetto visivo, tema ${nomeTema}`, () => {
    test.skip(() => process.env.CI === 'true' && !process.env.SUPABASE_SERVICE_ROLE_KEY, 'in CI servono le credenziali di servizio')

    test('dashboard: il guscio della pagina (solo testata: l\'elenco è dati)', async ({ asEmployee }, testInfo) => {
      test.skip(!employeeLoginEnabled(), 'service-role in .env.local assente')
      const page = await asEmployee('Minino')
      await pagina(page, '/dashboard', ls)
      // L'elenco dei turni è DATO: cambia ogni giorno e col numero di righe
      // cambia l'altezza della pagina — una base così sarebbe stantia da domani.
      // Il guscio che il design system disegna sta in testa: testata, pill
      // DCO/Noni, selettore admin. Quello si fotografа, e si fotografa bene.
      await expect(page).toHaveScreenshot(`dashboard-${testInfo.project.name}-${nomeTema}.png`, {
        maxDiffPixelRatio: 0.02,
        clip: { x: 0, y: 0, width: 393, height: 140 },
      })
    })

    test('impostazioni: la pagina dei controlli', async ({ asEmployee }, testInfo) => {
      test.skip(!employeeLoginEnabled(), 'service-role in .env.local assente')
      const page = await asEmployee('Minino')
      await pagina(page, '/impostazioni', ls)
      await expect(page).toHaveScreenshot(`impostazioni-${testInfo.project.name}-${nomeTema}.png`, { maxDiffPixelRatio: 0.02 })
    })

    test('notifiche: la bacheca con una voce di prova', async ({ asEmployee }, testInfo) => {
      test.skip(!employeeLoginEnabled(), 'service-role in .env.local assente')
      const page = await asEmployee('Minino')
      await page.addInitScript(() => {
        localStorage.setItem('notification-history', JSON.stringify([
          { id: 'v1', title: 'Prova', body: 'Corpo di prova della notifica.', timestamp: 1_700_000_000_000, read: false, type: 'info' },
        ]))
      })
      await pagina(page, '/notifiche', ls)
      await maschera(page, ['[data-notif-sezione]'])
      await expect(page).toHaveScreenshot(`notifiche-${testInfo.project.name}-${nomeTema}.png`, { maxDiffPixelRatio: 0.02 })
    })

    test('sheet delle azioni aperta (da /turnisala)', async ({ asEmployee }, testInfo) => {
      test.skip(!employeeLoginEnabled(), 'service-role in .env.local assente')
      const page = await asEmployee('Minino')
      await pagina(page, '/turnisala', ls)
      await page.locator('[aria-label^="Azioni"]').first().click()
      await page.waitForTimeout(800)
      await expect(page).toHaveScreenshot(`sheet-azioni-${testInfo.project.name}-${nomeTema}.png`, { maxDiffPixelRatio: 0.02 })
    })

    test('offline: il banner di stato (viewport)', async ({ asEmployee }, testInfo) => {
      test.skip(!employeeLoginEnabled(), 'service-role in .env.local assente')
      const page = await asEmployee('Minino')
      await pagina(page, '/dashboard', ls)
      await page.context().setOffline(true)
      await page.waitForTimeout(2_000)
      await expect(page).toHaveScreenshot(`offline-${testInfo.project.name}-${nomeTema}.png`, { maxDiffPixelRatio: 0.02 })
      await page.context().setOffline(false)
    })
  })
}
