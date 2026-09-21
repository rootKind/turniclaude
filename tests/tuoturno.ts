import { expect, type Locator, type Page } from '@playwright/test'
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

interface CellCode {
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
 * Il comando delle azioni di /tuoturno: apre e chiude l'elenco delle azioni.
 *
 * M2 (20/09/2026): non è più il FAB DENTRO la barra — è la superficie delle
 * azioni che sta sopra la barra, e la sua forma dipende dalla piattaforma (pill
 * su iOS, FAB su Android). I nomi accessibili non sono cambiati, quindi questo
 * helper continua a funzionare come prima.
 */
export function fabTurno(page: Page) {
  return page.getByRole('button', { name: /^(Azioni turno|Chiudi menu)$/ })
}

/**
 * Apre una voce dell'elenco delle azioni (comando → voce). Le voci si chiamano:
 * «Personalizza colori e stile delle card», «Confronta i turni di più dipendenti».
 *
 * PERCHÉ ESISTE, invece di due click scritti a mano negli spec: il menu è di
 * `bottom-nav`, l'ascoltatore dell'evento che apre il pannello è della pagina
 * (`tuoturno-client`). Due componenti, due tempi di idratazione: se il click
 * arriva mentre la pagina non ha ancora agganciato il suo `useEffect`, l'evento
 * cade nel vuoto — il menu si chiude e il pannello non si apre (visto dal vivo
 * a dev server FREDDO, con più browser che compilano insieme).
 *
 * Qui si fa la parte che si può fare senza dormire: si parte da menu chiuso e si
 * ASPETTA che la voce sia davvero comparsa prima di cliccarla. Chi chiama, se il
 * suo pannello non è comparso, riprova la voce: vedi `apriVoceFabConRitentativo`.
 */
async function apriVoceFab(page: Page, nomeVoce: string): Promise<void> {
  const fab = fabTurno(page)
  // Se il menu era rimasto aperto (tentativo precedente andato a vuoto), il click
  // sul FAB lo CHIUDEREBBE: si riparte sempre da menu chiuso.
  if ((await fab.getAttribute('aria-label')) === 'Chiudi menu') await fab.click()
  await fab.click()
  const voce = page.getByRole('button', { name: nomeVoce })
  const comparsa = await voce.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)
  if (!comparsa) throw new Error(`il menu del FAB non si è aperto: «${nomeVoce}» non è comparso`)
  await voce.click()
}

/**
 * Apre la voce del FAB e aspetta che il pannello che ne consegue si APRA davvero,
 * riprovando la voce (fino a `tentativi` volte) se è andata a vuoto. Ritorna il
 * locator del pannello, già atteso visibile: chi chiama lo usa com'è.
 *
 * Non è un'attesa a tempo travestita: ogni tentativo è un'interazione vera, e la
 * condizione d'uscita è il pannello visibile (non «sono passati N ms»).
 */
export async function apriVoceFabConRitentativo(
  page: Page,
  nomeVoce: string,
  pannello: Locator,
  tentativi = 3,
): Promise<Locator> {
  for (let t = 0; t < tentativi; t++) {
    const gia = await pannello.isVisible().catch(() => false)
    if (gia) return pannello
    await apriVoceFab(page, nomeVoce)
    const aperto = await pannello.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false)
    if (aperto) return pannello
  }
  await expect(pannello, `il pannello di «${nomeVoce}» non si è aperto`).toBeVisible()
  return pannello
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
