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

const EXCLUDED_FIRST = new Set(['RC', 'RI', 'RM', 'A', 'AG', 'D', 'VS', 'SPW', 'TIR', 'F'])

function looksLikeName(token: string): boolean {
  if (token.length < 2) return false
  if (EXCLUDED_FIRST.has(token)) return false
  if (/^\d+$/.test(token)) return false
  if (/^[a-z]/.test(token)) return false
  return true
}

function tryParseMainRow(tokens: string[], daysInMonth: number): { name: string; shifts: string[] } | null {
  for (let nameLen = 1; nameLen <= 4; nameLen++) {
    const rest = tokens.slice(nameLen)
    if (rest.length !== daysInMonth) continue
    if (!tokens.slice(0, nameLen).every(looksLikeName)) continue
    return { name: tokens.slice(0, nameLen).join(' '), shifts: rest }
  }
  return null
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
      const tokens = row.items.map(it => it.str)
      const parsed = tryParseMainRow(tokens, daysInMonth)

      if (parsed) {
        const modByDay: Record<number, string> = {}
        if (pendingMod) {
          // Merge split shift codes: "M" + "DCIF" at same x → "MDCIF"
          const modItems: TextItem[] = []
          for (let i = 0; i < pendingMod.items.length; i++) {
            const cur = pendingMod.items[i]
            const nxt = pendingMod.items[i + 1]
            if (
              /^[MNP]$/.test(cur.str) &&
              nxt &&
              Math.abs(cur.x - nxt.x) <= 10 &&
              /^[A-Z]/.test(nxt.str)
            ) {
              modItems.push({ ...cur, str: cur.str + nxt.str })
              i++
            } else {
              modItems.push(cur)
            }
          }
          for (const item of modItems) {
            if (['Mer','Gio','Ven','Sab','Dom','Lun','Mar'].includes(item.str)) continue
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

  return {
    month,
    schedule,
    uploaded_at: new Date().toISOString(),
  }
}
