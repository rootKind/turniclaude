// DUE DOMANDE SUI TERZETTI (27/09/2026)
// 1. I tre terzetti di una squadra sono IN ORDINE? Cioè: le 9 persone sono 9
//    sfalsamenti di un unico ciclo da 84, e i tre terzetti sono tre fasci
//    consecutivi di 28? Se sì, si possono numerare senza arbitrarietà.
// 2. ESPOSITO AL.: quale token differisce dalla fase 56 del suo terzetto?
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
const ruota = (p, k) => p.map((_, i) => p[(i + k) % p.length])

const perSquadra = new Map()
for (const m of membri) {
  const sq = sqDi.get(m.team_id) ?? ''
  if (!/^Squadra [A-D]$/.test(sq)) continue
  const p = ciclo.get(m.id) ?? (m.pattern ?? []).map(String)
  if (!p.length || !p.some(isSezione)) continue
  if (!perSquadra.has(sq)) perSquadra.set(sq, [])
  perSquadra.get(sq).push({ nome: m.full_name, p })
}

const offsetDi = (ref, p) => {
  for (let k = 0; k < ref.length; k++) {
    if (p.every((t, i) => t === ref[(i + k) % ref.length])) return k
  }
  return null
}

for (const [sq, lista] of perSquadra) {
  // la ruota comune: prendo il primo e cerco gli offset degli altri
  const ref = lista[0].p
  const conOffset = lista.map(x => ({ ...x, off: offsetDi(ref, x.p) }))
  const tutti = conOffset.every(x => x.off !== null)
  console.log(`\n== ${sq}`)
  if (tutti) {
    const ordinati = [...conOffset].sort((a, b) => a.off - b.off)
    console.log('  le 9 persone sono 9 sfalsamenti dello stesso ciclo, in ordine:')
    for (const x of ordinati) console.log(`    offset ${String(x.off).padStart(2)}  ${x.nome}`)
    const terzetti = [[0, 28, 56]]
    const basi = [...new Set(ordinati.map(x => x.off % 28))].sort((a, b) => a - b)
    console.log(`  terzetti: base ${basi.join(', ')} → terzetti con fasi ${terzetti[0].map(f => `${f}+${basi.join('/')}`).join(', ')}`)
    console.log(`  le fasi sono distanti 28 l'una: ${basi.length === 3 ? 'sì' : 'no'} (${basi.length} basi distinte)`)
  } else {
    console.log('  non tutte ruotano della stessa ruota:')
    for (const x of conOffset) console.log(`    ${x.nome.padEnd(15)} offset ${x.off === null ? '— (diversa)' : x.off}`)
  }
}

// il token di ESPOSITO AL.
const sqC = perSquadra.get('Squadra C')
const stuc = sqC.find(x => x.nome === 'STUCOVITZ')
const iann = sqC.find(x => x.nome === 'IANNACO')
const esp = sqC.find(x => x.nome === 'ESPOSITO AL.')
const fase56 = ruota(stuc.p, 56)
console.log('\n== Squadra C, terzetto 3: confronto token per token con la fase 56')
let mostrati = 0
for (let i = 0; i < fase56.length; i++) {
  if (fase56[i] === esp.p[i]) continue
  const data = new Date(Date.parse('2026-03-01') + i * 86400000).toISOString().slice(0, 10)
  console.log(`  giorno ${String(i).padStart(2)} del ciclo (${data}):`)
  console.log(`    STUCOVITZ/IANNACO alla fase 56 → ${fase56[i]}`)
  console.log(`    ESPOSITO AL.                 → ${esp.p[i]}`)
  mostrati++
}
console.log(`  token diversi: ${mostrati} su ${fase56.length}`)
