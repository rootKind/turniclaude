import { expect, test, type Page } from '@playwright/test'

/**
 * Smoke delle PAGINE (autenticate, vedi tests/README.md per la sessione):
 *  1. /turniferie DEVE scorrere in verticale su viewport bassi (il main ora ha
 *     min-height, non height fissa: prima i figli si comprimevano sotto la nav);
 *  2. /tuoturno: il contorno «da confermare» TRATTEGGIATO ha lo STESSO spessore
 *     (2px) su card intere e sulle metà delle card SPLIT — e la linea di taglio
 *     fra le metà resta nascosta (la regola a 2px ha specificità più alta delle
 *     regole che azzerano il taglio: l'ordine/parità di specificità è partecipe
 *     del fix, non toccarla senza riverificare);
 *  3. bottom-nav: l'etichetta «Turni Sala e Ferie» (la più lunga della barra)
 *     non deve straripare né il nav non deve diventare scrollabile, nemmeno
 *     a 320px.
 * Senza sessione valida i test si AUTOSALTANO (skip, non fallimento).
 */

async function requirePage(page: Page, path: string, h1: RegExp) {
  await page.goto(`http://localhost:3000${path}?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1_500) // il PwaGuard decide dopo il mount
  if (!page.url().includes(path)) test.skip(true, `non autenticato: ${page.url()}`)
  await expect(page.locator('main h1').filter({ hasText: h1 })).toBeVisible()
}

test.describe('Pagine: turniferie scorrevole + tratteggio uniforme', () => {
  test('turniferie: scroll verticale a viewport basso (300px)', async ({ page }) => {
    test.setTimeout(45_000)
    await page.setViewportSize({ width: 375, height: 300 })
    await requirePage(page, '/turniferie', /Turni Ferie/)
    await page.waitForTimeout(800) // framer-motion + caricamento assegnazioni
    const geo = await page.evaluate(() => ({
      scrollH: document.documentElement.scrollHeight,
      viewH: window.innerHeight,
    }))
    expect(geo.scrollH, 'il contenuto deve superare il viewport (niente compressione)').toBeGreaterThan(geo.viewH)
    await page.evaluate(() => window.scrollTo(0, 99_999))
    await page.waitForTimeout(300)
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled, 'la pagina deve SCORRERE fino in fondo (il fondo non deve restare tagliato)').toBeGreaterThan(0)
    // E il main NON deve essere bloccato alla vecchia height fissa
    // calc(100dvh - 4rem) (= 236px a viewport 300): deve poter superare il viewport.
    const height = await page.evaluate(() => getComputedStyle(document.querySelector('main')!).height)
    expect(parseInt(height, 10), 'il main non deve restare alla vecchia altezza fissa').toBeGreaterThan(236)
  })

  for (const width of [320, 390]) {
    test(`tuoturno: tratteggio 2px uniforme (intera = split) @ ${width}px`, async ({ page }) => {
      test.setTimeout(45_000)
      // Preferenza tratteggio PRIMA del caricamento (il guard la legge da localStorage).
      await page.addInitScript(() => localStorage.setItem('tuoturno-pending-ring', 'yellow-dashed'))
      await page.setViewportSize({ width, height: 800 })
      await requirePage(page, '/tuoturno', /Il tuo turno/)
      await page.waitForTimeout(1_000)
      const pendings = await page.locator('.cell-day.is-pend').count()
      if (pendings === 0) test.skip(true, 'nessun giorno «da confermare» nel mese corrente')
      const r = await page.evaluate(() => {
        const split = document.querySelector('.cell-day.cell-split.is-pend > .cell-half')
        const splitTheo = document.querySelector('.cell-day.cell-split.is-pend > .cell-half-theo')
        const whole = document.querySelector('.cell-day.is-pend:not(.cell-split)')
        const w = (el: Element | null) => (el ? getComputedStyle(el).borderTopWidth : null)
        const bb = (el: Element | null) => (el ? getComputedStyle(el).borderBottomWidth : null)
        return { split: w(split), splitTheoBottom: bb(splitTheo), whole: w(whole) }
      })
      // Card SPLIT (il caso del 23/9 di Minino): metà a 2px come le card intere,
      // taglio in mezzo ancora nascosto.
      if (r.split !== null) {
        expect(r.split, 'metà della card split').toBe('2px')
        expect(r.splitTheoBottom, 'linea di taglio fra le metà').toBe('0px')
      }
      if (r.whole !== null) expect(r.whole, 'card intera').toBe('2px')
      // Almeno UNA delle due forme deve esistere (c'è ≥1 pending, verificato sopra).
      expect(r.split ?? r.whole, 'nessuna card pendente trovata nel DOM').not.toBeNull()
    })

    test(`bottom-nav: «Turni Sala e Ferie» senza overflow @ ${width}px`, async ({ page }) => {
      test.setTimeout(45_000)
      await page.setViewportSize({ width, height: 640 })
      await requirePage(page, '/tuoturno', /Il tuo turno/)
      const r = await page.evaluate(() => {
        const nav = document.querySelector('nav.fixed')
        if (!nav) return null
        const label = [...nav.querySelectorAll('button span')].find(s =>
          s.textContent?.includes('Sala e Ferie'),
        )
        if (!label) return { missing: true }
        const lr = label.getBoundingClientRect()
        const parent = label.parentElement!.getBoundingClientRect()
        const navr = nav.getBoundingClientRect()
        return {
          missing: false as const,
          text: label.textContent,
          fitsParent: lr.right <= parent.right + 0.5,
          fitsNav: navr.right >= lr.right - 0.5 && lr.left >= navr.left - 0.5,
          navScrollable: nav.scrollWidth > nav.clientWidth,
        }
      })
      expect(r, 'bottom-nav presente').not.toBeNull()
      if ((r as { missing?: boolean }).missing) test.skip(true, 'voce «Turni Sala e Ferie» non trovata nel nav')
      const g = r as { fitsParent: boolean; fitsNav: boolean; navScrollable: boolean }
      expect(g.fitsParent, 'etichetta dentro il suo bottone').toBeTruthy()
      expect(g.fitsNav, 'bottone dentro il nav').toBeTruthy()
      expect(g.navScrollable, 'nav senza scroll orizzontale').toBeFalsy()
    })
  }
})
