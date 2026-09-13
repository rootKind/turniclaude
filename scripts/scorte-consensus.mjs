// Consenso pattern per le squadre fase delle scorte semplici dai PDF reali.
// Per ogni posizione del ciclo 28gg: se i riposi (RM/RC/RI) sono dominanti
// (>=50% e >=4 occorrenze) si usa il riposo più frequente, altrimenti 'D'.
// Stampa gli array pronti per la migration. node scripts/scorte-consensus.mjs
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
  if (dir === path.dirname(dir)) break
}

const { createClient } = require('@supabase/supabase-js')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const ANCHOR = Date.UTC(2026, 2, 1)
function isoToPos(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - ANCHOR) / 86400000) % 28
}
const REST = new Set(['RM', 'RC', 'RI'])

const { data: months } = await db.from('sala_schedule').select('month,schedule').order('month')
// name → Map(pos → tally token)
const members = new Map()
for (const r of months ?? []) {
  const d = r.schedule
  if (!d || d.v !== 2) continue
  d.rows.forEach((row, pi) => {
    const name = d.names[row.n ?? pi]
    if (!name) return
    if (!members.has(name)) members.set(name, new Map())
    const per = members.get(name)
    for (let day = 1; day <= d.days; day++) {
      const ci = row.d?.[day - 1]
      const tok = ci !== undefined && ci !== null ? (d.codes[ci] || '').trim() : ''
      const pos = isoToPos(`${r.month}-${String(day).padStart(2, '0')}`)
      if (!per.has(pos)) per.set(pos, new Map())
      const t = per.get(pos)
      const key = tok || '(vuoto)'
      t.set(key, (t.get(key) || 0) + 1)
    }
  })
}

const { data: treeRows } = await db.from('shift_team_members').select('full_name, shift_teams(name, shift_types(name))')
const teamOf = new Map()
for (const r of treeRows ?? []) {
  if (r.shift_teams?.shift_types?.name === 'Scorte') teamOf.set(r.full_name, r.shift_teams.name)
}

const teams = ['Squadra fase +0', 'Squadra fase +7', 'Squadra fase +14', 'Squadra fase +21', 'Squadra varianti']
for (const team of teams) {
  const names = [...teamOf.entries()].filter(([, t]) => t === team).map(([n]) => n)
  const perPos = Array.from({ length: 28 }, () => new Map())
  for (const n of names) {
    const per = members.get(n)
    if (!per) continue
    for (let pos = 0; pos < 28; pos++) {
      for (const [tok, c] of per.get(pos) ?? []) perPos[pos].set(tok, (perPos[pos].get(tok) || 0) + c)
    }
  }
  const pattern = perPos.map((tally, pos) => {
    const rests = [...tally.entries()].filter(([t]) => REST.has(t))
    const restCount = rests.reduce((s, [, c]) => s + c, 0)
    const total = [...tally.values()].reduce((s, c) => s + c, 0)
    if (restCount >= 4 && restCount / total >= 0.5) {
      return rests.sort((a, b) => b[1] - a[1])[0][0]
    }
    return 'D'
  })
  console.log(`-- ${team} (membri: ${names.join(', ')})`)
  console.log(`ARRAY[${pattern.map(p => `'${p}'`).join(', ')}]`)
  console.log()
}
