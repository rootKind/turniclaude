import { test, expect, findEmployee, E2E_BASE_URL } from './fixtures'
import { APP_VERSION, commitBreve, dataItaliana, versioneTesto } from '../lib/app-version'

/**
 * LA RIGA DI VERSIONE IN IMPOSTAZIONI (richiesta 18/09/2026).
 *
 * Prima era «v1.226 · 6eb0c28 — ultimo aggiornamento: 26/08/2026 13:10», scritta a
 * mano: il commit e la data restavano quelli dell'ultima volta che qualcuno si era
 * ricordato di aggiornarli. Ora è `V5 · <commit> · ultimo aggiornamento: <data e
 * ora>`, con commit e momento della BUILD (next.config.ts li cotti nelle env).
 *
 * Qui si prova la FORMATTAZIONE (pura, millisecondi, sempre eseguita) e la riga
 * vera sulla pagina. Il caso che conta davvero è il fuso: il deploy arriva in
 * ISO/UTC, la riga deve dire l'ora di Roma — con l'ora legale (UTC+2) e con
 * quella solare (UTC+1), altrimenti d'inverno sarebbe sbagliata di un'ora.
 */

test('la riga di versione: commit breve, ora di Roma, e fallback se manca la build', () => {
  // Ora di Roma = UTC+2 d'estate, UTC+1 d'inverno: sono due test, e il secondo è
  // quello che scopre una conversione scritta a mano invece che col fuso.
  expect(dataItaliana('2026-09-18T12:30:00.000Z', 'x')).toBe('18/09/2026 14:30')
  expect(dataItaliana('2026-01-15T23:30:00.000Z', 'x')).toBe('16/01/2026 00:30')  // scavalca la mezzanotte
  expect(dataItaliana('', 'fallback')).toBe('fallback')
  expect(dataItaliana(undefined, 'fallback')).toBe('fallback')
  expect(dataItaliana('non-una-data', 'fallback')).toBe('fallback')

  expect(commitBreve('a1b2c3d4e5f6', 'x')).toBe('a1b2c3d')
  expect(commitBreve('', 'x')).toBe('x')
  expect(commitBreve(undefined, 'x')).toBe('x')

  // La riga intera, come la legge l'utente.
  expect(versioneTesto()).toMatch(/^V5 · [0-9a-f]{7} · ultimo aggiornamento: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  expect(versioneTesto().startsWith(`${APP_VERSION} · `)).toBe(true)
})

test('in Impostazioni la riga di versione si legge (e non è più «v1.226»)', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Minino')), 'serve un utente in anagrafica (service-role in .env.local)')
  const page = await asEmployee('Minino')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${E2E_BASE_URL}/impostazioni?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  const riga = page.getByText(/^V5 · /)
  await expect(riga, 'la riga di versione non è a schermo').toBeVisible()
  await expect(riga).toHaveText(/^V5 · [0-9a-f]{7} · ultimo aggiornamento: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  // La vecchia riga scritta a mano non deve restare da nessuna parte.
  await expect(page.getByText(/v1\.226/)).toHaveCount(0)
})
