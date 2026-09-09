// Verifica: pattern famiglia (M/N/P + RC/RI/RM/D/·) per le squadre principali su Luglio 2026,
// confronto rotazioni e cadenza dei tipi di riposo tra le 4 squadre.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const FILE = process.argv[2] || 'C:/Users/david/Desktop/tools/pwa-v2/Turni esempio/Luglio_18-08-2026.pdf'
const FILE2 = process.argv[3] || 'C:/Users/david/Desktop/tools/pwa-v2/Turni esempio/Giugno_18-08-2026.pdf'

// ─── helpers copiati dal parser ──────────────────────────────────────────────
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
    const groupRows = rows.slice(groupStart, groupEnd)
    for (const row of groupRows) {
      const mergedItems = mergeClosePdfItems(row.items)
      const parsed = tryParseMainRowByX(mergedItems, headerXMap, daysInMonth)
      if (parsed) results.push({ name: parsed.name, theoreticalShifts: parsed.shifts })
    }
  }
  return results
}

// ─── parsing ─────────────────────────────────────────────────────────────────
async function parseFile(f, days) {
  const buffer = fs.readFileSync(f)
  const out = []
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
      out.push(...processPageRows(rows, days))
    } catch (err) { console.error('err', err) }
    return ''
  }
  await pdfParse(buffer, { pagerender })
  return out
}
const allPersons = await parseFile(FILE, 31)
const allPersons2 = await parseFile(FILE2, 30)

// ─── famiglia ────────────────────────────────────────────────────────────────
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

const targets = ['DI MONDA', 'ROMANO N.', 'COPPETA', 'LONI G.', "D'ELIA", 'PASSANNANTI', 'ARMENANTE', 'DI MONACO', 'CIPOLLETTA', 'CAIAZZO M.', 'CRISTOFARO', 'CICIA']
const rows = new Map()
for (const p of allPersons) if (!isShiftCodeName(p.name)) rows.set(p.name, p.theoreticalShifts.map(fam))
const rows2 = new Map()
for (const p of allPersons2) if (!isShiftCodeName(p.name)) rows2.set(p.name, p.theoreticalShifts.map(fam))

console.log('=== Pattern famiglia (31 giorni, Luglio 2026) ===')
for (const n of targets) {
  if (!rows.has(n)) { console.log(`${n.padEnd(16)} ASSENTE`); continue }
  const pat = rows.get(n)
  console.log(`${n.padEnd(16)} | ${pat.map((t, i) => `${i + 1}:${t}`).join(' ')}`)
}

// ─── confronto rotazioni (solo primi 28 giorni, P=28) ──────────────────────
console.log('\n=== Rotazioni P=28 (primi 28 gg) ===')
function rot(s, k) { k = ((k % s.length) + s.length) % s.length; return s.slice(k).concat(s.slice(0, k)) }
const bases = ['DI MONDA', 'COPPETA', "D'ELIA", 'ARMENANTE']
for (let i = 0; i < bases.length; i++) {
  const a = rows.get(bases[i])?.slice(0, 28)
  for (let j = 0; j < bases.length; j++) {
    if (i === j) continue
    const b = rows.get(bases[j])?.slice(0, 28)
    if (!a || !b) continue
    let best = null
    for (let k = 0; k < 28; k++) {
      const r = rot(b, k)
      let eq = 0
      for (let d = 0; d < 28; d++) if (r[d] === a[d]) eq++
      if (!best || eq > best.eq) best = { k, eq }
    }
    console.log(`${bases[i].padEnd(12)} vs ${bases[j].padEnd(12)}: offset=${best.k}gg  concordanza=${best.eq}/28`)
  }
}

// ─── cadenza tipi di riposo: posizioni e tipi per squadra ──────────────────
console.log('\n=== Giorni di riposo (tipo per posizione) ===')
for (const n of bases) {
  const pat = rows.get(n)?.slice(0, 28) || []
  const rests = pat.map((t, i) => (t === 'RC' || t === 'RI' || t === 'RM' || t === 'D' || t === '·' || t === 'X') ? `${i + 1}:${t}` : null).filter(Boolean)
  console.log(`${n.padEnd(12)} | ${rests.join(' ')}`)
}

// ─── Giugno vs Luglio: la riga di giugno deve essere luglio ruotato di 2 gg ──
console.log('\n=== Giugno = Luglio ruotato di 2gg? (verifica stabilità assoluta) ===')
function rotArr(s, k) { k = ((k % s.length) + s.length) % s.length; return s.slice(k).concat(s.slice(0, k)) }
for (const n of ['DI MONDA', "D'ELIA", 'COPPETA', 'ARMENANTE', 'CIPOLLETTA', 'CAIAZZO M.', 'CRISTOFARO', 'CICIA', 'DI MEO', 'MAIO', 'TURCO', 'SICA', 'CAIAZZO I.', 'COSENZA', 'CASTELLONE', 'DE SANTO', 'MANNA', 'BOCCHETTI', 'GRECO', 'MUCCI', 'SPAGNULO', 'TRANI', 'GIORDANO', 'MANNIELLO']) {
  const jul = rows.get(n)
  const jun = rows2.get(n)
  if (!jul || !jun) { console.log(`${n.padEnd(12)} | giu=${jun ? 'ok' : 'ASSENTE'} lug=${jul ? 'ok' : 'ASSENTE'}`); continue }
  const J = jun.slice(0, 28), L = jul.slice(0, 28)
  // cerca k tale che rot(giu28, k) == lug28
  let best = null
  for (let k = 0; k < 28; k++) {
    const r = rotArr(J, k)
    let eq = 0
    for (let i = 0; i < 28; i++) if (r[i] === L[i]) eq++
    if (!best || eq > best.eq) best = { k, eq }
  }
  console.log(`${n.padEnd(12)} | rot(k=${String(best.k).padStart(2)}, ok=${best.eq}/28)`)
}