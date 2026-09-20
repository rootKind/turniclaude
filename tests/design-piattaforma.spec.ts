import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { E2E_BASE_URL } from './employee-session'
import { detectPlatformFromUA, PLATFORM_ATTR, PLATFORM_OVERRIDE_KEY } from '../lib/platform'

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
    expect(await token(page, '--fs-body'), 'corpo').toBe(ATTESI[atteso].body)
    expect(await token(page, '--fs-title3'), 'titolo di sezione').toBe(ATTESI[atteso].title3)
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
    expect(misure.caption, 'text-caption deve valere --fs-caption').toBe(await token(page, '--fs-caption'))
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
