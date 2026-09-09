// Analisi turni teorici dai PDF di esempio.
// Riusa la logica di estrazione di lib/pdf-parser.ts (groupByRow, tryParseMainRowByX, ...)
// Uso: node scripts/analyze-turni.mjs dump|analyze [dir-pdf]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const DEFAULT_DIR = 'C:/Users/david/Desktop/tools/pwa-v2/Turni esempio'
const DIR = process.argv[3] || DEFAULT_DIR

// ─── helpers copiati da lib/pdf-parser.ts ────────────────────────────────────

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

const EXCLUDED_FIRST = new Set([
  'RC', 'RI', 'RM', 'A', 'AG', 'D', 'VS', 'SPW', 'TIR', 'F',
  'GIORNO', 'GIORNI', 'COLORI', 'LEGENDA', 'SIGLE', 'COLORE',
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

const DAY_COL_TOLERANCE = 13

function isNearDayColumn(x, headerXMap) {
  for (const hx of Object.values(headerXMap)) {
    if (Math.abs(x - hx) <= DAY_COL_TOLERANCE) return true
  }
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
    } else {
      result.push(cur)
    }
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
    if (
      nums.length === daysInMonth &&
      Math.min(...nums) === 1 &&
      Math.max(...nums) === daysInMonth
    ) headerIndices.push(i)
  })
  if (headerIndices.length === 0) return results

  for (let h = 0; h < headerIndices.length; h++) {
    const headerRow = rows[headerIndices[h]]
    const headerXMap = {}
    headerRow.items.filter(it => /^\d+$/.test(it.str)).forEach(it => {
      headerXMap[parseInt(it.str)] = it.x
    })

    const groupStart = headerIndices[h] + 2
    const groupEnd = h + 1 < headerIndices.length ? headerIndices[h + 1] : rows.length
    const groupRows = rows.slice(groupStart, groupEnd)

    let pendingMod = null
    for (const row of groupRows) {
      const mergedItems = mergeClosePdfItems(row.items)
      const parsed = tryParseMainRowByX(mergedItems, headerXMap, daysInMonth)

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

// ─── parsing PDF ─────────────────────────────────────────────────────────────

const MONTHS = {
  'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
  'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12,
}

function monthFromFilename(file) {
  const m = file.match(/^([A-Za-z]+?)_(\d{2})-(\d{2})-(\d{4})/)
  if (!m) return null
  const name = m[1].toLowerCase()
  const monthIdx = MONTHS[name]
  if (!monthIdx) return null
  const year = parseInt(m[4])
  const daysInMonth = new Date(year, monthIdx, 0).getDate()
  return { name: m[1], monthIdx, year, daysInMonth }
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
      const rows = groupByRow(textItems)
      const meta = monthFromFilename(path.basename(filePath))
      allPersons.push(...processPageRows(rows, meta.daysInMonth))
    } catch (err) {
      console.error('PDF parse error (page render)', err)
    }
    return ''
  }

  await pdfParse(buffer, { pagerender })
  return allPersons
}

// ─── main ────────────────────────────────────────────────────────────────────
const mode = process.argv[2] || 'dump'

// DIR: usa il primo argomento che è una cartella esistente, altrimenti default
const argDir = process.argv.slice(3).find(a => { try { return fs.statSync(a).isDirectory() } catch { return false } })
const PDF_DIR = argDir || DEFAULT_DIR
const files = fs.readdirSync(PDF_DIR).filter(f => f.toLowerCase().endsWith('.pdf')).sort()

const allData = []
for (const file of files) {
  const meta = monthFromFilename(file)
  if (!meta) { console.log(`SKIP (nome non riconosciuto): ${file}`); continue }
  const persons = await parsePdf(path.join(PDF_DIR, file))
  allData.push({ file, meta, persons })
}

if (mode === 'dump') {
  for (const { file, meta, persons } of allData) {
    console.log(`\n===== ${file} (${meta.name} ${meta.year}) =====`)
    for (const p of persons) {
      const seq = p.theoreticalShifts.map((s, i) => s || '·').join('')
      const mods = Object.entries(p.modByDay).map(([d, s]) => `${d}:${s}`).join(' ')
      console.log(`${p.name.padEnd(28)} | ${seq}${mods ? '  [mod: ' + mods + ']' : ''}`)
    }
  }
} else if (mode === 'days') {
  // dump giorno-per-giorno (token per colonna giorno)
  for (const { file, meta, persons } of allData) {
    console.log(`\n===== ${file} (${meta.name} ${meta.year}) =====`)
    for (const p of persons) {
      const cells = p.theoreticalShifts.map((s, i) => `${i + 1}:${s || '·'}`).join(' ')
      console.log(`${p.name.padEnd(24)} | ${cells}`)
    }
  }
} else if (mode === 'diag') {
  // diagnostica: per ogni persona, periodo minimo trovato DENTRO ogni singolo mese
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }
  function monthPeriod(shifts) {
    const L = shifts.length
    for (let P = 1; P <= Math.floor(L / 2) + 1; P++) {
      let ok = true
      for (let i = 0; i + P < L; i++) if (shifts[i] !== shifts[i + P]) { ok = false; break }
      if (ok) return P
    }
    return null
  }
  const names = Object.keys(persons).sort()
  for (const name of names) {
    const months = persons[name]
    if (months.length < 6) continue
    const perMonth = months.map(({ file, meta, shifts }) => `${meta.year}-${String(meta.monthIdx).padStart(2, '0')}:${monthPeriod(shifts) ?? '-'}`).join(' ')
    console.log(`${name.padEnd(26)} | ${perMonth}`)
  }
} else if (mode === 'conflicts') {
  // per una persona: verifica P e mostra i conflitti (stesso residuo, token diversi)
  const DAY0 = Date.UTC(2025, 0, 1) / 86400000
  function absDay(year, monthIdx, day) { return Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0 }
  const target = process.argv[3] || 'DI MONDA'
  const P = parseInt(process.argv[4] || '28')
  const asType = process.argv[5] === 'type'
  const typeOf = t => {
    const u = t.toUpperCase()
    if (!u) return 'R'
    if (u[0] === 'M') return 'M'
    if (u[0] === 'N') return 'N'
    if (u[0] === 'P') return 'P'
    if (u[0] === 'G' || u[0] === 'R' || u[0] === 'D') return 'R'
    return 'X'
  }
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }
  const months = persons[target]
  if (!months) { console.log('persona non trovata'); process.exit(1) }
  const rows = []
  for (const { file, meta, shifts } of months) {
    const cells = shifts.map((t, i) => ({ abs: absDay(meta.year, meta.monthIdx, i + 1), tok: asType ? typeOf(t) : t.toUpperCase(), day: i + 1 }))
    rows.push({ file, meta, cells })
  }
  rows.sort((a, b) => a.cells[0].abs - b.cells[0].abs)
  const byRes = new Map()
  const conflicts = []
  for (const { file, meta, cells } of rows) {
    for (const { abs, tok, day } of cells) {
      const r = ((abs % P) + P) % P
      const prev = byRes.get(r)
      if (prev !== undefined && prev.tok !== tok) {
        conflicts.push({ file, meta, day, abs, r, tok, prevTok: prev.tok, prevFile: prev.file })
      } else if (prev === undefined) {
        byRes.set(r, { tok, file })
      }
    }
  }
  console.log(`=== ${target} | P=${P} | mesi=${rows.length} | conflitti=${conflicts.length} ===`)
  for (const c of conflicts.slice(0, 60)) {
    console.log(`${c.file.padEnd(28)} giorno=${String(c.day).padStart(2)} abs=${c.abs} res=${String(c.r).padStart(2)} | ${c.prevTok.padEnd(6)} -> ${c.tok.padEnd(6)} (conflitto con ${c.prevFile})`)
  }
  // per ogni mese: sequenza di token con giorno, per verificare visivamente
  console.log('\n--- righe complete ---')
  for (const { file, meta, cells } of rows) {
    const line = cells.map(c => `${c.day}:${c.tok || '·'}`).join(' ')
    console.log(`${meta.name} ${meta.year} (${file}) | ${line}`)
  }
} else if (mode === 'rotations') {
  // analisi a LIVELLO DI TIPO: M/N/P/riposo, ignora sezione+slot
  // così le sezioni che cambiano nel tempo non rompono la periodicità
  const DAY0 = Date.UTC(2025, 0, 1) / 86400000
  function absDay(year, monthIdx, day) { return Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0 }
  const norm = t => t.toUpperCase()
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }
  // raccogli tutti i token visti nelle colonne giorni per filtrare le righe-spazzatura
  const dayTokens = new Set()
  for (const months of Object.values(persons)) {
    for (const { shifts } of months) shifts.forEach(t => { if (t) dayTokens.add(t.toUpperCase()) })
  }
  // filtra righe-spazzatura: "nome" che è un codice turno visto nelle colonne giorni
  // (ogni parola del nome deve essere un token-giorno, es. "NDCP PDCP" o "MM3M40")
  const isShiftCodeName = n => {
    const words = n.toUpperCase().split(/\s+/).filter(w => w.length >= 2)
    if (words.length === 0) return true
    if (words.every(w => dayTokens.has(w))) return true
    if (n.replace(/\s+/g, '').toUpperCase().endsWith('TIR') && /^[MNP]/.test(n.replace(/\s+/g, '').toUpperCase())) return true
    return false
  }
  // tipo: M/N/P se inizia con quelle lettere; G e R e D e vuoto => riposo; altro => X
  const typeOf = t => {
    const u = norm(t)
    if (!u) return 'R'
    if (u[0] === 'M') return 'M'
    if (u[0] === 'N') return 'N'
    if (u[0] === 'P') return 'P'
    if (u[0] === 'G' || u[0] === 'R' || u[0] === 'D') return 'R'
    return 'X'
  }
  const personDays = {}
  for (const [name, months] of Object.entries(persons)) {
    if (isShiftCodeName(name)) continue
    const pairs = []
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => pairs.push({ abs: absDay(meta.year, meta.monthIdx, i + 1), tok: typeOf(t) }))
    }
    pairs.sort((a, b) => a.abs - b.abs)
    personDays[name] = pairs
  }
  const MIN_AGREE = 0.9
  function minPeriod(pairs, maxP = 60) {
    for (let P = 1; P <= maxP; P++) {
      const byRes = new Map()
      let agree = 0
      for (const { abs, tok } of pairs) {
        const r = ((abs % P) + P) % P
        if (!byRes.has(r)) byRes.set(r, new Map())
        const counts = byRes.get(r)
        counts.set(tok, (counts.get(tok) || 0) + 1)
        agree++
      }
      let agreeing = 0
      const pattern = []
      let allSame = true
      let firstTok = null
      for (let r = 0; r < P; r++) {
        const counts = byRes.get(r)
        if (!counts) { pattern.push(''); continue }
        let bestTok = null, bestN = 0
        for (const [tok, n] of counts) if (n > bestN) { bestN = n; bestTok = tok }
        agreeing += bestN
        pattern.push(bestTok)
        if (firstTok === null) firstTok = bestTok
        else if (bestTok !== firstTok) allSame = false
      }
      if (agree > 0 && agreeing / agree >= MIN_AGREE && !allSame) {
        return { P, pattern, agree: Math.round((agreeing / agree) * 100) }
      }
    }
    return null
  }
  const results = []
  for (const [name, pairs] of Object.entries(personDays)) {
    const mp = minPeriod(pairs)
    results.push({ name, months: persons[name].length, days: pairs.length, ...(mp ? { P: mp.P, pattern: mp.pattern, agree: mp.agree } : { P: null, pattern: null }) })
  }
  console.log('===== ROTAZIONI (livello tipo M/N/P/riposo) =====')
  for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
    if (r.P) {
      const pat = r.pattern.join('')
      console.log(`${r.name.padEnd(26)} P=${String(r.P).padEnd(3)} ok=${String(r.agree).padEnd(3)}% mesi=${String(r.months).padEnd(2)} | ${pat}`)
    } else {
      console.log(`${r.name.padEnd(26)} P=?   (nessuna rotazione stabile)`)
    }
  }
  // squadre per rotazione
  const teams = new Map()
  for (const r of results) {
    if (!r.P) continue
    const key = `${r.P}:${r.pattern.join('')}`
    if (!teams.has(key)) teams.set(key, [])
    teams.get(key).push(r.name)
  }
  console.log('\n===== SQUADRE PER ROTAZIONE =====')
  let idx = 0
  for (const [key, members] of teams.entries()) {
    idx++
    const [P, pat] = key.split(':')
    console.log(`\nRotazione ${String(idx).padStart(2)} | P=${P} giorni | ${members.length} membri`)
    console.log(`  pattern: ${pat.split('').map((t, i) => `${i + 1}:${t}`).join(' ')}`)
    console.log(`  membri: ${members.sort().join(', ')}`)
  }
  const noPeriod = results.filter(r => !r.P).map(r => r.name)
  console.log(`\n===== SENZA ROTAZIONE STABILE (${noPeriod.length}) =====`)
  console.log(noPeriod.join(', '))
} else if (mode === 'families') {
  // per TUTTI: pattern di maggioranza a P=28 forzato (livello tipo), con % accordo
  const DAY0 = Date.UTC(2025, 0, 1) / 86400000
  function absDay(year, monthIdx, day) { return Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0 }
  const norm = t => t.toUpperCase()
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }
  const dayTokens = new Set()
  for (const months of Object.values(persons)) {
    for (const { shifts } of months) shifts.forEach(t => { if (t) dayTokens.add(t.toUpperCase()) })
  }
  const isShiftCodeName = n => {
    const words = n.toUpperCase().split(/\s+/).filter(w => w.length >= 2)
    if (words.length === 0) return true
    if (words.every(w => dayTokens.has(w))) return true
    if (n.replace(/\s+/g, '').toUpperCase().endsWith('TIR') && /^[MNP]/.test(n.replace(/\s+/g, '').toUpperCase())) return true
    return false
  }
  const typeOf = t => {
    const u = norm(t)
    if (!u) return 'R'
    if (u[0] === 'M') return 'M'
    if (u[0] === 'N') return 'N'
    if (u[0] === 'P') return 'P'
    if (u[0] === 'G' || u[0] === 'R' || u[0] === 'D') return 'R'
    return 'X'
  }
  const P = 28
  const rows = []
  for (const [name, months] of Object.entries(persons)) {
    if (isShiftCodeName(name)) continue
    const countsByRes = Array.from({ length: P }, () => new Map())
    let total = 0
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => {
        const abs = absDay(meta.year, meta.monthIdx, i + 1)
        const r = ((abs % P) + P) % P
        const tok = typeOf(t)
        countsByRes[r].set(tok, (countsByRes[r].get(tok) || 0) + 1)
        total++
      })
    }
    const pattern = countsByRes.map(c => [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?')
    let agreeing = 0
    countsByRes.forEach((c, r) => { agreeing += c.get(pattern[r]) || 0 })
    rows.push({ name, months: months.length, pattern: pattern.join(''), agree: Math.round((agreeing / total) * 100) })
  }
  // raggruppa per pattern
  const groups = new Map()
  for (const r of rows) {
    if (!groups.has(r.pattern)) groups.set(r.pattern, [])
    groups.get(r.pattern).push(r)
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  let gi = 0
  for (const [pattern, members] of sorted) {
    gi++
    const avgAgree = Math.round(members.reduce((s, m) => s + m.agree, 0) / members.length)
    console.log(`\nFamiglia ${String(gi).padStart(2)} | ${members.length} persone | accordo medio ${avgAgree}%`)
    console.log(`  pattern: ${pattern.split('').map((c, i) => `${i + 1}:${c}`).join(' ')}`)
    console.log(`  persone: ${members.sort((a, b) => b.agree - a.agree).map(m => `${m.name} (${m.agree}%)`).join(', ')}`)
  }
} else if (mode === 'classify') {
  // classificazione secondo le categorie dell'utente
  const norm = t => t.toUpperCase()
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }
  const dayTokens = new Set()
  for (const months of Object.values(persons)) {
    for (const { shifts } of months) shifts.forEach(t => { if (t) dayTokens.add(t.toUpperCase()) })
  }
  const isShiftCodeName = n => {
    const words = n.toUpperCase().split(/\s+/).filter(w => w.length >= 2)
    if (words.length === 0) return true
    if (words.every(w => dayTokens.has(w))) return true
    if (n.replace(/\s+/g, '').toUpperCase().endsWith('TIR') && /^[MNP]/.test(n.replace(/\s+/g, '').toUpperCase())) return true
    return false
  }
  const rows = []
  for (const [name, months] of Object.entries(persons)) {
    if (isShiftCodeName(name)) continue
    const toks = new Set()
    const types = new Set()
    for (const { shifts } of months) shifts.forEach(t => {
      const u = norm(t)
      if (u) { toks.add(u); types.add(u[0]) }
    })
    const hasN = [...toks].some(t => t[0] === 'N')
    const hasM = [...toks].some(t => t[0] === 'M')
    const hasP = [...toks].some(t => t[0] === 'P')
    const hasD = toks.has('D')
    const hasGIAP = [...toks].some(t => /GIAP|IAP/.test(t))
    rows.push({ name, months: months.length, n: [...toks].length, hasM, hasN, hasP, hasD, hasGIAP, toks: [...toks].sort().join(',') })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  console.log('=== CLASSIFICAZIONE PER CATEGORIA ===')
  const cat = (r) => {
    if (r.hasN) return 'FA LE NOTTI'
    if (!r.hasN && (r.hasM || r.hasP)) {
      if (r.hasD) return 'SENZA NOTTI con D'
      return 'SENZA NOTTI senza D'
    }
    if (r.hasD) return 'SOLO D e riposi'
    return 'SOLO riposi (riga quasi vuota)'
  }
  const groups = {}
  for (const r of rows) {
    const c = cat(r)
    ;(groups[c] ||= []).push(r)
  }
  for (const [c, list] of Object.entries(groups)) {
    console.log(`\n--- ${c} (${list.length}) ---`)
    console.log(list.map(r => `${r.name}${r.hasGIAP ? ' [IAP]' : ''}`).join(', '))
  }
  console.log('\n=== DETTAGLIO (nome | mesi | M N P D | token) ===')
  for (const r of rows) {
    console.log(`${r.name.padEnd(24)} | mesi=${String(r.months).padStart(2)} | M:${r.hasM ? 'y' : '-'} N:${r.hasN ? 'y' : '-'} P:${r.hasP ? 'y' : '-'} D:${r.hasD ? 'y' : '-'} | ${r.toks}`)
  }
} else if (mode === 'teams') {
  // classificazione finale secondo la struttura reale (indicazioni utente)
  const norm = t => t.toUpperCase()
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }
  const dayTokens = new Set()
  for (const months of Object.values(persons)) {
    for (const { shifts } of months) shifts.forEach(t => { if (t) dayTokens.add(t.toUpperCase()) })
  }
  const isShiftCodeName = n => {
    const words = n.toUpperCase().split(/\s+/).filter(w => w.length >= 2)
    if (words.length === 0) return true
    if (words.every(w => dayTokens.has(w))) return true
    if (n.replace(/\s+/g, '').toUpperCase().endsWith('TIR') && /^[MNP]/.test(n.replace(/\s+/g, '').toUpperCase())) return true
    return false
  }
  const rows = []
  for (const [name, months] of Object.entries(persons)) {
    if (isShiftCodeName(name)) continue
    const toks = new Set()
    let hasM = false, hasN = false, hasP = false, hasD = false
    const sections = new Set()
    for (const { shifts } of months) {
      shifts.forEach(t => {
        const u = norm(t)
        if (!u) return
        toks.add(u)
        if (u[0] === 'M') hasM = true
        else if (u[0] === 'N') hasN = true
        else if (u[0] === 'P') hasP = true
        if (u === 'D') hasD = true
        // famiglia di sezione dal token
        if (/DCIF/.test(u)) sections.add('DCIF')
        if (/DCCM/.test(u)) sections.add('DCCM')
        if (/DCP/.test(u)) sections.add('DCP')
        if (/M3M40/.test(u)) sections.add('M3M40')
        if (/IAP|GIAP/.test(u)) sections.add('IAP')
        if (/^[MNP]\d+/.test(u)) sections.add('num')
        if (/^[MNP][A-Z]*\d?[TS]?$/.test(u) && !/DCIF|DCCM|DCP|M3M40|IAP/.test(u) && /^[MNP]/.test(u)) {
          const m = u.match(/^([MNP])(\d+)/)
          if (m) sections.add('num')
        }
      })
    }
    rows.push({ name, months: months.length, hasM, hasN, hasP, hasD, sections: [...sections].sort().join('+') })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))

  // MN settimanale: il pattern di maggioranza a P=7 contiene un solo M e una sola N
  const DAY0 = Date.UTC(2025, 0, 1) / 86400000
  function absDay(year, monthIdx, day) { return Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0 }
  const typeOf = t => {
    const u = norm(t)
    if (!u) return 'R'
    if (u[0] === 'M') return 'M'
    if (u[0] === 'N') return 'N'
    if (u[0] === 'P') return 'P'
    if (u[0] === 'G' || u[0] === 'R' || u[0] === 'D') return 'R'
    return 'X'
  }
  const weekly = new Map()
  for (const [name, months] of Object.entries(persons)) {
    if (isShiftCodeName(name)) continue
    const cnt = Array.from({ length: 7 }, () => new Map())
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => {
        const abs = absDay(meta.year, meta.monthIdx, i + 1)
        const r = ((abs % 7) + 7) % 7
        const tok = typeOf(t)
        cnt[r].set(tok, (cnt[r].get(tok) || 0) + 1)
      })
    }
    const pat = cnt.map(c => [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?')
    const nM = pat.filter(x => x === 'M').length
    const nN = pat.filter(x => x === 'N').length
    if (nM === 1 && nN === 1) weekly.set(name, pat.join(''))
  }

  // categorie dell'utente
  const cat = r => {
    const sec = r.sections
    if (sec.includes('M3M40')) return 'M3M40 (6gg)'
    if (sec.includes('IAP')) return 'IAP/GIAP'
    if (!r.hasN && (r.hasM || r.hasP)) return 'SENZA NOTTI'
    if (r.hasN && r.hasM) return 'CON NOTTI'
    if (r.hasD) return 'SOLO D/riposi'
    return 'SOLO riposi'
  }
  const groups = {}
  for (const r of rows) (groups[cat(r)] ||= []).push(r)
  for (const [c, list] of Object.entries(groups)) {
    console.log(`\n=== ${c} (${list.length}) ===`)
    console.log(list.map(r => `${r.name}${r.sections ? ' [' + r.sections + ']' : ''}${r.hasD ? ' D' : ''}${weekly.get(r.name) ? ' MN-settimanale(' + weekly.get(r.name) + ')' : ''}`).join(', '))
  }
  console.log('\n=== PERSONE CON PATTERN MN SETTIMANALE (P=7) ===')
  console.log([...weekly.entries()].map(([n, p]) => `${n} (${p})`).join(', '))
  console.log('\n=== MAI NOTTI (nessuna N nelle righe teoriche) ===')
  console.log(rows.filter(r => !r.hasN && (r.hasM || r.hasP)).map(r => r.name).join(', '))
  console.log('\n=== DETTAGLIO ===')
  for (const r of rows) {
    console.log(`${r.name.padEnd(24)} | mesi=${String(r.months).padStart(2)} | M:${r.hasM ? 'y' : '-'} N:${r.hasN ? 'y' : '-'} P:${r.hasP ? 'y' : '-'} D:${r.hasD ? 'y' : '-'} | sezioni: ${r.sections || '-'}`)
  }
} else if (mode === 'export') {
  // export completo: riga completa e tipo, per persona + squadre
  const DAY0 = Date.UTC(2025, 0, 1) / 86400000
  function absDay(year, monthIdx, day) { return Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0 }
  const norm = t => t.toUpperCase()
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }
  // raccogli tutti i token visti nelle colonne giorni per filtrare le righe-spazzatura
  const dayTokens = new Set()
  for (const months of Object.values(persons)) {
    for (const { shifts } of months) shifts.forEach(t => { if (t) dayTokens.add(t.toUpperCase()) })
  }
  // filtra righe-spazzatura: "nome" che è un codice turno visto nelle colonne giorni
  // (ogni parola del nome deve essere un token-giorno, es. "NDCP PDCP" o "MM3M40")
  const isShiftCodeName = n => {
    const words = n.toUpperCase().split(/\s+/).filter(w => w.length >= 2)
    if (words.length === 0) return true
    if (words.every(w => dayTokens.has(w))) return true
    if (n.replace(/\s+/g, '').toUpperCase().endsWith('TIR') && /^[MNP]/.test(n.replace(/\s+/g, '').toUpperCase())) return true
    return false
  }
  const typeOf = t => {
    const u = norm(t)
    if (!u) return 'R'
    if (u[0] === 'M') return 'M'
    if (u[0] === 'N') return 'N'
    if (u[0] === 'P') return 'P'
    if (u[0] === 'G' || u[0] === 'R' || u[0] === 'D') return 'R'
    return 'X'
  }
  const MIN_AGREE = 0.9
  function minPeriod(pairs, maxP = 60) {
    for (let P = 1; P <= maxP; P++) {
      const byRes = new Map()
      let agree = 0
      for (const { abs, tok } of pairs) {
        const r = ((abs % P) + P) % P
        if (!byRes.has(r)) byRes.set(r, new Map())
        const counts = byRes.get(r)
        counts.set(tok, (counts.get(tok) || 0) + 1)
        agree++
      }
      let agreeing = 0
      const pattern = []
      let allSame = true
      let firstTok = null
      for (let r = 0; r < P; r++) {
        const counts = byRes.get(r)
        if (!counts) { pattern.push(''); continue }
        let bestTok = null, bestN = 0
        for (const [tok, n] of counts) if (n > bestN) { bestN = n; bestTok = tok }
        agreeing += bestN
        pattern.push(bestTok)
        if (firstTok === null) firstTok = bestTok
        else if (bestTok !== firstTok) allSame = false
      }
      if (agree > 0 && agreeing / agree >= MIN_AGREE && !allSame) {
        return { P, pattern, agree: Math.round((agreeing / agree) * 100) }
      }
    }
    return null
  }
  // per persona: periodo a livello tipo + pattern completo (maggioranza per residuo)
  const out = []
  for (const [name, months] of Object.entries(persons)) {
    if (isShiftCodeName(name)) continue
    const typed = []
    const full = []
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => {
        const abs = absDay(meta.year, meta.monthIdx, i + 1)
        typed.push({ abs, tok: typeOf(t) })
        full.push({ abs, tok: norm(t) })
      })
    }
    const tp = minPeriod(typed)
    let fp = null
    if (tp) fp = minPeriod(full, 60)
    out.push({
      name,
      months: months.length,
      typePeriod: tp ? { P: tp.P, pattern: tp.pattern.join(''), agree: tp.agree } : null,
      fullPeriod: fp ? { P: fp.P, pattern: fp.pattern, agree: fp.agree } : null,
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))

  console.log('===== EXPORT PER PERSONA =====')
  for (const r of out) {
    const t = r.typePeriod ? `P=${r.typePeriod.P} ok=${r.typePeriod.agree}% ${r.typePeriod.pattern}` : 'P=?'
    const f = r.fullPeriod ? `P=${r.fullPeriod.P} ok=${r.fullPeriod.agree}% ${r.fullPeriod.pattern.join('')}` : 'P=?'
    console.log(`${r.name.padEnd(24)} mesi=${String(r.months).padStart(2)} | TIPO: ${t}  | RIGA: ${f}`)
  }

  // squadre per ROTAZIONE (tipo): raggruppa per (P, pattern)
  const teams = new Map()
  for (const r of out) {
    if (!r.typePeriod) continue
    const key = `${r.typePeriod.P}:${r.typePeriod.pattern}`
    if (!teams.has(key)) teams.set(key, [])
    teams.get(key).push(r.name)
  }
  const teamList = [...teams.entries()].map(([key, members]) => {
    const [P, pattern] = key.split(':')
    return { P: parseInt(P), pattern, members: members.sort() }
  })
  teamList.sort((a, b) => a.P - b.P || a.members.length - b.members.length)

  console.log('\n===== SQUADRE (per rotazione tipo) =====')
  teamList.forEach((t, i) => {
    console.log(`\nSquadra ${String(i + 1).padStart(2)} | ciclo=${t.P} giorni | ${t.members.length} membri`)
    console.log(`  pattern: ${t.pattern.split('').map((c, j) => `${j + 1}:${c}`).join(' ')}`)
    console.log(`  membri: ${t.members.join(', ')}`)
  })

  // relazione di fase tra rotazioni con lo stesso P
  console.log('\n===== RELAZIONI DI FASE (stesso P) =====')
  const byP = {}
  for (const t of teamList) (byP[t.P] ||= []).push(t)
  for (const [P, list] of Object.entries(byP)) {
    if (list.length < 2) continue
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].pattern, b = list[j].pattern
        // offset di fase: di quante posizioni b è a ruotato rispetto ad a
        let off = -1
        for (let k = 0; k < P; k++) {
          if (a === b.slice(k) + b.slice(0, k)) { off = k; break }
        }
        console.log(`P=${P}: pattern A (${a.slice(0, 14)}...) vs pattern B (${b.slice(0, 14)}...) => offset=${off === -1 ? 'NON è una rotazione' : off + ' giorni'}`)
      }
    }
  }

  fs.writeFileSync('scripts/turni-analisi.json', JSON.stringify({ teamList, perPerson: out }, null, 2))
  console.log('\n(scritto scripts/turni-analisi.json)')
} else if (mode === 'analyze') {
  const DAY0 = Date.UTC(2025, 0, 1) / 86400000
  function absDay(year, monthIdx, day) { return Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0 }

  // aggrega per persona
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }

  // token normalizzati (maiuscole: il PDF scrive a volte "Pdcp" = "PDCP")
  const norm = t => t.toUpperCase()

  // raccogli tutti i token visti nelle colonne giorni per filtrare le righe-spazzatura
  const dayTokens = new Set()
  for (const months of Object.values(persons)) {
    for (const { shifts } of months) shifts.forEach(t => { if (t) dayTokens.add(t.toUpperCase()) })
  }
  // filtra righe-spazzatura: "nome" che è un codice turno visto nelle colonne giorni
  // (ogni parola del nome deve essere un token-giorno, es. "NDCP PDCP" o "MM3M40")
  const isShiftCodeName = n => {
    const words = n.toUpperCase().split(/\s+/).filter(w => w.length >= 2)
    if (words.length === 0) return true
    if (words.every(w => dayTokens.has(w))) return true
    if (n.replace(/\s+/g, '').toUpperCase().endsWith('TIR') && /^[MNP]/.test(n.replace(/\s+/g, '').toUpperCase())) return true
    return false
  }

  // per ogni persona: coppie (absDay -> token)
  const personDays = {}
  for (const [name, months] of Object.entries(persons)) {
    if (isShiftCodeName(name)) continue
    const pairs = []
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => pairs.push({ abs: absDay(meta.year, meta.monthIdx, i + 1), tok: norm(t) }))
    }
    pairs.sort((a, b) => a.abs - b.abs)
    personDays[name] = pairs
  }

  // trova il periodo minimo P con TOLLERANZA: per ogni residuo vale la maggioranza,
  // P è valido se >= MIN_AGREE frazione di osservazioni concorda col token di maggioranza.
  const MIN_AGREE = 0.9
  function minPeriod(pairs, maxP = 60) {
    let best = null
    for (let P = 1; P <= maxP; P++) {
      const byRes = new Map()
      let agree = 0
      for (const { abs, tok } of pairs) {
        const r = ((abs % P) + P) % P
        if (!byRes.has(r)) byRes.set(r, new Map())
        const counts = byRes.get(r)
        counts.set(tok, (counts.get(tok) || 0) + 1)
        agree++
      }
      let agreeing = 0
      const pattern = []
      let allSame = true
      let firstTok = null
      for (let r = 0; r < P; r++) {
        const counts = byRes.get(r)
        if (!counts) { pattern.push(''); continue }
        let bestTok = null, bestN = 0, total = 0
        for (const [tok, n] of counts) {
          total += n
          if (n > bestN) { bestN = n; bestTok = tok }
        }
        agreeing += bestN
        pattern.push(bestTok)
        if (firstTok === null) firstTok = bestTok
        else if (bestTok !== firstTok) allSame = false
      }
      if (agree > 0 && agreeing / agree >= MIN_AGREE && !allSame) {
        best = { P, pattern, agree: agreeing / agree }
        break
      }
    }
    return best
  }

  const results = []
  for (const [name, pairs] of Object.entries(personDays)) {
    const mp = minPeriod(pairs)
    results.push({ name, months: persons[name].length, days: pairs.length, ...(mp ? { P: mp.P, pattern: mp.pattern, agree: mp.agree } : { P: null, pattern: null }) })
  }

  // squadre: stesso (P, pattern con fase) => stessa riga teorica
  const teams = new Map()
  for (const r of results) {
    if (!r.P) continue
    const key = JSON.stringify([r.P, r.pattern])
    if (!teams.has(key)) teams.set(key, [])
    teams.get(key).push(r.name)
  }

  console.log('\n===== ANALISI PER PERSONA =====')
  for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
    if (r.P) {
      const pat = r.pattern.map((t, i) => `${i + 1}:${t || '·'}`).join(' ')
      console.log(`${r.name.padEnd(26)} P=${String(r.P).padEnd(3)} mesi=${String(r.months).padEnd(2)} giorni=${String(r.days).padEnd(3)} pattern=[${pat}]`)
    } else {
      console.log(`${r.name.padEnd(26)} P=?   mesi=${String(r.months).padEnd(2)} giorni=${String(r.days).padEnd(3)} (nessun periodo <= 60 trovato)`)
    }
  }

  console.log('\n===== SQUADRE =====')
  let tIdx = 0
  for (const [key, members] of teams.entries()) {
    tIdx++
    const [P, pattern] = JSON.parse(key)
    const pat = pattern.map((t, i) => `${i + 1}:${t || '·'}`).join(' ')
    console.log(`\nSquadra ${String(tIdx).padStart(2)} | P=${P} giorni | ${members.length} membri`)
    console.log(`  pattern: ${pat}`)
    console.log(`  membri: ${members.sort().join(', ')}`)
  }

  // persone senza squadra (non periodiche)
  const orphans = results.filter(r => !r.P)
  if (orphans.length) {
    console.log(`\n===== SENZA PERIODO (${orphans.length}) =====`)
    for (const r of orphans) console.log(`  ${r.name} (mesi=${r.months}, giorni=${r.days})`)
  }
} else if (mode === 'restperiod') {
  // periodo minimo a livello RIPOSO/LAVORO (R/W): riposo = tutto ciò che non è M/N/P
  // verifica la correzione dell'utente: le scorte hanno blocchi di riposo che ciclano ogni 28 giorni
  const DAY0 = Date.UTC(2025, 0, 1) / 86400000
  function absDay(year, monthIdx, day) { return Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0 }
  const isWork = t => /^[MNP]/.test((t || '').toUpperCase())
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }
  const targets = process.argv.slice(3)
  const names = targets.length ? targets : Object.keys(persons).sort()
  // periodo a livello R/W con TOLLERANZA (maggioranza per residuo, come le altre modalità)
  const MIN_AGREE = 0.9
  function minPeriodRW(pairs, maxP = 90) {
    for (let P = 1; P <= maxP; P++) {
      const byRes = new Map()
      for (const { abs, rw } of pairs) {
        const r = ((abs % P) + P) % P
        if (!byRes.has(r)) byRes.set(r, new Map())
        const counts = byRes.get(r)
        counts.set(rw, (counts.get(rw) || 0) + 1)
      }
      let agree = 0, agreeing = 0
      const pat = []
      for (let r = 0; r < P; r++) {
        const counts = byRes.get(r)
        if (!counts) continue
        let best = null, bestN = 0
        for (const [rw, n] of counts) { if (n > bestN) { bestN = n; best = rw } }
        agree += bestN
        agreeing += [...counts.values()].reduce((a, b) => a + b, 0)
        pat.push(best)
      }
      const hasBoth = pat.includes('R') && pat.includes('W')
      if (agree > 0 && agree / agreeing >= MIN_AGREE && hasBoth) return P
    }
    return null
  }
  for (const name of names) {
    const months = persons[name]
    if (!months) { console.log(`${name}: non trovata`); continue }
    const pairs = []
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => pairs.push({ abs: absDay(meta.year, meta.monthIdx, i + 1), rw: isWork(t) ? 'W' : 'R' }))
    }
    pairs.sort((a, b) => a.abs - b.abs)
    const P = minPeriodRW(pairs)
    const blocks = []
    let cur = pairs[0].rw, start = pairs[0].abs
    for (let i = 1; i <= pairs.length; i++) {
      const rw = i < pairs.length ? pairs[i].rw : null
      if (rw !== cur) { blocks.push({ rw: cur, len: pairs[i - 1].abs - start + 1 }); cur = rw; start = i < pairs.length ? pairs[i].abs : 0 }
    }
    // pattern di maggioranza per il P trovato
    let pat = ''
    if (P) {
      const byRes = new Map()
      for (const { abs, rw } of pairs) {
        const r = ((abs % P) + P) % P
        if (!byRes.has(r)) byRes.set(r, new Map())
        const counts = byRes.get(r)
        counts.set(rw, (counts.get(rw) || 0) + 1)
      }
      for (let r = 0; r < P; r++) {
        const counts = byRes.get(r)
        if (!counts) { pat += '·'; continue }
        let best = null, bestN = 0
        for (const [rw, n] of counts) if (n > bestN) { bestN = n; best = rw }
        pat += best
      }
    }
    const blk = blocks.map(b => `${b.rw}${b.len}`).join(' ')
    console.log(`${name.padEnd(26)} P(RW)=${String(P ?? '?').padEnd(3)} giorni=${pairs.length} | pattern: ${pat} | blocchi: ${blk}`)
  }
} else if (mode === 'groups') {
  // ANALISI DEI GRUPPI a livello di FAMIGLIA: M/N/P + tipo di riposo (RC/RI/RM/D/blank/X)
  // il ciclo deve includere la cadenza dei tipi di riposo: non può esistere un ciclo con solo RC
  const DAY0 = Date.UTC(2025, 0, 1) / 86400000
  function absDay(year, monthIdx, day) { return Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0 }
  const fam = t => {
    const u = (t || '').toUpperCase()
    if (!u) return '·'
    if (u === 'RC') return 'RC'
    if (u === 'RI') return 'RI'
    if (u === 'RM') return 'RM'
    if (u === 'D') return 'D'
    if (/^[MNP]/.test(u)) return u[0]
    if (/^[GR]/.test(u) && u !== 'RC' && u !== 'RI' && u !== 'RM') return 'X'
    return 'X'
  }
  const isName = n => {
    const words = n.toUpperCase().split(/\s+/).filter(w => w.length >= 2)
    if (words.length === 0) return false
    // un nome vero non è composto solo da token-turno; i token turno non hanno spazi lunghi
    return !/^(NDCP|PDCP|MDCP|MDCCM|NDCCM|PDCCM|MDCIF|NDCIF|PDCIF|MRIC|PRIC|M3M40|PM3M40|MM3M40|MIAP|PIAP|GIAP|R|RC|RI|RM|D)$/.test(n.trim().toUpperCase())
  }
  const persons = {}
  for (const { file, meta, persons: ps } of allData) {
    for (const p of ps) {
      if (!isName(p.name)) continue
      if (!persons[p.name]) persons[p.name] = []
      persons[p.name].push({ file, meta, shifts: p.theoreticalShifts })
    }
  }
  // CICLO MINIMO dentro un singolo mese: il turno teorico è ancorato al giorno 1 del mese,
  // ma i tipi di riposo (RC/RI/RM) vengono ridistribuiti tra i mesi → il ciclo completo
  // con i tipi di riposo va letto nel mese di riferimento (ultimo disponibile per persona).
  // Cerca il periodo minimo P nel pattern del mese (confronti diretti giorno i vs i+P).
  function minPeriodMonth(shifts, maxP = 62) {
    const L = shifts.length
    for (let P = 1; P <= maxP; P++) {
      let agree = 0, tot = 0
      for (let i = 0; i + P < L; i++) {
        tot++
        if (shifts[i] === shifts[i + P]) agree++
      }
      // vuole il minimo P con alta concordanza e pattern non costante
      if (tot > 0 && agree / tot >= 0.95) {
        const pat = shifts.slice(0, P)
        const restSet = new Set(pat.filter(t => t === 'RC' || t === 'RI' || t === 'RM' || t === 'D'))
        const hasWork = pat.some(t => t === 'M' || t === 'N' || t === 'P')
        if (restSet.size > 0 && hasWork) return { P, pattern: pat, restTypes: [...restSet].join('/'), agree: agree / tot }
      }
    }
    return null
  }
  const results = []
  for (const [name, months] of Object.entries(persons)) {
    // ultimo mese cronologico disponibile per questa persona
    const last = [...months]
      .sort((a, b) => (a.meta.year * 100 + a.meta.monthIdx) - (b.meta.year * 100 + b.meta.monthIdx))
      .pop()
    const fams = last.shifts.map(fam)
    const r = minPeriodMonth(fams)
    results.push({ name, file: last.file, days: fams.length, ...(r ? { P: r.P, pattern: r.pattern, restTypes: r.restTypes, agree: Math.round(r.agree * 100) } : { P: null }) })
  }

  // raggruppa per (P, pattern) esatto, poi unisci le rotazioni (stesso pattern ruotato)
  const exact = new Map()
  for (const r of results) {
    if (!r.P) continue
    const key = `${r.P}|${r.pattern.join('')}`
    if (!exact.has(key)) exact.set(key, { P: r.P, pattern: r.pattern, members: [], agree: r.agree })
    exact.get(key).members.push(r.name)
  }
  const rotations = []
  const used = new Set()
  for (const [key, g] of exact.entries()) {
    if (used.has(key)) continue
    const group = { P: g.P, pattern: g.pattern, members: [...g.members], agree: g.agree, phases: [{ offset: 0, members: [...g.members] }] }
    for (const [key2, g2] of exact.entries()) {
      if (key2 === key || used.has(key2) || g2.P !== g.P) continue
      const a = g.pattern, b = g2.pattern
      for (let k = 0; k < g.P; k++) {
        const r = b.slice(k).concat(b.slice(0, k))
        if (a.every((t, i) => t === r[i])) {
          group.phases.push({ offset: k, members: [...g2.members] })
          used.add(key2)
          break
        }
      }
    }
    used.add(key)
    rotations.push(group)
  }
  rotations.sort((a, b) => a.P - b.P)

  console.log('\n===== GRUPPI PER ROTAZIONE (livello famiglia M/N/P + RC/RI/RM/D) =====')
  rotations.forEach((g, i) => {
    const pat = g.pattern.map((t, j) => `${j + 1}:${t}`).join(' ')
    const all = g.phases.flatMap(p => p.members)
    console.log(`\nGruppo ${String(i + 1).padStart(2)} | ciclo=${g.P} giorni | ${all.length} persone | riposi nel ciclo: ${g.phases[0].members.length ? '' : ''}${[...new Set(g.pattern.filter(t => t === 'RC' || t === 'RI' || t === 'RM' || t === 'D'))].join(',') || 'nessuno'}`)
    console.log(`  pattern: ${pat}`)
    console.log(`  accordo: ${g.agree}%`)
    for (const ph of g.phases) {
      console.log(`  fase +${String(ph.offset).padStart(2)}gg (${ph.members.length}): ${ph.members.sort().join(', ')}`)
    }
  })
  const orphans = results.filter(r => !r.P)
  if (orphans.length) {
    console.log(`\n===== SENZA CICLO TROVATO (${orphans.length}) =====`)
    for (const r of orphans) console.log(`  ${r.name} (giorni=${r.days})`)
  }
} else if (mode === 'periods') {
  // PERIODI DEFINITIVI: timeline ASSOLUTA per persona (i turni teorici sono ancorati
  // alla data assoluta: giugno = luglio ruotato di 2 gg), voto di maggioranza per
  // residuo a livello FAMIGLIA (M/N/P + RC/RI/RM/D), tolleranza configurabile.
  const MIN_AGREE = parseFloat(process.argv[4] || '0.9')
  const DAY0 = Date.UTC(2025, 0, 1) / 86400000
  function absDay(year, monthIdx, day) { return Date.UTC(year, monthIdx - 1, day) / 86400000 - DAY0 }
  const norm = t => (t || '').toUpperCase()
  const fam = t => {
    const u = norm(t)
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
  const personDays = {}
  for (const [name, months] of Object.entries(persons)) {
    const pairs = []
    for (const { meta, shifts } of months) {
      shifts.forEach((t, i) => pairs.push({ abs: absDay(meta.year, meta.monthIdx, i + 1), tok: fam(t) }))
    }
    pairs.sort((a, b) => a.abs - b.abs)
    personDays[name] = pairs
  }
  function minPeriod(pairs, maxP = 90) {
    for (let P = 1; P <= maxP; P++) {
      const byRes = new Map()
      let agree = 0
      for (const { abs, tok } of pairs) {
        const r = ((abs % P) + P) % P
        if (!byRes.has(r)) byRes.set(r, new Map())
        const counts = byRes.get(r)
        counts.set(tok, (counts.get(tok) || 0) + 1)
        agree++
      }
      let agreeing = 0
      const pattern = []
      let allSame = true
      let firstTok = null
      for (let r = 0; r < P; r++) {
        const counts = byRes.get(r)
        if (!counts) { pattern.push('·'); continue }
        let bestTok = null, bestN = 0
        for (const [tok, n] of counts) if (n > bestN) { bestN = n; bestTok = tok }
        agreeing += bestN
        pattern.push(bestTok)
        if (firstTok === null) firstTok = bestTok
        else if (bestTok !== firstTok) allSame = false
      }
      if (agree > 0 && agreeing / agree >= MIN_AGREE && !allSame) {
        const restSet = new Set(pattern.filter(t => t === 'RC' || t === 'RI' || t === 'RM' || t === 'D'))
        const hasWork = pattern.some(t => t === 'M' || t === 'N' || t === 'P')
        if (restSet.size > 0 && hasWork) return { P, pattern, agree: Math.round((agreeing / agree) * 100) }
      }
    }
    return null
  }
  const results = []
  for (const [name, pairs] of Object.entries(personDays)) {
    const mp = minPeriod(pairs)
    results.push({ name, months: persons[name].length, days: pairs.length, ...(mp ? { P: mp.P, pattern: mp.pattern, agree: mp.agree } : { P: null }) })
  }
  // raggruppa per (P, pattern) con fusione delle rotazioni (array di token)
  const exact = new Map()
  for (const r of results) {
    if (!r.P) continue
    const key = `${r.P}|${r.pattern.join('')}`
    if (!exact.has(key)) exact.set(key, { P: r.P, pattern: r.pattern, members: [], agree: r.agree })
    exact.get(key).members.push(r.name)
  }
  const rotations = []
  const used = new Set()
  for (const [key, g] of exact.entries()) {
    if (used.has(key)) continue
    const group = { P: g.P, pattern: g.pattern, agree: g.agree, phases: [{ offset: 0, members: [...g.members] }] }
    for (const [key2, g2] of exact.entries()) {
      if (key2 === key || used.has(key2) || g2.P !== g.P) continue
      const a = g.pattern, b = g2.pattern
      for (let k = 0; k < g.P; k++) {
        const r = b.slice(k).concat(b.slice(0, k))
        if (a.every((t, i) => t === r[i])) { group.phases.push({ offset: k, members: [...g2.members] }); used.add(key2); break }
      }
    }
    used.add(key)
    rotations.push(group)
  }
  rotations.sort((a, b) => a.P - b.P)
  console.log(`\n===== PERIODI DEFINITIVI (livello famiglia, soglia=${MIN_AGREE}) =====`)
  rotations.forEach((g, i) => {
    const all = g.phases.flatMap(p => p.members)
    const rests = [...new Set(g.pattern.filter(t => t === 'RC' || t === 'RI' || t === 'RM' || t === 'D'))]
    console.log(`\nGruppo ${String(i + 1).padStart(2)} | ciclo=${g.P} giorni | ${all.length} persone | riposi nel ciclo: ${rests.join(',') || 'nessuno'} | accordo ~${g.agree}%`)
    console.log(`  pattern: ${g.pattern.map((t, j) => `${j + 1}:${t}`).join(' ')}`)
    for (const ph of g.phases) console.log(`  fase +${String(ph.offset).padStart(2)}gg (${ph.members.length}): ${ph.members.sort().join(', ')}`)
  })
  const orphans = results.filter(r => !r.P)
  if (orphans.length) {
    console.log(`\n===== SENZA PERIODO STABILE (${orphans.length}) =====`)
    for (const r of orphans) console.log(`  ${r.name} (mesi=${r.months}, giorni=${r.days})`)
  }
}
