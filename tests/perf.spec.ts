import { test, expect, findEmployee } from './fixtures'
import { openBoard } from './sala-board'
import { giorniGialli } from './sala-gialli'

/**
 * GUARDIA DI VELOCITÀ (17/09/2026).
 *
 * `openBoard` è il mattone di quasi ogni test di /turnisala e fino al 17/09
 * costava **8,0 s** di attese FISSE (400 + 1300 + 800 ms + il sondaggio del
 * changelog): la suite intera se ne andava in 6-8 minuti. Dopo la cura (attese
 * diventate condizioni, popup spenti dal contesto, vedi `tests/browser-setup.ts`)
 * una navigazione misura **~1,5 s**.
 *
 * Il valore torna su da solo se qualcuno rimette un'attesa fissa o un popup che
 * copre la pagina, e non te ne accorgi finché la suite non è di nuovo lenta:
 * questa guardia lo dice subito. SOGLIA SCELTA: 3,5 s — 2,3 volte il misurato, così
 * non fa rumore su una macchina lenta ma non lascia passare un `waitForTimeout`
 * da 1-2 s rimesso dentro. Se il tuo dev server è molto più lento, alza
 * `SOGLIA_MS` (e dillo nel commit: è l'unico numero che cambia).
 *
 * Non gira con gli altri: sta nel progetto `perf` (playwright.config.ts), seriale
 * e DOPO il resto — quattro worker che compilano e navigano insieme sporcherebbero
 * la misura. Come la sonda che l'ha motivata, misura UNA sola cosa: il tempo di
 * `openBoard` su un giorno giallo di settembre.
 */
const SOGLIA_MS = 3_500

test.setTimeout(120_000)

test('una navigazione della board resta sotto la soglia', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const gialli = await giorniGialli('2026-09')
  const giorno = gialli[0]?.day ?? 23
  const page = await asEmployee('Di Monda')
  await page.setViewportSize({ width: 1280, height: 900 })

  // Riscaldamento, non misurato: la prima navigazione paga la compilazione del
  // modulo da parte del dev server e la prima sessione, non le attese dell'helper.
  expect(await openBoard(page, { month: 9, day: giorno, shift: 'M' }), 'board non aperta').toBe(true)

  const tempi: number[] = []
  for (const turno of ['M', 'P', 'N'] as const) {
    const inizio = Date.now()
    expect(await openBoard(page, { month: 9, day: giorno, shift: turno }), 'board non aperta').toBe(true)
    tempi.push(Date.now() - inizio)
  }
  // MEDIANA, non media: un singolo picco di rete non deve far fallire la guardia.
  const mediana = [...tempi].sort((a, b) => a - b)[1]
  console.log(
    `[perf] openBoard ${giorno}/9: ${tempi.map(t => `${t} ms`).join(', ')} · mediana ${mediana} ms (soglia ${SOGLIA_MS} ms)`,
  )

  expect(
    mediana,
    `una navigazione di openBoard è tornata a ${mediana} ms (soglia ${SOGLIA_MS} ms). ` +
      'Quasi sempre è un\'attesa FISSA rimessa in openBoard: cerca `waitForTimeout` in ' +
      'tests/sala-board.ts (giorno, turno, mese/anno) e nei suoi helper. Se invece il ' +
      'tempo è cresciuto su TUTTE le prove, guarda se è tornato un popup che copre la ' +
      'pagina (tests/browser-setup.ts) o se il dev server è in difficoltà.',
  ).toBeLessThan(SOGLIA_MS)
})
