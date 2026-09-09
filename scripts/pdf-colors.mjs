// Estrae struttura visiva del PDF: colore sfondo cella nome + ordine righe.
// Uso: node scripts/pdf-colors.mjs <file.pdf>
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const base = path.resolve('node_modules/.pnpm/pdf-parse@1.1.4/node_modules/pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js')
const pdfjs = require(base)
if (pdfjs.PDFJS) pdfjs.PDFJS.disableFontFace = true

const file = process.argv[2] || 'C:/Users/david/Desktop/tools/pwa-v2/Turni esempio/Luglio_18-08-2026.pdf'

const OPS = pdfjs.OPS
const RECT_PATH_TYPE = 19 // tipo path rettangolo (args annidati: [[tipi],[coordi]])

function colorKey(args) {
  return Array.from(args).map(v => Math.round(v)).join(',')
}

function rgbName(c) {
  if (!c) return '?'
  const [r, g, b] = c.split(',').map(Number)
  if (r === 255 && g === 255 && b === 255) return 'BIANCO'
  if (r === 166 && g === 200 && b === 235) return 'BLU1'
  if (r === 172 && g === 215 && b === 230) return 'CELESTE'
  if (r === 208 && g === 208 && b === 208) return 'GRIGIO'
  if (r === 255 && g === 0 && b === 0) return 'ROSSO'
  return `RGB(${c})`
}

async function main() {
  const buffer = fs.readFileSync(file)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  console.log(`File: ${path.basename(file)} | pagine: ${doc.numPages}\n`)
  const allPages = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { items } = await page.getTextContent()
    const textItems = items
      .filter(it => it.str && it.str.trim())
      .map(it => {
        const [, , , , tx, ty] = it.transform
        return { str: it.str.trim(), x: tx, y: ty }
      })

    const opList = await page.getOperatorList()

    // stato colore fill con stack save/restore
    const fillStack = [null]
    let curFill = null
    let pendingRect = null
    const rects = [] // { x, y, w, h, color }

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i]
      const args = opList.argsArray[i]
      if (fn === OPS.save) { fillStack.push(curFill); continue }
      if (fn === OPS.restore) { curFill = fillStack.pop() ?? null; continue }
      if (fn === OPS.setFillRGBColor || fn === OPS.setFillCMYKColor || fn === OPS.setFillGray || fn === OPS.setFillColorN || fn === OPS.setFillColor) {
        curFill = colorKey(args)
        continue
      }
      if (fn === OPS.constructPath && args && Array.isArray(args[0]) && args[0].includes(RECT_PATH_TYPE) && args[1]) {
        const c = args[1]
        pendingRect = { x: c[0], y: c[1], w: c[2], h: c[3] }
        continue
      }
      if ((fn === OPS.eoFill || fn === OPS.fill || fn === OPS.fillStroke || fn === OPS.eoFillStroke) && pendingRect) {
        rects.push({ ...pendingRect, color: curFill })
        pendingRect = null
      }
    }

    // righe di testo raggruppate per y
    const yGroups = new Map()
    for (const t of textItems) {
      let g = null
      for (const [gy, arr] of yGroups) if (Math.abs(gy - t.y) <= 2) { g = gy; break }
      if (g === null) { g = t.y; yGroups.set(t.y, []) }
      yGroups.get(g).push(t)
    }
    const rows = [...yGroups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, its]) => ({ y, items: its.sort((a, b) => a.x - b.x) }))

    // colore sfondo che contiene un punto: scegli il rettangolo PIÙ PICCOLO (ultimo disegnato = sopra)
    // ignora i rettangoli "a linea" (bordi tabella, w o h < 5) e quelli enormi (bordo pagina)
    function bgAt(x, y) {
      let best = null
      let bestArea = Infinity
      for (const r of rects) {
        if (r.w < 5 || r.h < 5) continue
        if (r.w * r.h > 2000000) continue
        if (x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5) {
          const area = r.w * r.h
          if (area < bestArea) { bestArea = area; best = r }
        }
      }
      return best ? rgbName(best.color) : 'BIANCO/null'
    }

    console.log(`===== PAGINA ${p} (${rows.length} righe) =====`)
    const pageOut = []
    rows.forEach((row, i) => {
      const name = row.items.map(t => t.str).join(' ')
      const firstName = row.items[0]
      const bg = bgAt(firstName.x, row.y)
      console.log(`${String(i + 1).padStart(3)} | sfondoNome=${String(bg).padEnd(9)} | ${name.slice(0, 100)}`)
      pageOut.push({ row: i + 1, colore: bg, testo: name.slice(0, 200) })
    })
    allPages.push(pageOut)
    console.log('')
  }
  if (process.argv.includes('--json')) {
    fs.writeFileSync('scripts/struttura-pdf.json', JSON.stringify({ file: path.basename(file), pagine: allPages }, null, 2))
    console.log('(scritto scripts/struttura-pdf.json)')
  }
}

main().catch(err => { console.error(err); process.exit(1) })