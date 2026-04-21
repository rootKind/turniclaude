import { readFileSync } from 'fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const PDF_PATH = './Aprile_21-04-2026.pdf'
const DAYS_IN_MONTH = 30

// ─── helpers ─────────────────────────────────────────────────────────────────

function isShiftCode(token) {
  return /^[MNP][A-Z0-9]+$/.test(token)
}

// "M6S" → { shift:'M', section:'6', slot:'S' }
// "PDCCM" → { shift:'P', section:'DCCM', slot:null }
// "N4" → { shift:'N', section:'4', slot:null }
function parseShiftCode(token) {
  const shift = token[0]
  let raw = token.slice(1).replace(/TIR$/, '')
  // numeric section with S/T slot: e.g. "10S", "6T", "5S", "11"
  const m = raw.match(/^(\d+)([ST])?$/)
  if (m) return { shift, section: m[1], slot: m[2] ?? null }
  return { shift, section: raw, slot: null }
}

// ─── row grouping ─────────────────────────────────────────────────────────────

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

// ─── find header row (1 2 3 ... N) → returns { day → x } ────────────────────

function findHeaderXPositions(rows, daysInMonth) {
  for (const row of rows) {
    const nums = row.items.filter(it => /^\d+$/.test(it.str)).map(it => parseInt(it.str))
    if (nums.length === daysInMonth &&
      Math.min(...nums) === 1 &&
      Math.max(...nums) === daysInMonth) {
      const map = {}
      row.items.filter(it => /^\d+$/.test(it.str)).forEach(it => {
        map[parseInt(it.str)] = it.x
      })
      return map
    }
  }
  return null
}

// Mappa x → giorno più vicino dal header
function xToDay(x, headerXMap) {
  let best = null, bestDist = Infinity
  for (const [day, hx] of Object.entries(headerXMap)) {
    const d = Math.abs(x - hx)
    if (d < bestDist) { bestDist = d; best = parseInt(day) }
  }
  return best
}

// ─── parse main rows (NAME + 30 shift tokens) ────────────────────────────────

const EXCLUDED_FIRST_TOKENS = new Set(['RC','RI','RM','A','D','VS','SPW','TIR','F'])

// Un token è "nome" se: ≥2 char, non è un codice noto, non inizia in minuscolo, non è puro numero
function looksLikeName(token) {
  if (token.length < 2) return false
  if (EXCLUDED_FIRST_TOKENS.has(token)) return false
  if (/^\d+$/.test(token)) return false
  if (/^[a-z]/.test(token)) return false  // SpN, ecc.
  return true
}

function tryParseMainRow(tokens) {
  for (let nameLen = 1; nameLen <= 4; nameLen++) {
    const rest = tokens.slice(nameLen)
    if (rest.length !== DAYS_IN_MONTH) continue
    // Tutti i token del nome devono sembrare nome
    if (!tokens.slice(0, nameLen).every(looksLikeName)) continue
    return { name: tokens.slice(0, nameLen).join(' '), shifts: rest }
  }
  return null
}

// ─── classificazione token ───────────────────────────────────────────────────

// Codici di assenza (persona non presente) → ignora
const ABSENT_CODES = new Set([
  'A','AG','F','RM','RC','RI','VS','D','RIC',
])

// Sezioni non fisiche (presenti ma non su scrivania) riconoscibili come sezione dal parser
const NON_SECTION_DUTIES = new Set(['TUTOR'])

// Codici standalone che indicano "presente ma non in sezione"
function isPresentNoSection(token) {
  if (ABSENT_CODES.has(token)) return false
  // starts lowercase = SpN, SpSa, ecc.
  if (/^Sp[A-Za-z@]/.test(token)) return true
  if (/^ISp[A-Za-z]/.test(token)) return true
  if (token === 'SPW') return true
  if (token === 'GIAP') return true
  if (token === 'SpNw') return true
  if (/^Dis[A-Z]/.test(token)) return true // DisNa, DisCas
  return false
}

// ─── build schedule from one page-group ──────────────────────────────────────
// Trova tutti i "blocchi header + persone" nella pagina

function processPageRows(rows) {
  const results = [] // { name, theoreticalShifts:[30 tokens], modByDay:{day→token} }

  // Trova posizioni header (possono essere più di uno per pagina se ci sono più gruppi)
  const headerIndices = []
  rows.forEach((r, i) => {
    const nums = r.items.filter(it => /^\d+$/.test(it.str)).map(it => parseInt(it.str))
    if (nums.length === DAYS_IN_MONTH && Math.min(...nums) === 1 && Math.max(...nums) === DAYS_IN_MONTH)
      headerIndices.push(i)
  })
  if (headerIndices.length === 0) return results

  // Per ogni header, prendi le righe del gruppo successivo
  for (let h = 0; h < headerIndices.length; h++) {
    const headerRow = rows[headerIndices[h]]
    const headerXMap = {}
    headerRow.items.filter(it => /^\d+$/.test(it.str)).forEach(it => {
      headerXMap[parseInt(it.str)] = it.x
    })
    // Righe del gruppo = tra questo header e il successivo (o fine pagina)
    const groupStart = headerIndices[h] + 2 // skip header + day-names row
    const groupEnd = h + 1 < headerIndices.length ? headerIndices[h + 1] : rows.length
    const groupRows = rows.slice(groupStart, groupEnd)

    // Elabora le righe a coppie: mod (opzionale, y più alto) + main (30 token)
    let pendingMod = null
    for (const row of groupRows) {
      const tokens = row.items.map(it => it.str)
      const parsed = tryParseMainRow(tokens)

      if (parsed) {
        // È una riga MAIN
        const modByDay = {}
        if (pendingMod) {
          // Mappa ogni token mod al giorno per x-position
          for (const item of pendingMod.items) {
            const t = item.str
            if (['Mer','Gio','Ven','Sab','Dom','Lun','Mar'].includes(t)) continue
            const day = xToDay(item.x, headerXMap)
            if (day) modByDay[day] = t
          }
        }
        results.push({
          name: parsed.name,
          theoreticalShifts: parsed.shifts,
          modByDay,
        })
        pendingMod = null
      } else {
        // È una riga MOD — la salvo per associarla alla prossima riga MAIN
        pendingMod = row
      }
    }
  }

  return results
}

// ─── build final schedule ────────────────────────────────────────────────────
// schedule[day] = {
//   sections: { [sec]: { M/N/P: { surnames:{T,S,noSlot}, tirocinanti:[] } } }
//   altriPresenti: string[]
// }

function buildSchedule(allPersons) {
  const schedule = {}
  for (let d = 1; d <= DAYS_IN_MONTH; d++) schedule[d] = { sections: {}, altriPresenti: [] }

  for (const { name, theoreticalShifts, modByDay } of allPersons) {
    for (let d = 1; d <= DAYS_IN_MONTH; d++) {
      const effectiveToken = modByDay[d] ?? theoreticalShifts[d - 1]
      const theoreticalToken = theoreticalShifts[d - 1]

      // Assente → ignora
      if (!effectiveToken || ABSENT_CODES.has(effectiveToken)) continue

      // Presente ma non in sezione (standalone)
      if (isPresentNoSection(effectiveToken)) {
        schedule[d].altriPresenti.push(name)
        continue
      }

      if (!isShiftCode(effectiveToken)) continue

      const { shift, section, slot } = parseShiftCode(effectiveToken)
      const isTir = effectiveToken.endsWith('TIR')

      // Sezioni non fisiche (TUTOR, ecc.) → altri presenti
      if (NON_SECTION_DUTIES.has(section)) {
        schedule[d].altriPresenti.push(name)
        continue
      }

      // Inizializza struttura sezione
      const secs = schedule[d].sections
      if (!secs[section]) secs[section] = { M: emptyShift(), N: emptyShift(), P: emptyShift() }
      const shiftData = secs[section][shift]

      if (isTir) {
        shiftData.tirocinanti.push(name)
      } else {
        const key = slot ?? 'noSlot'
        if (!shiftData.surnames[key]) shiftData.surnames[key] = []
        shiftData.surnames[key].push(name)
      }
    }
  }
  return schedule
}

function emptyShift() {
  return { surnames: { T: [], S: [], noSlot: [] }, tirocinanti: [] }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const buf = readFileSync(PDF_PATH)
  const uint8 = new Uint8Array(buf)
  const doc = await getDocument({ data: uint8 }).promise
  const numPages = doc.numPages

  const allPersons = []

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const { items } = await page.getTextContent()
    const textItems = []
    for (const item of items) {
      if (!item.str.trim()) continue
      const [,, , , tx, ty] = item.transform
      textItems.push({ str: item.str.trim(), x: Math.round(tx), y: Math.round(ty) })
    }
    const rows = groupByRow(textItems)
    const persons = processPageRows(rows)
    allPersons.push(...persons)
  }

  console.log(`\n=== PERSONE TROVATE (${allPersons.length}) ===`)
  allPersons.forEach(p => console.log(` - ${p.name}`))

  const schedule = buildSchedule(allPersons)

  function sortSections(keys) {
    return keys.sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return a.localeCompare(b)
    })
  }

  // Stampa i giorni 1-5 come campione
  for (const day of [1, 2, 3, 4, 5]) {
    console.log(`\n${'─'.repeat(55)}`)
    console.log(`GIORNO ${day}`)
    console.log('─'.repeat(55))
    const { sections, altriPresenti } = schedule[day]
    for (const sec of sortSections(Object.keys(sections))) {
      const shiftObj = sections[sec]
      for (const sh of ['M', 'N', 'P']) {
        const { surnames, tirocinanti } = shiftObj[sh]
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
    if (altriPresenti.length) {
      console.log(`  [*] ALTRI PRESENTI: ${altriPresenti.join(', ')}`)
    }
  }

  // Sezioni uniche
  const allSecs = new Set()
  for (const { sections } of Object.values(schedule))
    for (const sec of Object.keys(sections))
      allSecs.add(sec)
  console.log(`\n=== SEZIONI UNICHE (${allSecs.size}) ===`)
  console.log(sortSections([...allSecs]).join(', '))
}

main().catch(console.error)
