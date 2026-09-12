// Punta ogni membro attivo di «Squadra in terza» contro la SUA riga base del PDF
// e conta le corrispondenze: se il 28gg è una troncatura del ciclo vero, tutti
// avranno percentuali basse e lo stesso schema di scarti.
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
let envPath = null
for (let dir = root; ; dir = path.dirname(dir)) {
  const c = path.join(dir, '.env.local')
  if (fs.existsSync(c)) { envPath = c; break }
  if (dir === path.dirname(dir)) break
}
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const rest = (t, s) => fetch(`${URL}/rest/v1/${t}${s}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).then(r => r.json())

const DAY_MS = 86400000
const parseDateUTC = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const daysBetween = (a, b) => Math.round((parseDateUTC(b) - parseDateUTC(a)) / DAY_MS)
const addDays = (iso, n) => { const d = new Date(parseDateUTC(iso) + n * DAY_MS); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }

function tokenForMember(type, member, teamId, adjustments, dateISO) {
  let offset = 0
  for (const a of adjustments) {
    if (a.effective_date > dateISO) continue
    if (a.scope === 'global' || a.team_id === teamId) offset += a.delta_days
  }
  const anchor = addDays(type.pattern_start, offset)
  const idx = ((daysBetween(anchor, dateISO) % type.cycle_days) + type.cycle_days) % type.cycle_days
  return member.pattern[idx] ?? ''
}

const [types, teams, members, adjustments, schedules] = await Promise.all([
  rest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active&is_active=eq.true'),
  rest('shift_teams', '?select=id,shift_type_id,name&order=sort_order.asc'),
  rest('shift_team_members', '?select=id,team_id,full_name,pattern,is_active&is_active=eq.true&order=sort_order.asc'),
  rest('shift_adjustments', '?select=effective_date,delta_days,scope,team_id'),
  rest('sala_schedule', '?select=month,schedule&order=month.asc'),
])

const tmap = new Map((teams ?? []).map(t => [t.id, t]))
const tymap = new Map((types ?? []).map(t => [t.id, t]))

// righe base PDF per nome
const pdfBase = new Map() // name -> Map(month -> base[])
for (const s of schedules ?? []) {
  if (s.schedule?.v !== 2) continue
  const d = s.schedule
  const code = i => d.codes[i ?? 0] ?? ''
  d.names.forEach((name, r) => {
    const row = d.rows[r]
    const base = Array.from({ length: d.days }, (_, i) => code(row?.t?.[i]))
    if (!pdfBase.has(name)) pdfBase.set(name, new Map())
    pdfBase.get(name).set(s.month, base)
  })
}

for (const type of types ?? []) {
  const squadre = (teams ?? []).filter(t => t.shift_type_id === type.id)
  console.log(`\n══ ${type.name} (ciclo ${type.cycle_days}gg) ══`)
  for (const team of squadre) {
    const mem = (members ?? []).filter(m => m.team_id === team.id)
    const scores = []
    for (const m of mem) {
      const pdf = pdfBase.get(m.full_name)
      if (!pdf) { scores.push({ n: m.full_name, pct: null }); continue }
      let ok = 0, tot = 0
      for (const [month, base] of pdf) {
        for (let d = 1; d <= base.length; d++) {
          const iso = `${month}-${String(d).padStart(2, '0')}`
          const theo = tokenForMember(type, m, team.id, adjustments ?? [], iso)
          const b = base[d - 1]
          if (!b && !theo) { ok++; tot++; continue }
          tot++
          if (theo === b) ok++
        }
      }
      scores.push({ n: m.full_name, pct: tot ? Math.round(100 * ok / tot) : null })
    }
    const list = scores.map(s => `${s.n}:${s.pct ?? '—'}%`).join('  ')
    console.log(`  ${team.name}: ${list}`)
  }
}
