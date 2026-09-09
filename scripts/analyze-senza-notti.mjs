// Analisi senza notti: righe famiglia per mese + periodo migliore su timeline assoluta
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')
const DIR = process.argv[2] || 'C:/Users/david/Desktop/tools/pwa-v2/Turni esempio'

// ─── parser (copiato da lib/pdf-parser.ts) ───────────────────────────────────
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
const EXCLUDED_FIRST = new Set(['RC', 'RI', 'RM', 'A', 'AG', 'D', 'VS', 'SPW', 'TIR', 'F', 'GIORNO', 'GIORNI', 'COLORI', 'LEGENDA', 'SIGLE', 'COLORE'])
function looksLikeName(token) {
  if (token.length < 2) return false
  if (EXCLUDED_FIRST.has(token)) return false
  if (/^\d+$/.test(token)) return false
  if (/^[a-z]/.test(token)) return false
  if (/[,;()/]/.test(token)) return false
  if (/^[A-Z][a-z]/.test(token) && token !== token.toUpperCase()) return false
  return true
}
const DAY_COL_TOLERANCE = 13
function isNearDayColumn(x, headerXMap) {
  for (const hx of Object.values(headerXMap)) if (Math.abs(x - hx) <= DAY_COL_TOLERANCE) return true
  return false
}
function tryParseMainRowByX(items, headerXMap, daysInMonth) {
  if (items.length === 0) return null
  if (headerXMap[1] === undefined) return null
  const nameItems = []
  const shiftItems = []
  for (const item of items) {
    if (isNearDayColumn(item.x, headerXMap)) shiftItems.push(item)
    else nameItems.push(item)
  }
  if (nameItems.length === 0 || nameItems.length > 4) return null
  if (!nameItems.every(it => looksLikeName(it.str))) return null
  const name = nameItems.map(it => it.str).join(' ')
  if (name.length > 30) return null
  const shifts = new Array(daysInMonth).fill('')
  for (const item of shiftItems) {
    const day = xToDay(item.x, headerXMap)
    if (day !== null && day >= 1 && day <= daysInMonth) shifts[day - 1] = item.str
  }
  return { name, shifts }
}
function mergeClosePdfItems(items) {
  const result = []
  for (let i = 0; i < items.length; i++) {
    const cur = items[i]
    const nxt = items[i + 1]
    if (nxt && Math.abs(cur.x - nxt.x) <= 10) {
      result.push({ ...cur, str: cur.str + nxt.str })
      i++
    } else result.push(cur)
  }
  return result
}
function xToDay(x, headerXMap) {
  let best = null
  let bestDist = Infinity
  for (const [day, hx] of Object.entries(headerXMap)) {
    const d = Math.abs(x - hx)
    if (d < bestDist) { bestDist = d; best = parseInt(day) }
  }
  return best
}
const DOW_LABELS = new Set(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'])
function processPageRows(rows, daysInMonth) {
  const results = []
  const headerIndices = []
  rows.forEach((r, i) => {
    const nums = r.items.filter(it => /^\d+$/.test(it.str)).map(it => parseInt(it.str))
    if (nums.length === daysInMonth && Math.min(...nums) === 1 && Math.max(...nums) === daysInMonth) headerIndices.push(i)
  })
  if (headerIndices.length === 0) return results
  for (let h = 0; h < headerIndices.length; h++) {
    const headerRow = rows[headerIndices[h]]
    const headerXMap = {}
    headerRow.items.filter(it => /^\d+$/.test(it.str)).forEach(it => { headerXMap[parseInt(it.str)] = it.x })
    const groupStart = headerIndices[h] + 2
    const groupEnd = h + 1 < headerIndices.length ? headerIndices[h + 1] : rows.length
    for (const row of rows.slice(groupStart, groupEnd)) {
      const parsed = tryParseMainRowByX(mergeClosePdfItems(row.items), headerXMap, daysInMonth)
      if (parsed) results.push({ name: parsed.name, theoreticalShifts: parsed.shifts })
    }
  }
  return results
}
const MONTHS = {
  'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
  'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12,
}
function monthFromFilename(file) {
  const m = file.match(/^([A-Za-z]+?)_(\d{2})-(\d{2})-(\d{4})/)
  if (!m) return null
  const monthIdx = MONTHS[m[1].toLowerCase()]
  if (!monthIdx) return null
  return { name: m[1], monthIdx, year: parseInt(m[4]), daysInMonth: new Date(parseInt(m[4]), monthIdx, 0).getDate() }
}
async function parsePdf(filePath) {
  const buffer = fs.readFileSync(filePath)
  const allPersons = []
  async function pagerender(pageData) {
    try {
      const { items } = await pageData.getTextContent()
      const textItems = []
      for (const item of items) {
        if (!item.str?.trim()) continue
        const [, , , , tx, ty] = item.transform
        textItems.push({ str: item.str.trim(), x: Math.round(tx), y: Math.round(ty) })
      }
      allPersons.push(...processPageRows(groupByRow(textItems), monthFromFilename(path.basename(filePath)).daysInMonth))
    } catch (err) { /* noop */ }
    return ''
  }
  await pdfParse(buffer, { pagerender })
  return allPersons
}

// ─── caricamento ─────────────────────────────────────────────────────────────
const files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.pdf')).sort()
const allData = []
for (const file of files) {
  const meta = monthFromFilename(file)
  if (!meta) continue
  allData.push({ file, meta, persons: await parsePdf(path.join(DIR, file)) })
}
allData.sort((a, b) => (a.meta.year * 100 + a.meta.monthIdx) - (b.meta.year * 100 + b.meta.monthIdx))

const DAY0 = Date.UTC(2025, 0, 1) / 86400000
const absDay = (year, monthIdx, day) => Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0
const fam = t => {
  const u = (t || '').toUpperCase()
  if (!u) return '·'
  if (u === 'RC') return 'RC'
  if (u === 'RI') return 'RI'
  if (u === 'RM') return 'RM'
  if (u === 'D') return 'D'
  if (/^[MNP]/.test(u)) return u[0]
  return 'X'
}
const isShiftCodeName = n => {
  const words = n.toUpperCase().split(/\s+/).filter(w => w.length >= 2)
  if (words.length === 0) return true
  return words.every(w => /^(NDCP|PDCP|MDCP|MDCCM|NDCCM|PDCCM|MDCIF|NDCIF|PDCIF|MRIC|PRIC|M3M40|PM3M40|MM3M40|MIAP|PIAP|GIAP|M[0-9]+|N[0-9]+|P[0-9]+|TIR|R|RC|RI|RM|D|GM3M40)$/.test(w))
}
const persons = {}
for (const { meta, persons: ps } of allData) {
  for (const p of ps) {
    if (isShiftCodeName(p.name)) continue
    if (!persons[p.name]) persons[p.name] = []
    persons[p.name].push({ meta, shifts: p.theoreticalShifts })
  }
}

// ─── modalità ────────────────────────────────────────────────────────────────
const MODE = process.argv[3] || 'senza-notti'
const names = (process.argv[4] || '').split(',').filter(Boolean)

if (MODE === 'senza-notti') {
  const targets = names.length ? names : ['DI MEO', 'MAIO', 'SICA', 'COSENZA', 'CETRANCOLO', 'CAIAZZO I.', 'COSTANZO', 'DI MICCO', 'ABATE', 'ALBANO', 'TURCO', "D'AURIA", 'LUCIGNANO', 'ROTONDO', 'LANGIONE', 'MEMOLI', 'CALLIGARI']
  for (const n of targets) {
    const months = persons[n]
    if (!months) { console.log(`\n=== ${n}: ASSENTE`); continue }
    console.log(`\n=== ${n} (${months.length} mesi) ===`)
    for (const { meta, shifts } of months) {
      const row = shifts.map(fam).map((t, i) => `${i + 1}:${t}`).join(' ')
      console.log(`${String(meta.year).padEnd(5)}-${String(meta.monthIdx).padStart(2, '0')} | ${row}`)
    }
  }
} else if (MODE === 'periodo') {
  // miglior periodo (max accordo) su timeline assoluta, per persona
  const targets = names.length ? names : Object.keys(persons)
  const out = []
  for (const n of targets) {
    const months = persons[n]
    if (!months) continue
    const pairs = []
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => pairs.push({ abs: absDay(meta.year, meta.monthIdx, i + 1), tok: fam(t) }))
    }
    pairs.sort((a, b) => a.abs - b.abs)
    const best = []
    for (let P = 1; P <= 90; P++) {
      const byRes = new Map()
      let agree = 0
      for (const { abs, tok } of pairs) {
        const r = ((abs % P) + P) % P
        if (!byRes.has(r)) byRes.set(r, new Map())
        const c = byRes.get(r)
        c.set(tok, (c.get(tok) || 0) + 1)
        agree++
      }
      let agreeing = 0
      const pattern = []
      let firstTok = null, allSame = true
      for (let r = 0; r < P; r++) {
        const c = byRes.get(r)
        if (!c) { pattern.push('·'); continue }
        let bestTok = null, bestN = 0
        for (const [tok, k] of c) if (k > bestN) { bestN = k; bestTok = tok }
        agreeing += bestN
        pattern.push(bestTok)
        if (firstTok === null) firstTok = bestTok
        else if (bestTok !== firstTok) allSame = false
      }
      const pct = agreeing / agree
      best.push({ P, pct, pattern, allSame })
    }
    best.sort((a, b) => b.pct - a.pct)
    const top = best.filter(b => !b.allSame && b.pct > 0.75).slice(0, 5)
    out.push({ n, top })
  }
  for (const { n, top } of out) {
    console.log(`\n${n}:`)
    for (const t of top) console.log(`  P=${String(t.P).padStart(3)} accordo=${(t.pct * 100).toFixed(1)}% pattern: ${t.pattern.map((x, i) => `${i + 1}:${x}`).join(' ')}`)
  }
} else if (MODE === 'scorte-semplici') {
  // righe delle scorte semplici (senza turno periodico) su tutti i mesi: cosa fanno?
  const targets = names.length ? names : ['BORRELLI', 'CACCIUOLO', 'CAVANNA', 'MINICOZZI', 'PRINCIPE', 'SEMOLA', 'ROMANO R.', 'MAROTTA', 'PAPA', 'GAROFALO', 'PIROZZI', 'LA MONTAGNA', 'DI BLASI L.', 'GRASSIA', 'DE ROSA', 'DONNARUMMA', 'IORIO', 'DONZELLI', 'COLUCCI M.', 'DE FALCO', 'D\'ANTONIO', 'CEPARANO']
  for (const n of targets) {
    const months = persons[n]
    if (!months) { console.log(`\n=== ${n}: ASSENTE`); continue }
    console.log(`\n=== ${n} (${months.length} mesi) ===`)
    for (const { meta, shifts } of months) {
      const row = shifts.map(fam).map((t, i) => `${i + 1}:${t}`).join(' ')
      console.log(`${String(meta.year).padEnd(5)}-${String(meta.monthIdx).padStart(2, '0')} | ${row}`)
    }
  }
} else if (MODE === 'griglia') {
  // scorte semplici: verifica che i giorni M+N cadano sulla griglia assoluta 28/7 giorni
  const targets = names.length ? names : ['BORRELLI', 'CACCIUOLO', 'CAVANNA', 'MINICOZZI', 'PRINCIPE', 'MAROTTA']
  for (const n of targets) {
    const months = persons[n]
    if (!months) continue
    const mn = []
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => {
        const u = (t || '').toUpperCase()
        if (u === 'M' || u === 'N' || /^M[0-9]/.test(u) || /^N[0-9]/.test(u)) mn.push(absDay(meta.year, meta.monthIdx, i + 1))
      })
    }
    mn.sort((a, b) => a - b)
    const spacings = mn.slice(1).map((d, i) => d - mn[i])
    const res28 = [...new Set(mn.map(d => ((d % 28) + 28) % 28))].sort((a, b) => a - b)
    console.log(`${n.padEnd(12)} | giorni M+N=${mn.length} | spaziature: ${spacings.join(',')} | residui mod 28: ${res28.join(',')}`)
  }
} else if (MODE === 'stat') {
  // statistiche R/W per le scorte semplici: quanti giorni di lavoro (M/N/P) al mese
  const targets = names.length ? names : Object.keys(persons)
  for (const n of targets) {
    const months = persons[n]
    if (!months) continue
    const stats = months.map(({ meta, shifts }) => {
      const work = shifts.filter(t => /^[MNP]/.test((t || '').toUpperCase())).length
      const d = shifts.filter(t => (t || '').toUpperCase() === 'D').length
      const rest = shifts.length - work - d
      return `${meta.year}-${String(meta.monthIdx).padStart(2, '0')}:W${work} D${d} R${rest}`
    })
    console.log(`${n.padEnd(20)} | ${stats.join(' ')}`)
  }
}