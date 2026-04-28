import { readFileSync } from 'fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const PDF_PATH = './Aprile_28-04-2026.pdf'
const DAYS_IN_MONTH = 30

function isShiftCode(token) {
  return /^[MNP][A-Z0-9]+$/.test(token)
}

function parseShiftCode(token) {
  const shift = token[0]
  const isTir = token.endsWith('TIR')
  const raw = token.slice(1).replace(/TIR$/, '')
  const m = raw.match(/^(\d+)([ST])?$/)
  if (m) return { shift, section: m[1], slot: m[2] ?? null, isTir }
  return { shift, section: raw, slot: null, isTir }
}

function groupByRow(items, tolerance = 3) {
  const rows = []
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

function xToDay(x, headerXMap) {
  let best = null, bestDist = Infinity
  for (const [day, hx] of Object.entries(headerXMap)) {
    const d = Math.abs(x - hx)
    if (d < bestDist) { bestDist = d; best = parseInt(day) }
  }
  return best
}

function mergeClosePdfItems(items) {
  const result = []
  for (let i = 0; i < items.length; i++) {
    const cur = items[i], nxt = items[i + 1]
    if (nxt && Math.abs(cur.x - nxt.x) <= 10) { result.push({ ...cur, str: cur.str + nxt.str }); i++ }
    else result.push(cur)
  }
  return result
}

const DAY_COL_TOLERANCE = 13
function isNearDayColumn(x, headerXMap) {
  for (const hx of Object.values(headerXMap))
    if (Math.abs(x - hx) <= DAY_COL_TOLERANCE) return true
  return false
}

const EXCLUDED_FIRST = new Set([
  'RC','RI','RM','A','AG','D','VS','SPW','TIR','F',
  'GIORNO','GIORNI','COLORI','LEGENDA','SIGLE','COLORE',
])
function looksLikeName(token) {
  if (token.length < 2) return false
  if (EXCLUDED_FIRST.has(token)) return false
  if (/^\d+$/.test(token)) return false
  if (/^[a-z]/.test(token)) return false
  if (/[,;()/]/.test(token)) return false
  if (/^[A-Z][a-z]/.test(token) && token !== token.toUpperCase()) return false
  return true
}

function tryParseMainRowByX(items, headerXMap) {
  if (items.length === 0 || headerXMap[1] === undefined) return null
  const nameItems = [], shiftItems = []
  for (const item of items) {
    if (isNearDayColumn(item.x, headerXMap)) shiftItems.push(item)
    else nameItems.push(item)
  }
  if (nameItems.length === 0 || nameItems.length > 4) return null
  if (!nameItems.every(it => looksLikeName(it.str))) return null
  const name = nameItems.map(it => it.str).join(' ')
  if (name.length > 30) return null
  const shifts = new Array(DAYS_IN_MONTH).fill('')
  for (const item of shiftItems) {
    const day = xToDay(item.x, headerXMap)
    if (day !== null && day >= 1 && day <= DAYS_IN_MONTH) shifts[day - 1] = item.str
  }
  return { name, shifts }
}

const ABSENT_CODES = new Set(['A','AG','F','RM','RC','RI','VS','D','RIC'])
const NON_SECTION_DUTIES = new Set(['TUTOR'])
const DOW_LABELS = new Set(['Lun','Mar','Mer','Gio','Ven','Sab','Dom'])

function isPresentNoSection(token) {
  if (ABSENT_CODES.has(token)) return false
  if (/^Sp[A-Za-z@]/.test(token)) return true
  if (/^ISp[A-Za-z]/.test(token)) return true
  if (token === 'SPW' || token === 'GIAP' || token === 'SpNw') return true
  if (/^Dis[A-Z]/.test(token)) return true
  return false
}

function processPageRows(rows) {
  const results = []
  const headerIndices = []
  rows.forEach((r, i) => {
    const nums = r.items.filter(it => /^\d+$/.test(it.str)).map(it => parseInt(it.str))
    if (nums.length === DAYS_IN_MONTH && Math.min(...nums) === 1 && Math.max(...nums) === DAYS_IN_MONTH)
      headerIndices.push(i)
  })
  if (headerIndices.length === 0) return results
  for (let h = 0; h < headerIndices.length; h++) {
    const headerRow = rows[headerIndices[h]]
    const headerXMap = {}
    headerRow.items.filter(it => /^\d+$/.test(it.str)).forEach(it => { headerXMap[parseInt(it.str)] = it.x })
    const groupStart = headerIndices[h] + 2
    const groupEnd = h + 1 < headerIndices.length ? headerIndices[h + 1] : rows.length
    const groupRows = rows.slice(groupStart, groupEnd)
    let pendingMod = null
    for (const row of groupRows) {
      const mergedItems = mergeClosePdfItems(row.items)
      const parsed = tryParseMainRowByX(mergedItems, headerXMap)
      if (parsed) {
        const modByDay = {}
        if (pendingMod) {
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

function emptyShift() { return { surnames: { T: [], S: [], noSlot: [] }, tirocinanti: [] } }

function buildSchedule(allPersons) {
  const schedule = {}
  for (let d = 1; d <= DAYS_IN_MONTH; d++) schedule[d] = { sections: {}, altriPresenti: [] }
  for (const { name, theoreticalShifts, modByDay } of allPersons) {
    for (let d = 1; d <= DAYS_IN_MONTH; d++) {
      const effective = modByDay[d] ?? theoreticalShifts[d - 1]
      if (!effective || ABSENT_CODES.has(effective)) continue
      if (isPresentNoSection(effective)) { schedule[d].altriPresenti.push(name); continue }
      if (!isShiftCode(effective)) continue
      const { shift, section, slot, isTir } = parseShiftCode(effective)
      if (NON_SECTION_DUTIES.has(section)) { schedule[d].altriPresenti.push(name); continue }
      const secs = schedule[d].sections
      if (!secs[section]) secs[section] = { M: emptyShift(), N: emptyShift(), P: emptyShift() }
      const shiftData = secs[section][shift]
      if (isTir) shiftData.tirocinanti.push(name)
      else shiftData.surnames[slot ?? 'noSlot'].push(name)
    }
  }
  return schedule
}

async function main() {
  const buf = readFileSync(PDF_PATH)
  const doc = await getDocument({ data: new Uint8Array(buf) }).promise
  const allPersons = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { items } = await page.getTextContent()
    const textItems = []
    for (const item of items) {
      if (!item.str.trim()) continue
      const [,,,, tx, ty] = item.transform
      textItems.push({ str: item.str.trim(), x: Math.round(tx), y: Math.round(ty) })
    }
    allPersons.push(...processPageRows(groupByRow(textItems)))
  }

  console.log(`\n=== PERSONE TROVATE (${allPersons.length}) ===`)
  allPersons.forEach(p => console.log(` - ${p.name}`))

  const schedule = buildSchedule(allPersons)
  const sortSecs = keys => keys.sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b)
    return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b)
  })

  for (const day of [1, 15, 30]) {
    console.log(`\n${'─'.repeat(55)}\nGIORNO ${day}\n${'─'.repeat(55)}`)
    const { sections, altriPresenti } = schedule[day]
    for (const sec of sortSecs(Object.keys(sections))) {
      for (const sh of ['M', 'N', 'P']) {
        const { surnames, tirocinanti } = sections[sec][sh]
        const hasData = surnames.T.length || surnames.S.length || surnames.noSlot.length || tirocinanti.length
        if (!hasData) continue
        const parts = []
        if (surnames.T.length) parts.push(`T:${surnames.T.join(', ')}`)
        if (surnames.S.length) parts.push(`S:${surnames.S.join(', ')}`)
        if (surnames.noSlot.length) parts.push(surnames.noSlot.join(', '))
        if (tirocinanti.length) parts.push(`tir:${tirocinanti.join(', ')}`)
        console.log(`  [${sh}] sez.${sec.padEnd(6)} ${parts.join(' | ')}`)
      }
    }
    if (altriPresenti.length) console.log(`  [*] ALTRI PRESENTI: ${altriPresenti.join(', ')}`)
  }

  const allSecs = new Set()
  for (const { sections } of Object.values(schedule)) for (const s of Object.keys(sections)) allSecs.add(s)
  console.log(`\n=== SEZIONI UNICHE (${allSecs.size}) ===\n${sortSecs([...allSecs]).join(', ')}`)
}

main().catch(console.error)
