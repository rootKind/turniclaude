import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Smoke: NESSUN testo di card troncato nel Confronto, a 320px (piccolo) e
 * 390px (iPhone Pro Max). Tre bersagli:
 *  1. mockup statico 320px (peggior caso: TUTOR, DCIF, F.E., Trasf…) — file://;
 *  2. mockup dashed + due righe (card split/strike e card sm) — file://;
 *  3. l'app REALE su localhost:3000 (dev server già avviato, vedi .freebuff/run.md):
 *     SENZA sessione il test salta (Supabase tiene la sessione in cookie httpOnly,
 *     non riproducibile qui) — i mockup 1-2 sono la rete di regressione vera.
 *
 * «Troncato» = scrollWidth > clientWidth su una riga con `truncate`
 * (white-space: nowrap + overflow hidden): l'ellipsis sta sostituendo lettere.
 */
// Percorsi dal CWD del progetto (Playwright lancia i test dalla root).
const MOCK_320 = pathToFileURL(resolve('mockups/confronta-320px.html')).href
const MOCK_DASHED = pathToFileURL(resolve('mockups/confronta-dashed-e-due-righe.html')).href

const WIDTHS = [320, 390]

/** Testi di card il cui contenuto sfora la propria box (ellipsis attiva). */
async function findClipped(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(sel => {
    const bad: string[] = []
    document.querySelectorAll(sel).forEach(el => {
      const box = el as HTMLElement
      const inner = box.innerText.trim()
      if (!inner) return
      if (box.scrollWidth > box.clientWidth) {
        bad.push(`${sel} "${inner}" scroll=${box.scrollWidth} client=${box.clientWidth}`)
      }
    })
    return bad
  }, selector)
}

test.describe('Confronto: nessun testo di card troncato', () => {
  for (const width of WIDTHS) {
    test(`mockup 320px (peggior caso) @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 640 })
      await page.goto(MOCK_320)
      await expect(page.locator('.card').first()).toBeVisible()
      // Lo script del mockup applica il cap colonne (stessa formula dell'app):
      // nessuna riga di testo può uscire dalla propria card.
      const clipped = await findClipped(page, '.card .r1, .card .cmp-sec, .card .one')
      expect(clipped, clipped.join('\n')).toEqual([])
      // E il frame 320px non deve avere scroll orizzontale.
      const overflow = await page.evaluate(() => {
        const t = document.querySelector('.cmp-table')!
        return { sw: t.scrollWidth, cw: t.clientWidth }
      })
      expect(overflow.sw, `scrollWidth ${overflow.sw} > clientWidth ${overflow.cw}`).toBeLessThanOrEqual(overflow.cw)
    })

    test(`mockup dashed + due righe @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 640 })
      await page.goto(MOCK_DASHED)
      await expect(page.locator('#mock-cmp-table .card-sm').first()).toBeVisible()
      // Card lg (split/strike/badge) e card sm (due righe turno+sezione).
      const clippedCards = await findClipped(page, '.card-lg, .card-sm')
      expect(clippedCards, clippedCards.join('\n')).toEqual([])
      // Le righe interne (badge, codici, sezioni) non devono sforare a loro volta.
      const clippedLines = await findClipped(page, '.day-badge, .code-lg, .theo-lg, .strike, .r1, .cmp-sec, .one')
      expect(clippedLines, clippedLines.join('\n')).toEqual([])
      // NOTA: qui NON si assertisce l'overflow della tabella demo — è larga per
      // DESIGN (5 colonne fisse di card 44px+ in un frame non responsive) e non
      // replica il cap-colonne dell'app. La garanzia «zero scroll orizzontale»
      // si verifica nel mockup 320px (che applica la formula del cap) e nell'app.
      // E il fix del tratteggio regge: le card split NON devono avere bordo
      // proprio (il perimetro lo disegnano le metà).
      const splitBorder = await page.evaluate(() => {
        const el = document.querySelector('#mock-split-dashed') as HTMLElement | null
        return el ? getComputedStyle(el).borderTopWidth : 'missing'
      })
      expect(splitBorder, 'la card split deve avere border-width 0 (il bordo è delle metà)').toBe('0px')
    })

    test(`app reale: tabella di confronto @ ${width}px`, async ({ page }) => {
      test.setTimeout(45_000)
      await page.setViewportSize({ width, height: 844 })
      // ?dev=rootkind-dev-2026 è la backdoor ufficiale del progetto (PwaGuard):
      // senza, un browser NON-PWA viene reindirizzato a /installa prima ancora
      // del check auth. Il guard salva il bypass in localStorage e toglie il
      // parametro dall'URL.
      await page.goto('http://localhost:3000/tuoturno?dev=rootkind-dev-2026', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1_500) // il guard decide dopo il mount
      if (!page.url().includes('/tuoturno')) {
        test.skip(true, `app non autenticata in questo browser di test: ${page.url()}`)
      }
      await expect(page.locator('main')).toBeVisible()
      // Apri il Confronto: FAB → mini-fab Users → prime due persone → conferma.
      await page.getByRole('button', { name: 'Azioni turno' }).click()
      await page.getByRole('button', { name: 'Confronta i turni di più dipendenti' }).click()
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      // Righe-persone: nome e cognome (≥2 parole) — esclude l'X senza testo e i
      // bottoni del footer («Azzera», «Scegli almeno 2», «Confronta (n)»).
      const choices = dialog.getByRole('button').filter({ hasText: /\S+ \S+/ }).filter({ hasNotText: /^(Azzera|Scegli almeno 2|Chiudi confronto|Confronta \()/ })
      await choices.nth(0).click()
      await choices.nth(1).click()
      await dialog.getByRole('button', { name: /Confronta \(2\)/ }).click()
      const table = page.locator('.cmp-table')
      const opened = await table.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)
      if (!opened) test.skip(true, 'la tabella non si è aperta (elenco persone o dati mancanti)')
      // NESSUN testo di card troncato (turno, sezione, codici interi).
      const clipped = await findClipped(page, '.cmp-table .cell-day')
      expect(clipped, clipped.join('\n')).toEqual([])
      // E niente barra di scorrimento orizzontale: il cap colonne deve bastare.
      const overflow = await page.evaluate(() => {
        const t = document.querySelector('.cmp-table')!
        return { sw: t.scrollWidth, cw: t.clientWidth }
      })
      expect(overflow.sw, `scrollWidth ${overflow.sw} > clientWidth ${overflow.cw}`).toBeLessThanOrEqual(overflow.cw)
    })
  }
})
