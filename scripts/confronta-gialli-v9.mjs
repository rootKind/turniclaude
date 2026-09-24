// CONFRONTO v8 vs v9 (24/09/2026): per OGNI PDF d'esempio, assegna le celle
// gialle con la vecchia regola (centro ±6px) e con la nuova (possesso per
// banda, rowOwnsYellowCell) e stampa le DIFFERENZE. Atteso: l'unica differenza
// è la scomparsa dei gialli «fantasma» ereditati dalla riga adiacente.
//
// Uso: node scripts/confronta-gialli-v9.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const mainRequire = createRequire('C:/Users/david/Desktop/tools/pwa-v2/package.json')
const pdfJsPath = mainRequire.resolve('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js')
const pdfjs = mainRequire(pdfJsPath)
if (pdfjs.PDFJS) pdfjs.PDFJS.disableFontFace = true

const OPS = pdfjs.OPS
const RECT_PATH_TYPE = 19

// ── parser (stessa copia fedele di debug-yellow-ottobre.mjs) ────────────────
function isYellowFill(rgb) {
  const [r, g, b] = rgb
  return r > 200 && g > 170 && b < 210 && (r - b) > 40 && (g - b) > 25
}

function collectYellowCellsRaw(fnArray, argsArray) {
  const cells = []
  const stack = [null]
  let curFill = null
  let pending = null
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i]
    if (fn === OPS.save) { stack.push(curFill); continue }
    if (fn === OPS.restore) { curFill = stack.pop() ?? null; continue }
    if (fn === OPS.setFillRGBColor || fn === OPS.setFillCMYKColor || fn === OPS.setFillGray || fn === OPS.setFillColorN || fn === OPS.setFillColor) {
      curFill = Array.from(args ?? []).map(v => Math.round(Number(v)))
      continue
    }
    if (fn === OPS.constructPath && Array.isArray(args?.[0]) && args[0].includes(RECT_PATH_TYPE) && Array.isArray(args?.[1])) {
      const c = args[1]
      pending = { x: c[0], y: c[1], w: c[2], h: c[3] }
      continue
    }
    if ((fn === OPS.eoFill || fn === OPS.fill || fn === OPS.fillStroke || fn === OPS.eoFillStroke) && pending) {
      const r = pending
      if (r.w > 3 && r.w < 80 && r.h > 3 && r.h < 40 && curFill && isYellowFill(curFill)) {
        cells.push({ ...r })
      }
      pending = null
    }
  }
  return cells
}

// v9: fusione dei rettangoli impilati (copia di lib/pdf-parser.ts)
function mergeStackedYellowCells(cells) {
  const HALF_CELL_MAX_H = 10.5
  const MERGE_MAX_H = 20
  const sorted = [...cells].sort((a, b) => (a.x - b.x) || (b.y - a.y))
  const out = []
  for (const c of sorted) {
    const prev = out[out.length - 1]
    if (
      prev &&
      prev.h <= HALF_CELL_MAX_H && c.h <= HALF_CELL_MAX_H &&
      Math.abs(prev.x - c.x) <= 2 &&
      Math.abs(prev.w - c.w) <= 2 &&
      prev.y - (c.y + c.h) <= 3
    ) {
      const bottom = Math.min(prev.y, c.y)
      const top = Math.max(prev.y + prev.h, c.y + c.h)
      const h = top - bottom
      if (h <= MERGE_MAX_H) {
        out[out.length - 1] = { x: prev.x, y: bottom, w: prev.w, h }
        continue
      }
    }
    out.push(c)
  }
  return out
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
  let best = null
  let bestDist = Infinity
  for (const [day, hx] of Object.entries(headerXMap)) {
    const d = Math.abs(x - hx)
    if (d < bestDist) { bestDist = d; best = parseInt(day) }
  }
  return best
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
const NAME_ZONE_MARGIN = 40
function isNearDayColumn(x, headerXMap) {
  for (const hx of Object.values(headerXMap)) {
    if (Math.abs(x - hx) <= DAY_COL_TOLERANCE) return true
  }
  return false
}
function tryParseMainRowByX(items, headerXMap, daysInMonth) {
  if (items.length === 0) return null
  if (headerXMap[1] === undefined) return null
  const nameZoneRight = headerXMap[1] - NAME_ZONE_MARGIN
  const nameItems = []
  const shiftItems = []
  for (const item of items) {
    if (isNearDayColumn(item.x, headerXMap)) shiftItems.push(item)
    else if (item.x < nameZoneRight) nameItems.push(item)
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

// v8: centro ±6px (fino al 23/09)
function yellowDaysAtRowV8(yellowCells, rowY, headerXMap, daysInMonth) {
  const days = []
  const COL_TOLERANCE = 3
  for (const c of yellowCells) {
    const cy = c.y + c.h / 2
    if (Math.abs(cy - rowY) > 6) continue
    const x1 = c.x - COL_TOLERANCE
    const x2 = c.x + c.w + COL_TOLERANCE
    for (const [day, hx] of Object.entries(headerXMap)) {
      const d = parseInt(day)
      if (d < 1 || d > daysInMonth) continue
      if (hx >= x1 && hx <= x2 && !days.includes(d)) days.push(d)
    }
  }
  return days
}

// v9: possesso per banda (copia di lib/pdf-parser.ts)
const ROW_BAND = 7.7
const MIN_CELL_ROW_OVERLAP = 4
function rowOwnsYellowCell(c, rowY, rowYs) {
  const top = c.y + c.h
  const bottom = c.y
  const overlapOf = (row) => Math.min(top, row + ROW_BAND) - Math.max(bottom, row - ROW_BAND)
  const own = overlapOf(rowY)
  if (own < MIN_CELL_ROW_OVERLAP) return false
  for (const other of rowYs) {
    if (other === rowY) continue
    if (overlapOf(other) > own) return false
  }
  return true
}
function yellowDaysAtRowV9(yellowCells, rowY, headerXMap, daysInMonth, rowYs) {
  const days = []
  const COL_TOLERANCE = 3
  for (const c of yellowCells) {
    if (!rowOwnsYellowCell(c, rowY, rowYs)) continue
    const x1 = c.x - COL_TOLERANCE
    const x2 = c.x + c.w + COL_TOLERANCE
    for (const [day, hx] of Object.entries(headerXMap)) {
      const d = parseInt(day)
      if (d < 1 || d > daysInMonth) continue
      if (hx >= x1 && hx <= x2 && !days.includes(d)) days.push(d)
    }
  }
  return days
}

// ── main ─────────────────────────────────────────────────────────────────────
const dir = 'C:/Users/david/Desktop/tools/pwa-v2/Turni esempio'
const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort()

// Il mese viene dal PREFISSO del nome (il suffisso è la data di creazione del
// file: «Ottobre_23-09-2026.pdf» è ottobre, creato il 23/09).
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

let totalDiffs = 0
let subsetOk = true
for (const f of files) {
  const buffer = fs.readFileSync(path.join(dir, f))
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise

  const prefisso = MESI.findIndex(m => f.toLowerCase().startsWith(m.toLowerCase()))
  // Anno: dal suffisso quando l'anno di creazione coincide con l'anno del mese
  // del PDF (caso quasi sempre vero in questa cartella), altrimenti l'ultimo
  // anno citato nel nome. Serve solo a daysInMonth (febbraio).
  const mY = f.match(/_(\d{2})-(\d{2})-(\d{4})/)
  let yy = mY ? Number(mY[3]) : 2026
  // Se il file è «Mese_18-08-ANNO» l'anno di creazione può essere quello del
  // mese stesso (es. Maggio_18-08-2026) o precedente (es. «2025» per mesi 2026
  // non ancora creati): il confronto v8/v9 è dentro lo stesso PDF, quindi
  // basta che daysInMonth sia quello GIUSTO per il mese: febbraio 2025 e 2026
  // hanno entrambi 28 giorni.
  const mm = prefisso + 1
  const daysInMonth = new Date(yy, mm, 0).getDate()

  const diffs = []
  let totV8 = 0
  let totV9 = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { items } = await page.getTextContent()
    const textItems = []
    for (const item of items) {
      if (!item.str?.trim()) continue
      const [, , , , tx, ty] = item.transform
      textItems.push({ str: item.str.trim(), x: Math.round(tx), y: Math.round(ty) })
    }
    const opList = await page.getOperatorList()
    const raw = collectYellowCellsRaw(opList.fnArray, opList.argsArray)
    // v8 usa i rect GREZZI (com'era), v9 usa i rect fusi.
    const merged = mergeStackedYellowCells(raw)

    const rows = groupByRow(textItems)
    const headerIndices = []
    rows.forEach((r, i) => {
      const nums = r.items.filter(it => /^\d+$/.test(it.str)).map(it => parseInt(it.str))
      if (nums.length === daysInMonth && Math.min(...nums) === 1 && Math.max(...nums) === daysInMonth) headerIndices.push(i)
    })

    for (let h = 0; h < headerIndices.length; h++) {
      const headerRow = rows[headerIndices[h]]
      const headerXMap = {}
      headerRow.items.filter(it => /^\d+$/.test(it.str)).forEach(it => { headerXMap[parseInt(it.str)] = it.x })
      const groupStart = headerIndices[h] + 2
      const groupEnd = h + 1 < headerIndices.length ? headerIndices[h + 1] : rows.length
      const groupRows = rows.slice(groupStart, groupEnd)
      const groupRowYs = groupRows.map(r => r.y)
      let pendingMod = null
      const allNames = new Map()
      for (const row of groupRows) {
        const parsed = tryParseMainRowByX(mergeClosePdfItems(row.items), headerXMap, daysInMonth)
        if (!parsed) { pendingMod = row; continue }
        allNames.set(row.y, parsed.name)
        const v8 = new Set(yellowDaysAtRowV8(raw, row.y, headerXMap, daysInMonth))
        if (pendingMod) for (const d of yellowDaysAtRowV8(raw, pendingMod.y, headerXMap, daysInMonth)) v8.add(d)
        const v9 = new Set(yellowDaysAtRowV9(merged, row.y, headerXMap, daysInMonth, groupRowYs))
        if (pendingMod) for (const d of yellowDaysAtRowV9(merged, pendingMod.y, headerXMap, daysInMonth, groupRowYs)) v9.add(d)
        totV8 += v8.size
        totV9 += v9.size
        // SICUREZZA: v9 non deve mai AGGIUNGERE gialli (solo togliere i falsi
        // positivi): un giallo in più cambiarebbe chip/assenti/scoperto dei
        // mesi storici.
        for (const d of v9) if (!v8.has(d)) subsetOk = false
        const soloV8 = [...v8].filter(d => !v9.has(d))
        const soloV9 = [...v9].filter(d => !v8.has(d))
        if (soloV8.length || soloV9.length) {
          // Diagnosi: per ogni giorno in contesa, chi è il proprietario v9 e
          // quali rettangoli (grezzi) lo toccano.
          const dettaglio = []
          for (const d of [...soloV8, ...soloV9]) {
            const hx = headerXMap[d]
            const toccatori = raw
              .filter(c => hx >= c.x - 3 && hx <= c.x + c.w + 3)
              .map(c => `y=${c.y.toFixed(1)}+h${c.h.toFixed(1)}(cy=${(c.y + c.h / 2).toFixed(1)})`)
              .join(' | ')
            const vicini = groupRowYs
              .filter(ry => raw.some(c => hx >= c.x - 3 && hx <= c.x + c.w + 3 && Math.abs((c.y + c.h / 2) - ry) <= 6))
              .map(ry => {
                const pers = allNames.get(ry) ?? '(mod)'
                return `${pers}@${ry}`
              })
            dettaglio.push(`g${d}: rect[${toccatori}] entro±6=[${vicini.join(', ')}]`)
          }
          diffs.push({ name: parsed.name, soloV8, soloV9, dettaglio })
        }
        pendingMod = null
      }
    }
  }
  if (diffs.length) {
    console.log(`${f} (mese ${mm}/${yy}, ${daysInMonth} gg): gialli v8=${totV8} → v9=${totV9} (${diffs.length} persone cambiate)`)
    for (const d of diffs) {
      console.log(`  ${d.name}: solo v8=[${d.soloV8.join(',')}] solo v9=[${d.soloV9.join(',')}]`)
      for (const det of d.dettaglio) console.log(`     ${det}`)
    }
    totalDiffs += diffs.length
  } else {
    console.log(`${f}: nessuna differenza`)
  }
}
console.log(`\nTOTALE persone con differenze: ${totalDiffs}`)
console.log(subsetOk ? 'OK: v9 non aggiunge NESSUN giallo nuovo (solo rimozioni)' : 'FALSO: v9 ha aggiunto gialli — CONTROLLARE')
