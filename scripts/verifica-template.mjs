// I TEMPLATE DOPO (27/09/2026): sono davvero l'assetto di ottobre, e nessuno
// è rimasto indietro? Ogni template deve combaciare con il ciclo in vigore
// dal 1° ottobre di una persona, e i nomi non devono essere duplicati.
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

const template = await devRest('shift_cycle_templates', '?select=*&order=name')
const membri = await devRest('shift_team_members', '?select=id,full_name,pattern')
const storico = await devRest('shift_member_patterns', '?select=member_id,from_date,pattern&from_date=eq.2026-10-01')

const cicloDi = new Map(storico.map(s => [s.member_id, (s.pattern ?? []).map(String)]))
const senzaStorico = new Set(membri.filter(m => !cicloDi.has(m.id)).map(m => m.full_name))
const stessi = (a, b) => a.length === b.length && a.every((t, i) => t === b[i])
const personaDi = nome => {
  const m = String(nome).match(/\(([^()]+)\)\s*$/)
  return m ? m[1] : null
}

console.log(`template: ${template.length}`)
const duplicati = template.map(t => t.name).filter((n, i, a) => a.indexOf(n) !== i)
console.log(`nomi duplicati: ${duplicati.length ? [...new Set(duplicati)].join(', ') : 'nessuno'}`)

const nonTrovati = []
const disallineati = []
const vecchi = []
for (const t of template) {
  const persona = personaDi(t.name)
  const p = (t.pattern ?? []).map(String)
  if (!persona) { nonTrovati.push(`${t.name} (nessun nome tra parentesi)`); continue }
  const m = membri.find(x => x.full_name === persona)
  if (!m) {
    if (!/vacante/.test(t.name)) nonTrovati.push(`${t.name}: «${persona}» non è un membro`)
    continue
  }
  const ciclo = cicloDi.get(m.id)
  if (!ciclo) { // nessuna riga di ottobre: il template deve essere il ciclo di base
    if (!stessi(p, (m.pattern ?? []).map(String))) disallineati.push(`${t.name}: non è il ciclo di base`)
    continue
  }
  if (!stessi(p, ciclo)) vecchi.push(`${t.name}: non è il ciclo di ottobre`)
  if (t.cycle_days !== p.length) disallineati.push(`${t.name}: cycle_days ${t.cycle_days} ma ${p.length} token`)
}
console.log(`senza persona nel nome: ${nonTrovati.length ? nonTrovati.join(' | ') : 'nessuno'}`)
console.log(`disallineati: ${disallineati.length ? disallineati.join(' | ') : 'nessuno'}`)
console.log(`ancora sull'assetto vecchio: ${vecchi.length ? vecchi.join(' | ') : 'nessuno'}`)

const perTipo = new Map()
for (const t of template) {
  const k = t.team_id
  if (!perTipo.has(k)) perTipo.set(k, [])
  perTipo.get(k).push(t)
}
console.log('\nper squadra:')
const sq = await devRest('shift_teams', '?select=id,name&order=sort_order')
for (const t of sq) {
  const l = perTipo.get(t.id) ?? []
  if (!l.length) continue
  console.log(`  ${t.name.padEnd(18)} ${String(l.length).padStart(2)} template · cicli: ${[...new Set(l.map(x => x.pattern.length))].sort((a, b) => a - b).join('/')} token`)
}
console.log(`\nprimi 6 nomi, per ordine:`)
for (const t of template.slice(0, 6)) console.log(`  ${t.name}`)
console.log('ultimi 4:')
for (const t of template.slice(-4)) console.log(`  ${t.name}`)
void senzaStorico
