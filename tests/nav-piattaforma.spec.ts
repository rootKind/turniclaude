import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'
import { activeDestinationId, NAV_DESTINATIONS } from '../components/nav/nav-destinations'
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
