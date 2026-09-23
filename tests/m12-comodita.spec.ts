import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'

/**
 * M12 — ADATTIVITÀ, ACCESSIBILITÀ E COMODITÀ D'USO (23/09/2026).
 *
 * Il piano indicava la board di sala come «il punto peggiore» dell'accessibilità,
 * e non per un'omissione: è una griglia densa dove l'informazione viaggia per
 * POSIZIONE (chi è in quale sezione, quale turno, in che ordine) e dove fino a
 * ieri, con un lettore di schermo, si sentiva una fila di cognomi e lettere senza
 * contesto. Le prove qui sotto non «guardano» la board: leggono l'albero che un
 * lettore di schermo percorre — ruoli, etichette, elenchi, annunci — perché è
 * l'unica parte dell'esperienza che non si può vedere in uno screenshot.
 *
 * La divisione dei describe non è casuale: i primi due hanno bisogno di una
 * sessione vera (board e Impostazioni), il terzo no — i campi di accesso sono
 * esattamente le pagine che si aprono PRIMA di avere un account.
 */
const DEV = 'dev=rootkind-dev-2026'

/** La skin va attesa: `?platform=` si applica al mount del provider (lezione M9). */
const SKIN = (page: import('@playwright/test').Page, piattaforma: 'android' | 'ios') =>
  page.waitForFunction(
    (p) => document.documentElement.getAttribute('data-platform') === p,
    piattaforma,
    { timeout: 20_000 },
  )

test.describe('M12a — la board si presenta a chi non la vede', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(180_000)

  test('è una regione con un nome, e annuncia giorno e turno', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    const board = page.locator('[role="region"][aria-label^="Board di sala"]')
    await expect(board).toBeVisible()
    // L'etichetta dice il CONTESTO: senza, la regione si chiamerebbe «qualcosa».
    const etichetta = await board.getAttribute('aria-label')
    expect(etichetta).toMatch(/turno (Mattina|Pomeriggio|Notte)/)

    // La live region è il pezzo che manca sempre: `role="status"` esiste nel DOM
    // e contiene la frase con il numero di card. Sta DENTRO la regione (l'app ne
    // ha un'altra, quella degli aggiornamenti realtime, e sono due cose diverse:
    // questa parla di quello che si sta guardando, quella di quello che è
    // cambiato altrove).
    const stato = board.locator('[data-slot="sala-annuncio"]')
    await expect(stato).toHaveAttribute('role', 'status')
    await expect(stato).toContainText(/\d+ card/)

    // Il CAMBIO di turno si annuncia: chi non vede la toolbar non ha altro modo
    // di sapere che il turno è cambiato.
    const notte = page.getByRole('button', { name: 'Notte' })
    await notte.click()
    await expect(stato).toContainText('turno Notte')
    await expect(notte).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Pomeriggio' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('ogni card dichiara la sezione, quante persone ha e l’elenco ordinato', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    const card = page.locator('[data-slot="desk-card"][role="group"]').first()
    await expect(card).toBeVisible()
    // «Sezione — N persone»: la stessa cosa che il titolo e i nomi dicono a chi
    // guarda. Il numero è informazione, non decorazione (serve a sapere quanto si
    // ascolterà prima di entrarci).
    await expect(card).toHaveAttribute('aria-label', /— \d+ (persona|persone)/)

    const elenco = card.locator('[role="list"]').first()
    await expect(elenco).toBeAttached()
    const voci = elenco.locator('[role="listitem"]')
    expect(await voci.count()).toBeGreaterThan(0)
    // L'ORDINE è informazione (primo/secondo/terzo slot): le voci non sono vuote e
    // hanno un testo leggibile, non un pallino.
    for (let i = 0; i < Math.min(3, await voci.count()); i++) {
      expect((await voci.nth(i).innerText()).trim().length).toBeGreaterThan(0)
    }
  })

  test('il calendario è una finestra dichiarata, non un pannello qualunque', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    const trigger = page.locator('button[aria-haspopup="dialog"]').first()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('[role="dialog"][aria-label="Scegli il giorno"]')).toBeVisible()

    // Si chiude SCEGLIENDO un giorno — il percorso vero, non un click sulla
    // velatura: con il pannello aperto il pulsante sotto è coperto (ed è giusto
    // così), quindi la chiusura si prova dove accade. `aria-expanded` torna falso:
    // uno stato che resta «aperto» dopo la chiusura è la trappola classica.
    const giorni = page.locator('[role="dialog"][aria-label="Scegli il giorno"] button:not([disabled])')
    expect(await giorni.count(), 'il calendario ha giorni selezionabili').toBeGreaterThan(5)
    await giorni.nth(10).click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('[role="dialog"][aria-label="Scegli il giorno"]')).toHaveCount(0)
  })
})

test.describe('M12b — leggere meglio: il gradino del testo', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(180_000)

  test('il gradino ingrandisce davvero, si ricorda la scelta e si può disfare', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/impostazioni?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Dimensione')).toBeVisible()

    // Il titolo scelto è quello della SEZIONE «Testo», non «il primo h2 della
    // pagina»: in giro ci sono altre intestazioni (il registro delle novità ne ha
    // una) e misurare quella sbagliata confronterebbe due elementi diversi — un
    // difetto che si vede solo quando un altro componente entra o esce.
    const titoloTesto = page.getByRole('heading', { name: 'Testo' })
    const misure = async () => ({
      base: await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)),
      titolo: await titoloTesto.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      gradino: await page.evaluate(() => document.documentElement.getAttribute('data-text-scale')),
    })

    const prima = await misure()
    expect(prima.gradino, 'si parte dal gradino predefinito').toBe('normale')

    const massimo = page.getByRole('button', { name: 'Massimo' })
    await massimo.click()
    await expect(massimo).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(async () => (await misure()).gradino, { message: 'il gradino si applica al documento' })
      .toBe('massimo')

    const dopo = await misure()
    // Il gradino sta sulla misura di BASE del documento: è quello che fa crescere
    // anche i testi scritti con le classi di Tailwind (text-xs, text-sm…), che non
    // leggono nessun token nostro — cioè il motivo per cui questa preferenza serve.
    expect(dopo.base / prima.base, 'la base cresce del fattore del gradino').toBeCloseTo(1.25, 2)
    expect(dopo.titolo, 'e i titoli crescono con lei').toBeGreaterThan(prima.titolo)

    // Si ricorda: la preferenza vive sul dispositivo, non nella sessione.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect.poll(async () => (await misure()).gradino).toBe('massimo')

    // …e si può tornare indietro (una preferenza che si può solo alzare è una
    // trappola: chi non vede più niente non trova il modo di rimpicciolire).
    await page.getByRole('button', { name: 'Normale' }).click()
    await expect.poll(async () => (await misure()).gradino).toBe('normale')
    expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe('100%')
  })
})

test.describe('M12b — la tastiera giusta al campo giusto', () => {
  test('l’accesso: chiocciola, memoria e il tasto che dice cosa succede', async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/login?${DEV}`, { waitUntil: 'domcontentloaded' })

    const email = page.locator('#email')
    await expect(email).toHaveAttribute('inputmode', 'email')
    await expect(email).toHaveAttribute('autocomplete', 'email')
    await expect(email).toHaveAttribute('enterkeyhint', 'next')

    const password = page.locator('#password')
    await expect(password).toHaveAttribute('autocomplete', 'current-password')
    // «Vai», non «avanti»: è l'ultimo campo del modulo.
    await expect(password).toHaveAttribute('enterkeyhint', 'go')
  })

  test('il recupero password: la chiocciola c’è anche qui', async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/reset-password?${DEV}`, { waitUntil: 'domcontentloaded' })
    const email = page.locator('#email')
    await expect(email).toHaveAttribute('inputmode', 'email')
    await expect(email).toHaveAttribute('autocomplete', 'email')
    // Il tasto «invia» (il codice OTP) dice cosa sta per partire.
    await expect(email).toHaveAttribute('enterkeyhint', 'send')
  })
})

test.describe('M12c — la comodità sulle liste lunghe', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(180_000)

  /** Una cronologia lunga È il caso d'uso: lo storage delle notifiche è locale (`lib/notification-storage.ts`). */
  const seminaNotifiche = (quante: number) => (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `prova-${i}`,
      title: `Comunicazione ${i + 1}`,
      body: 'Testo della comunicazione di prova.',
      timestamp: Date.now() - i * 60_000,
      read: false,
      type: 'system',
      shiftId: null,
    }))

  test('«torna su» compare dopo aver scorso e riporta in cima', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.setViewportSize({ width: 320, height: 640 })
    // Con le animazioni ridotte lo scorrimento è ISTANTANEO (`behavior: 'auto'`):
    // la prova verifica anche questo — una pagina che scorre per due secondi sotto
    // chi ha chiesto «meno movimento» è la cosa che questa preferenza vieta.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(
      ({ chiave, voci }) => window.localStorage.setItem(chiave, JSON.stringify(voci)),
      { chiave: 'notification-history', voci: seminaNotifiche(40)(40) },
    )

    await page.goto(`${E2E_BASE_URL}/notifiche?${DEV}`, { waitUntil: 'domcontentloaded' })
    // Si aspetta che l'elenco SIA disegnato prima di scorrere: una pagina corta
    // non scorre, e un test che scorre nel vuoto non proverebbe niente.
    await expect(page.getByText('Comunicazione 1', { exact: true })).toBeVisible()

    const pulsante = page.getByRole('button', { name: /Torna all'inizio/ })
    // In cima il comando NON c'è: coprirebbe il FAB delle azioni di sala.
    await expect(pulsante).toHaveCount(0)

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(pulsante).toBeVisible()
    await pulsante.click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('l’elenco vuoto offre una via d’uscita', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.addInitScript(() => window.localStorage.removeItem('notification-history'))
    await page.goto(`${E2E_BASE_URL}/notifiche?${DEV}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Nessuna notifica ricevuta')).toBeVisible()
    // Uno stato vuoto senza uscita lascia la domanda «e adesso?»: la risposta è la
    // board, dove i turni accadono.
    await expect(page.getByRole('link', { name: 'Vai ai turni di sala' })).toHaveAttribute(
      'href',
      '/turnisala',
    )
  })
})

test.describe('M12d — prestazioni e adattività dichiarate', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(180_000)

  test('il budget del vetro: al massimo tre superfici velate per schermata', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    // Il budget di M12 è DICHIARATO (tre: barra, testata, foglio) perché ogni
    // vetro è un livello di compositing che il telefono paga a ogni fotogramma. La
    // misura è il numero di elementi VISIBILI con un `backdrop-filter` attivo: se
    // qualcuno aggiunge una quarta superficie velata «perché è carina», questa
    // prova lo dice invece di aspettare che il telefono scaldi.
    const contaVetri = () =>
      page.evaluate(() => {
        const visibile = (el: Element) => {
          const r = el.getBoundingClientRect()
          const stile = getComputedStyle(el)
          return r.width > 0 && r.height > 0 && stile.visibility !== 'hidden' && stile.display !== 'none'
        }
        return Array.from(document.querySelectorAll<HTMLElement>('*'))
          .filter((el) => {
            const filtro = getComputedStyle(el).backdropFilter
            return filtro && filtro !== 'none' && visibile(el)
          })
          .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`)
      })

    for (const percorso of ['/turnisala', '/dashboard']) {
      await page.goto(`${E2E_BASE_URL}${percorso}?${DEV}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const vetri = await contaVetri()
      expect(vetri.length, `vetri su ${percorso}: ${vetri.join(', ')}`).toBeLessThanOrEqual(3)
    }
  })

  test('in orizzontale la board non sborda, e i lati rispettano l’intaglio', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    // Un telefono in orizzontale: la board (tre colonne) è il caso in cui il
    // contenuto rischia di più, ed è la ragione per cui M6 ha dato all'app le
    // safe area LATERALI.
    await page.setViewportSize({ width: 852, height: 393 })
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')
    await page.waitForTimeout(1500)

    const sborda = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(sborda, 'nessuno scorrimento orizzontale').toBeLessThanOrEqual(1)

    // `.shell-nav` e non `.safe-area-px` (M12f): lo spazio laterale della pagina
    // lo detta un solo posto, e da quando esiste la rail quello è `--nav-start`
    // più `--safe-left`. A 393 di altezza la rail non si accende, quindi qui il
    // valore è l'area sicura esattamente come prima.
    const contenitore = page.locator('.shell-nav').first()
    const prima = await contenitore.evaluate((el) => getComputedStyle(el).paddingLeft)
    // Con l'intaglio di lato (iPhone in orizzontale) il sistema dichiara un inset
    // laterale: il contenuto non deve finirci sotto.
    await page.evaluate(() => document.documentElement.style.setProperty('--safe-left', '44px'))
    const dopo = await contenitore.evaluate((el) => getComputedStyle(el).paddingLeft)
    expect(parseFloat(dopo) - parseFloat(prima), 'il contenuto si sposta di quanto dice il sistema').toBe(44)
  })
})
