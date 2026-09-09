// Genera supabase/migrations/020_seed_shift_teams.sql dal PDF di Luglio 2026
// (struttura verificata nell'analisi: tipologie, squadre/sottogruppi, membri).
//
// Il pattern di ogni membro è derivato per VOTO DI MAGGIORANZA sul residuo
// assoluto (mod cycle_days) usando le osservazioni dei mesi 2026 (struttura
// post-rivoluzione). pattern_start = 2026-07-01: pattern[r] = token del giorno
// (2026-07-01 + r). I token sono normalizzati in maiuscolo (il PDF a volte
// scrive "Pdcp").
//
// Uso: node scripts/generate-seed.mjs [dir-pdf]
// Output: supabase/migrations/020_seed_shift_teams.sql + report a stdout.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const DEFAULT_DIR = 'C:/Users/david/Desktop/tools/pwa-v2/Turni esempio'
const argDir = process.argv.slice(2).find(a => { try { return fs.statSync(a).isDirectory() } catch { return false } })
const PDF_DIR = argDir || DEFAULT_DIR

// ─── estrazione (helper copiati da lib/pdf-parser.ts / analyze-turni.mjs) ───

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
    } catch (err) { console.error('PDF parse error (page render)', err) }
    return ''
  }
  await pdfParse(buffer, { pagerender })
  return allPersons
}

// ─── struttura (dall'analisi dei colori del PDF di luglio 2026) ────────────

const STRUCTURE = [
  {
    name: 'Con notti', cycle: 28, active: true,
    teams: [
      { name: 'Squadra A', phase: 21, members: ['D\'ELIA', 'PASSANNANTI', 'CAIAZZO M.', 'DI FRAIA', 'FERRIERO', 'ESPOSITO AU.', 'ESPOSITO G.', 'FATIGATI', 'MELE', 'PISCOPO', 'VOLPE'] },
      { name: 'Squadra B', phase: 0, members: ['DI MONDA', 'ROMANO N.', 'DE PASCALE P.', 'NUBI', 'CIPOLLETTA', 'MININO', 'NERI', 'ROMANO R.', 'DI NAPOLI A.', 'SMERAGLIUOLO', 'SABIA'] },
      { name: 'Squadra C', phase: 14, members: ['ARMENANTE', 'DI MONACO', 'CICIA', 'COLUCCI F.', 'GUADAGNO', 'IANNACO', 'LARICCIA', 'NAVAS', 'ESPOSITO AL.', 'SANTORO', 'STUCOVITZ'] },
      { name: 'Squadra D', phase: 7, members: ['COPPETA', 'LONI G.', 'CRISTOFARO', 'DI NAPOLI M.', 'GAGLIOTTA', 'SEMOLA', 'NIOLA', 'PICCIRILLO', 'RISO', 'RUGGIERO A.', 'TROCCHIA'] },
    ],
  },
  {
    name: 'Senza notti', cycle: 84, active: true,
    teams: [
      { name: 'ARANCIONE', phase: 0, members: ['ALBANO', 'CAIAZZO I.', 'COSTANZO', 'DI MICCO', 'ABATE'] },
      { name: 'VERDE', phase: 28, members: ['DI MEO', 'COSENZA', 'CETRANCOLO', 'MAIO', 'SICA'] },
      { name: 'ROSA', phase: 56, members: ['LANGIONE', 'TURCO', 'D\'AURIA', 'LUCIGNANO', 'ROTONDO'] },
    ],
  },
  {
    name: 'Scorte rilievo', cycle: 28, active: true,
    teams: [
      { name: 'Rilievo', phase: 0, members: ['SENATORE', 'BARRA', 'BOCCHETTI', 'DE GIOVANNI', 'COCOZZA', 'CENTOMANI', 'CORBI', 'LONI A.', 'MUCCI', 'NEVANO', 'GRECO'] },
    ],
  },
  {
    name: 'Scorte semplici', cycle: 28, active: true,
    teams: [
      { name: 'Semplici fase 0', phase: 0, members: ['BORRELLI', 'IORIO', 'MINICOZZI'] },
      { name: 'Semplici fase +7', phase: 7, members: ['MAROTTA'] },
      { name: 'Semplici fase +14', phase: 14, members: ['CAVANNA', 'DE ROSA', 'DONNARUMMA'] },
      { name: 'Semplici fase +21', phase: 21, members: ['CACCIUOLO', 'PRINCIPE'] },
      { name: 'Semplici varianti', phase: 0, members: ['DONZELLI', 'STRINGILE', 'PAPA', 'COLUCCI M.', 'SPAGNULO'] },
    ],
  },
  {
    name: 'RIC/ASTER', cycle: 84, active: true,
    teams: [
      { name: 'RIC', phase: 0, members: ['EBBREZZA', 'D\'ADDONA', 'MANNIELLO'] },
      { name: 'ASTER', phase: 28, members: ['CASTELLONE', 'DE SANTO', 'MANNA', 'PELOSI'] },
    ],
  },
  {
    name: 'IAP', cycle: 28, active: false,
    teams: [
      { name: 'IAP', phase: 0, members: ['TRANI', 'CASTALDI', 'GIORDANO', 'NAPOLITANO', 'ARIEMMA'] },
    ],
  },
]

// ─── parsing ─────────────────────────────────────────────────────────────────

const files = fs.readdirSync(PDF_DIR).filter(f => f.toLowerCase().endsWith('.pdf')).sort()
const allData = []
for (const file of files) {
  const meta = monthFromFilename(file)
  if (!meta) continue
  const persons = await parsePdf(path.join(PDF_DIR, file))
  allData.push({ file, meta, persons })
}

// per persona: osservazioni per mese 2026 (assolute)
const DAY0 = Date.UTC(2025, 0, 1) / 86400000
const absDay = (y, mo, d) => Date.UTC(y, mo - 1, d) / 86400000 - DAY0
const START_ABS = absDay(2026, 7, 1)

const personMonths = new Map() // name -> [{year, monthIdx, toks: [{day, tok}]}]
for (const { meta, persons } of allData) {
  for (const p of persons) {
    if (!personMonths.has(p.name)) personMonths.set(p.name, [])
    const toks = []
    p.theoreticalShifts.forEach((t, i) => {
      if (!t) return
      toks.push({ day: i + 1, tok: t.toUpperCase() })
    })
    personMonths.get(p.name).push({ year: meta.year, monthIdx: meta.monthIdx, toks })
  }
}

const isWork = tok => /^[MNP]/.test(tok)
const signature = toks => {
  const fam = new Set()
  for (const { tok } of toks) if (isWork(tok)) fam.add(tok[0])
  return ['M', 'N', 'P'].map(f => (fam.has(f) ? f : '')).join('')
}
const monthKey = m => m.year * 12 + m.monthIdx

// ─── derivazione pattern per membro ──────────────────────────────────────────
// Regola:
//  1. mesi "rilevanti" = mesi 2026 con lavoro (M/N/P) e STESSA firma del mese di
//     lavoro più recente (gestisce chi ha cambiato squadra, es. LONI A.); se non
//     c'è nessun mese con lavoro si usano tutti i mesi 2026.
//  2. voto di maggioranza per residuo assoluto mod cycle, ESCLUDENDO i token G
//     (guardie: incarichi temporanei, non turno teorico).
//  3. se l'accordo è < 85% (sezioni che girano mese per mese, es. i numerati delle
//     squadre principali e delle scorte di rilevo) si usa la riga VERBATIM del mese
//     di lavoro più recente: sezioni reali, cadenza reale.
//  4. i residui senza osservazioni vengono riempiti col voto di maggioranza su TUTTI
//     i mesi 2026, poi col token del residuo di fase uguale più vicino (per i cicli
//     lunghi), infine vuoti.

function majority(cycle, obsSet) {
  const pattern = []
  let agreeing = 0, total = 0
  for (let r = 0; r < cycle; r++) {
    const counts = obsSet.get(r)
    if (!counts || counts.size === 0) { pattern.push(''); continue }
    let best = '', bestN = 0
    for (const [tok, n] of counts) { total += n; if (n > bestN) { bestN = n; best = tok } }
    pattern.push(best)
    agreeing += bestN
  }
  return { pattern, agree: total ? Math.round((agreeing / total) * 100) : 0 }
}

function derivePattern(name, cycle) {
  const allMonths = (personMonths.get(name) || []).slice().sort((a, b) => monthKey(b) - monthKey(a))
  if (allMonths.length === 0) return null
  // mesi 2026 se presenti (struttura post-rivoluzione), altrimenti i 2025
  const recent = allMonths.filter(m => m.year === 2026)
  const months = recent.length > 0 ? recent : allMonths.filter(m => m.year === 2025)

  const workMonths = months.filter(m => m.toks.some(t => isWork(t.tok)))
  const latestWork = workMonths[0] || null
  const relevant = latestWork
    ? workMonths.filter(m => signature(m.toks) === signature(latestWork.toks))
    : months

  const toRes = abs => ((abs - START_ABS) % cycle + cycle) % cycle

  // voto di maggioranza sui mesi rilevanti (escludendo G)
  const obsSet = new Map()
  for (const m of relevant) {
    for (const { day, tok } of m.toks) {
      if (tok === 'G') continue
      const r = toRes(absDay(m.year, m.monthIdx, day))
      if (!obsSet.has(r)) obsSet.set(r, new Map())
      obsSet.get(r).set(tok, (obsSet.get(r).get(tok) || 0) + 1)
    }
  }
  const maj = majority(cycle, obsSet)

  if (maj.agree >= 85) {
    return { pattern: maj.pattern, agree: maj.agree, obs: [...obsSet.values()].reduce((s, c) => s + [...c.values()].reduce((a, b) => a + b, 0), 0), emptyResidues: maj.pattern.filter(t => !t).length }
  }

  // accordo basso: riga verbatim del mese di lavoro più recente (sezioni reali).
  // I giorni 29-31 di un mese di 31 giorni ricadono sui residui 0-2 (continuazione
  // del ciclo): i giorni 1-3 del mese vincono (set solo se vuoto).
  const pattern = new Array(cycle).fill('')
  if (latestWork) {
    for (const { day, tok } of latestWork.toks) {
      const r = toRes(absDay(latestWork.year, latestWork.monthIdx, day))
      if (r >= 0 && r < cycle && !pattern[r]) pattern[r] = tok
    }
  }
  // riempi i buchi col voto di maggioranza su tutti i mesi 2026 (senza filtro G)
  const allSet = new Map()
  for (const m of months) {
    for (const { day, tok } of m.toks) {
      if (tok === 'G') continue
      const r = toRes(absDay(m.year, m.monthIdx, day))
      if (!allSet.has(r)) allSet.set(r, new Map())
      allSet.get(r).set(tok, (allSet.get(r).get(tok) || 0) + 1)
    }
  }
  const allMaj = majority(cycle, allSet)
  for (let r = 0; r < cycle; r++) {
    if (!pattern[r]) pattern[r] = allMaj.pattern[r] || ''
  }
  return { pattern, agree: maj.agree, obs: [...obsSet.values()].reduce((s, c) => s + [...c.values()].reduce((a, b) => a + b, 0), 0), emptyResidues: pattern.filter(t => !t).length }
}

// ─── fix D di chiusura (senza notti) ─────────────────────────────────────────
// La D chiude il giro ogni 84 giorni alla STESSA data assoluta per tutta la
// squadra (verificato: sempre di domenica, sfasata di 28 gg tra le squadre).
// I membri assenti nelle finestre della D (ferie) spostano il residuo: forziamo
// il residuo corretto della squadra.
const D_RESIDUE_BY_TEAM = { 'ARANCIONE': 67, 'VERDE': 39, 'ROSA': 11 }

// ─── generazione SQL ─────────────────────────────────────────────────────────

const uid = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`
const sqlArr = arr => `ARRAY[${arr.map(t => `'${t.replace(/'/g, "''")}'`).join(', ')}]`

let typeN = 1, teamN = 1, memberN = 1
const lines = []
lines.push('-- 020_seed_shift_teams.sql (GENERATO da scripts/generate-seed.mjs — non modificare a mano)')
lines.push('-- Struttura delle squadre e turni teorici estratta dal PDF di Luglio 2026.')
lines.push('-- pattern_start = 2026-07-01 per tutte le tipologie: pattern[r] è il token del giorno')
lines.push('-- (2026-07-01 + r) nel ciclo (28 o 84 giorni), ancorato alla data assoluta.')
lines.push('')
lines.push('insert into public.shift_types (id, name, cycle_days, pattern_start, is_active, sort_order) values')
const typeRows = []
for (const t of STRUCTURE) {
  typeRows.push(`  ('${uid('10000000', typeN)}', '${t.name.replace(/'/g, "''")}', ${t.cycle}, '2026-07-01', ${t.active}, ${typeN})`)
  typeN++
}
lines.push(typeRows.join(',\n') + ';')
lines.push('')

for (const t of STRUCTURE) {
  const typeId = uid('10000000', STRUCTURE.indexOf(t) + 1)
  lines.push(`-- ${t.name} (ciclo ${t.cycle} giorni)`)
  lines.push(`insert into public.shift_teams (id, shift_type_id, name, phase_offset_days, sort_order) values`)
  const teamRows = []
  t.teams.forEach((team, ti) => {
    const tid = uid('20000000', teamN + ti)
    teamRows.push(`  ('${tid}', '${typeId}', '${team.name.replace(/'/g, "''")}', ${team.phase}, ${ti + 1})`)
  })
  lines.push(teamRows.join(',\n') + ';')
  lines.push('')

  for (const team of t.teams) {
    const tid = uid('20000000', teamN)
    const rows = []
    let skipped = []
    const dRes = D_RESIDUE_BY_TEAM[team.name]
    team.members.forEach((name, mi) => {
      const d = derivePattern(name, t.cycle)
      if (!d) { skipped.push(name); return }
      if (dRes !== undefined) d.pattern[dRes] = 'D'
      rows.push(`  ('${uid('30000000', memberN++)}', '${tid}', '${name.replace(/'/g, "''")}', ${sqlArr(d.pattern)}, ${mi + 1}, true)`)
    })
    if (rows.length) {
      lines.push(`insert into public.shift_team_members (id, team_id, full_name, pattern, sort_order, is_active) values`)
      lines.push(rows.join(',\n') + ';')
      lines.push('')
    }
    if (skipped.length) {
      console.log(`  !! membri senza dati 2026 in ${t.name}/${team.name}: ${skipped.join(', ')}`)
    }
    teamN++
  }
}

const outPath = path.join(process.cwd(), 'supabase/migrations/020_seed_shift_teams.sql')
fs.writeFileSync(outPath, lines.join('\n'))

// ─── report ──────────────────────────────────────────────────────────────────

console.log(`Seed scritto in ${outPath}\n`)
console.log('=== REPORT DERIVAZIONE PATTERN (mesi 2026, voto di maggioranza per residuo) ===')
for (const t of STRUCTURE) {
  console.log(`\n## ${t.name} (ciclo ${t.cycle})${t.active ? '' : ' [INATTIVA]'}`)
  for (const team of t.teams) {
    console.log(`  ${team.name} (fase +${team.phase}gg):`)
    for (const name of team.members) {
      const d = derivePattern(name, t.cycle)
      if (!d) { console.log(`    ${name.padEnd(16)} NESSUN DATO 2026`); continue }
      const pat = d.pattern.map((tok, i) => `${i + 1}:${tok || '·'}`).join(' ')
      console.log(`    ${name.padEnd(16)} obs=${String(d.obs).padStart(4)} ok=${String(d.agree).padStart(3)}% vuoti=${d.emptyResidues}`)
      if (d.agree < 90) console.log(`      pattern: ${pat}`)
    }
  }
}