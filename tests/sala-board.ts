import { expect, type Page } from '@playwright/test'
import { E2E_BASE_URL } from './employee-session'
import { browserPreparato } from './browser-setup'

/** Helper di /turnisala per i test E2E: aprire un giorno+turno e leggere le card. */

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** Il bottone della data nella toolbar (testo «GIO 25 SETTEMBRE 2026»). */
const TRIGGER_DATA = 'button:has(svg.lucide-chevron-down)'

/** Prime tre lettere dei mesi, come le mostra il trigger (maiuscole, 3 lettere). */
const MESI_BREVI = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC']

/**
 * Lascia disegnare al browser DUE frame.
 *
 * Serve dove conta la MISURA (rettangoli delle chip, scrollWidth, righe di
 * testo): React ha gia committato, ma il layout no. E il rimpiazzo esatto delle
 * attese fisse che questa suite usava per «aspettare che si assesti» (200-350 ms
 * a bottone, per decine di bottone → minuti buttati).
 */
export async function riposa(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
}

/** Mese e anno che la board sta mostrando ADESSO, letti dal trigger della data. */
async function dataMostrata(page: Page): Promise<{ mese: number; anno: number } | null> {
  const testo = await page.locator(TRIGGER_DATA).first().innerText().catch(() => '')
  const maiuscolo = testo.toUpperCase()
  const anno = maiuscolo.match(/\b(20\d{2})\b/)
  const mese = MESI_BREVI.findIndex(m => maiuscolo.includes(m))
  if (!anno || mese < 0) return null
  return { mese: mese + 1, anno: Number(anno[1]) }
}

/** Le chip gialle sono gli span con lo stile inline della fill trasferte. */
const CHIP_SELECTOR = 'span[style*="altri-pill"]'

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
  /** Nomi dell'EQUIPAGGIO (elenco + tirocinanti), senza le chip gialle: serve a
   *  distinguere chi c'è per turno da chi c'è SOLO come chip gialla. */
  names: string
  text: string
}

/** Card della board, nell'ordine di rendering. */
export async function boardCards(page: Page): Promise<BoardCard[]> {
  return page.evaluate(chipSel => {
    const out: Array<{ title: string; highlighted: boolean; chips: string[]; names: string; text: string }> = []
    for (const c of document.querySelectorAll('.sala-card-bg')) {
      // Nomi dell'equipaggio = testo delle aree nomi SENZA le chip gialle
      // (che stanno o in coda o al posto del nome).
      const names = [...c.querySelectorAll('.sala-card-body, .sala-card-tir')]
        .map(area => {
          const clone = area.cloneNode(true) as HTMLElement
          clone.querySelectorAll(chipSel).forEach(el => el.remove())
          return clone.textContent ?? ''
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      out.push({
        title: c.querySelector('.sala-card-title')?.textContent?.trim() ?? '',
        highlighted: c.className.includes('desk-card-highlight'),
        chips: [...c.querySelectorAll(chipSel)].map(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
        names,
        text: (c as HTMLElement).innerText.replace(/\s*\n+\s*/g, ' | ').trim(),
      })
    }
    return out
  }, CHIP_SELECTOR)
}

/**
 * Quante volte la card dice «— scoperto»: chip gialla OPPURE riga di TESTO.
 *
 * Dal 16/09/2026 (sera) la scopertura si scrive in due modi: con la chip gialla
 * dove è un allarme (presente/futuro, minimo > 0) e come un NOME della card nei
 * giorni passati e dove il minimo in vigore è 0 (sezione scoperta da programma).
 * Le due forme non convivono sulla stessa riga, quindi si sommano: chi legge il
 * conteggio non deve sapere in che modalità è la board.
 */
export function scopertiIn(card: BoardCard): number {
  const testuali = (card.names.match(/—\s*scoperto/g) ?? []).length
  const chips = card.chips.filter(t => t.includes('scoperto')).length
  return testuali + chips
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
  // Con il contesto preparato (tests/browser-setup.ts) i dati del changelog sono
  // bloccati: il dialog non si apre MAI e questo sondaggio costerebbe 2 s a vuoto
  // a ogni navigazione — era la voce piu cara dell'intera suite.
  if (browserPreparato(page)) return
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
 * Chiude il pannello dei giorni senza scegliere niente.
 *
 * Il pannello non risponde a Escape e il suo backdrop (`div.fixed.inset-0.z-40`)
 * copre anche il trigger che l'ha aperto: il click si consegna DIRETTAMENTE
 * all'elemento (`element.click()`), senza l'hit-test di Playwright — la stessa
 * mossa di `openSalaAdminFab` per la pressione lunga del mini-Fab.
 */
async function chiudiDayPicker(page: Page): Promise<void> {
  const consegnato = await page.evaluate(() => {
    const panel = document.querySelector('.cal-panel')
    const backdrop = panel?.parentElement?.querySelector('div.fixed.inset-0') as HTMLElement | null
    if (!backdrop) return false
    backdrop.click()
    return true
  })
  if (!consegnato) await page.keyboard.press('Escape')   // rete di sicurezza
  await expect(page.locator('.cal-panel')).toHaveCount(0)
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
    const anno = target.year ?? 2026
    const prima = await dataMostrata(page)
    // Selettore mese/anno: le tendine sono dentro il pannello e la griglia si
    // ridisegna da sola, quindi non serve nessuna attesa fissa (`expect(giorno)`
    // sotto e gia un'attesa).
    await openDayPicker(page)
    await page.selectOption('select[aria-label="Scegli mese"]', String(target.month - 1))
    await page.selectOption('select[aria-label="Scegli anno"]', String(anno))
    const giorno = page.locator(`.cal-panel button[aria-label*=" ${target.day} ${MESI[target.month - 1]} ${anno}"]`).first()
    await expect(giorno).toBeVisible()

    // Cambiare GIORNO dentro il mese a schermo e stato locale (i dati del mese
    // sono gia in memoria: nessuna rete, nessuna attesa). Cambiare MESE ricarica
    // il mese (IndexedDB + riconvalida): li si aspetta la risposta, con un tetto
    // di 400 ms per il caso «mese teorico», che si genera in locale.
    const cambiaMese = !prima || prima.mese !== target.month || prima.anno !== anno
    const ricarica = cambiaMese
      ? page.waitForResponse(r => r.url().includes('/rest/v1/sala_schedule'), { timeout: 2000 }).catch(() => null)
      : null

    // Sul giorno GIÀ scelto il click non fa niente: react-day-picker in modalità
    // «single» risponde `undefined` (deselezione) e la board, che ignora il click
    // vuoto, NON chiude il pannello → si resta appesi col suo backdrop sopra i
    // bottoni del turno. Caso reale, non teorico: cercare il giorno di OGGI
    // (17/09/2026 lo era), che è già quello selezionato.
    const giaScelto = await giorno.evaluate(
      el => el.hasAttribute('data-selected-single') || el.getAttribute('aria-selected') === 'true',
    )
    if (giaScelto) {
      await chiudiDayPicker(page)
    } else {
      await giorno.click()
      // Conferma del cambio giorno: il trigger della data scrive «GIO 25
      // SETTEMBRE 2026». Era un'attesa fissa di 1,3 s a ogni navigazione.
      await expect
        .poll(() => page.locator(TRIGGER_DATA).first().innerText(), {
          timeout: 5000,
          message: `il trigger della data non è passato al ${target.day} ${MESI[target.month - 1]} ${anno}`,
        })
        // `\s*` tollera il testo reso con a capo fra i pezzi («VEN 25 SETTEMBRE»)
        // e quello incollato di `textContent` («VEN25SETTEMBRE»).
        .toMatch(new RegExp(`${target.day}\\s*${MESI_BREVI[target.month - 1]}`, 'i'))
    }
    if (ricarica) await Promise.race([ricarica, page.waitForTimeout(400)])
    await riposa(page)
  }

  if (target.shift) {
    await selectShift(page, target.shift)
  }
  return true
}

/** Seleziona il turno nella toolbar della board, senza ricaricare la pagina. */
export async function selectShift(page: Page, shift: 'M' | 'P' | 'N'): Promise<void> {
  // Il changelog puo aprirsi a metà navigazione (timer 1,5 s): con il contesto
  // preparato questa chiamata è gratuita, senza è la rete di sicurezza.
  await dismissChangelog(page)
  await page.locator('button', { hasText: new RegExp(`^${shift}$`) }).first().click()
  // Il turno e stato locale: il bottone prescelto prende la classe
  // `sala-toolbar-chip` (il marcatore del turno attivo), e `riposa` lascia rifare
  // le misure di chip e card. Era un'attesa fissa di 600 ms a ogni cambio.
  await expect(
    page.locator('button.sala-toolbar-chip', { hasText: new RegExp(`^${shift}$`) }).first(),
    `il turno ${shift} non risulta selezionato`,
  ).toBeVisible({ timeout: 5000 })
  await riposa(page)
}

export interface BoardChip {
  /** Titolo della card che la contiene. */
  card: string
  /** Testo della chip («SmeragliuoloSPCA», «— scoperto»…). */
  text: string
  /** true se la CHIP (la pillola, non solo il testo) esce dall'area visibile
   *  della card: la card ha `overflow-hidden` e taglia sul suo bordo, quindi
   *  quello che sporge perde il contorno e parte del testo (regressione
   *  15/09/2026: a 390px la chip «SmeragliuoloSPCA» usciva di 22px). */
  overflowing: boolean
  /** true se il testo è finito dietro l'ellipsis. */
  clipped: boolean
  /** Righe su cui è disposta la chip (2 = la sigla è scesa sotto il nome). */
  lines: number
  /** Larghezza della chip (px). */
  width: number
  /** Font applicato al testo della chip (px). */
  font: number
}

/**
 * Chip gialle della board con le loro misure. I testi adattivi hanno la classe
 * `.sala-fit-text` (globals.css): la loro misura cambia con la larghezza della
 * card, quindi il confronto va fatto sui rettangoli resi dal browser.
 */
export async function boardChips(page: Page): Promise<BoardChip[]> {
  return page.evaluate((chipSel: string) => {
    const out: Array<{
      card: string
      text: string
      overflowing: boolean
      clipped: boolean
      lines: number
      width: number
      font: number
    }> = []
    for (const chip of document.querySelectorAll(chipSel)) {
      const card = chip.closest('.sala-card-bg')
      const cb = card?.getBoundingClientRect()
      const box = chip.getBoundingClientRect()
      const lineH = parseFloat(getComputedStyle(chip).lineHeight) || 16
      const parti = [...chip.querySelectorAll('.sala-fit-text')]
      // Limite visibile = padding box della card (overflow-hidden taglia sul
      // bordo: 1px per lato). LL confronto è sulla CHIP: il suo contorno tondo
      // è ciò che si perde, e il testo può starci dentro mentre la pillola no.
      out.push({
        card: card?.querySelector('.sala-card-title')?.textContent?.trim() ?? '',
        text: (chip.textContent ?? '').replace(/\s+/g, ' ').trim(),
        overflowing: !!cb && (box.right > cb.right - 1 || box.left < cb.left + 1),
        clipped: parti.some(el => el.scrollWidth > el.clientWidth + 1),
        lines: Math.max(1, Math.round(box.height / lineH)),
        width: Math.round(box.width),
        font: parti[0] ? +parseFloat(getComputedStyle(parti[0]).fontSize).toFixed(2) : 0,
      })
    }
    return out
  }, CHIP_SELECTOR)
}

/**
 * Righe di pixel del CORPO della card che lasciano scoperto il FONDO CARD.
 *
 * La card ha due tinte: il fondo (`.sala-card-bg`, in scuro #262626) e la
 * SUPERFICIE del corpo (`.sala-card-body`, #171717). Sotto il titolo la card
 * deve essere coperta da fasce a tutta larghezza (corpo, righe di coda, tir,
 * teorico≠reale): se una fascia manca, il fondo card si vede come una SECONDA
 * tinta dentro la stessa card — il difetto segnalato sulla board in tema scuro
 * (richiesta 16/09/2026: le card a riga con le chip in coda).
 *
 * Ritorna l'elenco (card, y) delle righe coperte soltanto dal fondo card: vuoto
 * = nessuna. I bordi (1px in alto sotto il titolo e in basso) sono esclusi.
 */
export async function cardBodyGaps(page: Page): Promise<Array<{ card: string; y: number }>> {
  return page.evaluate(() => {
    const out: Array<{ card: string; y: number }> = []
    for (const card of document.querySelectorAll('.sala-card-bg')) {
      const title = card.querySelector('.sala-card-title')
      if (!title) continue
      const cr = card.getBoundingClientRect()
      const tr = title.getBoundingClientRect()
      // Fasce = discendenti con uno sfondo NON trasparente e a tutta larghezza:
      // le chip (stretta, è la loro tinta) e i bordi non contano.
      const fasce: Array<[number, number]> = []
      for (const el of card.querySelectorAll('*')) {
        const cs = getComputedStyle(el)
        if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.visibility === 'hidden' || cs.display === 'none') continue
        const r = el.getBoundingClientRect()
        if (r.height < 2 || r.width < cr.width - 4) continue
        fasce.push([r.top - 0.5, r.bottom + 0.5])
      }
      for (let y = tr.bottom + 1; y < cr.bottom - 1; y += 2) {
        if (!fasce.some(([t, b]) => t <= y && y <= b)) {
          out.push({ card: title.textContent?.trim() ?? '', y: Math.round(y - cr.top) })
        }
      }
    }
    return out.slice(0, 40)
  })
}

export interface BoardChipColor {
  /** Titolo della card che la contiene. */
  card: string
  /** Testo della chip («AlbanoA», «MininoSPCA»…). */
  text: string
  /** Colore del testo della chip, come lo rende il browser («rgb(…)»). */
  textColor: string
  /** Colore del BORDO con la sua trasparenza («color(srgb r g b / 0.3)»). */
  borderColor: string
  /** Testi e colori dei pezzi dentro la chip (cognome, sigla). */
  children: Array<{ text: string; color: string }>
  /** Grassetto (700+) sui pezzi DENTRO la chip: true solo per l'utente loggato. */
  bold: boolean
}

/**
 * Colori RESI delle chip gialle: serve a difendere che la chip abbia una sola
 * famiglia di colori (richiesta 16/09/2026). Prima il bordo si ricavava dalla
 * tinta TRASFERTE (ambra) mentre il testo veniva dalla tinta ASSENTI: in tema
 * scuro ambra e rosa sono due famiglie lontane e la chip sembrava avere DUE
 * colori addosso. Ora il bordo segue il testo (`currentColor` 30%), come ogni
 * altra pillola dell'app: qui si confrontano i canali, non i nomi delle variabili.
 */
export async function boardChipColors(page: Page): Promise<BoardChipColor[]> {
  return page.evaluate((chipSel: string) => {
    const out: Array<{
      card: string
      text: string
      textColor: string
      borderColor: string
      children: Array<{ text: string; color: string }>
      bold: boolean
    }> = []
    for (const chip of document.querySelectorAll(chipSel)) {
      const st = getComputedStyle(chip)
      const parti = [...chip.querySelectorAll('.sala-fit-text')]
      out.push({
        card: chip.closest('.sala-card-bg')?.querySelector('.sala-card-title')?.textContent?.trim() ?? '',
        text: (chip.textContent ?? '').replace(/\s+/g, ' ').trim(),
        textColor: st.color,
        borderColor: st.borderTopColor,
        children: parti.map(el => ({ text: (el.textContent ?? '').trim(), color: getComputedStyle(el).color })),
        bold: parti.some(el => +getComputedStyle(el).fontWeight >= 700),
      })
    }
    return out
  }, CHIP_SELECTOR)
}

/**
 * I testi in GRASSETTO della board, con la card che li contiene (richiesta
 * 16/09/2026: il nome dell'utente loggato si riconosce a colpo d'occhio).
 */
export async function boldTexts(page: Page): Promise<Array<{ card: string; text: string; chip: string | null; weight: number }>> {
  return page.evaluate(() => {
    const out: Array<{ card: string; text: string; chip: string | null; weight: number }> = []
    // TUTTA la card: i nomi stanno nel corpo (`.sala-card-body`) ma le chip
    // gialle possono stare anche nelle righe di coda, che vivono fuori dal corpo.
    const foglie = [...document.querySelectorAll('.sala-card-bg span')]
      // Solo le FOGLIE: i contenitori ereditano il grassetto del figlio e
      // riporterebbero lo stesso nome due volte (il pallino ● che li accompagna
      // non è un nome e resta fuori).
      .filter(el => !el.querySelector('span'))
    for (const el of foglie) {
      const w = +getComputedStyle(el).fontWeight
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (w < 700 || !/[A-Za-z]/.test(text)) continue
      out.push({
        card: el.closest('.sala-card-bg')?.querySelector('.sala-card-title')?.textContent?.trim() ?? '',
        text,
        // La chip che la contiene (se è dentro una chip gialla): la sua SIGLA è
        // in grassetto insieme al nome, quindi appartiene all'utente anche se
        // non porta il cognome.
        chip: el.closest('span[style*="altri-pill"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
        weight: w,
      })
    }
    return out
  })
}

/**
 * Apre l'elenco delle azioni di /turnisala (admin e manager). NON è un click:
 * la superficie delle azioni si apre con una PRESSIONE LUNGA di 500 ms sul
 * comando «Azioni sala» (onPointerDown avvia il timer, onPointerUp lo annulla)
 * — esattamente la ragione per cui serve un helper invece di `page.click`.
 *
 * M2 (20/09/2026): il comando non è più dentro la barra (e su iOS non è un FAB
 * ma una pill), ma la pressione lunga è rimasta la stessa: è il canale con cui
 * questa spec raggiunge le voci, e non è stato toccato insieme alla barra per
 * non mescolare due cose in un solo commit.
 */
export async function openSalaAdminFab(page: Page): Promise<void> {
  const apri = page.getByLabel('Minimi di persone per card')
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    if (await apri.count()) return
    const fab = page.getByLabel('Azioni sala')
    if (!(await fab.count())) return
    // NIENTE pointerup: quando il menu è aperto la label del Fab diventa «Chiudi
    // menu», quindi il locator non trova più niente e l'attesa si mangerebbe il
    // timeout del test. Il timer della pressione lunga è già scattato.
    await fab.dispatchEvent('pointerdown').catch(() => {})
    await page.waitForTimeout(900)        // timer della bottom-nav: 500 ms
  }
}

/**
 * Le pill «SEI TU» della board: quelle dell'utente loggato (classe
 * `desk-own-badge`), con grassetto e spessore dell'anello interno. Nelle «altre
 * presenze» la pill dell'utente è in grassetto e con il bordo spesso (richiesta
 * 16/09/2026); le pill degli altri restano normali.
 */
export async function ownPills(page: Page): Promise<Array<{ text: string; weight: number; ring: string; bg: string }>> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.desk-own-badge')].map(el => {
      const st = getComputedStyle(el)
      return {
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        weight: +st.fontWeight,
        ring: st.boxShadow,
        bg: st.backgroundColor,
      }
    }),
  )
}


export function cardByTitle(cards: BoardCard[], title: string): BoardCard | undefined {
  return cards.find(c => c.title === title)
}
