// Verifica post-fix scorte (13/09/2026):
// 1) backtest: i riposi teorici (pattern di consenso in shift_team_members)
//    coincidono con i riposi reali dell'ultimo PDF caricato?
// 2) coerenza ottobre (mese teorico): dentro ogni mini-squadra il ciclo dei
//    riposi dev'essere IDENTICO tra i membri (il bug segnalato dall'utente).
// Uso: node scripts/verify-scorte-fix.mjs [YYYY-MM opzionale per il backtest]
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

const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const addD = (iso, n) => new Date(pd(iso) + n * DAY).toISOString().slice(0, 10)
const dbt = (a, b) => Math.round((pd(b) - pd(a)) / DAY)
function adjOff(adj, teamId, d) {
  let o = 0
  for (const a of adj) { if (a.effective_date > d) continue; if (a.scope === 'global' || a.team_id === teamId) o += a.delta_days }
  return o
}
function tokenFor(type, member, teamId, adj, dateISO) {
  const anchor = addD(type.pattern_start, adjOff(adj, teamId, dateISO))
  const period = Math.max(1, member.pattern.length || type.cycle_days)
  const idx = ((dbt(anchor, dateISO) % period) + period) % period
  return member.pattern[idx] ?? ''
}
const isRest = t => /^(RM|RC|RI)$/.test(t)

const [{ data: types }, { data: mem }, adjRes, { data: months }] = await Promise.all([
  db.from('shift_types').select('id,name,cycle_days,pattern_start,is_active'),
  db.from('shift_team_members').select('full_name,pattern,is_active,team_id,shift_teams(id,name,sort_order,shift_types(name))'),
  db.from('shift_adjustments').select('*'),
  db.from('sala_schedule').select('month,schedule').order('month'),
])
const adj = adjRes.data ?? []
const scorte = types.find(t => t.name === 'Scorte')
const members = (mem ?? []).filter(m => m.shift_teams?.shift_types?.name === 'Scorte' && m.is_active !== false)
const teamName = new Map(members.map(m => [m.team_id, m.shift_teams.name]))
const teamSort = new Map(members.map(m => [m.team_id, m.shift_teams.sort_order]))

const real = new Map()
for (const r of months ?? []) {
  const d = r.schedule
  if (!d || d.v !== 2) continue
  const map = new Map()
  d.rows.forEach((row, pi) => {
    const name = d.names[row.n ?? pi]
    if (!name) return
    const days = new Map()
    for (let day = 1; day <= d.days; day++) {
      const ci = row.d?.[day - 1]
      days.set(day, ci !== undefined && ci !== null ? (d.codes[ci] || '').trim() : '')
    }
    map.set(name, days)
  })
  real.set(r.month, map)
}
const sortedReal = [...real.keys()].sort()
console.log('PDF months:', sortedReal.join(', '))
if (adj.length) console.log('adjustments:', adj.map(a => `${a.scope === 'global' ? 'global' : a.team_id} ${a.effective_date} Δ${a.delta_days}`).join(', '))

// ── 1. backtest su ogni mese reale disponibile ──────────────────────────────
const argMonth = process.argv[2]
const toCheck = argMonth ? [argMonth] : sortedReal
for (const month of toCheck) {
  const rows = real.get(month)
  if (!rows) { console.log(month, 'non in DB'); continue }
  const [y, mo] = month.split('-').map(Number)
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  let match = 0, mismatch = 0, skipped = 0
  const bad = []
  const perMember = new Map()
  // giorni reali da ignorare: assenze, disponibilità, vuoti (non contraddicono il ciclo)
  const SKIP = /^(A|F|F\.E\.|AG|AG7|VS|TRASF|D)$/i
  for (const m of members) {
    const rrows = rows.get(m.full_name)
    if (!rrows) continue
    for (let d = 1; d <= dim; d++) {
      const t = tokenFor(scorte, m, m.team_id, adj, `${month}-${String(d).padStart(2, '0')}`)
      const rt = rrows.get(d) ?? ''
      if (!rt || SKIP.test(rt)) { skipped++; continue }
      const a = isRest(t), b = isRest(rt)
      if (a && b) match++
      else if (a !== b) {
        mismatch++
        bad.push(`${m.full_name} ${d} teo=${t || '∅'} real=${rt || '∅'}`)
        perMember.set(m.full_name, (perMember.get(m.full_name) ?? 0) + 1)
      }
    }
  }
  console.log(`BACKTEST ${month}: coincidenti=${match} divergenti=${mismatch} (ignorati ${skipped} gg assenza/disp/vuoti) → accuratezza ${(100 * match / Math.max(1, match + mismatch)).toFixed(1)}%`)
  if (perMember.size) console.log('  per membro:', [...perMember.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}=${c}`).join(' '))
  if (bad.length) console.log('  esempi:', bad.slice(0, 8).join(' | '))
}

// ── 2. ottobre teorico: coerenza riposi DENTRO ogni mini-squadra ────────────
console.log()
const OCT = '2026-10'
const groups = new Map()
for (const m of members) {
  let line = ''
  for (let d = 1; d <= 31; d++) {
    const t = tokenFor(scorte, m, m.team_id, adj, `2026-10-${String(d).padStart(2, '0')}`)
    line += isRest(t) ? 'R' : (t ? '-' : '.')
  }
  const tn = teamName.get(m.team_id)
  if (!groups.has(tn)) groups.set(tn, { sort: teamSort.get(m.team_id), lines: [] })
  groups.get(tn).lines.push(`${m.full_name}: ${line}`)
}
for (const [tn, g] of [...groups.entries()].sort((a, b) => a[1].sort - b[1].sort)) {
  console.log(`[${tn}]`)
  for (const l of g.lines) console.log('  ' + l)
  const uniq = new Set(g.lines.map(l => l.split(': ')[1]))
  console.log(uniq.size === 1 ? '  → riposi IDENTICI tra i membri ✓' : `  → ⚠ ${uniq.size} cicli DIVERSI nella stessa squadra ✗`)
}
