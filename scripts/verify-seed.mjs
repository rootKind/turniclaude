// Verifica del seed: per ogni membro, confronta i token generati dal pattern
// (ancorato a 2026-07-01) con la riga reale del PDF di Luglio 2026.
// - livello famiglia (M/N/P + RC/RI/RM/D): deve combaciare quasi ovunque
// - token completi: deve combaciare sui giorni 1..28 (i giorni 29-31 possono
//   differire per chi ha sezioni che girano settimanalmente)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

// ─── estrazione righe luglio 2026 ────────────────────────────────────────────
const DEFAULT_DIR = 'C:/Users/david/Desktop/tools/pwa-v2/Turni esempio'
const argDir = process.argv.slice(2).find(a => { try { return fs.statSync(a).isDirectory() } catch { return false } })
const PDF_DIR = argDir || DEFAULT_DIR
const JULY = path.join(PDF_DIR, 'Luglio_18-08-2026.pdf')

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
function xToDay(x, headerXMap) {
  let best = null, bestDist = Infinity
  for (const [day, hx] of Object.entries(headerXMap)) {
    const d = Math.abs(x - hx)
    if (d < bestDist) { bestDist = d; best = parseInt(day) }
  }
  return best
}
function tryParseMainRowByX(items, headerXMap, daysInMonth) {
  if (items.length === 0) return null
  if (headerXMap[1] === undefined) return null
  const nameItems = [], shiftItems = []
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
    if (nxt && Math.abs(cur.x - nxt.x) <= 10) { result.push({ ...cur, str: cur.str + nxt.str }); i++ }
    else result.push(cur)
  }
  return result
}
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
      const mergedItems = mergeClosePdfItems(row.items)
      const parsed = tryParseMainRowByX(mergedItems, headerXMap, daysInMonth)
      if (parsed) results.push({ name: parsed.name, shifts: parsed.shifts })
    }
  }
  return results
}

const buffer = fs.readFileSync(JULY)
const july = {}
async function pagerender(pageData) {
  try {
    const { items } = await pageData.getTextContent()
    const textItems = []
    for (const item of items) {
      if (!item.str?.trim()) continue
      const [, , , , tx, ty] = item.transform
      textItems.push({ str: item.str.trim(), x: Math.round(tx), y: Math.round(ty) })
    }
    const rows = groupByRow(textItems)
    for (const p of processPageRows(rows, 31)) july[p.name] = p.shifts
  } catch {}
  return ''
}
await pdfParse(buffer, { pagerender })

// ─── pattern dal seed SQL ────────────────────────────────────────────────────
const sql = fs.readFileSync('supabase/migrations/020_seed_shift_teams.sql', 'utf8')
const members = []
for (const m of sql.matchAll(/'((?:[^']|'')+)', ARRAY\[([^\]]*)\], (\d+), (true|false)\)/g)) {
  members.push({ name: m[1].replace(/''/g, "'"), pattern: m[2].match(/'[^']*'/g).map(x => x.slice(1, -1)) })
}

// ─── confronto ───────────────────────────────────────────────────────────────
const fam = tok => {
  const u = (tok || '').toUpperCase()
  if (!u) return '·'
  if (u === 'RC' || u === 'RI' || u === 'RM' || u === 'D') return u
  if (/^[MNP]/.test(u)) return u[0]
  return 'X'
}

let full1_28 = 0, full1_28tot = 0, famAll = 0, famAllTot = 0
const bad = []
const mismatchReasons = { absentWork: 0, drift: 0, other: 0 }
const mismatchExamples = []
for (const mem of members) {
  const actual = july[mem.name]
  if (!actual) { bad.push(`${mem.name}: NON trovato nel PDF di luglio`); continue }
  const cycle = mem.pattern.length
  const monthWork = actual.filter(t => /^[MNP]/.test(t || '')).length
  for (let d = 1; d <= 31; d++) {
    const gen = mem.pattern[(d - 1) % cycle] ?? ''
    const act = actual[d - 1] ?? ''
    if (d <= 28) { full1_28tot++; if (gen.toUpperCase() === act.toUpperCase()) full1_28++ }
    famAllTot++
    if (fam(gen) === fam(act)) { famAll++; continue }
    // mismatch famiglia: classificazione
    if (/^[MNP]/.test(gen) && !/^[MNP]/.test(act) && monthWork === 0) { mismatchReasons.absentWork++; continue }
    if (d > 28) { mismatchReasons.drift++; continue }
    mismatchReasons.other++
    if (mismatchExamples.length < 10) mismatchExamples.push(`${mem.name} g${d}: gen=${gen} vs luglio=${act}`)
  }
}
console.log(`Membri seed: ${members.length} | trovati in luglio: ${members.filter(m => july[m.name]).length}`)
console.log(`Token completi giorni 1-28: ${full1_28}/${full1_28tot} (${Math.round(full1_28 / full1_28tot * 100)}%)`)
console.log(`Famiglia (M/N/P/RC/RI/RM/D) tutti i giorni: ${famAll}/${famAllTot} (${Math.round(famAll / famAllTot * 100)}%)`)
console.log(`Mismatch famiglia: assente-in-luglio=${mismatchReasons.absentWork}, oltre-g28=${mismatchReasons.drift}, altri=${mismatchReasons.other}`)
if (mismatchExamples.length) { console.log('\nEsempi mismatch residui:'); mismatchExamples.forEach(e => console.log('  ' + e)) }
if (bad.length) { console.log('\nNon nel PDF di luglio (atteso):'); bad.forEach(b => console.log('  ' + b)) }