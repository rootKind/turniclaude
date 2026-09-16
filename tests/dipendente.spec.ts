import { test, expect, employeeLoginEnabled, findEmployee } from './fixtures'
import { openBoard, boardCards, boldTexts, ownPills } from './sala-board'
import { giorniSuCard, giorniGialli } from './sala-gialli'

/**
 * E2E «come la vedrebbe quella persona» su /turnisala (richiesta 27/09/2026).
 *
 * L'evidenzia della card (`desk-card-highlight`) deve seguire ciò che la card
 * MOSTRA: se una persona c'è (nel suo elenco o in una chip gialla) la sua card si
 * accende, se non c'è resta spenta. Il caso che questa prova difende è quello
 * GIALLO DA RICHIEDENTE: il suo reale è un'assenza (A, SpCA…), quindi non è più
 * nell'elenco della sezione e la card non si evidenziava pur mostrandolo
 * (caso BARRA del 24/09/2026) — il fix passa alla board anche i nomi dei gialli.
 *
 * L'attesa è ricavata dal DOM, non da un caso scritto a mano: il PDF del mese
 * viene ricaricato spesso (l'utente lo aggiorna) e un test legato a «BARRA il
 * 24/9» diventa rosso al primo caricamento nuovo. Qui l'invariante è:
 *
 *     card evidenziate  ==  card che nominano la persona (elenco o chip)
 *
 * Richiede la service-role in `.env.local` (senza, i test si saltano) e il dev
 * server su `E2E_BASE_URL` (default http://localhost:3000).
 */
test.describe('turnisala: evidenzia della card del dipendente', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')

  // La board è uno schema a 3 colonne: a 320px (viewport degli altri test) il
  // dialog del calendario copre tutto lo schermo e non resta backdrop da
  // cliccare per chiuderlo. Qui conta il dato, non il layout mobile.
  test.use({ viewport: { width: 1280, height: 800 } })
  test.setTimeout(180_000)

  // Il giorno NON è scritto a mano (16/09/2026, sera): il PDF del mese si
  // ricarica e i candidati cambiano posto — quel giorno il 23/9 tutti e tre i
  // candidati erano nei Corsi (SPCA), fuori dalle card, e la prova passava a
  // vuoto. Qui si scelgono i giorni in cui la persona sta DAVVERO su una card
  // (turno di sezione o cella gialla, tests/sala-gialli.ts).
  const CANDIDATI = ['Smeragliuolo', 'Di Monda']
  const TURNI = ['M', 'P', 'N'] as const

  test('la card evidenziata è quella che mostra la persona (anche solo come chip gialla)', async ({ asEmployee }) => {
    let soloChip = 0
    let casiPositivi = 0

    for (const who of CANDIDATI) {
      const dip = await findEmployee(who)
      test.skip(!dip, `dipendente «${who}» non presente in anagrafica`)
      const cognome = (dip!.cognome ?? who).toUpperCase()
      const giorni = (await giorniSuCard('2026-09', [cognome])).get(cognome) ?? []
      test.skip(!giorni.length, `${who} non sta su nessuna card nel mese caricato`)
      const giorno = giorni[Math.floor(giorni.length / 2)]   // uno di mezzo, non di bordo
      const page = await asEmployee(who)

      for (const turno of TURNI) {
        expect(await openBoard(page, { month: 9, day: giorno, shift: turno }), 'board non aperta').toBe(true)
        const cards = await boardCards(page)

        const nominata = (t: string) => t.toUpperCase().includes(cognome)
        const attese = cards.filter(c => nominata(c.names) || c.chips.some(nominata)).map(c => c.title)
        const evidenziate = cards.filter(c => c.highlighted).map(c => c.title)

        expect(
          evidenziate,
          `${who} il ${giorno}/9 turno ${turno}: evidenziate ${evidenziate.join(', ') || '—'} ma la board la mostra su ${attese.join(', ') || '—'}`,
        ).toEqual(attese)

        // Il caso delicato: la persona c'è SOLO come chip gialla (reale di
        // assenza) e la card deve accendersi lo stesso.
        if (cards.some(c => c.chips.some(nominata) && !nominata(c.names))) {
          soloChip++
          expect(evidenziate, `${who} è sulla board solo come chip: la card deve evidenziare`).not.toHaveLength(0)
        }
        if (attese.length) casiPositivi++
      }
    }

    expect(casiPositivi, 'la prova passerebbe a vuoto: la board non mostra nessuno dei candidati').toBeGreaterThan(0)
    console.log(`casi con la persona solo come chip gialla: ${soloChip} · casi con la persona sulla board: ${casiPositivi}`)
  })

  test('controllo negativo: senza la persona sulla board non si evidenzia nulla', async ({ asEmployee }) => {
    // Chi non compare in nessuna card — chip comprese — non deve accendere
    // niente: l'evidenzia è della persona, non del turno aperto.
    const candidati = ['Barra', 'Di Meo', 'Caiazzo']
    for (const who of candidati) {
      const dip = await findEmployee(who)
      test.skip(!dip, `dipendente «${who}» non presente in anagrafica`)
      const cognome = (dip!.cognome ?? who).toUpperCase()
      const page = await asEmployee(who)
      expect(await openBoard(page, { month: 9, day: 23, shift: 'P' })).toBe(true)
      const cards = await boardCards(page)
      const nominata = (t: string) => t.toUpperCase().includes(cognome)
      if (cards.some(c => nominata(c.names) || c.chips.some(nominata))) continue   // c'è: caso positivo, non negativo
      expect(cards.filter(c => c.highlighted).map(c => c.title), `${who} non è sulla board: nessuna evidenzia`).toEqual([])
      const chipScoperto = cards.some(c => c.chips.some(t => t.includes('scoperto')))
      console.log(`${who}: non sulla board · nessuna evidenzia ✓${chipScoperto ? ' (la board ha card scoperte)' : ''}`)
      return
    }
  })
})

/**
 * IL NOME DELL'UTENTE LOGGATO SI RICONOSCE (richiesta 16/09/2026): in card il
 * suo cognome va in GRASSETTO (chip gialle comprese) e, quando compare nelle
 * «altre presenze», la pill prende il grassetto e il bordo spesso.
 *
 * La regola è la stessa dell'evidenzia: dove la board lo nomina, lì si vede.
 * L'attesa è ricavata dal DOM (nessun caso scritto a mano), così il test
 * sopravvive al ricaricamento del PDF.
 */
test.describe('turnisala: il mio nome si riconosce', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')
  test.use({ viewport: { width: 1280, height: 900 } })
  test.setTimeout(240_000)

  test('in card va in grassetto il mio cognome, non quello degli altri', async ({ asEmployee }) => {
    const dip = await findEmployee('Minino')
    test.skip(!dip, 'admin non in anagrafica')
    const mio = (dip!.cognome ?? 'Minino').toUpperCase()
    // Il giorno lo decide il DATO (vedi il describe sopra): deve essere uno in
    // cui Minino sta su una card, altrimenti la prova passerebbe a vuoto.
    const giorni = (await giorniSuCard('2026-09', [mio])).get(mio) ?? []
    test.skip(!giorni.length, `${mio} non sta su nessuna card nel mese caricato`)
    const giorno = giorni[Math.floor(giorni.length / 2)]
    const page = await asEmployee('Minino')

    // Il grassetto è MIO se porta il mio cognome oppure se sta dentro la mia
    // chip (dove va in grassetto anche la sigla: «MininoSPCA»).
    const eMio = (x: { text: string; chip: string | null }) =>
      x.text.toUpperCase().includes(mio) || (x.chip ?? '').toUpperCase().includes(mio)

    let casi = 0
    for (const turno of ['M', 'P', 'N'] as const) {
      expect(await openBoard(page, { month: 9, day: giorno, shift: turno }), 'board non aperta').toBe(true)
      const grassetti = await boldTexts(page)
      if (!grassetti.length) continue
      casi++
      expect(
        grassetti.filter(x => !eMio(x)).map(x => `${x.card}:${x.text}`),
        'nessun altro nome deve andare in grassetto',
      ).toEqual([])
    }
    expect(casi, `il ${giorno}/9 la board non nomina ${mio}: la prova passerebbe a vuoto`).toBeGreaterThan(0)
  })

  test('nelle «altre presenze» la mia pill ha grassetto e bordo spesso', async ({ asEmployee }) => {
    const dip = await findEmployee('Cosenza')
    test.skip(!dip, 'dipendente non in anagrafica')
    const mio = (dip!.cognome ?? 'Cosenza').toUpperCase()
    const page = await asEmployee('Cosenza')

    // Cosenza compare nei gruppi in più giorni (12, 13, 21…): si prende il primo
    // che ne ha uno, perché il PDF del mese può cambiare.
    let giorno: number | null = null
    for (const d of [12, 13, 21, 14, 16]) {
      if (!(await openBoard(page, { month: 9, day: d, shift: 'P' }))) continue
      if ((await ownPills(page)).length) { giorno = d; break }
    }
    expect(giorno, `nei gruppi di settembre non c'è nessuna pill di ${mio}: la prova va ripuntata su un altro mese`).not.toBeNull()

    const mie = await ownPills(page)
    for (const p of mie) {
      expect(p.text.toUpperCase(), 'la pill dell’utente loggato è la sua').toContain(mio)
      expect(p.weight, `«${p.text}»: testo in grassetto`).toBeGreaterThanOrEqual(700)
      // L'anello interno passa da 1px a 2px (inset 0 0 0 2px <colore>).
      expect(p.ring, `«${p.text}»: bordo spesso`).toMatch(/inset/)
      expect(p.ring, `«${p.text}»: bordo spesso`).toContain('2px')
    }

    // Controllo: nessun altro, nello stesso giorno, porta la pill dell'utente.
    const altro = await asEmployee('Di Monda')
    expect(await openBoard(altro, { month: 9, day: giorno!, shift: 'P' })).toBe(true)
    expect(await ownPills(altro), 'chi non è in quei gruppi non ha nessuna pill propria').toEqual([])
  })
})

/**
 * La segnalazione «— scoperto» porta il trattino DENTRO di sé, chip o testo che
 * sia (richiesta 27/09/2026 e 16/09/2026, sera).
 *
 * È un `describe` a sé perché il viewport si dichiara con `test.use`, che vale a
 * livello di file o di describe — dentro il corpo di un test Playwright lo
 * rifiuta (e la board, a 3 colonne, ha bisogno di desktop).
 */
test.describe('turnisala: il posto libero delle card scoperte', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')
  test.use({ viewport: { width: 1280, height: 800 } })

  test('sta dentro la chip (o la riga di testo)', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Smeragliuolo')), 'dipendente non in anagrafica')
    test.setTimeout(300_000)

    const page = await asEmployee('Smeragliuolo')
    // NIENTE giorno fisso: le scoperte cadono dove cadono le CELLE GIALLUE (il
    // sostituto lascia la card) o dove i minimi non sono coperti. Si prendono i
    // giorni gialli del mese corrente e del successivo, più ricchi prima: su
    // quelli la probabilità di una card scoperta è massima e la ricerca resta in
    // poche board invece di forzare 112 navigazioni.
    const candidati = [...(await giorniGialli('2026-09')).slice(0, 4).map(g => ({ m: 9, d: g.day })),
      ...(await giorniGialli('2026-10')).slice(0, 4).map(g => ({ m: 10, d: g.day }))]
    test.skip(!candidati.length, 'nessuna cella gialla nei due mesi: niente da verificare')
    for (const { m, d } of candidati) {
      expect(await openBoard(page, { month: m, day: d, shift: 'P' }), 'board non aperta').toBe(true)
      const cards = await boardCards(page)
      // Chip gialla (allarme, presente/futuro) OPPURE riga di testo «— scoperto»
      // (giorno passato o sezione scoperta da programma): entrambe portano il
      // trattino dentro.
      const conScoperto = cards.filter(
        c => c.chips.some(t => t.includes('scoperto')) || /—\s*scoperto/.test(c.names),
      )
      if (!conScoperto.length) continue
      for (const c of conScoperto) {
        expect(
          c.names.replace(/\s+/g, ' ').trim(),
          `card ${c.title} il ${d}/${m}: il posto libero non deve restare fuori dalla segnalazione`,
        ).not.toMatch(/(^|\|)\s*—\s*(\||$)/)
      }
      console.log(`card scoperte verificate il ${d}/${m}: ${conScoperto.map(c => c.title).join(', ')}`)
      return
    }
    console.log('nessuna card scoperta nei giorni gialli dei due mesi: niente da verificare')
  })
})
