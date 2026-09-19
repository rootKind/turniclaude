import { test, expect, findEmployee } from './fixtures'
import { E2E_BASE_URL } from './employee-session'
import { VACATION_PERIOD_LABELS, getVacationPeriodForYear } from '../lib/vacations'
import type { VacationPeriod } from '../types/database'

/**
 * L'ANNO A SCHERMO NON EREDITA GLI OVERRIDE DI UN ALTRO ANNO (bug 25/09/2026).
 *
 * Segnalazione: «se da admin si imposta primo anno turniferie 2027 e si va nella
 * pagina 2027, aggiornando più volte la pagina alcune persone cambiano periodo di
 * ferie».
 *
 * La pagina chiedeva gli override DUE volte per ogni apertura: all'apertura
 * `selectedYear` è l'anno corrente (2026) e la richiesta parte, poi
 * `min_year_turniferie` risolve a 2027 e l'anno cambia → seconda richiesta. Le
 * due risposte arrivavano in ordine IMPREVEDIBILE e nessuna delle due si
 * arrendeva: quando vinceva la 2026 la pagina 2027 mostrava i SUOI override (per
 * gli interessati il periodo dell'anno sbagliato, diverso a ogni aggiornamento).
 * Qui la corsa è forzata: la risposta del 2026 arriva 2 s DOPO quella del 2027.
 *
 * Il banco è tutto finto (nessun dato del DB entra nel giudizio): liste e
 * override sono intercettati a livello di rete, così la spec non dipende da chi
 * ha quale periodo — l'unica cosa che conta è QUALE delle due risposte vince.
 * `ZZPROVA` è in entrambe le liste (is_secondary true e false) per non dover
 * sapere quale categoria mostra l'utente di test.
 */
test('la pagina di un anno non mostra i periodi di un altro anno', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const page = await asEmployee('Di Monda')
  const ANNO = 2027
  const ANNO_VECCHIO = 2026
  // La rotazione la decide la lib vera: il periodo «giusto» del 2027 e due
  // periodi diversi da usare come override (uno per il 2027, uno per il 2026).
  const ROTAZIONE = getVacationPeriodForYear(1, ANNO)
  const OVERRIDE_2027: VacationPeriod = ROTAZIONE === 5 ? 4 : 5
  const OVERRIDE_2026 = ([1, 2, 3, 4, 5, 6] as VacationPeriod[]).find(
    p => p !== OVERRIDE_2027 && p !== ROTAZIONE,
  )!

  const persona = { id: 'zz-prova', nome: 'Zeta', cognome: 'ZZPROVA', is_secondary: false }
  const assegnazione = (isSecondary: boolean) => ({
    user_id: 'zz-prova', base_period: 1, created_at: '2026-01-01',
    user: { ...persona, is_secondary: isSecondary },
  })

  await page.route('**/rest/v1/app_settings**', route =>
    route.fulfill({ json: { min_year_turniferie: ANNO, min_year_vacanze: ANNO } }),
  )
  await page.route('**/rest/v1/vacation_assignments**', route =>
    route.fulfill({ json: [assegnazione(false), assegnazione(true)] }),
  )
  await page.route('**/rest/v1/vacation_year_overrides**', async route => {
    const url = new URL(route.request().url())
    const anno = Number((url.searchParams.get('year') ?? '').replace('eq.', ''))
    if (anno === ANNO_VECCHIO) {
      // La risposta VECCHIA è lenta: con le due richieste in corsa diventa lei a
      // chiudere per ultima (è la condizione della segnalazione).
      await new Promise(r => setTimeout(r, 2000))
      return route.fulfill({ json: [{ user_id: 'zz-prova', period: OVERRIDE_2026 }] })
    }
    return route.fulfill({ json: [{ user_id: 'zz-prova', period: OVERRIDE_2027 }] })
  })

  // `?dev=…` è il bypass del gate «installa l'app» (components/providers/pwa-guard).
  await page.goto(`${E2E_BASE_URL}/turniferie?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })

  /** La card di un periodo (dal suo titolo), letta come testo. */
  const card = (periodo: VacationPeriod) =>
    page
      .locator('div.rounded-xl.border.bg-card')
      .filter({ has: page.locator('span', { hasText: new RegExp(`^${VACATION_PERIOD_LABELS[periodo].label}$`) }) })
      .first()

  // 1. Il periodo dell'anno a schermo è quello dell'override del 2027.
  await expect(
    card(OVERRIDE_2027),
    `ZZPROVA non è nel periodo ${OVERRIDE_2027}: la pagina non ha applicato l'override dell'anno`,
  ).toContainText('ZZPROVA', { timeout: 20_000 })

  // 2. E aspetta che la risposta VECCHIA sia arrivata: non deve spostare niente.
  await page.waitForTimeout(3000)
  expect(
    await page.locator('div.rounded-xl.border.bg-card').filter({ hasText: 'ZZPROVA' }).count(),
    'ZZPROVA compare in più di un periodo',
  ).toBe(1)
  await expect(card(OVERRIDE_2026), 'la pagina 2027 sta mostrando gli override del 2026').not.toContainText('ZZPROVA')
  await expect(card(ROTAZIONE), 'la pagina 2027 è tornata alla rotazione senza override').not.toContainText('ZZPROVA')

  // 3. E l'aggiornamento della pagina non cambia niente (era il sintomo: la
  //    stessa pagina, aggiornata, mostrava persone in periodi diversi).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await expect(card(OVERRIDE_2027), 'dopo l\'aggiornamento il periodo è cambiato').toContainText('ZZPROVA')
  await expect(card(OVERRIDE_2026)).not.toContainText('ZZPROVA')
})
