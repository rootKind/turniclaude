// IL CICOLO DI COPPOLA, RICAVATO DAI PDF (27/09/2026)
// La sua riga nei PDF di settembre e ottobre è «RC RI» ogni sei giorni, e non è
// una fase del ciclo di CASTELLONE (la migliore fa 4 celle su 9). Quindi non
// entra in ASTER con quel ciclo: ha un asset suo, minimo. Qui lo ricavo e lo
// verifico su entrambi i mesi, così la teoria del mese combacia col PDF.
import fs from 'node:fs'
import path from 'node:path'

let dir = process.cwd()
let env = null
for (;;) {
  const f = path.join(dir, '.env.local')
  if (fs.existsSync(f)) {
    env = {}
    for (const r of fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    break
  }
  const su = path.dirname(dir)
  if (su === dir) break
  dir = su
}
const MAIN = 'zrbbzfingrdpdflkndgl'
const mainQuery = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${MAIN}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 200)}`)
  return JSON.parse(t)
}

const ANCHOR = '2026-03-01'
const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const gg = (a, b) => Math.round((pd(b) - pd(a)) / DAY)

const righePdf = new Map()
for (const mese of ['2026-09', '2026-10']) {
  const s = (await mainQuery(`select schedule from sala_schedule where month='${mese}' order by uploaded_at desc limit 1`))[0].schedule
  const i = s.names.findIndex(n => String(n).toUpperCase() === 'COPPOLA')
  const row = i >= 0 ? (s.rows[i] ?? {}) : {}
  const turni = Array.from({ length: s.days }, (_, k) => s.codes[row.t?.[k] ?? 0] ?? '')
  righePdf.set(mese, turni)
  console.log(`${mese}: ${turni.filter(Boolean).length} celle piene su ${s.days} · indici pieni ${turni.map((t, k) => (t ? k : -1)).filter(k => k >= 0).join(',')}`)
}

// Provo i periodi 1..84 e, per ognuno, la sequenza di token ricostruita dai
// PDF: se un periodo spiega tutti i giorni pieni di entrambi i mesi, quello è
// il ciclo (e i Token mancanti sono semplicemente giorni senza turno).
const mesi = [...righePdf.keys()]
let migliore = null
for (let periodo = 1; periodo <= 84; periodo++) {
  const seq = new Array(periodo).fill('')
  let ok = 0
  let tot = 0
  let conflitto = false
  for (const mese of mesi) {
    const turni = righePdf.get(mese)
    for (let k = 0; k < turni.length; k++) {
      const idx = ((gg(ANCHOR, `${mese}-${String(k + 1).padStart(2, '0')}`) % periodo) + periodo) % periodo
      const t = turni[k]
      if (!t) continue
      tot++
      if (seq[idx] === '') seq[idx] = t
      else if (seq[idx] !== t) { conflitto = true; break }
      ok++
    }
    if (conflitto) break
  }
  if (!conflitto && tot > 0) {
    const piene = seq.filter(Boolean).length
    if (!migliore || periodo < migliore.periodo) migliore = { periodo, seq, coperti: ok, tot }
  }
}
if (!migliore) { console.log('\nnessun periodo 1..84 spiega le righe di COPPOLA'); process.exit(1) }
console.log(`\nmigliore periodo: ${migliore.periodo} giorni · spiega ${migliore.coperti}/${migliore.tot} celle piene`)
console.log(`ciclo: ${migliore.seq.map(x => x || '·').join(' ')}`)
console.log(`token pieni: ${migliore.seq.filter(Boolean).length} su ${migliore.periodo}`)

// verifica giorno per giorno
for (const [mese, turni] of righePdf) {
  let ok = 0
  const scarti = []
  for (let k = 0; k < turni.length; k++) {
    const idx = ((gg(ANCHOR, `${mese}-${String(k + 1).padStart(2, '0')}`) % migliore.periodo) + migliore.periodo) % migliore.periodo
    if (migliore.seq[idx] === turni[k]) ok++
    else scarti.push(`${mese}-${String(k + 1).padStart(2, '0')}: PDF «${turni[k] || '·'}» vs ciclo «${migliore.seq[idx] || '·'}»`)
  }
  console.log(`\n${mese}: ${ok}/${turni.length} combaciano`)
  if (scarti.length) console.log(`  scarti (${scarti.length}): ${scarti.slice(0, 8).join(' | ')}`)
}
