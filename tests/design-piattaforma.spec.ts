import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { E2E_BASE_URL } from './employee-session'
import { detectPlatformFromUA, PLATFORM_ATTR, PLATFORM_OVERRIDE_KEY } from '../lib/platform'
import { EASING_OSSERVATO, TOKEN_MOTO, assestamentoMs, linearDaMolla } from '../lib/motion'

/**
 * PIATTAFORMA E TOKEN — M1 del design system duale iOS/Android (20/09/2026).
 *
 * Le fondamenta sono per costruzione INVISIBILI: i token di base valgono i
 * valori di sempre e nessuna componente li usa ancora. Quindi non si possono
 * provare «guardando la pagina»: si provano dove l'errore si nasconderebbe,
 * cioè nel punto in cui i tre pezzi si toccano.
 *
 *   1. **Il server ha scritto `data-platform` giusto.** Il valore atteso non è
 *      scritto a mano per progetto: si prende lo User-Agent del motore che sta
 *      girando DAVVERO e lo si dà in pasto a `detectPlatformFromUA`, la stessa
 *      funzione pura che usa `app/layout.tsx`. Così la spec prova insieme il
 *      server (`headers()` → attributo) e la funzione (iPad, Android, desktop),
 *      su tre motori: Chromium desktop, WebKit/iPhone, Chromium/Pixel.
 *   2. **I token di piattaforma arrivano al browser.** `--touch-min`, la scala
 *      tipografica, il raggio della sheet, il font: il valore è quello che la
 *      piattaforma dichiara in `app/globals.css`.
 *   3. **La scala tipografica è COLLEGATA alle utility** (`text-body`,
 *      `text-title3`): è la parte che nessun controllo statico può garantire,
 *      perché dipende dal fatto che Tailwind generi le utility da `@theme
 *      inline`. Si crea un elemento con quella classe e si legge la misura.
 *   4. **Il livello 1 semantico risolve.** `--surface` deve valere esattamente
 *      quanto `--background`: sono alias, e se un giorno smettessero di
 *      risolversi il `var()` invalido farebbe sparire uno sfondo in silenzio.
 *   5. **L'override di QA funziona** (query `?platform=`, e localStorage che
 *      persiste al reload): è lo strumento con cui si guarda la skin dell'altra
 *      piattaforma dal proprio telefono. Non è la strada dei test — i test
 *      girano con i motori veri — ma se si rompesse, la QA a mano diventerebbe
 *      cieca senza che nessuno se ne accorga.
 *
 * Si usa `/login`: è pubblica (nessuna sessione necessaria) e sta sotto il
 * layout root, che è dove vive l'attributo.
 */

const PAGINA = `${E2E_BASE_URL}/login?dev=rootkind-dev-2026`

/** Contratto del livello 2: gli stessi numeri di `app/globals.css`. */
const ATTESI = {
  desktop: { touch: '40px', body: '14px', title3: '16px', sheet: '10px', font: null },
  ios: { touch: '44px', body: '15px', title3: '20px', sheet: '10px', font: '-apple-system' },
  android: { touch: '48px', body: '14px', title3: '16px', sheet: '28px', font: 'Roboto' },
} as const

type NomePiattaforma = keyof typeof ATTESI

/** La piattaforma che il PROGETTO Playwright deve far vedere (ios → WebKit/iPhone). */
function piattaformaDelProgetto(): NomePiattaforma {
  const nome = test.info().project.name
  if (nome === 'ios') return 'ios'
  if (nome === 'android') return 'android'
  return 'desktop'
}

async function token(page: Page, nome: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    nome,
  )
}

/**
 * Lo stesso token, ma RISOLTO in px.
 *
 * Serve da M6 (22/09/2026): la scala tipografica è in `rem` × `--type-scale`, così
 * l'impostazione di testo del sistema può ingrandire l'app. `getPropertyValue`
 * restituirebbe la stringa scritta nel foglio (`0.9375rem`), che non dice se il
 * token si risolve in una misura vera; qui il valore passa da una `font-size`
 * reale e torna in pixel — cioè si prova la cosa che l'utente vede.
 */
async function tokenPx(page: Page, nome: string): Promise<string> {
  return page.evaluate((n) => {
    const el = document.createElement('span')
    el.style.fontSize = `var(${n})`
    document.body.appendChild(el)
    const v = getComputedStyle(el).fontSize
    el.remove()
    return v
  }, nome)
}

async function apri(page: Page, url = PAGINA) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  // L'attributo è nell'HTML iniziale: se c'è un flash, è prima di questo momento.
  await expect(page.locator('html')).toHaveAttribute(PLATFORM_ATTR, /.+/)
}

test.describe('Piattaforma: il server scrive data-platform dallo User-Agent', () => {
  test('l’attributo è il verdetto di detectPlatformFromUA sullo User-Agent del motore', async ({ page }) => {
    const atteso = piattaformaDelProgetto()
    await apri(page)

    const vivo = await page.evaluate(() => ({
      ua: navigator.userAgent,
      touch: navigator.maxTouchPoints,
      attributo: document.documentElement.getAttribute('data-platform'),
    }))
    const verdetto = detectPlatformFromUA(vivo.ua, { maxTouchPoints: vivo.touch })

    expect(
      verdetto,
      `lo User-Agent di questo motore deve descrivere la piattaforma attesa dal progetto (${atteso}): ${vivo.ua}`,
    ).toBe(atteso)
    expect(vivo.attributo, 'il server ha scritto lo stesso verdetto nell’HTML iniziale').toBe(verdetto)
  })

  test('i token di piattaforma sono quelli dichiarati', async ({ page }) => {
    const atteso = piattaformaDelProgetto()
    await apri(page)

    expect(await token(page, '--touch-min'), 'minimo dei controlli').toBe(ATTESI[atteso].touch)
    expect(await tokenPx(page, '--fs-body'), 'corpo').toBe(ATTESI[atteso].body)
    expect(await tokenPx(page, '--fs-title3'), 'titolo di sezione').toBe(ATTESI[atteso].title3)
    expect(await token(page, '--radius-sheet'), 'angoli della sheet').toBe(ATTESI[atteso].sheet)

    const font = await token(page, '--font-ui')
    expect(font, 'il token del font deve risolversi (non un var() vuoto)').not.toBe('')
    if (ATTESI[atteso].font) {
      expect(font, `su ${atteso} il font è quello di sistema della piattaforma`).toContain(ATTESI[atteso].font)
    } else {
      // Desktop: resta il font dell'app (Geist), non quello di un telefono.
      expect(font, 'il desktop non deve scivolare su un font di piattaforma').not.toContain('Roboto')
      expect(font, 'il desktop non deve scivolare su un font di piattaforma').not.toContain('-apple-system')
    }

    /**
     * IL FONT DISEGNATO, non solo quello DICHIARATO (M6, 22/09/2026).
     *
     * Questa asserzione è nata da un difetto vero, trovato dal controllo nuovo di
     * `scripts/check-design-tokens.mjs`: `--font-ui` era dichiarato dalle skin (SF su
     * iOS, Roboto su Android) e APPLICATO da nessuno — il `<body>` porta la classe di
     * Geist, quindi l'iPhone disegnava Geist e la skin iOS non usava il font di
     * sistema, che è la prima cosa che chiede la HIG. Le righe qui sopra guardavano il
     * TOKEN e passavano lo stesso: ora si guarda il font che il browser ha davvero
     * risolto sul body.
     */
    const disegnato = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    if (ATTESI[atteso].font) {
      expect(disegnato, `su ${atteso} il body deve DISEGNARSI col font di sistema`).toContain(ATTESI[atteso].font)
    } else {
      expect(disegnato, 'il desktop resta sul font dell’app').not.toContain('Roboto')
      expect(disegnato, 'il desktop resta sul font dell’app').not.toContain('-apple-system')
    }
  })

  /**
   * L'AREA DI TOCCO INVISIBILE (M6).
   *
   * La HIG chiede 44pt di AREA, non di disegno: su iOS un controllo può restare di
   * 32px e allargare la zona che risponde al dito. Si misura la scatola dello
   * pseudo-elemento, che è ciò che il dito colpisce davvero.
   * Su Android e desktop la regola NON deve esistere: lì il ripple di Material
   * richiede `overflow: hidden` sul controllo, quindi l'allargamento sarebbe finto —
   * il bersaglio non crescerebbe. La via, su Android, è la taglia vera (M9).
   */
  test('l’area di tocco si allarga solo dove può allargarsi davvero', async ({ page }) => {
    const suIOS = piattaformaDelProgetto() === 'ios'
    await apri(page)

    const area = await page.evaluate(() => {
      const el = document.createElement('span')
      el.className = 'touch-expand'
      el.style.cssText = 'display:inline-block;width:20px;height:20px'
      document.body.appendChild(el)
      const s = getComputedStyle(el, '::after')
      const out = { larghezza: s.width, altezza: s.height }
      el.remove()
      return out
    })

    if (suIOS) {
      expect(area.larghezza, 'iOS: il controllo è 20px, l’area che risponde è 44').toBe('44px')
      expect(area.altezza, 'iOS: idem in altezza').toBe('44px')
    } else {
      expect(area.larghezza, 'altrove la regola non esiste: nessun allargamento finto').not.toBe('44px')
      expect(area.altezza, 'altrove la regola non esiste: nessun allargamento finto').not.toBe('44px')
    }
  })

  test('la scala tipografica è collegata alle utility di Tailwind', async ({ page }) => {
    const atteso = piattaformaDelProgetto()
    await apri(page)

    const misure = await page.evaluate(() => {
      const misura = (classe: string) => {
        const el = document.createElement('span')
        el.className = classe
        el.textContent = 'x'
        document.body.appendChild(el)
        const fs = getComputedStyle(el).fontSize
        el.remove()
        return fs
      }
      return { body: misura('text-body'), title3: misura('text-title3'), caption: misura('text-caption') }
    })

    expect(misure.body, 'text-body deve valere --fs-body').toBe(ATTESI[atteso].body)
    expect(misure.title3, 'text-title3 deve valere --fs-title3').toBe(ATTESI[atteso].title3)
    expect(misure.caption, 'text-caption deve valere --fs-caption').toBe(await tokenPx(page, '--fs-caption'))
  })

  test('il livello semantico sono alias veri, non valori copiati', async ({ page }) => {
    await apri(page)

    const coppie = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      const v = (n: string) => cs.getPropertyValue(n).trim()
      return {
        surface: [v('--surface'), v('--background')],
        container: [v('--surface-container'), v('--card')],
        onSurface: [v('--on-surface'), v('--foreground')],
        separator: [v('--separator'), v('--border')],
        danger: [v('--danger'), v('--destructive')],
      }
    })

    for (const [nome, [alias, bersaglio]] of Object.entries(coppie)) {
      expect(alias, `${nome}: l’alias deve risolvere (var() sostituito)`).not.toBe('')
      expect(alias, `${nome}: l’alias deve valere quanto il token di base`).toBe(bersaglio)
    }
  })
})

test.describe('Override di QA: guardare la skin dell’altra piattaforma', () => {
  test('?platform= riscrive l’attributo e i token senza toccare il server', async ({ page }) => {
    const atteso = piattaformaDelProgetto()
    const altra: NomePiattaforma = atteso === 'android' ? 'ios' : 'android'

    await apri(page, `${PAGINA}&platform=${altra}`)

    await expect(page.locator('html')).toHaveAttribute(PLATFORM_ATTR, altra)
    expect(await token(page, '--touch-min'), `con l’override ${altra} i controlli cambiano minimo`).toBe(
      ATTESI[altra].touch,
    )
    const font = await token(page, '--font-ui')
    expect(font, `con l’override ${altra} cambia anche il font`).toContain(ATTESI[altra].font as string)
  })

  test('la scelta salvata in localStorage vince al reload (senza query)', async ({ page }) => {
    const atteso = piattaformaDelProgetto()
    const altra: NomePiattaforma = atteso === 'android' ? 'ios' : 'android'

    await apri(page)
    await page.evaluate(
      ([chiave, valore]) => localStorage.setItem(chiave, valore),
      [PLATFORM_OVERRIDE_KEY, altra] as const,
    )
    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.locator('html')).toHaveAttribute(PLATFORM_ATTR, altra)
    expect(await token(page, '--touch-min')).toBe(ATTESI[altra].touch)
  })
})

/**
 * IL MOTO (M7, 22/09/2026).
 *
 * Le molle sono token del foglio di stile e i valori sono GENERATI da
 * `lib/motion.ts`: qui si prova che i due coincidano davvero, sul browser vero.
 * È la stessa idea della piattaforma (`detectPlatformFromUA` importata invece di
 * riscritta) applicata al movimento: il valore atteso non è scritto a mano nella
 * spec, è quello che la libreria calcola — quindi se un giorno qualcuno "aggiusta"
 * una molla nel CSS senza passare dalla fisica, questa spec lo prende.
 *
 * Le due cose che si provano, e perché:
 *  1. ogni molla è quella calcolata, e ogni DURATA è il tempo di assestamento della
 *     molla che governa (una molla con la durata sbagliata è una molla tagliata a
 *     metà: il rimbalzo non si vede);
 *  2. con «riduci movimento» le molle smettono di rimbalzare — la promessa di
 *     accessibilità di M7, che senza prova sarebbe solo un commento nel CSS.
 */
test.describe('Moto: le molle sono quelle calcolate, e chi chiede meno movimento le ottiene', () => {
  /** La skin CSS in gioco: il desktop resta sui valori di base. */
  function skin(): 'ios' | 'android' {
    return piattaformaDelProgetto() === 'android' ? 'android' : 'ios'
  }

  const molle = Object.fromEntries(TOKEN_MOTO.map((m) => [m.ruolo, m])) as Record<
    string,
    (typeof TOKEN_MOTO)[number]
  >

  test('ogni molla del foglio di stile è quella di lib/motion.ts, e la durata è il suo assestamento', async ({
    page,
  }) => {
    await apri(page)

    for (const voce of TOKEN_MOTO) {
      expect(await token(page, voce.token), `${voce.token} (${skin()})`).toBe(linearDaMolla(voce[skin()]))
    }

    // In CSS una molla va in coppia con una durata: se resta quella di prima, il
    // campione viene tagliato e il rimbalzo non si vede. La durata non è un numero
    // a parte, è il tempo di assestamento della molla che la governa.
    expect(await token(page, '--motion-duration-enter'), 'il pannello che sale').toBe(
      `${assestamentoMs(molle.pop[skin()])}ms`,
    )
    expect(await token(page, '--motion-duration-exit'), 'il velo che si accende').toBe(
      `${assestamentoMs(molle.fade[skin()])}ms`,
    )
    expect(await token(page, '--motion-duration-press'), 'la pressione e il suo ritorno').toBe(
      `${assestamentoMs(molle.press[skin()])}ms`,
    )
  })

  test('la pressione risponde alla molla su ENTRAMBE le skin', async ({ page }) => {
    await apri(page)
    if (piattaformaDelProgetto() === 'desktop') return

    // La pressione è la prova che le molle non sono token decorativi: iOS le usa
    // per il RITORNO del controllo che si è ritirato, Android per la velatura di
    // stato (famiglia effects). Fino a ieri Android non le usava affatto.
    const scatti = await page.evaluate(() => {
      const letture: string[] = []
      for (const foglio of Array.from(document.styleSheets)) {
        let regole: CSSRuleList
        try {
          regole = foglio.cssRules
        } catch {
          continue
        }
        for (const regola of Array.from(regole)) {
          const testo = regola.cssText
          if (testo.includes(":active") || testo.includes("::after")) letture.push(testo)
        }
      }
      return letture.join('\n')
    })

    const atteso = skin() === 'ios' ? 'transform' : 'background'
    expect(scatti, `la pressione ${skin()} deve dichiarare la molla`).toContain('var(--motion-spring-press)')
    expect(scatti, `la molla della pressione su ${skin()} deve governare ${atteso}`).toMatch(
      new RegExp(`${atteso}[^;]*var\\(--motion-spring-press\\)`),
    )
  })

  test('con «riduci movimento» le molle smettono di rimbalzare', async ({ page }) => {
    const suDesktop = piattaformaDelProgetto() === 'desktop'
    await apri(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })

    for (const voce of TOKEN_MOTO) {
      const valore = await token(page, voce.token)
      expect(valore, `${voce.token}: niente molla campionata quando l'utente chiede meno movimento`).not.toContain(
        'linear(',
      )
      // Sulle due piattaforme il collasso porta all'easing sobrio di quella skin;
      // sul desktop le molle non esistevano già prima, e restano l'easing di base
      // (cioè: il desktop non si muove, come promesso da M6 in poi).
      if (!suDesktop) expect(valore, `${voce.token}: collassa su --motion-ease-standard`).toBe(EASING_OSSERVATO[skin()])
    }
  })
})
