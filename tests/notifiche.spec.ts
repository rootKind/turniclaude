import { test, expect, E2E_BASE_URL, employeeLoginEnabled, findEmployee } from './fixtures'

/**
 * PANNELLO NOTIFICHE (16/09/2026): il pannello admin deve mostrare TUTTI i
 * messaggi push dell'app, compresi quelli delle ferie lato manager che prima
 * erano testo hardcoded nei route (invisibili da qui).
 *
 * Il test guarda le tre cose che il contratto del registry (`scripts/
 * check-notif-templates.mjs`) non può vedere perché non passa dal browser:
 *  1. l'intestazione conta i MESSAGGI (una voce per messaggio, non metà);
 *  2. i 5 messaggi ferie sono elencati con la loro etichetta;
 *  3. aprendone uno, l'editor mostra testo e variabili del registro, e
 *     l'anteprima coi valori d'esempio si legge come il messaggio vero.
 *
 * È in sola lettura: non salva override (che sarebbero globali).
 */
test.describe('pannello: messaggi push', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('elenca anche i messaggi ferie decisi dal manager', async ({ asEmployee }) => {
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/admin?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Debug notifiche').first().click()

    const intestazione = page.getByText(/messaggi push dell'app/)
    await expect(intestazione).toBeVisible()
    const testo = (await intestazione.textContent()) ?? ''
    // «21 messaggi push dell'app[ · 2 modificati]»: il conteggio è un intero
    // (era metà del numero di chiavi: un testo modificato dava «0.5 modificati»).
    expect(testo).toMatch(/^\d+ messaggi push dell'app( · \d+ modificat[oi])?$/)
    const quanti = Number(testo.match(/^(\d+) /)?.[1])
    expect(quanti, 'il registro ha i 5 messaggi ferie in più').toBeGreaterThanOrEqual(21)

    for (const label of [
      'Cambio ferie in attesa (scorte)',
      'Cambio ferie approvato → richiedente',
      'Cambio ferie approvato → vincitore',
      'Cambio ferie cancellato dal turnista',
      'Cambio ferie assegnato ad altri',
    ]) {
      await expect(page.getByText(label, { exact: true }).first(), label).toBeVisible()
    }

    // L'editor di uno di questi: titolo, variabili e anteprima col testo reale.
    await page.getByText('Cambio ferie in attesa (scorte)', { exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/^Titolo$/).first()).toBeVisible()
    // Le parentesi dell'anno sono NEL TESTO (17/09/2026): i route passano l'anno
    // nudo, così l'anteprima qui sotto è il messaggio vero, carattere per carattere.
    await expect(page.locator('textarea').first()).toHaveValue(
      /Il cambio \{periodo\} \(\{anno\}\) con \{cognome_attore\} non può essere ancora accettato perché ci sono scorte disponibili/,
    )
    // Vocabolario ferie nelle variabili suggerite: {periodo}/{anno}, non {turno}/{data}.
    await expect(dialog.getByRole('button', { name: '{periodo}' }).first()).toBeVisible()
    await expect(dialog.getByRole('button', { name: '{turno}' })).toHaveCount(0)
    // Anteprima coi valori d'esempio: frase leggibile, non «16–30 Giu2026».
    await expect(dialog.getByText(/^Il cambio 16–30 Giu \(2026\) con Bianchi non può essere ancora accettato/)).toBeVisible()
  })

  test('l\'anteprima dell\'interesse attribuisce i turni cercati al destinatario', async ({ asEmployee }) => {
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/admin?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Debug notifiche').first().click()

    await page.getByText('Interesse al tuo turno', { exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    // {turno_cercati} sono i turni che cerca la richiesta del DESTINATARIO (chi
    // prende il tuo turno te ne dà uno che avevi chiesto): un «cerca …» senza
    // soggetto si leggeva come se a cercare fosse l'interessato.
    await expect(dialog.getByText(/^Bianchi è interessato al tuo Mattina del 15\/05 \(tu cerchi Pomeriggio\/Notte\)$/)).toBeVisible()
    await expect(dialog.getByText(/\(cerca /)).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: '{turno_cercati}' }).first()).toBeVisible()
  })
})
