// Diagnosi: genera Febbraio 2025 teorico con i DATI REALI del DB (stessa
// matematica di lib/turni-teorici.ts) e conta le presenze per turno/giorno.
// Non stampa mai valori segreti.
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
let envPath = null
for (let dir = root; ; dir = path.dirname(dir)) {
  const c = path.join(dir, '.env.local')
  if (fs.existsSync(c)) { envPath = c; break }
  if (dir === path.dirname(dir)) break
}
if (!envPath) { console.error('.env.local non trovato'); process.exit(1) }
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('env mancanti'); process.exit(1) }

const rest = (table, search) =>
  fetch(`${URL}/rest/v1/${table}${search}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  }).then(r => r.json())

const DAY_MS = 86400000
const parseDateUTC = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const daysBetween = (a, b) => Math.round((parseDateUTC(b) - parseDateUTC(a)) / DAY_MS)
const addDays = (iso, n) => {
  const d = new Date(parseDateUTC(iso) + n * DAY_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const types = await rest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active&order=sort_order.asc')
const teams = await rest('shift_teams', '?select=id,shift_type_id,name&order=sort_order.asc')
const members = await rest('shift_team_members', '?select=id,team_id,full_name,pattern,is_active&order=full_name.asc')
const adjustments = await rest('shift_adjustments', '?select=team_id,scope,delta_days,effective_date')

console.log(`types=${types.length} teams=${teams.length} members=${members.length} adjustments=${adjustments.length}`)

const isShiftCode = t => /^[MNP][A-Z0-9]+$/.test(t)
const ABSENT = new Set(['A', 'AG', 'F', 'RM', 'RC', 'RI', 'VS', 'D'])
const isPresentNoSection = t =>
  (!ABSENT.has(t) && (/^Sp[A-Za-z@]/.test(t) || /^ISp[A-Za-z]/.test(t) || t === 'SPW' || t === 'SpNw' || /^Dis[A-Z]/.test(t)))

function tokenForMember(type, member, teamId, dateISO) {
  let offset = 0
  for (const a of adjustments) {
    if (a.effective_date > dateISO) continue
    if (a.scope === 'global' || a.team_id === teamId) offset += a.delta_days
  }
  const anchor = addDays(type.pattern_start, offset)
  const period = Math.max(1, member.pattern.length || type.cycle_days)
  const idx = ((daysBetween(anchor, dateISO) % period) + period) % period
  return member.pattern[idx] ?? ''
}

// Presenze (codici shift) per ciascun giorno di Febbraio 2025.
const target = '2025-02'
const nDays = new Date(Date.UTC(2025, 2, 0)).getUTCDate()
let totalPresent = 0
let emptyPatternMembers = 0
const perShift = { M: 0, P: 0, N: 0 }
const sample = []

for (const type of types) {
  if (!type.is_active) continue
  const typeTeams = teams.filter(t => t.shift_type_id === type.id)
  for (const team of typeTeams) {
    const mems = members.filter(m => m.team_id === team.id && m.is_active)
    for (const member of mems) {
      if (!member.pattern || member.pattern.length === 0) { emptyPatternMembers++; continue }
      for (let d = 1; d <= nDays; d++) {
        const dateISO = `${target}-${String(d).padStart(2, '0')}`
        const tok = tokenForMember(type, member, team.id, dateISO)
        if (!tok || ABSENT.has(tok)) continue
        if (isPresentNoSection(tok)) { perShift.M++; totalPresent++; continue } // grossolanamente in altriPresenti
        if (isShiftCode(tok)) {
          perShift[tok[0]]++
          totalPresent++
          if (sample.length < 8 && d <= 3) sample.push(`${member.full_name} ${dateISO} ${tok}`)
        }
      }
    }
  }
}

console.log('Presenze Febbraio 2025:', totalPresent, JSON.stringify(perShift))
console.log('membri senza pattern:', emptyPatternMembers)
for (const s of sample) console.log(' ', s)
