import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'
import { activeDestinationId, destinationById, NAV_DESTINATIONS, TURNI_VIEWS } from '../components/nav/nav-destinations'
import { PLATFORM_ATTR } from '../lib/platform'

/**
 * LA BARRA E LE AZIONI — M2 del design system iOS/Android (20/09/2026).
 *
 * Questa spec difende le due cose che il report contestava (issue 1 e 2) e che
 * non si vedono da un test di pagina:
 *
 *   1. **La barra fa solo destinazioni.** Cinque voci, nessuna che cambia
 *      significato al tap, nessuna etichetta illeggibile, e il comando delle
 *      AZIONI fuori dalla barra — la prova è geometrica: il pulsante che apre il
 *      menu non è un discendente del `<nav>` e la sua base sta SOPRA il bordo
 *      alto della barra.
 *   2. **L'aspetto è quello della piattaforma.** Altezza della barra, pillola
 *      della voce attiva, forma del comando (FAB su Android, pill su iOS),
 *      superficie dell'elenco (bottom sheet con la scriminatura su Android,
 *      action sheet con «Annulla» su iOS). Il valore atteso dipende dal PROGETTO
 *      Playwright (`ios` gira su WebKit/iPhone, `android` su Chromium/Pixel,
 *      `chromium` è il desktop): così la skin è provata sul motore vero, non solo
 *      simulata con l'override.
 *
 * L'override di QA (`?platform=`) si prova lo stesso, ma per un'altra ragione:
 * è lo strumento con cui si guarda la skin dell'altra piattaforma dal proprio
 * telefono, e se smettesse di funzionare la QA a mano diventerebbe cieca.
 *
 * Il contratto delle azioni (quale azione per quale pagina e ruolo) ha qui la sua
 * parte PURA: `activeDestinationId` si prova senza browser, perché è l'unico
 * punto in cui si decide se una voce è accesa.
 */
const DEV = 'dev=rootkind-dev-2026'

/** Altezze attese della barra: i token di M1, uguali a `app/globals.css`. */
const ALTEZZA_BARRA = { desktop: 64, ios: 49, android: 80 } as const
type Piattaforma = keyof typeof ALTEZZA_BARRA

function piattaformaDelProgetto(): Piattaforma {
  const nome = test.info().project.name
  if (nome === 'ios') return 'ios'
  if (nome === 'android') return 'android'
  return 'desktop'
}

const nav = (page: import('@playwright/test').Page) =>
  page.locator('nav[aria-label="Navigazione principale"]')
/** Il comando delle azioni: quello che apre l'elenco (o esegue l'unica azione). */
const comandoAzioni = (page: import('@playwright/test').Page) =>
  page.locator('button[data-nav-actions="control"]')

test.describe('Destinazioni: la parte pura del contratto', () => {
  test('sono cinque, ognuna con il suo percorso, e l’accensione è esatta', () => {
    expect(NAV_DESTINATIONS).toHaveLength(5)
    expect(NAV_DESTINATIONS.map((d) => d.label)).toEqual([
      'Cambi turno',
      'Cambi ferie',
      'Turni',
      'Il tuo turno',
      'Impostazioni',
    ])

    // Una voce accesa per ogni sua pagina…
    expect(activeDestinationId('/dashboard')).toBe('cambi-turno')
    expect(activeDestinationId('/vacanze')).toBe('cambi-ferie')
    expect(activeDestinationId('/turnisala')).toBe('turni')
    expect(activeDestinationId('/turniferie')).toBe('turni')
    expect(activeDestinationId('/tuoturno')).toBe('tuo-turno')
    expect(activeDestinationId('/impostazioni')).toBe('impostazioni')

    // …e NESSUNA per le pagine di dettaglio: /notifiche si apre dalla campanella
    // e /admin da Impostazioni. Accendere una voce direbbe «sei qui» a chi non c'è.
    expect(activeDestinationId('/notifiche')).toBeNull()
    expect(activeDestinationId('/admin')).toBeNull()

    // «Turni» è l'unica che ricorda dove eri (due viste, una destinazione).
    expect(NAV_DESTINATIONS.filter((d) => d.remembersLastPage).map((d) => d.id)).toEqual(['turni'])
  })
})

test.describe('La barra: cinque destinazioni, azioni fuori', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('cinque voci, quella della pagina accesa, e nessuna etichetta illeggibile', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })

    const voci = nav(page).locator('a')
    await expect(voci).toHaveCount(5)
    await expect(nav(page).locator('a[aria-current="page"]')).toHaveCount(1)
    await expect(nav(page).locator('a[aria-current="page"]')).toHaveAttribute('aria-label', 'Cambi turno')

    // I nomi accessibili sono quelli scritti nel contratto (le spec li citano).
    expect(await voci.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([
      'Cambi turno',
      'Cambi ferie',
      'Turni: sala e ferie',
      'Il tuo turno',
      'Impostazioni',
    ])

    // La voce si accende seguendo la pagina: su /tuoturno è «Il tuo turno»…
    await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(nav(page).locator('a[aria-current="page"]')).toHaveAttribute('aria-label', 'Il tuo turno')

    // …e su ognuna delle due viste di «Turni» è la stessa voce (sala E ferie).
    for (const vista of ['/turnisala', '/turniferie']) {
      await page.goto(`${E2E_BASE_URL}${vista}?${DEV}`, { waitUntil: 'domcontentloaded' })
      await expect(nav(page).locator('a[aria-current="page"]')).toHaveAttribute('aria-label', 'Turni: sala e ferie')
    }
  })

  for (const larghezza of [320, 390]) {
    test(`le etichette entrano nella barra a ${larghezza}px (era la voce a 7px)`, async ({ asEmployee }) => {
      test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
      const page = await asEmployee('Minino')
      await page.setViewportSize({ width: larghezza, height: 700 })
      await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })
      await expect(nav(page).locator('a')).toHaveCount(5)

      const misure = await page.evaluate(() => {
        const n = document.querySelector('nav[aria-label="Navigazione principale"]')!
        return {
          voci: [...n.querySelectorAll('a')].map((a) => {
            const etichetta = a.querySelector('span:last-child') as HTMLElement
            const rectVoce = a.getBoundingClientRect()
            const rectEtichetta = etichetta.getBoundingClientRect()
            return {
              testo: etichetta.textContent ?? '',
              font: parseFloat(getComputedStyle(etichetta).fontSize),
              dentroLaVoce: rectEtichetta.left >= rectVoce.left - 0.5 && rectEtichetta.right <= rectVoce.right + 0.5,
              tagliata: etichetta.scrollWidth > etichetta.clientWidth + 1,
            }
          }),
          barraScrollabile: n.scrollWidth > n.clientWidth + 1,
        }
      })

      for (const v of misure.voci) {
        expect(v.font, `«${v.testo}»: l'etichetta è leggibile (il minimo è 10px)`).toBeGreaterThanOrEqual(10)
        expect(v.dentroLaVoce, `«${v.testo}» dentro la sua voce`).toBeTruthy()
        expect(v.tagliata, `«${v.testo}» non deve finire con i puntini a ${larghezza}px`).toBeFalsy()
      }
      expect(misure.barraScrollabile, 'la barra non deve scorrere in orizzontale').toBeFalsy()
    })
  }

  test('il comando delle AZIONI non sta dentro la barra: è sopra, fuori', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(comandoAzioni(page)).toBeVisible()

    const geometria = await page.evaluate(() => {
      const n = document.querySelector('nav[aria-label="Navigazione principale"]')!
      const comando = document.querySelector('button[data-nav-actions="control"]') as HTMLElement
      const rn = n.getBoundingClientRect()
      const rc = comando.getBoundingClientRect()
      return {
        dentroLaBarra: n.contains(comando),
        baseDelComando: rc.bottom,
        bordoAltoDellaBarra: rn.top,
        // La base del pulsante deve stare SOPRA il bordo alto della barra.
        sopra: rc.bottom <= rn.top + 0.5,
        centrato: Math.abs((rc.left + rc.right) / 2 - window.innerWidth / 2) < 4,
      }
    })
    expect(geometria.dentroLaBarra, 'il comando delle azioni non è dentro il <nav>').toBeFalsy()
    expect(
      geometria.sopra,
      `il comando deve stare sopra la barra (base ${geometria.baseDelComando.toFixed(0)}px, barra da ${geometria.bordoAltoDellaBarra.toFixed(0)}px)`,
    ).toBeTruthy()
    void geometria.centrato
  })

  test('con UNA azione il tap la esegue subito (come il vecchio pulsante-link)', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })

    // Il nome del comando È il nome dell'azione: su una pagina con una sola cosa
    // da fare il pulsante la dice, invece di chiamarsi «Azioni» e nasconderla.
    await expect(comandoAzioni(page)).toHaveAttribute('aria-label', 'Nuovo turno')
    await comandoAzioni(page).click()

    // Naviga davvero (e il documento non si ricarica: è navigazione del client).
    await page.waitForURL(/new=1/, { timeout: 15_000 })
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('con PIÙ azioni il tap apre l’elenco, e le voci hanno il nome che le spec conoscono', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}`, { waitUntil: 'domcontentloaded' })

    await expect(comandoAzioni(page)).toHaveAttribute('aria-label', 'Azioni turno')
    await comandoAzioni(page).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // I nomi accessibili sono quelli che l'app usava già come `aria-label`: le
    // spec dei menu (`apriVoceFab`, `openSalaAdminFab`) contano su questo.
    await expect(page.getByRole('button', { name: 'Personalizza colori e stile delle card' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confronta i turni di più dipendenti' })).toBeVisible()

    // Mentre è aperto, il comando dice che cosa fa il prossimo tap.
    await expect(comandoAzioni(page)).toHaveAttribute('aria-label', 'Chiudi menu')

    // Esc chiude (il tocco fuori c'è, ma su desktop non tutti lo cercano).
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})

test.describe('Le due skin: il motore vero dice quale', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')
  test.setTimeout(120_000)

  test('altezza, pillola della voce attiva e forma del comando', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const atteso = piattaformaDelProgetto()
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(nav(page).locator('a')).toHaveCount(5)

    const skin = await page.evaluate(() => {
      const n = document.querySelector('nav[aria-label="Navigazione principale"]')!
      const attiva = n.querySelector('a[aria-current="page"]')!
      const pillola = attiva.querySelector('span')! as HTMLElement
      const comando = document.querySelector('button[data-nav-actions="control"]') as HTMLElement
      const cs = getComputedStyle(comando)
      const rc = comando.getBoundingClientRect()
      return {
        piattaforma: document.documentElement.getAttribute('data-platform'),
        altezzaBarra: Math.round(n.getBoundingClientRect().height),
        pillola: {
          w: Math.round(pillola.getBoundingClientRect().width),
          h: Math.round(pillola.getBoundingClientRect().height),
          sfondo: getComputedStyle(pillola).backgroundColor,
        },
        comando: {
          w: Math.round(rc.width),
          h: Math.round(rc.height),
          radius: cs.borderRadius,
          testo: (comando.textContent ?? '').trim(),
          fondo: cs.backdropFilter,
        },
      }
    })

    expect(skin.piattaforma, 'la piattaforma che il motore dichiara').toBe(atteso)
    expect(skin.altezzaBarra, `la barra su ${atteso}`).toBe(ALTEZZA_BARRA[atteso])

    if (atteso === 'android') {
      // M3: la voce attiva sta in una pillola 32×64, e il comando è un FAB 56dp
      // con angoli a 16 (il cerchio è la variante expressive, non questa).
      expect(skin.pillola).toMatchObject({ w: 64, h: 32 })
      expect(skin.pillola.sfondo, 'la pillola della voce attiva deve essere visibile').not.toBe('rgba(0, 0, 0, 0)')
      expect(skin.comando.w, 'FAB M3').toBe(56)
      expect(skin.comando.h).toBe(56)
      expect(skin.comando.radius).toBe('16px')
    } else if (atteso === 'ios') {
      // HIG: nessuna pillola (l'indicatore è la tinta del testo) e nessun FAB —
      // il comando è una pill con l'etichetta scritta sopra.
      expect(skin.pillola.sfondo, 'su iOS non c’è la pillola di Material').toBe('rgba(0, 0, 0, 0)')
      expect(skin.comando.h, 'controllo a 44pt').toBeGreaterThanOrEqual(44)
      expect(skin.comando.testo.length, 'la pill dice cosa fa').toBeGreaterThan(0)
      expect(parseFloat(skin.comando.radius), 'pill: completamente arrotondata').toBeGreaterThan(20)
    } else {
      expect(skin.comando.w, 'sul desktop il pulsante resta quello di sempre').toBe(48)
      expect(skin.comando.h).toBe(48)
    }
  })

  test('la barra è un’ISOLA su iOS e una fascia altrove, e si alza solo quando si scorre', async ({
    asEmployee,
  }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const atteso = piattaformaDelProgetto()
    const page = await asEmployee('Minino')

    // Serve una pagina che SCORRA davvero — e che stia DENTRO la barra: senza
    // contenuto sotto di sé lo stato «scrolled» non esiste, è il suo senso. Due
    // trappole già pagate: la board di sala sta tutta nello schermo (misurata), e
    // il pannello di amministrazione NON è una pagina del gruppo `(app)`, quindi
    // non ha la barra affatto. La bacheca delle notifiche invece è lunga per
    // costruzione: la storia vive in localStorage, quindi si semina prima che
    // l'app parta e la lunghezza dello scorrimento è certa, non sperata.
    const storia = Array.from({ length: 40 }, (_, i) => ({
      id: `prova-scorrimento-${i}`,
      title: `Notifica ${i}`,
      body: `Corpo della notifica ${i}`,
      timestamp: Date.now() - i * 60_000,
      read: i > 0,
      type: 'info',
    }))
    await page.addInitScript(entries => {
      localStorage.setItem('notification-history', JSON.stringify(entries))
    }, storia)

    await page.goto(`${E2E_BASE_URL}/notifiche?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(nav(page)).toBeVisible({ timeout: 20_000 })

    /** Geometria e stato della barra, prima e dopo lo scorrimento. */
    const misura = () =>
      page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Navigazione principale"]') as HTMLElement
        const barra = nav.firstElementChild as HTMLElement
        const stile = getComputedStyle(barra)
        return {
          larghezzaNav: Math.round(nav.getBoundingClientRect().width),
          larghezzaBarra: Math.round(barra.getBoundingClientRect().width),
          raggio: stile.borderRadius,
          scrolled: barra.hasAttribute('data-scrolled'),
          ombra: stile.boxShadow,
          scorrevole: document.documentElement.scrollHeight - window.innerHeight > 60,
        }
      })

    const inCima = await misura()
    test.skip(!inCima.scorrevole, 'questa pagina non scorre a questo viewport: lo stato non avrebbe senso')

    // 1. LA GEOMETRIA. L'isola di iOS 26 è staccata dai lati; su Android e sul
    //    desktop la barra occupa tutta la larghezza, come da M2.
    if (atteso === 'ios') {
      expect(inCima.raggio, 'capsula: l’altezza è 49, quindi il raggio si riduce da sé').toBe('999px')
      expect(inCima.larghezzaBarra, 'l’isola lascia 8pt per lato').toBe(inCima.larghezzaNav - 16)
    } else {
      expect(inCima.raggio, 'nessuna capsula fuori da iOS').toBe('0px')
      expect(inCima.larghezzaBarra, 'la barra è larga quanto lo schermo').toBe(inCima.larghezzaNav)
    }

    // 2. A PAGINA IN CIMA niente ombra: il bordo che si accende dice «c'è del
    //    contenuto sotto», e sotto non c'è niente. È il difetto che M8 chiude —
    //    prima la barra lo dichiarava SEMPRE.
    expect(inCima.scrolled, 'a pagina in cima lo stato è spento').toBe(false)
    expect(inCima.ombra, `a pagina in cima la barra su ${atteso} non si alza`).toBe('none')

    // 3. SCORRENDO si accende: su iOS il filo chiaro di bordo, su Android
    //    l'elevazione di Material. Sul desktop NIENTE: lì la barra ha il suo
    //    filo da sempre e la M8 non tocca un pixel.
    await page.evaluate(() => window.scrollTo(0, 400))
    await expect
      .poll(async () => (await misura()).scrolled, { message: 'scorrendo la barra deve accendersi' })
      .toBe(true)

    const scorrendo = await misura()
    if (atteso === 'desktop') {
      expect(scorrendo.ombra, 'sul desktop l’ombra resta quella di prima: nessuna').toBe('none')
    } else {
      expect(scorrendo.ombra, `scorrendo la barra su ${atteso} si alza`).not.toBe('none')
    }

    // 4. LA BANDA NON SI INTERROMPE A METÀ SCHERMO. La suite gira a 320px, dove il
    //    difetto non si vede: se il limite dei 32rem finisse sulla SUPERFICIE
    //    invece che sul contenuto, su un desktop largo la barra diventerebbe una
    //    striscia di 512px in mezzo al nulla (è successo nella prima stesura di
    //    M8, e nessuna prova se n'era accorta). Qui si misura a 1280px: fuori da
    //    iOS la banda è larga quanto la barra che la contiene, su iOS è l'isola
    //    (i due distacchi, che non dipendono dalla larghezza perché si tolgono
    //    dalla PERCENTUALE e non dal massimo).
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(200)
    const largo = await misura()
    expect(
      largo.larghezzaBarra,
      atteso === 'ios' ? 'a 1280px l’isola resta staccata di 8pt per lato' : 'a 1280px la banda è a tutta larghezza, come prima di M8',
    ).toBe(atteso === 'ios' ? largo.larghezzaNav - 16 : largo.larghezzaNav)
  })

  test('la superficie dell’elenco è quella della piattaforma', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const atteso = piattaformaDelProgetto()
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}`, { waitUntil: 'domcontentloaded' })

    await comandoAzioni(page).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // iOS: «Annulla» separato (HIG). Android e desktop: la scriminatura, e
    // l'uscita è il tocco fuori dalla sheet (convenzione Material).
    if (atteso === 'ios') {
      await expect(dialog.getByRole('button', { name: 'Annulla' })).toBeVisible()
    } else {
      const scriminatura = await dialog.evaluate(
        (d) => !!d.querySelector('div[aria-hidden="true"]'),
      )
      expect(scriminatura, 'la sheet di Material ha la scriminatura').toBeTruthy()
      await expect(dialog.getByRole('button', { name: 'Annulla' })).toHaveCount(0)
    }

    // Il tocco fuori chiude, su entrambe.
    await page.mouse.click(5, 5)
    await expect(dialog).toBeHidden()
  })
})

test.describe('Le due viste di «Turni»: la lingua sta nella pagina, non nel menu', () => {
  /**
   * M2b (20/09/2026). «Turni» è UNA destinazione con DUE pagine, e il passaggio
   * fra loro era rimasto un'azione del menu («Vai a Turni ferie»): per un
   * dipendente era l'UNICA azione di quelle pagine, cioè un pulsante flottante
   * che esisteva solo per cambiare pagina. Qui si difendono le tre cose che
   * possono rompersi senza che nessun altro test se ne accorga: il selettore
   * copre le stesse pagine della destinazione, sta NELLA pagina (non nella
   * barra) e disegna la superficie della piattaforma su cui gira.
   */
  test('il selettore copre esattamente le pagine della destinazione «Turni» (parte pura)', () => {
    // Due elenchi che possono divergere sono due bug che aspettano: i percorsi
    // del selettore sono quelli della destinazione, nello stesso ordine.
    expect(TURNI_VIEWS.map((v) => v.path)).toEqual([...destinationById('turni').paths])
    expect(TURNI_VIEWS.map((v) => v.label)).toEqual(['Sala', 'Ferie'])
    // Il nome accessibile dice che è una vista dei turni: «Ferie» da sola, in
    // mezzo alla pagina, non lo direbbe.
    expect(TURNI_VIEWS.map((v) => v.ariaLabel)).toEqual(['Turni sala', 'Turni ferie'])
  })

  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('da sala si passa a ferie dal selettore, e la voce non è più nel menu delle azioni', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}`, { waitUntil: 'domcontentloaded' })

    const selettore = page.locator('[data-turni-switch]')
    await expect(selettore).toBeVisible()
    // È NELLA PAGINA, non dentro la barra: era il punto di tutta la milestone.
    expect(
      await selettore.evaluate((s) => !!s.closest('nav[aria-label="Navigazione principale"]')),
    ).toBeFalsy()
    await expect(selettore.locator('a[aria-current="page"]')).toHaveAttribute('aria-label', 'Turni sala')

    // Le voci del menu delle azioni, quando ci sono, NON contengono più il cambio
    // di vista: quella è una lingua, e sta sopra.
    const comando = comandoAzioni(page)
    if (await comando.count()) {
      await comando.click()
      await expect(page.getByRole('button', { name: 'Vai a Turni ferie' })).toHaveCount(0)
      await page.keyboard.press('Escape')
    }

    await selettore.getByLabel('Turni ferie').click()
    await page.waitForURL(/\/turniferie/, { timeout: 15_000 })

    // Sull'altra pagina è lo STESSO controllo, acceso dall'altra parte.
    const selettoreFerie = page.locator('[data-turni-switch]')
    await expect(selettoreFerie).toBeVisible()
    await expect(selettoreFerie.locator('a[aria-current="page"]')).toHaveAttribute('aria-label', 'Turni ferie')

    // E si torna indietro: la lingua è bidirezionale, non una scorciatoia.
    await selettoreFerie.getByLabel('Turni sala').click()
    await page.waitForURL(/\/turnisala/, { timeout: 15_000 })
  })

  test('la skin del selettore è quella della piattaforma', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const atteso = piattaformaDelProgetto()
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-turni-switch]')).toBeVisible()

    const skin = await page.evaluate(() => {
      const s = document.querySelector('[data-turni-switch]') as HTMLElement
      const attiva = s.querySelector('a[aria-current="page"]') as HTMLElement
      const barretta = attiva.lastElementChild as HTMLElement
      return {
        sfondo: getComputedStyle(s).backgroundColor,
        raggio: getComputedStyle(s).borderRadius,
        imbottitura: getComputedStyle(s).paddingLeft,
        altezza: Math.round(attiva.getBoundingClientRect().height),
        raggioVoce: getComputedStyle(attiva).borderTopLeftRadius,
        ombraVoce: getComputedStyle(attiva).boxShadow,
        barrettaAltezza: Math.round(barretta.getBoundingClientRect().height),
        barrettaSfondo: getComputedStyle(barretta).backgroundColor,
      }
    })

    if (atteso === 'ios') {
      // Segmented control: contenitore di sistema tinto e voce attiva rialzata.
      expect(skin.sfondo, 'il contenitore è tinto').not.toBe('rgba(0, 0, 0, 0)')
      expect(skin.raggio).toBe('9px')
      expect(skin.imbottitura).toBe('2px')
      expect(skin.altezza, 'voce a 32pt').toBe(32)
      expect(skin.raggioVoce, 'il thumb sta dentro con 2pt di imbottitura (9 − 2)').toBe('7px')
      expect(skin.ombraVoce, 'il thumb è rialzato').not.toBe('none')
      expect(skin.barrettaAltezza, 'su iOS la barretta di Material non esiste').toBe(0)
    } else {
      // Tab di Material: nessun contenitore tinto, e «sei qui» lo dice la barretta.
      expect(skin.sfondo).toBe('rgba(0, 0, 0, 0)')
      expect(skin.raggio).toBe('0px')
      expect(skin.altezza, atteso === 'android' ? 'voce a 48dp' : 'valori di base sul desktop').toBe(
        atteso === 'android' ? 48 : 40,
      )
      expect(skin.barrettaAltezza, 'barretta da 3dp').toBe(3)
      expect(skin.barrettaSfondo, 'la voce attiva ha la sua barretta').not.toBe('rgba(0, 0, 0, 0)')
    }
  })
})

test.describe('Override di QA: guardare la skin dell’altra piattaforma', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')

  test('?platform= cambia la barra davvero, non solo l’attributo', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const atteso = piattaformaDelProgetto()
    const altra: Piattaforma = atteso === 'android' ? 'ios' : 'android'
    const page = await asEmployee('Minino')

    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=${altra}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute(PLATFORM_ATTR, altra)
    await expect
      .poll(async () => nav(page).evaluate((n) => Math.round(n.getBoundingClientRect().height)))
      .toBe(ALTEZZA_BARRA[altra])
  })
})
