// I 9 CHE RUOTANO SONO 3 TERZETTI? (27/09/2026)
// In ogni squadra in terza i 9 che lavorano su sezioni potrebbero essere tre
// terzetti, e dentro ogni terzetto i tre hanno la stessa sequenza di sezioni
// con la fase sfalsata. Se è vero, lo «slot» è (terzetto, fase) e non un
// numero progressivo: ed è una divisione che l'ufficio conosce, non una mia.
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
const devRest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json())

const squadre = await devRest('shift_teams', '?select=id,name&order=sort_order')
const membri = await devRest('shift_team_members', '?select=id,full_name,team_id,sort_order,pattern')
const storico = await devRest('shift_member_patterns', '?select=member_id,from_date,pattern&from_date=eq.2026-10-01')
const sqDi = new Map(squadre.map(s => [s.id, s.name]))
const ciclo = new Map(storico.map(s => [s.member_id, (s.pattern ?? []).map(String)]))
const isSezione = t => /^[MNP]\d/.test(t ?? '')

/** b è a (p + k) di a, cioè le stesse giornate ruotate di k giorni? */
const ruotatoDi = (a, b) => {
  const L = a.length
  if (L !== b.length) return null
  for (let k = 0; k < L; k++) {
    if (b.every((t, i) => t === a[(i + k) % L])) return k
  }
  return null
}

const perSquadra = new Map()
for (const m of membri) {
  const p = ciclo.get(m.id) ?? (m.pattern ?? []).map(String)
  if (!p.length || p.every(t => !isSezione(t))) continue
  if (!/^Squadra [A-D]$/.test(sqDi.get(m.team_id) ?? '')) continue
  const k = sqDi.get(m.team_id)
  if (!perSquadra.has(k)) perSquadra.set(k, [])
  perSquadra.get(k).push({ nome: m.full_name, p })
}

for (const [sq, lista] of perSquadra) {
  console.log(`\n== ${sq}: ${lista.length} persone che ruotano`)
  // cerco i terzetti: A e B girano sulla stessa sequenza se una è la rotazione
  // dell'altra. Due terzetti diversi hanno sequenze diverse.
  const gruppi = []
  const presi = new Set()
  for (let i = 0; i < lista.length; i++) {
    if (presi.has(i)) continue
    const gruppo = [i]
    for (let j = i + 1; j < lista.length; j++) {
      if (presi.has(j)) continue
      const k = ruotatoDi(lista[i].p, lista[j].p)
      if (k !== null && k !== 0) { gruppo.push(j); presi.add(j) }
    }
    presi.add(i)
    gruppi.push(gruppo)
  }
  for (const gruppo of gruppi) {
    const fasi = gruppo.map(i => ruotatoDi(lista[gruppo[0]].p, lista[i].p) ?? 0)
    console.log(`  terzetto di ${gruppo.length}: ${gruppo.map((i, k) => `${lista[i].nome} (fase ${fasi[k]})`).join(' · ')}`)
  }
  // controllo anche: dentro un terzetto, la SEQUENZA di sezioni coincide?
  for (const gruppo of gruppi) {
    if (gruppo.length < 2) continue
    const sez = p => p.filter(isSezione).map(t => t.replace(/[TS]$/, '').slice(1))
    const base = sez(lista[gruppo[0]].p)
    for (const i of gruppo.slice(1)) {
      const k = ruotatoDi(base, sez(lista[i].p))
      console.log(`      ${lista[i].nome}: sequenza di sezioni = base ruotata di ${k === null ? '— (diversa)' : k}`)
    }
  }
}
