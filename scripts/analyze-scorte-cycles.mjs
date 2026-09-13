// Analisi cicli scorte (rilievo + semplici) dai PDF reali.
// Per ogni membro: posizione nel ciclo 28gg (ancorata a pattern_start 2026-03-01)
// → token prevalente per posizione → set di riposi → cluster di mini-squadra.
// Uso: node scripts/analyze-scorte-cycles.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = process.cwd()

let env = {}
for (let dir = root; ; dir = path.dirname(dir)) {
  const p = path.join(dir, '.env.local')
  if (fs.existsSync(p)) {
    for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)=\$\{([^}]+)\}$/)
      if (m && env[m[2]] !== undefined) env[m[1]] = env[m[2]]
      else { const n = l.match(/^([A-Z0-9_]+)=(.*)$/); if (n) env[n[1]] = n[2].replace(/^['"]|['"]$/g, '') }
    }
    break
  }
  if (d === path.dirname(d)) break
}

const { createClient } = require('@supabase/supabase-js')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const ANCHOR = Date.UTC(2026, 2, 1) // pattern_start Scorte: 2026-03-01
const REST = new Set(['RM', 'RC', 'RI'])

function isoToPos(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  return Math.round((t - ANCHOR) / 86400000) % 28
}

const { data: months } = await db.from('sala_schedule').select('month,schedule').order('month')
const members = new Map() // name → Map(pos → Map(token → count))

for (const r of months ?? []) {
  const d = r.schedule
  if (!d || d.v !== 2) continue
  // decodifica v2: rows[].n = indice nome, rows[].d = indici codici per giorno
  d.rows.forEach((row, pi) => {
    const name = d.names[row.n ?? pi]
    if (!name) return
    if (!members.has(name)) members.set(name, new Map())
    const per = members.get(name)
    for (let day = 1; day <= d.days; day++) {
      const ci = row.d?.[day - 1]
      const tok = ci !== undefined && ci !== null ? (d.codes[ci] || '').trim() : ''
      const iso = `${r.month}-${String(day).padStart(2, '0')}`
      const pos = isoToPos(iso)
      if (!per.has(pos)) per.set(pos, new Map())
      const tally = per.get(pos)
      const key = tok || '(vuoto)'
      tally.set(key, (tally.get(key) || 0) + 1)
    }
  })
}

// members del team Scorte dal DB (per sapere chi è chi)
const { data: treeRows } = await db.from('shift_team_members').select('full_name, is_lead, shift_teams(name, shift_types(name))')
const teamOf = new Map()
for (const r of treeRows ?? []) {
  if (r.shift_teams?.shift_types?.name === 'Scorte') teamOf.set(r.full_name, { team: r.shift_teams.name, lead: r.is_lead })
}

const restSetKey = per => {
  const rests = []
  for (let pos = 0; pos < 28; pos++) {
    const tally = per.get(pos)
    if (!tally) { rests.push('?'); continue }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
    rests.push(REST.has(top[0]) ? 'R' : '.')
  }
  return rests.join('')
}

const clusters = new Map()
const report = []
for (const [name, per] of members) {
  const info = teamOf.get(name)
  if (!info) continue
  const key = restSetKey(per)
  // coerenza: posizioni con token misti tra i mesi
  let mixed = 0
  for (let pos = 0; pos < 28; pos++) {
    const tally = per.get(pos)
    if (!tally) continue
    if (tally.size > 1) mixed++
  }
  if (!clusters.has(key)) clusters.set(key, [])
  clusters.get(key).push(name)
  report.push({ name, team: info.team, lead: info.lead, key, mixed })
}

console.log('=== CLUSTER per pattern riposi (28 pos: R=riposo, .=altro, ?=niente dati) ===')
for (const [key, names] of [...clusters.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n[${names.length} membri] ${key}`)
  for (const n of names) {
    const r = report.find(x => x.name === n)
    console.log('   ', n.padEnd(14), 'team:', (r.team + '').padEnd(17), r.lead ? 'LEAD ' : '     ', 'posizioni miste:', r.mixed)
  }
}

// dettaglio posizioni miste per i membri delle fasi (per capire chi è incoerente)
console.log('\n=== POSIZIONI MISTE (override PDF) — solo scorte semplici ===')
for (const [name, per] of members) {
  const info = teamOf.get(name)
  if (!info || info.team === 'Squadra rilievo') continue
  const details = []
  for (let pos = 0; pos < 28; pos++) {
    const tally = per.get(pos)
    if (tally && tally.size > 1) details.push(`${pos}:[${[...tally.entries()].map(([t, c]) => `${t}×${c}`).join(',')}]`)
  }
  if (details.length) console.log(name.padEnd(14), details.join(' '))
}
