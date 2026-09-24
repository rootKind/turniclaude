import { test, expect, employeeLoginEnabled, findEmployee } from './fixtures'
import { openBoard, openSalaAdminFab } from './sala-board'

/**
 * MINIMI PER CARD — SOLO LETTURA (26/09/2026).
 *
 * Due prove del pannello «Minimi per card» che non SCRIVONO niente (aprono,
 * leggono i valori precompilati dalla piantina, misurano, annullano). Stavano
 * nella coda seriale di `minimi.spec.ts`, che invece è seriale perché ha test
 * che scrivono la piantina in modo GLOBALE (playwright.config.ts): un test di
 * sola lettura pagava quel biglietto senza averne bisogno. Ora girano qui, in
 * parallelo con la suite — e il progetto `minimi` (i writer) dipende da questo,
 * così la precondizione «piantina com'è» dei test che la leggono regge: qui
 * finisce prima che un writer abbia toccato qualcosa.
 *
 * L'utente autenticato è l'ADMIN vero (Minino Davide — è la sua anagrafica a
 * portare l'uuid di ADMIN_ID): il pannello è riservato a lui.
 */
test.describe('minimi per card: sola lettura', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')

  // La board è uno schema a 3 colonne: come in minimi.spec.ts, a 320px il
  // pannello del calendario copre lo schermo e non resta backdrop da cliccare.
  test.use({ viewport: { width: 1280, height: 900 } })

  test('il mini-Fab admin apre il pannello, precompilato dalla piantina', async ({ asEmployee }) => {
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    expect(await openBoard(page, { month: 9, day: 6, shift: 'P' })).toBe(true)

    await openSalaAdminFab(page)
    const apri = page.getByLabel('Minimi di persone per card')
    await expect(apri, 'il mini-Fab «Minimi per card» deve essere nel menu admin').toBeVisible()
    await apri.click()

    await expect(page.getByRole('heading', { name: 'Minimi per card' })).toBeVisible()
    // M/P dalla piantina: la 6° è doppia → 2, l'8° è singola → 1. Di notte vale
    // la tabella: l'8° a 0, il 4° a 1, la DCIF a 0.
    await expect(page.getByLabel('DCO 6° turno P')).toHaveValue('2')
    await expect(page.getByLabel('DCO  8° turno M')).toHaveValue('1')
    await expect(page.getByLabel('DCO  8° turno N')).toHaveValue('0')
    await expect(page.getByLabel('DCO 4° turno N')).toHaveValue('1')
    await expect(page.getByLabel('DCIF turno N')).toHaveValue('0')
    await expect(page.getByLabel('DCO 4° turno P')).toHaveValue('2')
    // La data di efficacia è compilata (oggi) e modificabile.
    await expect(page.getByLabel('Valido dal')).not.toHaveValue('')

    await page.getByRole('button', { name: 'Annulla' }).click()
    await expect(page.getByRole('heading', { name: 'Minimi per card' })).toHaveCount(0)
  })

  // Il pannello ha 13 righe × 3 caselle: su un telefono deve restare usabile e
  // non deve spingere la pagina in orizzontale. Qui non si apre il calendario
  // (a 320px il suo pannello copre lo schermo), quindi si resta sul giorno
  // corrente: basta il Fab e il pannello.
  test('il pannello non sborda su uno schermo da 320px', async ({ asEmployee }) => {
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.setViewportSize({ width: 320, height: 640 })
    // Senza `day` si resta sul giorno corrente: qui non serve navigare.
    expect(await openBoard(page, { month: 9 }), 'board non aperta').toBe(true)

    await openSalaAdminFab(page)
    await page.getByLabel('Minimi di persone per card').click()
    await expect(page.getByRole('heading', { name: 'Minimi per card' })).toBeVisible()

    const misure = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      view: document.documentElement.clientWidth,
      caselle: document.querySelectorAll('input[type="number"]').length,
    }))
    expect(misure.caselle, '13 card × 3 turni').toBe(39)
    expect(misure.doc, 'il pannello non deve allargare la pagina').toBeLessThanOrEqual(misure.view + 1)

    await page.getByRole('button', { name: 'Annulla' }).click()
  })
})
