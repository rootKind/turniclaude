import { expect, type Page } from '@playwright/test'
import { E2E_BASE_URL } from './employee-session'

/** Helper di /turnisala per i test E2E: aprire un giorno+turno e leggere le card. */

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** Le chip gialle sono gli span con lo stile inline della fill trasferte. */
export const CHIP_SELECTOR = 'span[style*="altri-pill"]'

export interface BoardTarget {
  /** Mese 1-12. */
  month: number
  /** Giorno del mese (1-31). Se assente resta il giorno corrente della board. */
  day?: number
  year?: number
  /** Turno da selezionare; se assente resta quello corrente. */
  shift?: 'M' | 'P' | 'N'
}

export interface BoardCard {
  title: string
  highlighted: boolean
  /** Testo delle chip gialle della card («Di Meo», «BarraA», «— scoperto»…). */
  chips: string[]
  text: string
}

/** Card della board, nell'ordine di rendering. */
export async function boardCards(page: Page): Promise<BoardCard[]> {
  return page.evaluate(chipSel => {
    const out: Array<{ title: string; highlighted: boolean; chips: string[]; text: string }> = []
    for (const c of document.querySelectorAll('.sala-card-bg')) {
      out.push({
        title: c.querySelector('.sala-card-title')?.textContent?.trim() ?? '',
        highlighted: c.className.includes('desk-card-highlight'),
        chips: [...c.querySelectorAll(chipSel)].map(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
        text: (c as HTMLElement).innerText.replace(/\s*\n+\s*/g, ' | ').trim(),
      })
    }
    return out
  }, CHIP_SELECTOR)
}

/**
 * Chiude il dialog «Novità di questa versione» (components/providers/
 * changelog-dialog.tsx): si apre ~1,5 s dopo l'avvio per gli utenti che non
 * l'hanno mai visto e rende INERTE la pagina sottostante (i click su trigger e
 * turni vengono intercettati dall'overlay). Si chiude con Escape o sul backdrop,
 * NON con «Continua»: quello chiama markChangelogSeen e scriverebbe sul profilo
 * di una persona vera — un test non deve mutare dati reali.
 *
 * Esportata: il dialog è dell'APP, non di /turnisala — serve a ogni pagina
 * autenticata (es. i test di /tuoturno).
 */
export async function dismissChangelog(page: Page) {
  const dialog = page.locator('[data-slot="dialog-content"]', { hasText: 'Novità di questa versione' })
  const overlay = page.locator('[data-slot="dialog-overlay"]')
  for (let i = 0; i < 5 && !(await dialog.count()); i++) await page.waitForTimeout(400)
  if (!(await dialog.count())) return
  for (let i = 0; i < 3; i++) {
    if (!(await overlay.count())) return
    if (i === 0) await page.keyboard.press('Escape')
    else await overlay.first().click({ position: { x: 4, y: 4 } }).catch(() => {})
    await overlay.first().waitFor({ state: 'detached', timeout: 2500 }).catch(() => {})
  }
}

/**
 * Apre il pannello dei giorni: un pannello dell'app con il suo backdrop
 * `div.fixed.inset-0` (NON il dialog del changelog, che ha
 * `data-slot="dialog-overlay"`). Mese, anno e giorno si scelgono tutti dentro
 * questa apertura.
 */
async function openDayPicker(page: Page) {
  if (await page.locator('select[aria-label="Scegli mese"]').isVisible().catch(() => false)) return
  const trigger = page.locator('button', { has: page.locator('svg.lucide-chevron-down') }).first()
  await trigger.click()
  await page.waitForSelector('select[aria-label="Scegli mese"]', { timeout: 10_000 })
}

/**
 * Apre /turnisala al giorno/turno indicato. Ritorna `false` se la pagina NON è
 * autenticata (nessuna board): così il test può saltare invece di fallire.
 */
export async function openBoard(page: Page, target: BoardTarget, baseUrl = E2E_BASE_URL): Promise<boolean> {
  await page.goto(`${baseUrl}/turnisala?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  const ready = await page
    .waitForSelector('.sala-card-bg', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  if (!ready) {
    if (!page.url().includes('/turnisala')) return false   // non autenticato
    throw new Error(`board non caricata (URL: ${page.url()})`)
  }
  await dismissChangelog(page)

  if (target.day) {
    await openDayPicker(page)
    await page.selectOption('select[aria-label="Scegli mese"]', String(target.month - 1))
    await page.selectOption('select[aria-label="Scegli anno"]', String(target.year ?? 2026))
    await page.waitForTimeout(400)
    const giorno = page.locator(`.cal-panel button[aria-label*=" ${target.day} ${MESI[target.month - 1]} ${target.year ?? 2026}"]`).first()
    await expect(giorno).toBeVisible()
    await giorno.click()
    await page.waitForTimeout(1300)
  }

  if (target.shift) {
    await dismissChangelog(page)   // può aprirsi a metà navigazione (timer 1,5 s)
    await page.locator('button', { hasText: new RegExp(`^${target.shift}$`) }).first().click()
    await page.waitForTimeout(800)
  }
  return true
}

/** Titoli delle card evidenziate (la card «sei tu» del dipendente loggato). */
export async function highlightedCards(page: Page): Promise<string[]> {
  return (await boardCards(page)).filter(c => c.highlighted).map(c => c.title)
}

export function cardByTitle(cards: BoardCard[], title: string): BoardCard | undefined {
  return cards.find(c => c.title === title)
}
