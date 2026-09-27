// LE RIGHE DI COPPOLA NEI PDF (27/09/2026)
// Otto celle piene su 31 in ottobre non sono un turno: è una riga che si sta
// riempiendo. Guardo cosa c'è scritto, mese per mese, e se nelle altre righe
// del PDF c'è qualcuno che copre i suoi stessi turni.
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

for (const mese of ['2026-08', '2026-09', '2026-10']) {
  const s = (await mainQuery(`select schedule from sala_schedule where month='${mese}' order by uploaded_at desc limit 1`))[0].schedule
  const nomi = s.names.map(n => String(n).toUpperCase())
  const i = nomi.findIndex(n => n === 'COPPOLA' || n.startsWith('COPPOLA '))
  console.log(`\n=== ${mese} (${s.days} giorni)`)
  if (i < 0) { console.log('  COPPOLA non c\'è'); continue }
  const row = s.rows[i] ?? {}
  const teorico = Array.from({ length: s.days }, (_, k) => s.codes[row.t?.[k] ?? 0] ?? '')
  const reale = Array.from({ length: s.days }, (_, k) => s.codes[row.d?.[k] ?? 0] ?? '')
  console.log(`  riga ${i + 1} · nome nel PDF: «${s.names[i]}»`)
  console.log(`  teorico: ${teorico.map(x => x || '·').join(' ')}`)
  console.log(`  reale:   ${reale.map(x => x || '·').join(' ')}`)
  const piene = teorico.filter(Boolean).length
  const turni = [...new Set(teorico.filter(Boolean))]
  console.log(`  celle piene: ${piene}/${s.days} · codici usati: ${turni.join(' ')}`)
  // chi altro ha gli stessi turni nello stesso giorno
  if (piene > 0 && piene < s.days) {
    const stessi = new Set()
    for (let k = 0; k < s.days; k++) {
      if (!teorico[k]) continue
      for (let j = 0; j < s.names.length; j++) {
        if (j === i) continue
        const r2 = s.rows[j] ?? {}
        if ((s.codes[r2.t?.[k] ?? 0] ?? '') === teorico[k]) stessi.add(s.names[j])
      }
    }
    console.log(`  chi fa gli stessi turni in quei giorni: ${[...stessi].slice(0, 8).join(', ')}${stessi.size > 8 ? ` … (${stessi.size})` : ''}`)
  }
}
