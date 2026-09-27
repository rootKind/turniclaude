// QUALE FASE È DI ESPOSITO AL. NEI PDF DI APRILE E MAGGIO? (27/09/2026)
// Il suo ciclo di ottobre combacia 31/31 col PDF di ottobre, ma con quello di
// aprile e maggio no (1/30 e 16/31). Provo tutte le 28 fasi del ciclo del suo
// terzetto (la base di STUCOVITZ) e vedo quale ricostruisce quei mesi: se
// qualche fase li fa bene, allora nei PDF di allora lui era in terzetto ma con
// un'altra fase, e questo cambia il nome del suo slot.
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

const membri = await devRest('shift_team_members', '?select=id,full_name,pattern')
const storico = await devRest('shift_member_patterns', '?select=member_id,from_date,pattern&order=from_date')
const di = n => membri.find(x => x.full_name === n)
const ciclo = (nome, data) => {
  const m = di(nome)
  const r = storico.find(s => s.member_id === m.id && String(s.from_date).slice(0, 10) === data)
  return (r?.pattern ?? m.pattern ?? []).map(String)
}
const stuc = ciclo('STUCOVITZ', '2026-03-01')
const espBase = ciclo('ESPOSITO AL.', '2026-03-01')
const espOtt = ciclo('ESPOSITO AL.', '2026-10-01')
console.log(`STUCOVITZ (fase 0 del terzetto): ${stuc.length} token`)
console.log(`ESPOSITO AL. base: ${espBase.length} token, D in ${espBase.filter(t => t === 'D').length}`)
console.log(`ESPOSITO AL. ottobre: ${espOtt.length} token, D in ${espOtt.filter(t => t === 'D').length}`)

const mesi = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
const pdf = await mainQuery(`select month, schedule from sala_schedule where month in (${mesi.map(x => `'${x}'`).join(',')}) order by month`)
const DAY = 86400000
const pd = iso => { const [y, m2, d] = iso.split('-').map(Number); return Date.UTC(y, m2 - 1, d) }
const gg = (a, b) => Math.round((pd(b) - pd(a)) / DAY)
const ruota = (p, k) => p.map((_, i) => p[(i + k) % p.length])

const pdfPerMese = new Map()
for (const r of pdf) {
  const s = r.schedule
  if (!s?.names) { console.log(`${r.month}: payload non v2, lo salto`); continue }
  const i = s.names.findIndex(n => String(n).toUpperCase().includes('ESPOSITO AL'))
  if (i < 0) { console.log(`${r.month}: non c'è nel PDF`); continue }
  const row = s.rows[i] ?? {}
  const turni = Array.from({ length: s.days }, (_, k) => s.codes[row.t?.[k] ?? 0] ?? '')
  pdfPerMese.set(r.month, turni)
  console.log(`${r.month}: riga ${i + 1}, ${s.days} giorni, primi 8: ${turni.slice(0, 8).join(' ')}`)
}

console.log('\nla migliore delle 28 fasi del ciclo di STUCOVITZ, mese per mese:')
for (const [mese, turni] of pdfPerMese) {
  const voti = []
  for (let k = 0; k < 28; k++) {
    const p = ruota(stuc, k)
    let ok = 0
    for (let i = 0; i < turni.length; i++) {
      const d = `${mese}-${String(i + 1).padStart(2, '0')}`
      if (p[((gg('2026-03-01', d) % 84) + 84) % 84] === turni[i]) ok++
    }
    voti.push([k, ok])
  }
  voti.sort((a, b) => b[1] - a[1])
  console.log(`  ${mese}: ${voti[0][1]}/${turni.length} · fasi migliori ${voti.slice(0, 4).map(([k, v]) => `${k}(${v})`).join(' ')}`)
}

console.log('\nconfronto: il suo ciclo di base e quello di ottobre')
for (const [mese, turni] of pdfPerMese) {
  for (const [nome, p] of [['base', espBase], ['ottobre', espOtt]]) {
    let ok = 0
    for (let i = 0; i < turni.length; i++) {
      const d = `${mese}-${String(i + 1).padStart(2, '0')}`
      if (p[((gg('2026-03-01', d) % 84) + 84) % 84] === turni[i]) ok++
    }
    console.log(`  ${mese} con il ciclo ${nome}: ${ok}/${turni.length}`)
  }
}
