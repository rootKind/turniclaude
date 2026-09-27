// IL TERZETTO MANcante DELLA SQUADRA C (27/09/2026)
// Squadre A, B e D sono tre terzetti puliti, ognuno con fasi 0/28/56. In C
// ci sono due terzetti, una coppia e una persona da sola. Chi è la solitaria e
// di quanto si discosta dalla fase che dovrebbe avere: se è una differenza di
// uno o due token è la stessa postazione con un refuso, se è un asset
// diverso allora lo slot non è quello che sembra.
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

const sqC = squadre.find(s => s.name === 'Squadra C')
const lista = membri.filter(m => m.team_id === sqC.id)
  .map(m => ({ nome: m.full_name, p: ciclo.get(m.id) ?? (m.pattern ?? []).map(String) }))
  .filter(x => x.p.length && x.p.some(isSezione))
console.log(`Squadra C, ${lista.length} persone che ruotano\n`)

// la coppia STUCOVITZ/IANNACO è la base del terzetto mancante?
const stuc = lista.find(x => x.nome === 'STUCOVITZ')
const iann = lista.find(x => x.nome === 'IANNACO')
const esp = lista.find(x => x.nome === 'ESPOSITO AL.')
const ruota = (p, k) => p.map((_, i) => p[(i + k) % p.length])
const diff = (a, b) => a.reduce((n, t, i) => n + (t === b[i] ? 0 : 1), 0)

for (const [nome, k] of [['DI FRAIA', null]]) void nome, void k

console.log('confronto con la coppia che fa da base (STUCOVITZ fase 0, IANNACO fase 28):')
for (const x of lista) {
  if (x.nome === 'STUCOVITZ') continue
  for (const k of [0, 28, 56]) {
    const d = diff(ruota(stuc.p, k), x.p)
    if (d <= 6) console.log(`  ${x.nome.padEnd(14)} contro la fase ${String(k).padStart(2)}: ${d} token diversi su ${x.p.length}`)
  }
}

console.log('\nle tre fasi del terzetto che manca, viste sulle sezioni:')
for (const k of [0, 28, 56]) {
  const p = ruota(stuc.p, k)
  const sez = p.filter(isSezione).map(t => t.replace(/[TS]$/, '').slice(1)).join(' ')
  console.log(`  fase ${String(k).padStart(2)}: ${p.slice(0, 10).join(' ')} …`)
  console.log(`          sezioni: ${sez.slice(0, 60)} …`)
}
console.log('\nESPOSITO AL. per confronto:')
console.log(`  ${esp.p.slice(0, 10).join(' ')} …`)
console.log(`  sezioni: ${esp.p.filter(isSezione).map(t => t.replace(/[TS]$/, '').slice(1)).join(' ').slice(0, 60)} …`)
console.log(`  turni di sezione: ${esp.p.filter(isSezione).length} (STUCOVITZ ${stuc.p.filter(isSezione).length})`)
