// Scorte semplici: sottogruppi e ciclo 28 giorni nella struttura NUOVA (post-rivoluzione)
// 1) trova tutti i candidati (righe con M/N nudi o solo D/RC/RI/RM)
// 2) per gli ultimi mesi: trova le date RM (ogni 28gg?) e il pattern 28 giorni
// 3) raggruppa per pattern/fase
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')
const DIR = process.argv[2] || 'C:/Users/david/Desktop/tools/pwa-v2/Turni esempio'

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
const fam = t => {
  const u = (t || '').toUpperCase()
  if (!u) return '·'
  if (u === 'RC' || u === 'RI' || u === 'RM' || u === 'D') return u
  if (/^M[0-9]/.test(u)) return 'M'
  if (/^N[0-9]/.test(u)) return 'N'
  if (/^P[0-9]/.test(u)) return 'P'
  if (u === 'M' || u === 'N' || u === 'P') return u
  return 'X'
}

const MODE = process.argv[3] || 'candidati'

if (MODE === 'candidati') {
  // trova chi ha M/N nudi oppure righe solo D/RC/RI/RM negli ultimi 3 mesi
  for (const n of Object.keys(persons).sort()) {
    const months = persons[n].slice(-3)
    if (months.length < 3) continue
    let hasMN = false, hasSect = false, onlyRest = true
    for (const { shifts } of months) {
      for (const t of shifts) {
        const u = (t || '').toUpperCase()
        if (u === 'M' || u === 'N') hasMN = true
        if (/^[MNP][0-9]/.test(u)) hasSect = true
        if (u !== 'D' && u !== 'RC' && u !== 'RI' && u !== 'RM' && u !== '' && u !== 'M' && u !== 'N') onlyRest = false
      }
    }
    if ((hasMN && !hasSect) || onlyRest) {
      const last = months[months.length - 1]
      console.log(`${n.padEnd(18)} | MN-nudo=${hasMN} solo-riposi=${onlyRest} | ${last.shifts.map((t, i) => `${i + 1}:${fam(t)}`).join(' ')}`)
    }
  }
} else if (MODE === 'rm') {
  // date RM per persona negli ultimi 6 mesi (per trovare fase/sottogruppo)
  const targets = (process.argv[4] || '').split(',').filter(Boolean)
  const list = targets.length ? targets : Object.keys(persons)
  for (const n of list) {
    const months = persons[n]
    if (!months) continue
    const rms = []
    for (const { meta, shifts } of months.slice(-6)) {
      shifts.forEach((t, i) => { if ((t || '').toUpperCase() === 'RM') rms.push(`${meta.year}-${String(meta.monthIdx).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`) })
    }
    if (rms.length) console.log(`${n.padEnd(18)} | RM: ${rms.join(', ')}`)
  }
} else if (MODE === 'pattern') {
  // pattern 28 giorni da RM a RM (ultimo blocco completo), per persona
  const targets = (process.argv[4] || '').split(',').filter(Boolean)
  for (const n of targets) {
    const months = persons[n]
    if (!months) continue
    // timeline famiglia
    const pairs = []
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => pairs.push({ abs: absDay(meta.year, meta.monthIdx, i + 1), tok: fam(t) }))
    }
    pairs.sort((a, b) => a.abs - b.abs)
    const rms = []
    for (let i = 0; i < pairs.length; i++) if (pairs[i].tok === 'RM') rms.push(i)
    if (rms.length < 2) { console.log(`${n}: nessuna RM`); continue }
    // trova l'ultima coppia di RM a 28 giorni esatti
    let a = null, b = null
    for (let k = rms.length - 1; k >= 1; k--) {
      if (pairs[rms[k]].abs - pairs[rms[k - 1]].abs === 28) { a = rms[k - 1]; b = rms[k]; break }
    }
    if (a === null) { console.log(`${n}: nessuna coppia RM a 28gg`); continue }
    const pat = pairs.slice(a, b).map(p => p.tok)
    const restCount = pat.filter(t => t !== 'D' && t !== '·' && t !== 'X').length
    console.log(`${n.padEnd(18)} | riposi=${restCount}/28 | ${pat.map((t, i) => `${i + 1}:${t}`).join(' ')}`)
  }
}