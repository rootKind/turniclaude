import { expect, type Page } from '@playwright/test'
import { E2E_BASE_URL } from './employee-session'
import { dismissChangelog } from './sala-board'

/**
 * Helper di /tuoturno («Il tuo turno»): aprire il calendario di una persona in un
 * mese preciso e leggere i codici delle celle con la loro misura.
 *
 * Serve in particolare ai CODICI LUNGHI (richiesta 15/09/2026): la griglia è a 7
 * colonne fisse dentro max-w-lg, quindi la cella va da 37px (320px di schermo) a
 * 65px (≥512px) e i codici del PDF arrivano a 6-7 caratteri (MM3M40, MDCCM…).
 */

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

/** Larghezze di schermo da provare (i codici devono entrare a TUTTE). */
export const LARGHEZZE = [320, 360, 375, 390, 414, 512, 768, 1280]

export interface CellCode {
  /** Testo del codice («MM3M40», «MDCCM», «M7»…). */
  label: string
  /** Font-size calcolato (px). */
  font: number
  /** Righe su cui è disegnato il codice. */
  lines: number
  /** true se il testo è TAGLIATO (ellipsis): la regressione da non riammettere. */
  clipped: boolean
  cellW: number
}

/**
 * Apre /tuoturno sul mese indicato e (se `who` è dato) sul calendario di quella
 * persona, scelta dal selettore «Turni di chi?» — così un solo login basta a
 * guardare le celle di chiunque abbia codici lunghi.
 */
export async function openCalendar(
  page: Page,
  who?: string,
  target: { year: number; month: number } = { year: 2026, month: 9 },
): Promise<void> {
  await page.goto(`${E2E_BASE_URL}/tuoturno?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.cell-day').first()).toBeVisible({ timeout: 30_000 })
  await dismissChangelog(page)

  // Mese e anno si scelgono in due click (bottone mese/anno → pannello): il mese
  // tiene l'anno corrente, l'anno tiene il mese corrente — l'ultimo click vince.
  await page.getByLabel('Scegli mese e anno').click()
  await page.locator('.month-pop button', { hasText: new RegExp(`^${MESI[target.month - 1]}$`) }).first().click()
  await page.getByLabel('Scegli mese e anno').click()
  await page.locator('.month-pop button', { hasText: new RegExp(`^${target.year}$`) }).first().click()
  await expect(page.locator('.cell-day').first()).toBeVisible()

  if (!who) return
  await page.getByLabel('Scegli di chi vedere i turni').click()
  await page.getByPlaceholder('Cerca cognome o nome…').fill(who)
  const voce = page.locator('[data-slot="dialog-content"] button', { hasText: new RegExp(`^${who}`, 'i') }).first()
  // La lista si filtra mentre si scrive: si ASPETTA la voce (era un'attesa fissa
  // di 250 ms, che su una ricerca lenta diventava un falso «non trovato»).
  const trovata = await voce.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
  if (!trovata) {
    await page.keyboard.press('Escape')
    await page.locator('[data-slot="dialog-overlay"]').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
    throw new Error(`«${who}» non è nel selettore di /tuoturno (serve un utente dell'anagrafica)`)
  }
  await voce.click()
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0)
}

/**
 * Codici disegnati nelle celle del calendario, con font, numero di righe e stato
 * di taglio. `clipped` è la misura che conta: clientWidth < scrollWidth significa
 * che l'ellipsis è subentrata (il codice non si legge).
 */
export async function cellCodes(page: Page): Promise<CellCode[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.cell-day')].flatMap(cell => {
      const cellW = Math.round(cell.getBoundingClientRect().width)
      return [...cell.querySelectorAll('.cell-fit-text')].map(s => {
        const cs = getComputedStyle(s)
        const font = parseFloat(cs.fontSize)
        const lineH = parseFloat(cs.lineHeight) || font
        const box = s.getBoundingClientRect()
        return {
          label: (s.textContent ?? '').replace(/\s+/g, ' ').trim(),
          font: +font.toFixed(2),
          lines: Math.max(1, Math.round(box.height / lineH)),
          clipped: s.scrollWidth > s.clientWidth + 1,
          cellW,
        }
      })
    }),
  )
}
