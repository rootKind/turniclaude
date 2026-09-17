import { test, expect, employeeLoginEnabled, findEmployee } from './fixtures'
import { boardCards, cardByTitle, openBoard, openSalaAdminFab, scopertiIn } from './sala-board'
import { defaultSnapshot } from '../lib/sala-minimi'
import { readSalaLayout, writeSalaLayout, writeSalaLayoutValue, type LayoutSnapshot } from './sala-layout'

/**
 * MINIMI PER CARD: dal mini-Fab admin fino alla chip «scoperto» in card
 * (richiesta 15/09/2026).
 *
 * Il giro completo, che è l'unica cosa che le prove di logica non possono dire:
 * minifab → evento → pannello precompilato → salvataggio su Supabase → la board
 * ricaricata segnala la card sotto il minimo. Il giorno scelto è il 6/9 turno P:
 * la DCO 6° (doppia) ha UNA persona sola, quindi manca esattamente di una.
 *
 * ATTENZIONE — questo spec SCRIVE nel database reale: la piantina è la riga
 * `sala_layout` id=1 dell'utente. Prima di tutto ne prende una copia esatta
 * (`beforeAll`) e la rimette com'era in `afterAll`, che Playwright esegue anche
 * se un test fallisce. Il test che salva ripristina la copia anche all'inizio,
 * così la precondizione «nessun minimo configurato» non dipende dall'ordine.
 *
 * L'utente autenticato è l'ADMIN vero (Minino Davide — è la sua anagrafica a
 * portare l'uuid di ADMIN_ID): il pannello è riservato a lui.
 *
 * SERIALE, anche se la suite gira in parallelo (playwright.config.ts): questo è
 * l'unico spec che SCRIVE sulla piantina condivisa, e `beforeAll`/`afterAll`
 * girano una volta per WORKER — in parallelo copia e ripristino si
 * accavallerebbero (e gli altri spec potrebbero leggere la piantina modificata).
 */
test.describe.configure({ mode: 'serial' })

test.describe('turnisala: minimi per card', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(180_000)

  // La board è uno schema a 3 colonne: a 320px il pannello del calendario copre
  // lo schermo e non resta backdrop da cliccare.
  test.use({ viewport: { width: 1280, height: 900 } })

  let prima: LayoutSnapshot | null = null

  test.beforeAll(async () => { prima = await readSalaLayout() })
  test.afterAll(async () => { if (prima) await writeSalaLayout(prima) })

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

  test('salvando, la card sotto il minimo si segnala (e nel passato si scrive a testo)', async ({ asEmployee }) => {
    test.skip(!prima, 'piantina non leggibile (service-role assente)')
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'admin non in anagrafica')
    // Precondizione DETERMINISTICA: la piantina senza minimi, qualunque cosa ci
    // sia in archivio (l'utente può aver già configurato la sua fotografia per
    // settembre: il test non deve dipendere da quello). `afterAll` rimette poi
    // tutto come l'ha trovato.
    const { cards: cardsPiantina, defaults: defaultsPiantina } = prima!.layout
    await writeSalaLayoutValue(defaultsPiantina ? { cards: cardsPiantina, defaults: defaultsPiantina } : { cards: cardsPiantina })

    const page = await asEmployee('Minino')
    expect(await openBoard(page, { month: 9, day: 6, shift: 'P' })).toBe(true)
    const primaDelSalvataggio = await boardCards(page)
    expect(
      primaDelSalvataggio.flatMap(c => c.chips.filter(t => t.includes('scoperto'))),
      'senza minimi configurati non deve esserci nessuna chip «scoperto»',
    ).toEqual([])

    await openSalaAdminFab(page)
    await page.getByLabel('Minimi di persone per card').click()
    await expect(page.getByRole('heading', { name: 'Minimi per card' })).toBeVisible()
    // Il minimo deve valere dal 6/9 (il giorno che stiamo guardando), non da oggi.
    await page.getByLabel('Valido dal').fill('2026-09-01')
    await page.getByRole('button', { name: /Salva|Conferma/ }).click()
    await expect(page.getByRole('heading', { name: 'Minimi per card' })).toHaveCount(0, { timeout: 15_000 })

    expect(await openBoard(page, { month: 9, day: 6, shift: 'P' })).toBe(true)
    const cards = await boardCards(page)
    const c6 = cardByTitle(cards, 'DCO 6°')
    expect(c6, 'card DCO 6° non trovata').toBeTruthy()
    // Una persona mancante → UNA riga, e sulla card scoperta il posto libero «—»
    // non si vede più staccato dalla riga.
    expect(scopertiIn(c6!), 'DCO 6° il 6/9 P è sotto il minimo di 2').toBe(1)
    expect(c6!.names.replace(/\s+/g, ' ').trim()).not.toMatch(/(^|\|)\s*—\s*(\||$)/)
    // IL 6/9 È UN GIORNO PASSATO (oggi è il 16/9): la scopertura si scrive come
    // un nome, non con la chip gialla — è un fatto, non un allarme (richiesta
    // 16/09/2026, sera). Il posto mancante è il SUSSIDIO, quindi in corsivo.
    expect(c6!.chips.filter(t => t.includes('scoperto')), 'nel passato niente chip').toEqual([])
    expect(c6!.names, 'la riga di testo «— scoperto» sta in card').toContain('— scoperto')
    // Il FONT si legge sullo span del TESTO (`.sala-fit-text`, come i nomi veri),
    // non sul contenitore: la riga del sussidio porta il corsivo un livello sopra.
    expect(
      await page.evaluate(() => {
        const it = [...document.querySelectorAll('.sala-card-body .sala-fit-text')]
          .find(el => (el.textContent ?? '').includes('— scoperto'))
        return it ? getComputedStyle(it).fontStyle : null
      }),
      'il posto mancante è il sussidio: la riga va in corsivo come uno slot S',
    ).toBe('italic')

    const altre = cards.filter(c => c.title !== 'DCO 6°')
    expect(
      altre.flatMap(c => Array.from({ length: scopertiIn(c) }, () => c.title)),
      'il 6/9 turno P è scoperta solo la DCO 6°',
    ).toEqual([])

    // Il minimo vale PER TURNO: la notte dello stesso giorno non si tocca.
    expect(await openBoard(page, { month: 9, day: 6, shift: 'N' }), 'board non aperta').toBe(true)
    const notte = await boardCards(page)
    expect(
      notte.flatMap(c => Array.from({ length: scopertiIn(c) }, () => c.title)),
      'di notte il 6/9 non manca nessuno',
    ).toEqual([])
  })

  /**
   * UNA VOCE PUÒ ENTRARE IN VIGORE A METÀ GIORNATA (richiesta 16/09/2026).
   *
   * «Valido dal 27/9, turno P» deve lasciare la MATTINA del 27 come stava e
   * cominciare dal pomeriggio. Il giorno di partenza non è scelto a caso: è un
   * giorno in cui la regola dei minimi, se valesse da tutta la giornata, avrebbe
   * segnalato una card in mattina — quindi la prova distingue davvero i due
   * comportamenti. Le attese sono ricavate dal DOM, non scritte a mano: se il
   * PDF del mese viene ricaricato, le chip cambiano ma il confronto resta valido.
   */
  test('con un turno di partenza la regola non tocca i turni prima', async ({ asEmployee }) => {
    test.skip(!prima, 'piantina non leggibile (service-role assente)')
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'admin non in anagrafica')
    const { cards: cardsPiantina, defaults: defaultsPiantina } = prima!.layout
    await writeSalaLayoutValue(defaultsPiantina ? { cards: cardsPiantina, defaults: defaultsPiantina } : { cards: cardsPiantina })

    const page = await asEmployee('Minino')
    const scoperti = (cards: Awaited<ReturnType<typeof boardCards>>) =>
      cards.flatMap(c => Array.from({ length: scopertiIn(c) }, () => `${c.title}:— scoperto`))

    expect(await openBoard(page, { month: 9, day: 27, shift: 'M' }), 'board non aperta').toBe(true)
    const mattinaPrima = scoperti(await boardCards(page))

    // Pannello: data di efficacia + TURNO di partenza.
    await openSalaAdminFab(page)
    await page.getByLabel('Minimi di persone per card').click()
    await expect(page.getByRole('heading', { name: 'Minimi per card' })).toBeVisible()
    await page.getByLabel('Valido dal').fill('2026-09-27')
    await page.getByLabel('Turno P di partenza').click()
    await page.getByRole('button', { name: /Salva|Conferma/ }).click()
    await expect(page.getByRole('heading', { name: 'Minimi per card' })).toHaveCount(0, { timeout: 15_000 })

    // (1) LA MATTINA DEL GIORNO DI PARTENZA RESTA COM'ERA: la voce comincia dal
    //     pomeriggio, quindi la regola dei minimi non può applicarsi lì.
    expect(await openBoard(page, { month: 9, day: 27, shift: 'M' }), 'board non aperta').toBe(true)
    expect(scoperti(await boardCards(page)), 'la mattina del giorno di partenza non deve cambiare').toEqual(mattinaPrima)

    // (2) Il pannello dice cosa è in vigore, giorno+turno: la mattina nessuna
    //     voce (la prima parte dal pomeriggio), dal pomeriggio sì.
    await openSalaAdminFab(page)
    await page.getByLabel('Minimi di persone per card').click()
    await expect(page.getByText(/la prima voce parte dal 2026-09-27, turno P/)).toBeVisible()
    await page.getByRole('button', { name: 'Annulla' }).click()

    expect(await openBoard(page, { month: 9, day: 27, shift: 'P' }), 'board non aperta').toBe(true)
    await openSalaAdminFab(page)
    await page.getByLabel('Minimi di persone per card').click()
    await expect(page.getByText(/In vigore da 2026-09-27, turno P/)).toBeVisible()
    await page.getByRole('button', { name: 'Annulla' }).click()
  })

  /**
   * PERIODI PER CASELLA (richiesta 16/09/2026, sera).
   *
   * Il caso dell'utente, dal vivo: il 24/9 di pomeriggio la DCIF resta scoperta
   * perché DI MEO è stato chiamato sulla DCP — nel FUTURO è un allarme, quindi la
   * board lo segnala con la chip. Dichiarando quel posto «scoperto da programma»
   * (un periodo a 0 sulla casella DCIF|P che copre il 24/9) la stessa scopertura
   * si scrive come un nome: la sezione è vuota per scelta, non per imprevisto.
   *
   * La piantina è messa in uno stato NOTO (card e default dell'utente + una voce
   * di minimi dal 1/9 coi valori della piantina): senza, la regola non sarebbe
   * attiva il 24/9 e la chip non ci sarebbe. `afterAll` rimette tutto com'era.
   */
  test('un periodo a 0 dichiara la casella scoperta da programma: la riga si scrive a testo', async ({ asEmployee }) => {
    test.skip(!prima, 'piantina non leggibile (service-role assente)')
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'admin non in anagrafica')
    const { cards: cardsPiantina, defaults: defaultsPiantina } = prima!.layout
    await writeSalaLayoutValue({
      cards: cardsPiantina,
      ...(defaultsPiantina ? { defaults: defaultsPiantina } : {}),
      minimums: [{ from: '2026-09-01', values: defaultSnapshot(cardsPiantina) }],
    })

    const page = await asEmployee('Minino')
    const dcif = async () => (await boardCards(page)).find(c => c.title.toUpperCase().includes('DCIF'))

    expect(await openBoard(page, { month: 9, day: 24, shift: 'P' }), 'board non aperta').toBe(true)
    const primaDelPeriodo = await dcif()
    expect(primaDelPeriodo, 'card DCIF non trovata').toBeTruthy()
    expect(scopertiIn(primaDelPeriodo!), 'il 24/9 P la DCIF è scoperta (DI MEO è sulla DCP)').toBeGreaterThan(0)
    expect(
      primaDelPeriodo!.chips.some(t => t.includes('scoperto')),
      'nel futuro, senza periodi, la segnalazione è la chip gialla',
    ).toBe(true)

    // Il periodo: la casella DCIF di POMERIGGIO, 0 persone, il solo 24/9.
    await openSalaAdminFab(page)
    await page.getByLabel('Minimi di persone per card').click()
    await expect(page.getByRole('heading', { name: 'Minimi per card' })).toBeVisible()
    await page.getByLabel('Periodi DCIF').click()
    await page.getByLabel('Aggiungi periodo DCIF turno P').click()
    await page.getByLabel('Valore periodo DCIF turno P').fill('0')
    // `exact`: le pastiglie del turno hanno etichette che CONTENGONO «Inizio/Fine
    // periodo …» («Turno inizio periodo DCIF turno P»), quindi il match parziale
    // ne pesca cinque.
    await page.getByLabel('Inizio periodo DCIF turno P', { exact: true }).fill('2026-09-24')
    await page.getByLabel('Fine periodo DCIF turno P', { exact: true }).fill('2026-09-24')
    await page.getByLabel('Conferma periodo DCIF turno P').click()
    await page.getByRole('button', { name: 'Salva', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Minimi per card' })).toHaveCount(0, { timeout: 15_000 })

    // Il periodo è finito nella piantina, con le date che servono.
    const salvata = (await readSalaLayout())!.layout as { minimumPeriods?: Array<Record<string, unknown>> }
    expect(
      salvata.minimumPeriods?.some(p => p.card === 'DCIF' && p.shift === 'P' && p.value === 0 && p.from === '2026-09-24' && p.to === '2026-09-24'),
      'periodo salvato nella piantina',
    ).toBe(true)

    expect(await openBoard(page, { month: 9, day: 24, shift: 'P' }), 'board non aperta').toBe(true)
    const dopo = await dcif()
    expect(dopo!.chips.filter(t => t.includes('scoperto')), 'niente più chip: la scopertura è da programma').toEqual([])
    expect(dopo!.names, 'la scopertura si scrive come un nome').toContain('— scoperto')
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
