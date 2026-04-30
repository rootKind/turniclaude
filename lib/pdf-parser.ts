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

function ensureDOMMatrix() {
  if (typeof (globalThis as any).DOMMatrix !== 'undefined') return
  ;(globalThis as any).DOMMatrix = class DOMMatrix {
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true; isIdentity = true
    get a() { return this.m11 } get b() { return this.m12 }
    get c() { return this.m21 } get d() { return this.m22 }
    get e() { return this.m41 } get f() { return this.m42 }
    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length === 6) {
        this.m11 = init[0]; this.m12 = init[1]
        this.m21 = init[2]; this.m22 = init[3]
        this.m41 = init[4]; this.m42 = init[5]
        this.isIdentity = false
      }
    }
    multiply(m: any) {
      return new (globalThis as any).DOMMatrix([
        this.m11*m.m11+this.m12*m.m21, this.m11*m.m12+this.m12*m.m22,
        this.m21*m.m11+this.m22*m.m21, this.m21*m.m12+this.m22*m.m22,
        this.m41*m.m11+this.m42*m.m21+m.m41, this.m41*m.m12+this.m42*m.m22+m.m42,
      ])
    }
    translate(tx: number, ty: number) {
      return new (globalThis as any).DOMMatrix([this.m11,this.m12,this.m21,this.m22,this.m41+tx,this.m42+ty])
    }
    scale(sx: number, sy = sx) {
      return new (globalThis as any).DOMMatrix([this.m11*sx,this.m12*sx,this.m21*sy,this.m22*sy,this.m41,this.m42])
    }
    inverse() {
      const det = this.m11*this.m22-this.m12*this.m21
      if (!det) return new (globalThis as any).DOMMatrix()
      return new (globalThis as any).DOMMatrix([
        this.m22/det,-this.m12/det,-this.m21/det,this.m11/det,
        (this.m21*this.m42-this.m22*this.m41)/det,(this.m12*this.m41-this.m11*this.m42)/det,
      ])
    }
    transformPoint(p: any = {}) {
      const x=p.x??0,y=p.y??0
      return {x:this.m11*x+this.m21*y+this.m41,y:this.m12*x+this.m22*y+this.m42,z:0,w:1}
    }
    static fromMatrix(m: any) {
      return new (globalThis as any).DOMMatrix([m.m11??m.a??1,m.m12??m.b??0,m.m21??m.c??0,m.m22??m.d??1,m.m41??m.e??0,m.m42??m.f??0])
    }
    static fromFloat32Array(a: Float32Array) { return new (globalThis as any).DOMMatrix([...a]) }
    static fromFloat64Array(a: Float64Array) { return new (globalThis as any).DOMMatrix([...a]) }
    toString() { return `matrix(${this.m11},${this.m12},${this.m21},${this.m22},${this.m41},${this.m42})` }
  }
}

async function extractColoredPersons(
  buffer: Buffer,
  daysInMonth: number,
): Promise<{ result: Record<number, Record<string, 'salmon' | 'green'>>; debug: ExtractDebug }> {
  ensureDOMMatrix()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs') as any
  const data = new Uint8Array(buffer)
  const pdfDoc = await getDocument({ data, verbosity: 0 }).promise
  const opNames: Record<number, string> = Object.fromEntries(
    Object.entries(OPS as Record<string, number>).map(([k, v]) => [v, k])
  )

  const result: Record<number, Record<string, 'salmon' | 'green'>> = {}
  const debug: ExtractDebug = { headersFoundPerPage: [], uniqueFillColors: [], constructPathCount: 0, coloredRectsFound: 0 }
  const seenColors = new Set<string>()

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p)
    const [ops, textContent] = await Promise.all([
      page.getOperatorList(),
      page.getTextContent(),
    ])

    const textItems: TextItem[] = (textContent.items as any[])
      .filter(i => i.str?.trim())
      .map(i => ({ str: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }))

    // Find header row(s): row containing all day numbers 1..daysInMonth
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

    // All day-column x positions — used to exclude shift codes from name extraction
    const allDayXs = headers.flatMap(h => Object.values(h.xmap))
    const isNearDayCol = (x: number) => allDayXs.some(hx => Math.abs(x - hx) <= DAY_COL_TOLERANCE)

    // Collect small colored rects (per-day cell: width < 120, height < 60)
    const coloredRects: ColoredRect[] = []
    let currentFillColor: string | null = null
    for (let i = 0; i < ops.fnArray.length; i++) {
      const name = opNames[ops.fnArray[i]]
      const args = ops.argsArray[i]
      if (name === 'setFillRGBColor') {
        const raw = args[0]
        currentFillColor = typeof raw === 'string' ? raw
          : '#' + [raw, args[1], args[2]].map((v: number) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
        seenColors.add(currentFillColor)
      } else if (name === 'constructPath') {
        debug.constructPathCount++
        if (currentFillColor) {
          const cat = classifyColor(currentFillColor)
          if (cat && args[2]) {
            const b = args[2] as Record<number, number>
            const w = b[2] - b[0]; const h = b[3] - b[1]
            if (w > 0 && w < 120 && h > 0 && h < 60) {
              coloredRects.push({ color: cat, x1: b[0], y1: b[1], x2: b[2], y2: b[3] })
            }
          }
        }
      }
    }
    debug.coloredRectsFound += coloredRects.length

    // For each colored rect: find day (x) and person name (y)
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
    const extracted = await extractColoredPersons(buffer, daysInMonth)
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
