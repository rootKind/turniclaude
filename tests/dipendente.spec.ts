import { test, expect, employeeLoginEnabled, findEmployee } from './fixtures'
import { openBoard, boardCards, cardByTitle } from './sala-board'

/**
 * E2E «come la vedrebbe quella persona» su /turnisala.
 *
 * L'evidenzia della card (`desk-card-highlight`) nasce dai COGNOMI della card,
 * ricostruiti dai codici REALI: un dipendente con turno GIALLO da richiedente
 * (reale di assenza/corso: A, SpCA…) non è più in quell'elenco, pur restando
 * sulla card con la chip → senza i nomi gialli la sua card NON si evidenziava
 * (caso BARRA del 24/09/2026). Qui si verifica sul campo, con le sessioni vere.
 *
 * Richiede la service-role in `.env.local` (i test si saltano senza) e il dev
 * server su `E2E_BASE_URL` (default http://localhost:3000).
 */
test.describe('turnisala: card del dipendente evidenziata col turno giallo', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')

  // La board è uno schema a 3 colonne: a 320px (viewport degli altri test) il
  // dialog del calendario copre tutto lo schermo e non resta backdrop da
  // cliccare per chiuderlo. Qui conta il dato, non il layout mobile.
  test.use({ viewport: { width: 1280, height: 800 } })

  const CASI = [
    { who: 'Barra', chi: 'BARRA (giallo RICHIEDENTE, reale A)', day: 24, shift: 'M' as const, card: 'DCCM', chip: 'BarraA' },
    { who: 'Di Meo', chi: 'DI MEO (giallo SOSTITUTO, reale MDCP)', day: 24, shift: 'M' as const, card: 'DCP', chip: 'Di Meo' },
  ]

  for (const caso of CASI) {
    test(`${caso.chi} → evidenzia ${caso.card} il ${caso.day}/9 turno ${caso.shift}`, async ({ asEmployee }) => {
      test.skip(!(await findEmployee(caso.who)), `dipendente «${caso.who}» non presente in anagrafica`)

      const page = await asEmployee(caso.who)
      expect(await openBoard(page, { month: 9, day: caso.day, shift: caso.shift })).toBe(true)

      const cards = await boardCards(page)
      const card = cardByTitle(cards, caso.card)
      expect(card, `card ${caso.card} assente dalla board`).toBeTruthy()
      expect(card!.highlighted, `la card ${caso.card} deve evidenziare ${caso.who}`).toBe(true)
      expect(card!.chips, `la chip del turno deve stare su ${caso.card}`).toContain(caso.chip)

      // Nessuna ALTRA card evidenziata: l'evidenzia è della persona, non della board.
      expect(cards.filter(c => c.highlighted).map(c => c.title)).toEqual([caso.card])
    })
  }

  test('controllo negativo: stesso dipendente su un turno senza la sua chip', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Barra')), 'dipendente «Barra» non presente in anagrafica')

    const page = await asEmployee('Barra')
    // Il 24/09 la sua chip è sul turno M: sul turno P non deve evidenziare nulla
    // (lì c'è solo la card scoperta della DCIF, che non è sua).
    expect(await openBoard(page, { month: 9, day: 24, shift: 'P' })).toBe(true)

    const cards = await boardCards(page)
    expect(cards.filter(c => c.highlighted)).toEqual([])
    expect(cardByTitle(cards, 'DCIF')?.chips).toContain('— scoperto')
  })
})
