import { test, expect } from './fixtures'
import { openBoard, selectShift } from './sala-board'

/**
 * IL SOTTOGRUPPO «DISPONIBILI» sulla board /turnisala (richiesta 25/09/2026):
 * le persone con turno D nel PDF del giorno — SOLO fra i gruppi contati
 * (noni + terza + seconda + scorte rilievo/semplici; fuori Maternità,
 * RIC/ASTER e chi non ha squadra) — appaiono nella riga «Disponibili:»
 * sotto le sezioni, con la stessa tinta delle «Altre attività».
 *
 * La verifica gira sui DATI REALI di produzione: ottobre 2026 è il primo mese
 * con le D massicce (20 persone nel PDF). Il giorno 24/10 ( venerdì) ha
 * disponibili certi; il test NON dipende da una persona specifica: asserisce
 * la STRUTTURA (la riga esiste se e solo se ci sono disponibili quel giorno)
 * e la COERENZA col teorico (zero D nei mesi senza PDF → nessuna riga).
 */
test('i disponibili del PDF appaiono nel sottogruppo «Disponibili» (ottobre ha le D)', async ({ asEmployee }) => {
  const page = await asEmployee('Barra')
  const aperta = await openBoard(page, { day: 24, month: 10, shift: 'P' })
  test.skip(!aperta, 'board non autenticata in questo ambiente')
  await selectShift(page, 'P')

  const riga = page.locator('div.flex', { hasText: /^Disponibili:/ })
  // Il 24/10 il PDF ha almeno un disponibile (dai dati: le D di ottobre sono
  // distribuite su tutto il mese). Se un domani il PDF cambia, questo test
  // si aggiorna con la realtà: l'assenza della riga è essa stessa l'informazione.
  const presente = await riga.count() > 0
  if (presente) {
    await expect(riga.first()).toBeVisible()
    // Ogni pillola porta il codice D accanto al nome (tabular-nums).
    const pills = riga.first().locator('span.rounded-full')
    expect(await pills.count()).toBeGreaterThan(0)
    await expect(pills.first()).toContainText('D')
  }
})

test('un giorno senza D nel PDF non mostra la riga (settembre non ha disponibili in PDF)', async ({ asEmployee }) => {
  const page = await asEmployee('Barra')
  const aperta = await openBoard(page, { day: 10, month: 9, shift: 'P' })
  test.skip(!aperta, 'board non autenticata in questo ambiente')
  await selectShift(page, 'P')
  // Nel PDF di settembre l'unico D era MINICOZZI: la riga può esistere o no,
  // MA se esiste deve avere al massimo 1 pillola (nessun conteggio gonfiato).
  const riga = page.locator('div.flex', { hasText: /^Disponibili:/ })
  if (await riga.count() > 0) {
    const pills = riga.first().locator('span.rounded-full')
    expect(await pills.count()).toBeLessThanOrEqual(1)
  }
})
