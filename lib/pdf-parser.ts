import type { DaySchedule, SectionShiftData, SalaShiftType, SalaSchedule } from '@/types/database'

// ─── helpers ──────────────────────────────────────────────────────────────────

function isShiftCode(token: string): boolean {
  return /^[MNP][A-Z0-9]+$/.test(token)
}

interface ParsedShift {
  shift: SalaShiftType
  section: string
  slot: 'T' | 'S' | null
  isTir: boolean
}

function parseShiftCode(token: string): ParsedShift {
  const shift = token[0] as SalaShiftType
  const isTir = token.endsWith('TIR')
  const raw = token.slice(1).replace(/TIR$/, '')
  const m = raw.match(/^(\d+)([ST])?$/)
  if (m) return { shift, section: m[1], slot: (m[2] as 'T' | 'S') ?? null, isTir }
  return { shift, section: raw, slot: null, isTir }
}

const ABSENT_CODES = new Set([
  'A', 'AG', 'F', 'RM', 'RC', 'RI', 'VS', 'D',
])

const NON_SECTION_DUTIES = new Set(['TUTOR'])

function isPresentNoSection(token: string): boolean {
  if (ABSENT_CODES.has(token)) return false
  if (/^Sp[A-Za-z@]/.test(token)) return true
  if (/^ISp[A-Za-z]/.test(token)) return true
  if (token === 'SPW') return true
  if (token === 'SpNw') return true
  if (/^Dis[A-Z]/.test(token)) return true
  return false
}

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
 * Returns true when x is within DAY_COL_TOLERANCE of any day-column header.
 * Inter-day spacing in these PDFs is ~25px, so 13px is < half-step.
 */
const DAY_COL_TOLERANCE = 13

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

  const nameItems: TextItem[] = []
  const shiftItems: TextItem[] = []
  for (const item of items) {
    if (isNearDayColumn(item.x, headerXMap)) shiftItems.push(item)
    else nameItems.push(item)
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

const DOW_LABELS = new Set(['Lun','Mar','Mer','Gio','Ven','Sab','Dom'])

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

// ─── page processing ──────────────────────────────────────────────────────────

interface PersonData {
  name: string
  theoreticalShifts: string[]
  modByDay: Record<number, string>
}

function processPageRows(
  rows: Array<{ y: number; items: TextItem[] }>,
  daysInMonth: number,
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
        if (pendingMod) {
          // Filter DOW labels first, then merge any remaining split codes
          const filtered = pendingMod.items.filter(it => !DOW_LABELS.has(it.str))
          for (const item of mergeClosePdfItems(filtered)) {
            const day = xToDay(item.x, headerXMap)
            if (day) modByDay[day] = item.str
          }
        }
        results.push({ name: parsed.name, theoreticalShifts: parsed.shifts, modByDay })
        pendingMod = null
      } else {
        pendingMod = row
      }
    }
  }

  return results
}

// ─── schedule builder ─────────────────────────────────────────────────────────

function emptyShift(): SectionShiftData {
  return { surnames: { T: [], S: [], noSlot: [] }, tirocinanti: [] }
}

function buildSchedule(allPersons: PersonData[], daysInMonth: number): Record<number, DaySchedule> {
  const schedule: Record<number, DaySchedule> = {}
  for (let d = 1; d <= daysInMonth; d++) schedule[d] = { sections: {}, altriPresenti: [] }

  for (const { name, theoreticalShifts, modByDay } of allPersons) {
    for (let d = 1; d <= daysInMonth; d++) {
      const effective = modByDay[d] ?? theoreticalShifts[d - 1]
      if (!effective || ABSENT_CODES.has(effective)) continue

      if (isPresentNoSection(effective)) {
        schedule[d].altriPresenti.push(name)
        continue
      }

      if (!isShiftCode(effective)) continue

      const { shift, section, slot, isTir } = parseShiftCode(effective)

      if (NON_SECTION_DUTIES.has(section)) {
        schedule[d].altriPresenti.push(name)
        continue
      }

      const secs = schedule[d].sections
      if (!secs[section]) secs[section] = { M: emptyShift(), N: emptyShift(), P: emptyShift() }
      const shiftData = secs[section][shift]

      if (isTir) {
        shiftData.tirocinanti.push(name)
      } else {
        const key = slot ?? 'noSlot'
        shiftData.surnames[key as 'T' | 'S' | 'noSlot'].push(name)
      }
    }
  }

  return schedule
}

// ─── color extraction ─────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function classifyColor(hex: string): 'green' | 'salmon' | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [r, g, b] = rgb
  // Light green: high G, G dominates R and B, high brightness
  if (g > 200 && g > r + 20 && g > b + 20 && r > 150 && b > 150) return 'green'
  // Light salmon: high R, R dominates G and B, high brightness
  if (r > 220 && r > g + 20 && r > b + 30 && g > 180 && b > 160) return 'salmon'
  return null
}

interface ColoredRect { color: 'green' | 'salmon'; x1: number; y1: number; x2: number; y2: number }

interface ExtractDebug {
  headersFoundPerPage: number[]
  uniqueFillColors: string[]
  constructPathCount: number
  coloredRectsFound: number
}

// pdfjs v1.10.100 (bundled in pdf-parse) op codes
const PDFJS_OP_SET_FILL_RGB = 59
const PDFJS_OP_CONSTRUCT_PATH = 91
const PDFJS_PATH_RECTANGLE = 19  // path-op within constructPath ops array

function extractColoredPersonsFromPageData(
  pages: Array<{ textItems: TextItem[]; fnArray: number[]; argsArray: any[][] }>,
  daysInMonth: number,
): { result: Record<number, Record<string, 'salmon' | 'green'>>; debug: ExtractDebug } {
  const result: Record<number, Record<string, 'salmon' | 'green'>> = {}
  const debug: ExtractDebug = {
    headersFoundPerPage: [],
    uniqueFillColors: [],
    constructPathCount: 0,
    coloredRectsFound: 0,
  }
  const seenColors = new Set<string>()

  for (const { textItems, fnArray, argsArray } of pages) {
    const rowMap: Record<number, TextItem[]> = {}
    for (const t of textItems) (rowMap[t.y] = rowMap[t.y] || []).push(t)

    const headers: Array<{ xmap: Record<number, number> }> = []
    for (const items of Object.values(rowMap)) {
      const nums = items.filter(i => /^\d+$/.test(i.str)).map(i => parseInt(i.str))
      if (nums.length >= daysInMonth - 2 && Math.min(...nums) === 1 && Math.max(...nums) === daysInMonth) {
        const xmap: Record<number, number> = {}
        items.filter(i => /^\d+$/.test(i.str)).forEach(i => { xmap[parseInt(i.str)] = i.x })
        headers.push({ xmap })
      }
    }
    debug.headersFoundPerPage.push(headers.length)
    if (headers.length === 0) continue

    const allDayXs = headers.flatMap(h => Object.values(h.xmap))
    const isNearDayCol = (x: number) => allDayXs.some(hx => Math.abs(x - hx) <= DAY_COL_TOLERANCE)

    const coloredRects: ColoredRect[] = []
    let currentFillColor: string | null = null

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i]
      const args = argsArray[i]

      if (fn === PDFJS_OP_SET_FILL_RGB) {
        // pdfjs v1.10.100 passes args as 0-255 integers (used directly in makeCssRgb)
        currentFillColor = '#' + [args[0], args[1], args[2]]
          .map((v: number) => Math.round(v).toString(16).padStart(2, '0')).join('')
        seenColors.add(currentFillColor)
      } else if (fn === PDFJS_OP_CONSTRUCT_PATH) {
        debug.constructPathCount++
        if (!currentFillColor) continue
        const cat = classifyColor(currentFillColor)
        if (!cat) continue
        // args[0] = path ops array, args[1] = flat coords array
        const pathOps: number[] = Array.from(args[0] ?? [])
        const coords: number[] = Array.from(args[1] ?? [])
        let ci = 0
        for (const op of pathOps) {
          if (op === PDFJS_PATH_RECTANGLE) {
            const x = coords[ci], y = coords[ci + 1], w = coords[ci + 2], h = coords[ci + 3]
            ci += 4
            if (w > 0 && w < 120 && Math.abs(h) > 0 && Math.abs(h) < 60) {
              const x1 = x, y1 = h >= 0 ? y : y + h
              const x2 = x + w, y2 = h >= 0 ? y + h : y
              coloredRects.push({ color: cat, x1, y1, x2, y2 })
            }
          } else {
            if (op === 13 || op === 14) ci += 2        // moveTo, lineTo
            else if (op === 15) ci += 6                 // curveTo
            else if (op === 16 || op === 17) ci += 4    // curveTo2, curveTo3
          }
        }
      }
    }
    debug.coloredRectsFound += coloredRects.length

    for (const rect of coloredRects) {
      const cx = (rect.x1 + rect.x2) / 2
      let bestDay: number | null = null; let bestDist = Infinity
      for (const { xmap } of headers) {
        for (const [day, hx] of Object.entries(xmap)) {
          const d = Math.abs(cx - hx)
          if (d < bestDist) { bestDist = d; bestDay = parseInt(day) }
        }
      }
      if (bestDay === null || bestDist > 20) continue

      const nameItems = textItems
        .filter(t => t.y >= rect.y1 - 3 && t.y <= rect.y2 + 3 && !isNearDayCol(t.x))
        .filter(t => looksLikeName(t.str))
      if (nameItems.length === 0 || nameItems.length > 4) continue
      const name = nameItems.map(t => t.str).join(' ').trim()
      if (!name) continue

      if (!result[bestDay]) result[bestDay] = {}
      if (result[bestDay][name] !== 'green') result[bestDay][name] = rect.color
    }
  }

  debug.uniqueFillColors = [...seenColors]
  return { result, debug }
}

// ─── public API ───────────────────────────────────────────────────────────────

export async function parsePdfSchedule(buffer: Buffer, month: string): Promise<SalaSchedule> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')

  const year = parseInt(month.split('-')[0])
  const monthIdx = parseInt(month.split('-')[1])
  const daysInMonth = new Date(year, monthIdx, 0).getDate()

  const allPersons: PersonData[] = []
  const colorPages: Array<{ textItems: TextItem[]; fnArray: number[]; argsArray: any[][] }> = []

  async function pagerender(pageData: any): Promise<string> {
    try {
      const { items } = await pageData.getTextContent()
      const textItems: TextItem[] = []
      for (const item of items as any[]) {
        if (!item.str?.trim()) continue
        const [, , , , tx, ty] = item.transform
        textItems.push({ str: item.str.trim(), x: Math.round(tx), y: Math.round(ty) })
      }
      const rows = groupByRow(textItems)
      allPersons.push(...processPageRows(rows, daysInMonth))

      // collect operator list for color extraction using the same pdfjs instance
      try {
        const opList = await pageData.getOperatorList()
        colorPages.push({
          textItems,
          fnArray: Array.from(opList.fnArray),
          argsArray: opList.argsArray,
        })
      } catch {
        // non-fatal: color extraction for this page skipped
      }
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

  const schedule = buildSchedule(allPersons, daysInMonth)

  let coloredPersons: Record<number, Record<string, 'salmon' | 'green'>> | undefined
  let extractDebug: ExtractDebug | undefined
  let extractError: string | undefined
  try {
    const extracted = extractColoredPersonsFromPageData(colorPages, daysInMonth)
    coloredPersons = extracted.result
    extractDebug = extracted.debug
  } catch (err) {
    extractError = String(err)
    console.error('PDF color extraction error (non-fatal)', err)
  }

  return {
    month,
    schedule,
    uploaded_at: new Date().toISOString(),
    ...(coloredPersons && Object.keys(coloredPersons).length > 0 ? { coloredPersons } : {}),
    _debug: extractDebug,
    _extractError: extractError,
  }
}
