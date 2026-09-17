import { test, expect, findEmployee } from './fixtures'
import { LARGHEZZE, cellCodes, openCalendar } from './tuoturno'
import { riposa } from './sala-board'

/**
 * CODICI LUNGHI nel calendario di /tuoturno (richiesta 15/09/2026).
 *
 * La griglia dei giorni è a 7 colonne FISSE dentro `max-w-lg`: la cella misura
 * 65px su desktop e 37px a 320px, mentre i codici reali del PDF arrivano a 6-7
 * caratteri («MM3M40», «NDisSal», «MDCCM»). A 14px «MM3M40» misura 67px: non è
 * mai entrato e finiva con l'ellipsis — anche a schermo intero.
 *
 * Qui si difende il comportamento nuovo: a OGNI larghezza nessun codice è
 * tagliato; i più lunghi si rimpiccioliscono (fino a 8px) e, sotto i 345px di
 * schermo, vanno a capo dentro la stessa card da 76px.
 */
const PERSONE = ['Di Monda', 'Smeragliuolo']

for (const chi of PERSONE) {
  test(`codici lunghi nella cella — ${chi}`, async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente per entrare (service-role in .env.local)')
    const page = await asEmployee('Di Monda')
    await openCalendar(page, chi, { year: 2026, month: 9 })

    const visti = new Map<string, number>()
    for (const w of LARGHEZZE) {
      await page.setViewportSize({ width: w, height: 900 })
      // La griglia è a container query: le misure cambiano al resize, quindi si
      // aspetta che il layout sia ridisegnato (due frame) e non 220 ms fissi.
      await riposa(page)
      const codici = await cellCodes(page)
      const tagliati = codici.filter(c => c.clipped)
      const lunghi = codici.filter(c => c.label.length >= 5)
      for (const c of lunghi) visti.set(c.label, Math.max(visti.get(c.label) ?? 0, c.font))

      expect(
        tagliati.map(c => `«${c.label}» (cella ${c.cellW}px, ${c.font}px)`),
        `a ${w}px di schermo nessun codice deve essere tagliato`,
      ).toEqual([])

      // Leggibilità: un codice o sta a ≥8px, o è andato a capo (sotto i 345px).
      for (const c of lunghi) {
        expect(c.font >= 8 || c.lines >= 2, `«${c.label}» a ${w}px: ${c.font}px su ${c.lines} riga/righe`).toBe(true)
      }
    }

    // La prova non deve passare a vuoto: settembre 2026 ha i codici lunghi.
    expect([...visti.keys()], `nessun codice lungo nel mese per ${chi}`).not.toHaveLength(0)
    console.log(`${chi}: codici lunghi visti — ${[...visti].map(([t, f]) => `«${t}» fino a ${f}px`).join(', ')}`)
  })
}
