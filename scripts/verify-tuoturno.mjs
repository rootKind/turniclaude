// Verifica «Il tuo turno» per un utente: teorico calcolato vs reale PDF vs riga base del PDF.
// Uso: node scripts/verify-tuoturno.mjs [frase-cognome]  (default: minino)
// NON stampa mai valori segreti (solo l'host del progetto per conferma dev/main).
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

// Env dal .env.local del progetto principale (questo worktree non ce l'ha):
// risali la gerarchia delle cartelle finché trovi un .env.local.
let envPath = null
for (let dir = root; ; dir = path.dirname(dir)) {
  const candidate = path.join(dir, '.env.local')
  if (fs.existsSync(candidate)) { envPath = candidate; break }
  if (dir === path.dirname(dir)) break
}
if (!envPath) {
  console.error('.env.local non trovato risalendo da', root)
  process.exit(1)
}
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Variabili mancanti in .env.local (URL o SERVICE_ROLE_KEY)')
  process.exit(1)
}

const filtro = (process.argv[2] ?? 'minino').toLowerCase()
const rest = (table, search) =>
  fetch(`${URL}/rest/v1/${table}${search}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  }).then(r => r.json())

// ── date helpers (UTC, identici a lib/turni-teorici.ts) ─────────────────────
const DAY_MS = 86400000
const parseDateUTC = iso => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const daysBetween = (a, b) => Math.round((parseDateUTC(b) - parseDateUTC(a)) / DAY_MS)
const addDays = (iso, n) => {
  const d = new Date(parseDateUTC(iso) + n * DAY_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
const WD = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM']
const weekday = iso => WD[(new Date(parseDateUTC(iso)).getUTCDay() + 6) % 7]

// ── logica teorico (specchio di tokenForMember) ─────────────────────────────
function adjustmentOffset(adjustments, teamId, dateISO) {
  let offset = 0
  for (const a of adjustments) {
    if (a.effective_date > dateISO) continue
    if (a.scope === 'global' || a.team_id === teamId) offset += a.delta_days
  }
  return offset
}
function tokenForMember(type, member, teamId, adjustments, dateISO) {
  const offset = adjustmentOffset(adjustments, teamId, dateISO)
  const anchor = addDays(type.pattern_start, offset)
  const idx = ((daysBetween(anchor, dateISO) % type.cycle_days) + type.cycle_days) % type.cycle_days
  return member.pattern[idx] ?? ''
}

// ── nome ↔ utente (specchio di personNameMatches) ───────────────────────────
function personNameMatches(fullName, user) {
  const fn = fullName.trim().toLowerCase()
  const cognome = (user.cognome ?? '').trim().toLowerCase()
  const nome = (user.nome ?? '').trim().toLowerCase()
  if (!fn || !cognome) return false
  if (fn === cognome) return true
  const prefixed = fn.match(/^(.*)\s+([a-z]+)\.$/)
  if (prefixed && prefixed[1] === cognome) return !!nome && nome.startsWith(prefixed[2])
  return false
}

const [users, types, teams, members, adjustments, schedules] = await Promise.all([
  rest('users', `?select=id,nome,cognome&cognome=ilike.*${filtro}*`),
  rest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active,sort_order&order=sort_order.asc'),
  rest('shift_teams', '?select=id,shift_type_id,name,phase_offset_days,sort_order&order=sort_order.asc'),
  rest('shift_team_members', '?select=id,team_id,full_name,user_id,pattern,sort_order,is_active,is_lead&order=sort_order.asc'),
  rest('shift_adjustments', '?select=id,effective_date,delta_days,scope,team_id,note&order=effective_date.asc'),
  rest('sala_schedule', '?select=month,schedule,uploaded_at&order=month.asc'),
])

const user = (users ?? []).find(u => `${u.cognome} ${u.nome ?? ''}`.toLowerCase().includes(filtro))
if (!user) { console.error('Utente non trovato'); process.exit(1) }

console.log(`Progetto: ${URL.replace('https://', '').split('.')[0]} (atteso dev: uokfixddsuqcjddbfkln)`)
console.log(`Utente: ${user.cognome} ${user.nome ?? ''} (${user.id})`)

const tree = { types: (types ?? []).map(t => ({ ...t, teams: (teams ?? []).filter(x => x.shift_type_id === t.id) })) }

// ── diagnostica: righe «MININO» nel DB + dimensione squadre ─────────────────
console.log('\n── Diagnostica strutture ──')
for (const t of tree.types) {
  if (!t.is_active) continue
  for (const team of t.teams) {
    const names = members.filter(m => m.is_active && m.team_id === team.id).map(m => m.full_name)
    const hasUser = names.some(n => personNameMatches(n, user))
    console.log(`${t.name} / ${team.name} (${names.length} attivi)${hasUser ? '   <== contiene l\'utente' : ''}`)
    if (hasUser) console.log(`   membri: ${names.join(', ')}`)
  }
}
const activeMembers = (members ?? []).filter(m => m.is_active)

// match per user_id (priorità) poi per nome
let ref = null
for (const t of tree.types) for (const team of t.teams) for (const m of activeMembers) {
  if (m.user_id === user.id) ref = { type: t, team, member: m }
}
if (!ref) {
  for (const t of tree.types) for (const team of t.teams) for (const m of activeMembers) {
    if (personNameMatches(m.full_name, user)) { ref = { type: t, team, member: m }; break }
  }
}
if (!ref) { console.error('Membro squadra non trovato (né per user_id né per nome)'); process.exit(1) }

console.log(`Membro: "${ref.member.full_name}" — squadra "${ref.team.name}" — tipologia "${ref.type.name}"`)
console.log(`  user_id sul membro: ${ref.member.user_id ?? 'NULL'}`)
console.log(`  ciclo ${ref.type.cycle_days}gg, pattern_start ${ref.type.pattern_start}, is_lead ${ref.member.is_lead}`)
console.log(`  pattern: ${ref.member.pattern.join('|')}`)
console.log(`Aggiustamenti: ${(adjustments ?? []).length === 0 ? 'nessuno' : ''}`)
for (const a of adjustments ?? []) console.log(`  ${a.effective_date} delta=${a.delta_days} scope=${a.scope} team=${a.team_id ?? '-'} note=${a.note ?? '-'}`)

// ── mesi reali (PDF, formato v2) ────────────────────────────────────────────
const realMonths = new Map()
if (!Array.isArray(schedules)) {
  console.error('Errore lettura sala_schedule:', JSON.stringify(schedules).slice(0, 300))
  process.exit(1)
}
for (const s of schedules) {
  if (s.schedule?.v === 2) realMonths.set(s.month, s.schedule)
}
console.log(`\nMesi reali caricati (v2): ${[...realMonths.keys()].join(', ') || 'nessuno'}`)

function pdfPerson(data) {
  const code = i => data.codes[i ?? 0] ?? ''
  const idx = data.names.findIndex(n => personNameMatches(n, user))
  if (idx < 0) return null
  const row = data.rows[idx]
  const days = Array.from({ length: data.days }, (_, i) => code(row?.d?.[i]))
  const base = Array.from({ length: data.days }, (_, i) => code(row?.t?.[i]))
  const yellow = row?.y ?? []
  return { name: data.names[idx], days, base, yellow }
}

const today = new Date()
const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

let mismTheoBase = 0, mismRealTheo = 0, checked = 0
console.log('\n── Verifica giorno per giorno (ultimi 10 giorni + prossimi 5) ──')
console.log('data        sett  TEORICO(calcolato)  PDF-base  REALE  giallo')

const inWindow = iso => daysBetween(iso, todayISO) <= 10 && daysBetween(iso, todayISO) >= -5
for (const [month, data] of [...realMonths.entries()].sort()) {
  const person = pdfPerson(data)
  if (!person) { console.log(`\n[${month}] persona NON trovata nel PDF`) ; continue }
  for (let d = 1; d <= data.days; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`
    const theo = tokenForMember(ref.type, ref.member, ref.team.id, adjustments ?? [], iso)
    const real = person.days[d - 1] ?? ''
    const base = person.base[d - 1] ?? ''
    const pend = person.yellow.includes(d)
    checked++
    if (theo !== base) mismTheoBase++
    if (real !== theo && !pend) mismRealTheo++
    if (inWindow(iso)) {
      const flag = theo !== base ? '  <== teorico≠PDF-base' : ''
      const flag2 = real !== theo ? (pend ? ' (giallo=da confermare)' : '  <== reale≠teorico') : ''
      console.log(`${iso}  ${weekday(iso)}   ${theo.padEnd(18)}  ${base.padEnd(9)}  ${real.padEnd(6)} ${pend ? 'G' : ' '}${flag}${flag2}`)
    }
  }
  if (!inWindow(`${month}-01`) && !inWindow(addDays(`${month}-28`, 3))) {
    console.log(`[${month}] verificati ${data.days} giorni fuori finestra (vedi conteggi)`)
  } else {
    console.log(`[${month}] ok`)
  }
}

console.log(`\n── Riepilogo (${checked} giorni confrontati) ──`)
console.log(`Giorni con teorico calcolato ≠ riga base del PDF: ${mismTheoBase}`)
console.log(`Giorni con reale ≠ teorico (esclusi i gialli «da confermare»): ${mismRealTheo}`)
if (mismTheoBase > 0) {
  console.log('\nDettaglio teorico≠PDF-base:')
  for (const [month, data] of [...realMonths.entries()].sort()) {
    const person = pdfPerson(data)
    if (!person) continue
    for (let d = 1; d <= data.days; d++) {
      const iso = `${month}-${String(d).padStart(2, '0')}`
      const theo = tokenForMember(ref.type, ref.member, ref.team.id, adjustments ?? [], iso)
      const base = person.base[d - 1] ?? ''
      if (theo !== base) console.log(`  ${iso} (${weekday(iso)}): calcolato=${theo || '—'}  pdf-base=${base || '—'}`)
    }
  }
}
