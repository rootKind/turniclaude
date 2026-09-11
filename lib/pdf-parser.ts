import type { DaySchedule, SalaSchedule } from '@/types/database'
import { applyTokenToDay } from '@/lib/shift-tokens'
import { encodeSalaMonth, type MonthPersonShifts } from '@/lib/sala-month'

// ─── row grouping ─────────────────────────────────────────────────────────────

interface TextItem { str: string; x: number; y: number }

function groupByRow(items: TextItem[], tolerance = 3): Array<{ y: number; items: TextItem[] }> {
  const rows: Array<{ y: number; items: TextItem[] }> = []
  for (const item of items) {
    const y = Math.round(item.y)
    let row = rows.find(r => Math.abs(r.y - y) <= tolerance)
    if (!row) { row = { y, items: [] }; rows.push(row) }
    row.items.push(item)
  }
  rows.sort((a, b) => b.y - a.y)
  rows.forEach(r => r.items.sort((a, b) => a.x - b.x))
  return rows
}

// ─── name detection ───────────────────────────────────────────────────────────

const EXCLUDED_FIRST = new Set([
  'RC', 'RI', 'RM', 'A', 'AG', 'D', 'VS', 'SPW', 'TIR', 'F',
  'GIORNO', 'GIORNI', 'COLORI', 'LEGENDA', 'SIGLE', 'COLORE',
])

function looksLikeName(token: string): boolean {
  if (token.length < 2) return false
  if (EXCLUDED_FIRST.has(token)) return false
  if (/^\d+$/.test(token)) return false
  if (/^[a-z]/.test(token)) return false
  if (/[,;()/]/.test(token)) return false  // commas/parens/slashes = footer text
  if (/^[A-Z][a-z]/.test(token) && token !== token.toUpperCase()) return false  // SpNw, SpN style codes
  return true
}

/**
 * Riga di legenda / firma a piè di pagina: non è una persona. Il confronto è sul
 * TOKEN INIZIALE (non su una sottostringa): «NAPOLI» non deve scartare i cognomi
 * che lo contengono («DI NAPOLI A.»).
 */
const LEGEND_ARTIFACTS = ['NOTE', 'LEGENDA', 'COLORI', 'SIGLE', 'GIORNI', 'GIORNO', 'NAPOLI', 'RESPONSABILE']

export function isLegendArtifact(name: string): boolean {
  const u = name.toUpperCase()
  const first = (u.match(/^[A-Z0-9]+/) ?? [''])[0]
  return LEGEND_ARTIFACTS.includes(first) || u.includes('RESPONSABILE')
}

/**
 * Il roster nel tempo cambia l'iniziale di alcuni dipendenti: qui vengono
 * unificati, così in tutta l'app restano una sola persona.
 */
const ALIAS_UTENTI: Record<string, string> = {
  'RUGGIERO': 'RUGGIERO A.',
  'ESPOSITO A.': 'ESPOSITO AU.',
}

export function nomeCanonico(name: string): string {
  return ALIAS_UTENTI[name.toUpperCase()] ?? name
}

/**
 * Returns true when x is within DAY_COL_TOLERANCE of any day-column header.
 * Inter-day spacing in these PDFs is ~25px, so 13px is < half-step.
 */
const DAY_COL_TOLERANCE = 13

/**
 * Distanza minima a sinistra della colonna del giorno 1 entro cui vive il
 * cognome: i nomi stanno a x≈53-57, mentre i frammenti di cella del giorno 1
 * (il PDF li stacca, es. «P»+«DCIF») possono scostarsi fino a ~17px dalla
 * colonna. Con 40px di margine la zona nome è inequivocabile, e i frammenti
 * fuori colonna non diventano il «nome» di una persona fantasma.
 */
const NAME_ZONE_MARGIN = 40

function isNearDayColumn(x: number, headerXMap: Record<number, number>): boolean {
  for (const hx of Object.values(headerXMap)) {
    if (Math.abs(x - hx) <= DAY_COL_TOLERANCE) return true
  }
  return false
}

function tryParseMainRowByX(
  items: TextItem[],
  headerXMap: Record<number, number>,
  daysInMonth: number,
): { name: string; shifts: string[] } | null {
  if (items.length === 0) return null
  if (headerXMap[1] === undefined) return null

  const nameZoneRight = headerXMap[1] - NAME_ZONE_MARGIN
  const nameItems: TextItem[] = []
  const shiftItems: TextItem[] = []
  for (const item of items) {
    if (isNearDayColumn(item.x, headerXMap)) shiftItems.push(item)
    else if (item.x < nameZoneRight) nameItems.push(item)
  }

  if (nameItems.length === 0 || nameItems.length > 4) return null
  if (!nameItems.every(it => looksLikeName(it.str))) return null
  const name = nameItems.map(it => it.str).join(' ')
  if (name.length > 30) return null  // footer/legend rows are always long

  const shifts = new Array<string>(daysInMonth).fill('')
  for (const item of shiftItems) {
    const day = xToDay(item.x, headerXMap)
    if (day !== null && day >= 1 && day <= daysInMonth) shifts[day - 1] = item.str
  }

  return { name, shifts }
}

// ─── pdf item merge ───────────────────────────────────────────────────────────

const DOW_LABELS = new Set(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'])

/**
 * PDF renderers sometimes split a single shift-code token across multiple text
 * items at essentially the same x-position (e.g. "PT" + "UTOR" → "PTUTOR",
 * "M" + "DCIF" → "MDCIF").  The inter-day spacing in these PDFs is ~25px, so
 * any two consecutive items within 10px are guaranteed to be part of the same
 * split token.
 */
function mergeClosePdfItems(items: TextItem[]): TextItem[] {
  const result: TextItem[] = []
  for (let i = 0; i < items.length; i++) {
    const cur = items[i]
    const nxt = items[i + 1]
    if (nxt && Math.abs(cur.x - nxt.x) <= 10) {
      result.push({ ...cur, str: cur.str + nxt.str })
      i++
    } else {
      result.push(cur)
    }
  }
  return result
}

// ─── x → day mapping ──────────────────────────────────────────────────────────

function xToDay(x: number, headerXMap: Record<number, number>): number | null {
  let best: number | null = null
  let bestDist = Infinity
  for (const [day, hx] of Object.entries(headerXMap)) {
    const d = Math.abs(x - hx)
    if (d < bestDist) { bestDist = d; best = parseInt(day) }
  }
  return best
}

// ─── celle gialle («turno da confermare») ─────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

/**
 * La legenda del PDF lo dice esplicitamente: «Sfondo Giallo = Turno da
 * confermare» (ipotesi di variazione, non ancora approvata).  Il colore non
 * esiste nel text layer: va letto dalla lista operatori, dove ogni cella è un
 * rettangolo riempito. Distinguiamo il giallo dai colori-squadra (rosa, pesca,
 * verde, azzurro) con una soglia su R/G alti e B basso.
 */
function isYellowFill(rgb: number[]): boolean {
  const [r, g, b] = rgb
  return r > 200 && g > 170 && b < 210 && (r - b) > 40 && (g - b) > 25
}

const RECT_PATH_TYPE = 19
const CELL_MIN_W = 3
const CELL_MAX_W = 80
const CELL_MIN_H = 3
const CELL_MAX_H = 40

function collectYellowCells(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  OPS: Record<string, number>,
): Rect[] {
  const cells: Rect[] = []
  const stack: Array<number[] | null> = [null]
  let curFill: number[] | null = null
  let pending: Rect | null = null

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i] as unknown[] | undefined
    if (fn === OPS.save) { stack.push(curFill); continue }
    if (fn === OPS.restore) { curFill = stack.pop() ?? null; continue }
    if (
      fn === OPS.setFillRGBColor || fn === OPS.setFillCMYKColor ||
      fn === OPS.setFillGray || fn === OPS.setFillColorN || fn === OPS.setFillColor
    ) {
      curFill = Array.from(args ?? []).map(v => Math.round(Number(v)))
      continue
    }
    if (fn === OPS.constructPath && Array.isArray(args?.[0]) && (args?.[0] as number[]).includes(RECT_PATH_TYPE) && Array.isArray(args?.[1])) {
      const c = args![1] as number[]
      pending = { x: c[0], y: c[1], w: c[2], h: c[3] }
      continue
    }
    if (
      (fn === OPS.eoFill || fn === OPS.fill || fn === OPS.fillStroke || fn === OPS.eoFillStroke) &&
      pending
    ) {
      const r = pending
      if (r.w > CELL_MIN_W && r.w < CELL_MAX_W && r.h > CELL_MIN_H && r.h < CELL_MAX_H && curFill && isYellowFill(curFill)) {
        cells.push(r)
      }
      pending = null
    }
  }
  return cells
}

// ─── page processing ──────────────────────────────────────────────────────────

interface PersonData {
  name: string
  theoreticalShifts: string[]
  modByDay: Record<number, string>
  yellowDays: number[]
}

/** Giorni marcati in giallo sulla riga con quel y (±6px dal centro della cella). */
function yellowDaysAtRow(yellowCells: Rect[], rowY: number, headerXMap: Record<number, number>, daysInMonth: number): number[] {
  const days: number[] = []
  for (const c of yellowCells) {
    const cy = c.y + c.h / 2
    if (Math.abs(cy - rowY) > 6) continue
    const day = xToDay(c.x + c.w / 2, headerXMap)
    if (day && day >= 1 && day <= daysInMonth && !days.includes(day)) days.push(day)
  }
  return days
}

function processPageRows(
  rows: Array<{ y: number; items: TextItem[] }>,
  daysInMonth: number,
  yellowCells: Rect[] = [],
): PersonData[] {
  const results: PersonData[] = []

  const headerIndices: number[] = []
  rows.forEach((r, i) => {
    const nums = r.items.filter(it => /^\d+$/.test(it.str)).map(it => parseInt(it.str))
    if (
      nums.length === daysInMonth &&
      Math.min(...nums) === 1 &&
      Math.max(...nums) === daysInMonth
    ) headerIndices.push(i)
  })
  if (headerIndices.length === 0) return results

  for (let h = 0; h < headerIndices.length; h++) {
    const headerRow = rows[headerIndices[h]]
    const headerXMap: Record<number, number> = {}
    headerRow.items.filter(it => /^\d+$/.test(it.str)).forEach(it => {
      headerXMap[parseInt(it.str)] = it.x
    })

    const groupStart = headerIndices[h] + 2
    const groupEnd = h + 1 < headerIndices.length ? headerIndices[h + 1] : rows.length
    const groupRows = rows.slice(groupStart, groupEnd)

    let pendingMod: typeof rows[0] | null = null
    for (const row of groupRows) {
      // Merge split tokens in the theoretical row before parsing
      const mergedItems = mergeClosePdfItems(row.items)
      const parsed = tryParseMainRowByX(mergedItems, headerXMap, daysInMonth)

      if (parsed) {
        const modByDay: Record<number, string> = {}
        const yellowDays = new Set(yellowDaysAtRow(yellowCells, row.y, headerXMap, daysInMonth))
        if (pendingMod) {
          // Filter DOW labels first, then merge any remaining split codes
          const filtered = pendingMod.items.filter(it => !DOW_LABELS.has(it.str))
          for (const item of mergeClosePdfItems(filtered)) {
            const day = xToDay(item.x, headerXMap)
            if (day) modByDay[day] = item.str
          }
          // Le correzioni sono stampate sulla riga sopra il dipendente: se è
          // evidenziata in giallo, il giorno è «da confermare» per lui.
          for (const d of yellowDaysAtRow(yellowCells, pendingMod.y, headerXMap, daysInMonth)) yellowDays.add(d)
        }
        results.push({
          name: parsed.name,
          theoreticalShifts: parsed.shifts,
          modByDay,
          yellowDays: [...yellowDays],
        })
        pendingMod = null
      } else {
        pendingMod = row
      }
    }
  }

  return results
}

// ─── persone del mese ────────────────────────────────────────────────────────

function monthDays(month: string): number {
  const year = parseInt(month.split('-')[0])
  const monthIdx = parseInt(month.split('-')[1])
  return new Date(year, monthIdx, 0).getDate()
}

/**
 * Unisce le persone con lo stesso nome canonico: a volte il PDF riporta due
 * blocchi per la stessa persona (nome con/senza iniziale). Vince il primo, i
 * giorni vuoti vengono riempiti dal secondo.
 */
function mergePersons(list: PersonData[], daysInMonth: number): MonthPersonShifts[] {
  const byName = new Map<string, MonthPersonShifts>()
  const order: string[] = []

  for (const p of list) {
    if (isLegendArtifact(p.name)) continue
    const name = nomeCanonico(p.name)
    const days = Array.from({ length: daysInMonth }, (_, i) => p.modByDay[i + 1] ?? p.theoreticalShifts[i] ?? '')
    const existing = byName.get(name)
    if (!existing) {
      byName.set(name, { name, days, teorico: [...p.theoreticalShifts], yellow: [...p.yellowDays] })
      order.push(name)
      continue
    }
    for (let i = 0; i < daysInMonth; i++) {
      if (!existing.days[i] && days[i]) existing.days[i] = days[i]
      if (!existing.teorico[i] && p.theoreticalShifts[i]) existing.teorico[i] = p.theoreticalShifts[i]
    }
    for (const d of p.yellowDays) if (!existing.yellow.includes(d)) existing.yellow.push(d)
  }

  return order.map(n => byName.get(n)!)
}

function buildSchedule(allPersons: MonthPersonShifts[], daysInMonth: number): Record<number, DaySchedule> {
  const schedule: Record<number, DaySchedule> = {}
  for (let d = 1; d <= daysInMonth; d++) schedule[d] = { sections: {}, altriPresenti: [] }

  for (const person of allPersons) {
    for (let d = 1; d <= daysInMonth; d++) {
      applyTokenToDay(schedule[d], person.name, person.days[d - 1] ?? '')
    }
  }

  return schedule
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Superficie di una pagina pdf.js che ci serve davvero: il testo con le
 * coordinate e (quando disponibile) la lista operatori per leggere i colori.
 */
interface PdfPageProxyLike {
  getTextContent(): Promise<{ items: Array<{ str?: string; transform: number[] }> }>
  getOperatorList?(): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>
}

export async function parsePdfSchedule(buffer: Buffer, month: string): Promise<SalaSchedule> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const pdfParse = require('pdf-parse')
  // Stessa istanza di pdf.js usata da pdf-parse: serve sia per le costanti OPS
  // (la lettura dei colori passa dalla lista operatori) sia per disattivare il
  // caricamento dei font, che in Node richiederebbe il DOM.
  let bundledPdfJs: { OPS?: Record<string, number>; PDFJS?: { disableFontFace?: boolean } } | null = null
  try {
    bundledPdfJs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js')
    if (bundledPdfJs?.PDFJS) bundledPdfJs.PDFJS.disableFontFace = true
  } catch {
    bundledPdfJs = null
  }
  /* eslint-enable @typescript-eslint/no-require-imports */

  const daysInMonth = monthDays(month)
  const people: PersonData[] = []

  async function pagerender(pageData: PdfPageProxyLike): Promise<string> {
    try {
      const { items } = await pageData.getTextContent()
      const textItems: TextItem[] = []
      for (const item of items) {
        if (!item.str?.trim()) continue
        const [, , , , tx, ty] = item.transform
        textItems.push({ str: item.str.trim(), x: Math.round(tx), y: Math.round(ty) })
      }

      let yellowCells: Rect[] = []
      const OPS = bundledPdfJs?.OPS
      if (OPS && pageData.getOperatorList) {
        try {
          const opList = await pageData.getOperatorList()
          yellowCells = collectYellowCells(opList.fnArray, opList.argsArray, OPS)
        } catch (err) {
          // Le celle gialle sono un extra: senza di esse il mese resta valido.
          console.error('PDF yellow-cell scan failed (page ignored)', err)
        }
      }

      const rows = groupByRow(textItems)
      people.push(...processPageRows(rows, daysInMonth, yellowCells))
    } catch (err) {
      console.error('PDF parse error (page render)', err)
    }
    return ''
  }

  try {
    await pdfParse(buffer, { pagerender })
  } catch (err) {
    console.error('PDF parse error', err)
    throw err
  }

  const allPersons = mergePersons(people, daysInMonth)
  const data = encodeSalaMonth(allPersons, daysInMonth)
  // La vista per-giorno resta disponibile per turnisala e per la pulizia cambi.
  const schedule = buildSchedule(allPersons, daysInMonth)

  return {
    month,
    schedule,
    uploaded_at: new Date().toISOString(),
    data,
  }
}
