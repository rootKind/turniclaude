// IL SUBENTRO, VERIFICATO (27/09/2026)
// COPPOLA deve combaciare con la sua riga del PDF di ottobre (76) e non
// esistere prima; CASTELLONE il contrario. Guardo entrambi, mese per mese.
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
const devRest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json())

const tipi = await devRest('shift_types', '?select=id,name,pattern_start,is_active')
const squadre = await devRest('shift_teams', '?select=id,name,shift_type_id')
const membri = await devRest('shift_team_members', '?select=id,full_name,team_id,pattern,is_active,user_id')
const storico = await devRest('shift_member_patterns', '?select=member_id,from_date,pattern&order=from_date')
const tipiSq = new Map(squadre.map(s => [s.id, s.shift_type_id]))
const tipoDi = new Map(tipi.map(t => [t.id, t]))
const cicloInVigore = (m, data) => {
  const righe = storico.filter(s => s.member_id === m.id && s.from_date <= data).sort((a, b) => a.from_date.localeCompare(b.from_date))
  return (righe.pop()?.pattern ?? m.pattern ?? []).map(String)
}
const DAY = 86400000
const pd = iso => { const [y, m2, d] = iso.split('-').map(Number); return Date.UTC(y, m2 - 1, d) }
const gg = (a, b) => Math.round((pd(b) - pd(a)) / DAY)

console.log('membri ASTER e i loro cicli:')
for (const m of membri.filter(x => /ASTER/i.test(squadre.find(s => s.id === x.team_id)?.name ?? ''))) {
  const righe = storico.filter(s => s.member_id === m.id).map(s => `${s.from_date}: ${s.pattern.length}`).join(' · ')
  console.log(`  ${m.full_name.padEnd(12)} attivo ${m.is_active ? 'sì' : 'no'} · utente ${m.user_id ? 'sì' : 'no'} · colonne ${m.pattern.length} · ${righe}`)
}

for (const mese of ['2026-09', '2026-10']) {
  const s = (await mainQuery(`select schedule from sala_schedule where month='${mese}' order by uploaded_at desc limit 1`))[0].schedule
  const nomi = s.names.map(n => String(n).toUpperCase())
  console.log(`\n${mese}:`)
  for (const nome of ['CASTELLONE', 'COPPOLA']) {
    const m = membri.find(x => x.full_name === nome)
    const i = nomi.findIndex(n => n === nome || n.startsWith(nome + ' '))
    if (!m) { console.log(`  ${nome}: non è un membro`); continue }
    const inPdf = i >= 0
    const row = inPdf ? (s.rows[i] ?? {}) : null
    const pdfTurni = inPdf ? Array.from({ length: s.days }, (_, k) => s.codes[row.t?.[k] ?? 0] ?? '') : []
    const tipo = tipoDi.get(tipiSq.get(m.team_id))
    let ok = 0
    for (let k = 0; k < pdfTurni.length; k++) {
      const d = `${mese}-${String(k + 1).padStart(2, '0')}`
      const p = cicloInVigore(m, d)
      const t = p.length ? p[((gg(tipo.pattern_start, d) % p.length) + p.length) % p.length] : ''
      if (t === pdfTurni[k]) ok++
    }
    const quanti = pdfTurni.filter(Boolean).length
    console.log(`  ${nome.padEnd(11)} ${inPdf ? `riga ${i + 1} del PDF` : 'NON è nel PDF di questo mese'} · ${cicloInVigore(m, `${mese}-15`).length} token in vigore a metà mese · ${ok}/${quanti} combaciano`)
    // se non combacia, qual fase della ruota di ASTER gli appartiene?
    if (inPdf && quanti > 0 && ok < quanti) {
      const ref = cicloInVigore(membri.find(x => x.full_name === 'CASTELLONE'), '2026-09-15')
      if (ref.length) {
        const voti = []
        for (let k = 0; k < ref.length; k++) {
          const p = ref.map((_, j) => ref[(j + k) % ref.length])
          let buoni = 0
          for (let j = 0; j < pdfTurni.length; j++) {
            const d = `${mese}-${String(j + 1).padStart(2, '0')}`
            if (p[((gg(tipo.pattern_start, d) % p.length) + p.length) % p.length] === pdfTurni[j]) buoni++
          }
          voti.push([k, buoni])
        }
        voti.sort((a, b) => b[1] - a[1])
        console.log(`      la migliore fase del ciclo di CASTELLONE: ${voti[0][1]}/${quanti} (offset ${voti[0][0]}), poi ${voti.slice(1, 4).map(([k, v]) => `${k}(${v})`).join(' ')}`)
      }
    }
  }
}
