import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'

/**
 * M10 — LA VIBRAZIONE E IL VETRO CONTRASTO (22/09/2026).
 *
 * Due cose che lo schermo non mostra, e che però sono contratto:
 *
 *  · l'**aptica** non disegna pixel: l'unica prova possibile è SPIARE il canale
 *    (`navigator.vibrate`) e contare i millisecondi sparati. Le durate sono i
 *    token `--aptica-*` della skin, letti a ogni chiamata — e la skin decide
 *    anche il silenzio: su iOS valgono `0ms`, quindi il canale non spara MAI
 *    (WebKit non distribuisce l'api alle PWA, e HIG non mette il feedback a
 *    scatti nel vocabolario dei controlli). Quello che si prova è la catena
 *    INTERA: il gesto → il momento giusto → la durata del token → il motore.
 *
 *  · il **vetro contrasto**: la riga di luce sul bordo alto del foglio (30% del
 *    filo di vetro, smorzata in 28px) esiste perché «traslucido sopra
 *    traslucido» è il buco già pagato in M8b. La prova: il fondo del foglio è
 *    un COMPOSTO (luce sopra superficie), e `prefers-reduced-transparency`
 *    lo riduce alla superficie nuda — la via d'uscita accessibile è parte del
 *    contratto, non un ornamento.
 *
 * L'override di QA (`?platform=`) permette di provare entrambe le skin sullo
 * stesso motore (stesso patto delle spec di M4).
 */
const DEV = 'dev=rootkind-dev-2026'

/** Il numero di chiamate registrate dallo spia, per la piattaforma data. */
const CHIAMATE = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __aptica: number[] }).__aptica)

const SOMMA = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __aptica: number[] }).__aptica.reduce((a, b) => a + b, 0))

/**
 * L'override `?platform=` si indossa al MOUNT del provider: subito dopo
 * `domcontentloaded` i token di skin non sono ancora quelli della piattaforma
 * scelta, e leggerli lì dà i numeri della skin sbagliata (il difetto con cui
 * questa spec è nata). Si aspetta l'attributo scritto su <html> PRIMA di
 * leggere qualunque token o agire su un controllo.
 */
const SKIN = (page: import('@playwright/test').Page, piattaforma: 'android' | 'ios') =>
  page.waitForFunction(
    (p) => document.documentElement.getAttribute('data-platform') === p,
    piattaforma,
    { timeout: 20_000 },
  )

test.describe('L’aptica e il vetro contrasto (M10)', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('il tocco del bottone spara la durata della skin: Android sì, iOS tace', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    // Le durate ATTESE, lette dal foglio di stile con la stessa formula del
    // contratto: non si copiano a mano — si misurano, così la prova non può
    // divergere dal contratto che le blocca.
    for (const piattaforma of ['android', 'ios'] as const) {
      await page.goto(`${E2E_BASE_URL}/admin/movimento?${DEV}&platform=${piattaforma}`, {
        waitUntil: 'domcontentloaded',
      })
      await SKIN(page, piattaforma)
      await page.evaluate(() => {
        const register = (window as unknown as {
          __aptica?: number[]
          __vibrate?: Navigator['vibrate']
        })
        register.__aptica = []
        Object.defineProperty(navigator, 'vibrate', {
          configurable: true,
          value: (pattern: number | number[]) => {
            const ms = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern
            ;(window as unknown as { __aptica: number[] }).__aptica.push(ms)
            return true
          },
        })
      })
      // La durata ATTESA la si legge dal documento, con la stessa formula del
      // contratto dei token: la prova non copia il numero, lo misura.
      const attesa = await page.evaluate(
        () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--aptica-tap'), 10),
      )

      // Il test bed è la SONDA (/admin/movimento): i suoi bottoni non navigano
      // né toccano il database — un tap sul comando delle azioni invece CAMBIA
      // PAGINA, e lo spia muore con la pagina.
      // Il selettore è l'ATTRIBUTO: la pagina ha due «Conferma» (la sezione
      // M7 mostra il controllo normale, questa il controllo espressivo) e
      // solo il secondo porta data-gl — il locator per nome becca l'altro.
      const bottone = page.locator('button[data-gl]', { hasText: 'Conferma' }).first()
      await expect(bottone).toBeVisible({ timeout: 20_000 })
      await bottone.hover()
      await page.mouse.down()
      await page.mouse.up()

      if (attesa > 0) {
        await expect
          .poll(() => SOMMA(page), { timeout: 5_000, message: `Android deve sparare ${attesa}ms` })
          .toBe(attesa)
      } else {
        await page.waitForTimeout(400)
        expect(await CHIAMATE(page), 'iOS non spara MAI: la skin decide il silenzio').toEqual([])
      }
    }
  })

  test('la pressione lunga spara l’avviso a metà attesa, non dopo l’apertura', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=android`, {
      waitUntil: 'domcontentloaded',
    })
    await SKIN(page, 'android')
    await page.evaluate(() => {
      ;(window as unknown as { __aptica: number[] }).__aptica = []
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (pattern: number | number[]) => {
          const ms = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern
          ;(window as unknown as { __aptica: number[] }).__aptica.push(ms)
          return true
        },
      })
    })
    // La somma conta ANCHE il tocco riconosciuto del pointerdown (il comando
    // usa lo stesso canale): ciò che si prova è che il TOTALE sparato —
    // avviso + tocco — sia già lì PRIMA che il menu esista.
    const [attesa, tocco] = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement)
      return [
        parseInt(s.getPropertyValue('--aptica-avviso'), 10),
        parseInt(s.getPropertyValue('--aptica-tap'), 10),
      ]
    })

    // La pressione lunga non è un tap: resta sul comando e il foglio si apre
    // SOLO dopo i 500ms — il momento in cui il menu è ancora chiuso è la
    // misura del «prima del movimento».
    const comando = page.locator('button[data-nav-actions="control"]').first()
    await expect(comando).toBeVisible({ timeout: 20_000 })
    await comando.hover()
    await page.mouse.down()

    // L'AVVISO IN ANTICIPO SUL MOVIMENTO: la vibrazione arriva a metà attesa
    // (300ms di 500), NON quando il menu è già aperto. La somma conta ANCHE il
    // tocco riconosciuto del pointerdown (il comando usa lo stesso canale):
    // ciò che si prova è che il TOTALE sparato supera già l'avviso PRIMA che
    // il menu esista.
    await expect
      .poll(() => SOMMA(page), { timeout: 5_000, message: `avviso+tocco = ${attesa + tocco}ms entro i 300ms` })
      .toBe(attesa + tocco)

    // Il menu NON è ancora aperto: l'avviso lo precede.
    expect(await page.locator('div.nav-scrim').count(), "il menu segue l'avviso, non lo precede").toBe(0)
    await page.mouse.up()
  })

  test('una conferma distruttiva dell’allarme spara l’accento pesante', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/admin/movimento?${DEV}&platform=android`, {
      waitUntil: 'domcontentloaded',
    })
    await SKIN(page, 'android')
    await page.evaluate(() => {
      ;(window as unknown as { __aptica: number[] }).__aptica = []
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (pattern: number | number[]) => {
          const ms = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern
          ;(window as unknown as { __aptica: number[] }).__aptica.push(ms)
          return true
        },
      })
    })
    const [attesa, tocco] = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement)
      return [
        parseInt(s.getPropertyValue('--aptica-conferma'), 10),
        parseInt(s.getPropertyValue('--aptica-tap'), 10),
      ]
    })

    // L'ALLARME DI PROVA della sonda: la stessa primitiva `Alert` dell'app con
    // una conferma distruttiva che non distrugge niente — la catena del gesto
    // è quella vera, e il database non viene toccato.
    await page.getByRole('button', { name: "Prova l'allarme" }).click()
    const conferma = page.getByRole('dialog').getByRole('button', { name: 'Elimina', exact: true })
    await expect(conferma).toBeVisible({ timeout: 10_000 })
    // Il click dell'apertura ha GIÀ sparato il suo tocco: si conta da zero il
    // momento della scelta, così la misura è solo di quella conferma.
    await page.evaluate(() => {
      ;(window as unknown as { __aptica: number[] }).__aptica = []
    })
    await conferma.click()

    await expect
      .poll(() => SOMMA(page), { timeout: 5_000, message: `la conferma deve sparare ${attesa}ms` })
      .toBe(attesa + tocco)
  })

  test('il foglio su iOS ha la luce di contrasto, e l’accessibilità la spegne', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    // La skin la si prova con l'override di QA (stesso patto delle spec di M4):
    // così il COMPOSTO si prova su qualunque motore, e la media query di
    // accessibilità — che è una feature di CHROMIUM — si emula col protocollo
    // CDP, che WebKit non offre. Su WebKit la via d'uscita resta provata dal
    // contratto dei token (le due medie d'accessibilità li spegnono), non qui.
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=ios`, {
      waitUntil: 'domcontentloaded',
    })
    await SKIN(page, 'ios')

    // Il comando apre l'elenco in un foglio: su iOS ha già «Annulla» dentro.
    const comando = page.locator('button[data-nav-actions="control"]').first()
    await expect(comando).toBeVisible({ timeout: 20_000 })
    // Su iOS un TAP esegue l'azione primaria (e naviga via): il foglio lo apre
    // la PRESSIONE LUNGA (500 ms, da M2). Stessa ricetta delle spec M8.
    await comando.hover()
    await page.mouse.down()
    await page.waitForTimeout(650)
    await page.mouse.up()
    const foglio = page.locator('div.nav-sheet')
    await expect(foglio).toBeVisible({ timeout: 10_000 })

    const misura = () =>
      foglio.evaluate((el) => getComputedStyle(el).backgroundImage)

    // In condizioni normali il fondo è un COMPOSTO: la riga di luce sta nella
    // prima immagine, il resto è la superficie.
    const composto = await misura()
    expect(composto, 'il foglio iOS ha almeno un gradiente (la luce di contrasto)').toContain('linear-gradient')

    // La via d'uscita accessibile: niente vetro, niente luce. Solo dove il
    // motore può EMULARE la media query (Chromium/CDP).
    const motore = page.context().browser()?.browserType().name()
    test.skip(motore !== 'chromium', 'la media query si emula solo su Chromium (CDP)')
    const sessione = await page.context().newCDPSession(page)
    await sessione.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    })
    const ridotto = await misura()
    expect(ridotto, 'senza vetro il foglio torna alla superficie nuda').not.toContain('linear-gradient')
  })
})
