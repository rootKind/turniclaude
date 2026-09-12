// Diagnostica omonimi: quale riga «MININO» in shift_team_members corrisponde
// alla rotazione reale del PDF? Confronta ogni pattern candidato con la riga
// base del PDF (teorico[] del parser v2) e conta le corrispondenze.
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
  rest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active,sort_order&order=sort_order.asc'),
  rest('shift_teams', '?select=id,shift_type_id,name,sort_order&order=sort_order.asc'),
  rest('shift_team_members', '?select=id,team_id,full_name,pattern,is_active,is_lead&full_name=ilike.*MININO*&order=sort_order.asc'),
  rest('shift_adjustments', '?select=effective_date,delta_days,scope,team_id'),
  rest('sala_schedule', '?select=month,schedule&order=month.asc'),
])

const tmap = new Map((teams ?? []).map(t => [t.id, t]))
const tymap = new Map((types ?? []).map(t => [t.id, t]))

console.log('── Righe «MININO» in shift_team_members ──')
const candidates = []
for (const m of members ?? []) {
  const team = tmap.get(m.team_id)
  const type = tymap.get(team?.shift_type_id)
  candidates.push({ m, team, type })
  console.log(`${type?.name} / ${team?.name} — is_active(type)=${type?.is_active} is_active(member)=${m.is_active} lead=${m.is_lead}`)
  console.log(`   pattern: ${m.pattern.join('|')}`)
}

// PDF base row per MININO (persona del calendario sala)
const codeOf = (data, i) => data.codes[i ?? 0] ?? ''
const pdfBase = new Map()   // month -> base[]
const pdfReal = new Map()
for (const s of schedules ?? []) {
  if (s.schedule?.v !== 2) continue
  const data = s.schedule
  const idx = data.names.findIndex(n => n.trim().toLowerCase() === 'minino')
  if (idx < 0) continue
  const row = data.rows[idx]
  pdfBase.set(s.month, Array.from({ length: data.days }, (_, i) => codeOf(data, row?.t?.[i])))
  pdfReal.set(s.month, Array.from({ length: data.days }, (_, i) => codeOf(data, row?.d?.[i])))
}
console.log('\nMesi con riga PDF «MININO»:', [...pdfBase.keys()].join(', ') || 'nessuno')

console.log('\n── Punteggio pattern vs riga base PDF (giorni coerenti / totali) ──')
for (const { m, team, type } of candidates) {
  let ok = 0, tot = 0
  for (const [month, base] of pdfBase) {
    for (let d = 1; d <= base.length; d++) {
      const iso = `${month}-${String(d).padStart(2, '0')}`
      const theo = tokenForMember(type, m, team.id, adjustments ?? [], iso)
      if (!base[d - 1] && !theo) { ok++; tot++; continue }
      if (!base[d - 1] || !theo) { tot++; continue }
      tot++
      if (theo === base[d - 1]) ok++
    }
  }
  const stato = type?.is_active && m.is_active ? 'ATTIVO' : 'inattivo'
  console.log(`${type?.name} / ${team?.name} [${stato}]: ${ok}/${tot} (${tot ? Math.round(100 * ok / tot) : 0}%)`)
}

// Anche: match per user_id esiste? (già visto: NULL). E nomi simili nel PDF:
const sep2026 = (schedules ?? []).find(s => s.month === '2026-09')?.schedule
if (sep2026?.v === 2) {
  const mininos = sep2026.names.filter(n => n.trim().toLowerCase().includes('minino'))
  console.log('\nRighe «minino» nel PDF 2026-09:', JSON.stringify(mininos))
}
