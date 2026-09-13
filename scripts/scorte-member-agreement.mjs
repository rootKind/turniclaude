// Pattern di riposo MAGGIORITARIO per ogni singolo membro scorte (dai PDF reali),
// poi confronto tra membri della stessa squadra: se due membri hanno pattern
// diversi, sono mini-squadre distinte (o il consenso di squadra è sbagliato).
// Uso: node scripts/scorte-member-agreement.mjs
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
const isoToPos = iso => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - ANCHOR) / 86400000) % 28
}
const REST = new Set(['RM', 'RC', 'RI'])
const SKIP = /^(A|F|F\.E\.|AG|AG7|VS|TRASF|D)$/i

const { data: months } = await db.from('sala_schedule').select('month,schedule').order('month')
// name → Array(28) di tally
const members = new Map()
for (const r of months ?? []) {
  const d = r.schedule
  if (!d || d.v !== 2) continue
  d.rows.forEach((row, pi) => {
    const name = d.names[row.n ?? pi]
    if (!name) return
    if (!members.has(name)) members.set(name, Array.from({ length: 28 }, () => new Map()))
    const per = members.get(name)
    for (let day = 1; day <= d.days; day++) {
      const ci = row.d?.[day - 1]
      const tok = ci !== undefined && ci !== null ? (d.codes[ci] || '').trim() : ''
      if (!tok || SKIP.test(tok)) continue
      const pos = isoToPos(`${r.month}-${String(day).padStart(2, '0')}`)
      const t = per[pos]
      const k = REST.has(tok) ? tok : 'lavoro'
      t.set(k, (t.get(k) || 0) + 1)
    }
  })
}

const { data: treeRows } = await db.from('shift_team_members').select('full_name, shift_teams(name, sort_order, shift_types(name))')
const teamOf = new Map()
for (const r of treeRows ?? []) {
  if (r.shift_teams?.shift_types?.name === 'Scorte') teamOf.set(r.full_name, { name: r.shift_teams.name, sort: r.shift_teams.sort_order })
}

function ownPattern(name, mode) {
  const per = members.get(name)
  if (!per) return null
  return per.map(tally => {
    const total = [...tally.values()].reduce((s, c) => s + c, 0)
    const rests = [...tally.entries()].filter(([t]) => REST.has(t))
    const restCount = rests.reduce((s, [, c]) => s + c, 0)
    if (total >= 4 && restCount >= total * 0.5) {
      const top = rests.sort((a, b) => b[1] - a[1])[0][0]
      return mode === 'pos' ? 'R' : top
    }
    return 'D'
  })
}

const groups = new Map()
for (const [name, t] of teamOf) {
  if (!groups.has(t.name)) groups.set(t.name, { sort: t.sort, names: [] })
  groups.get(t.name).names.push(name)
}
for (const [tn, g] of [...groups.entries()].sort((a, b) => a[1].sort - b[1].sort)) {
  console.log(`[${tn}]`)
  const pats = new Map()
  for (const n of g.names) {
    const p = ownPattern(n, 'pos')
    if (!p) { console.log(`  ${n}: nessun dato PDF`); continue }
    pats.set(n, p.join(''))
    console.log(`  ${n.padEnd(12)} ${p.join('')}`)
  }
  if (pats.size > 1) {
    const uniq = new Set(pats.values())
    if (uniq.size === 1) {
      console.log('  → POSIZIONI di riposo identiche tra i membri ✓')
    } else {
      console.log('  → POSIZIONI DIVERSE tra membri:')
      const byPat = new Map()
      for (const [n, p] of pats) byPat.set(p, [...(byPat.get(p) ?? []), n])
      let i = 0
      for (const [p, ns] of byPat) { i++; console.log(`    ciclo ${i} (${ns.join(', ')}): ${p}`) }
    }
  }
  console.log()
}
