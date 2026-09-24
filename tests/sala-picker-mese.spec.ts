import { test, expect, findEmployee } from './fixtures'
import { openBoard } from './sala-board'

/**
 * LA TENDINA MESE DEL PICKER SEGUE IL MESE SFOGLIATO (fix 24/09/2026).
 *
 * Nel picker della data di /turnisala la tendina «Scegli mese» scriveva il suo
 * value dal MESE DELLA BOARD (`currentMonth`) invece che dal mese sfogliato
 * (`pickerMonth`): aprendo il picker da settembre e scegliendo «Ottobre», la
 * griglia sotto passava davvero a ottobre (i giorni cliccati portavano al mese
 * giusto) ma la tendina rispronava «Settembre» — e i mesi NON si vedevano mai
 * cambiare, finché non si sceglieva un giorno.
 *
 * La prova: aprire il picker, scegliere ottobre dalla tendina e ASSERT che la
 * tendina STESSA resta su ottobre; poi cliccare un giorno di ottobre e
 * verificare che la board e la riapertura del picker sono coerenti.
 */
test('la tendina mese del picker segue il mese sfogliato', async ({ asEmployee }) => {
  test.setTimeout(120_000)
  // Sessione FRESCA via service-role (come chip-gialle/dipendente): il
  // storageState di tests/.auth-state.json invecchia al primo refresh del
  // token e manda in skip la board senza motivo.
  test.skip(!(await findEmployee('Di Monda')), 'serve la service-role in .env.local')
  const page = await asEmployee('Di Monda')
  if (!(await openBoard(page, { month: 9, day: 15 }))) test.skip(true, 'board non disponibile (nessuna sessione)')

  // Apri il picker e sfoglia fino a ottobre (SOLO la tendina: nessun click sui giorni).
  const trigger = page.locator('button:has(svg.lucide-chevron-down)').first()
  await trigger.click()
  const selMese = page.locator('select[aria-label="Scegli mese"]')
  await selMese.waitFor({ state: 'visible' })
  await selMese.selectOption('9')   // ottobre (indice 0-based)

  // FIX: la tendina mostra il mese SFogliato, non più quello della board.
  await expect(selMese).toHaveValue('9')

  // La griglia è su ottobre: il 15 ottobre è visibile e cliccabile (mese teorico,
  // nessun giorno disabilitato).
  const giorno = page.locator('.cal-panel button[aria-label*=" 15 ottobre 2026"]').first()
  await expect(giorno).toBeVisible()
  await giorno.click()

  // La board è passata a ottobre (il trigger mostra il mese nuovo;
  // «uppercase» è CSS: il testo DOM resta «Ottobre»).
  await expect(trigger).toContainText(/ott/i)

  // Riapertura: il calendario riparte dal mese della board (ottobre).
  await trigger.click()
  await expect(page.locator('select[aria-label="Scegli mese"]')).toHaveValue('9')
})
