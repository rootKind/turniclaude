// Applica alle tipologie del DB il ciclo «sup» dedotto dalla storia dei PDF:
//  - shift_types.cycle_days = periodo minimo reale (es. 84gg per «in terza»)
//  - shift_types.pattern_start = anchor comune (2026-03-01, primo giorno PDF)
//  - pattern dei membri = codici COMPLETI (turno+sezione) per classe di resto
// Uso: node scripts/apply-super-cycle.mjs          (anteprima, NON scrive)
//      node scripts/apply-super-cycle.mjs --apply  (scrive, con backup JSON)
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
const APPLY = process.argv.includes('--apply')
const hdr = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const rest = (t, s) => fetch(`${URL}/rest/v1/${t}${s}`, { headers: hdr }).then(r => r.json())
const patch = async (t, q, body) => { const r = await fetch(`${URL}/rest/v1/${t}${q}`, { method: 'PATCH', headers: hdr, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${t} PATCH ${r.status}: ${await r.text()}`); return true }

const COMMON_ANCHOR = '2026-03-01'   // primo giorno coperto dai PDF (lunedi)
const dayKey = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000) }
const norm = t => (t ?? '').trim().replace(/TIR$/, '')

const [types, teams, members, schedules] = await Promise.all([
  rest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active,sort_order&order=sort_order.asc'),
  rest('shift_teams', '?select=id,shift_type_id,name,sort_order'),
  rest('shift_team_members', '?select=id,team_id,full_name,pattern,is_active,is_lead&order=sort_order.asc'),
  rest('sala_schedule', '?select=month,schedule&order=month.asc'),
])

const pdfMonths = new Map()
for (const s of schedules ?? []) if (s.schedule?.v === 2) pdfMonths.set(s.month, s.schedule)
const months = [...pdfMonths.keys()].sort()
console.log(`Mesi PDF: ${months.join(', ')}  — anchor comune ${COMMON_ANCHOR} — modalità: ${APPLY ? 'APPLY (scrive)' : 'DRY-RUN (non scrive)'}`)

// sequenza teorico di una persona per giorno assoluto
function memberSeq(fullName, map = pdfMonths) {
  const seq = new Map()
  for (const month of map.keys()) {
    const data = map.get(month)
    const idx = data.names.findIndex(n => n.trim().toUpperCase() === fullName.trim().toUpperCase())
    if (idx < 0) continue
    const row = data.rows[idx]
    const code = i => data.codes[i ?? 0] ?? ''
    for (let d = 1; d <= data.days; d++) seq.set(dayKey(`${month}-${String(d).padStart(2, '0')}`), code(row?.t?.[d - 1]))
  }
  return seq
}

// periodo minimo con sequenza che si ripete (maggioranza per classe di resto)
function minimalPeriod(seq) {
  const keys = [...seq.keys()].sort((a, b) => a - b)
  if (keys.length < 28) return null
  const first = keys[0]
  const span = keys[keys.length - 1] - first + 1
  const days = [...seq.entries()].sort((a, b) => a[0] - b[0])
  for (let p = 14; p <= Math.min(168, span - 28); p++) {
    const tally = Array.from({ length: p }, () => new Map())
    for (const [k, raw] of days) {
      const t = norm(raw)
      if (!t) continue
      const m = tally[(k - first) % p]
      const cur = m.get(t)
      if (cur) cur.n++
      else m.set(t, { n: 1 })
    }
    if (tally.some(m => m.size === 0)) continue
    let agree = 0
    let sumTot = 0
    for (const m of tally) {
      let best = 0
      for (const { n } of m.values()) { sumTot += n; if (n > best) best = n }
      agree += best
    }
    if (sumTot > 0 && (sumTot - agree) / sumTot > 0.03) continue
    return { p }
  }
  return null
}

// pattern di lunghezza N con anchor COMUNE; le classi senza osservazione si
// riempono rimappando il pattern ancorato al primo giorno proprio della persona
function buildPattern(seq, N, anchorKey, ownFirstKey) {
  const tally = Array.from({ length: N }, () => new Map())
  for (const [k, raw] of [...seq.entries()].sort((a, b) => a[0] - b[0])) {
    const t = norm(raw)
    if (!t) continue
    const m = tally[((k - anchorKey) % N + N) % N]
    const cur = m.get(t)
    if (cur) { cur.n++; cur.last = k } else m.set(t, { n: 1, last: k })
  }
  const pick = m => {
    if (!m || m.size === 0) return ''
    let best = null
    for (const [t, { n, last }] of m) if (!best || n > best.n || (n === best.n && last > best.last)) best = { t, n, last }
    return best.t
  }
  // pattern ancorato al primo giorno PROPRIO (per il riempimento dei buchi)
  const ownTally = Array.from({ length: N }, () => new Map())
  for (const [k, raw] of [...seq.entries()].sort((a, b) => a[0] - b[0])) {
    const t = norm(raw)
    if (!t) continue
    const r = (k - ownFirstKey) % N
    const m = ownTally[r]
    const cur = m.get(t)
    if (cur) { cur.n++; cur.last = k } else m.set(t, { n: 1, last: k })
  }
  const shift = ((ownFirstKey - anchorKey) % N + N) % N
  const out = []
  let empty = 0
  for (let r = 0; r < N; r++) {
    let t = pick(tally[r])
    if (!t) { t = pick(ownTally[(r - shift + N) % N]); if (t) empty++ }
    if (!t) { empty++; t = '' }
    out.push(t)
  }
  return { pattern: out, empty }
}

const typeById = new Map((types ?? []).map(t => [t.id, t]))
const teamById = new Map((teams ?? []).map(t => [t.id, t]))

// ── 1) periodo modale per tipologia ──────────────────────────────────────────
const perType = new Map() // type_id → { N, members: [{m, seq}] }
for (const m of members ?? []) {
  if (!m.is_active) continue
  const team = teamById.get(m.team_id)
  const type = typeById.get(team?.shift_type_id)
  if (!type?.is_active) continue
  const seq = memberSeq(m.full_name)
  const entry = perType.get(type.id) ?? { type, N: 0, members: [] }
  entry.members.push({ m, seq })
  const found = minimalPeriod(seq)
  if (found) {
    entry.periods = entry.periods ?? new Map()
    entry.periods.set(found.p, (entry.periods.get(found.p) ?? 0) + 1)
  }
  perType.set(type.id, entry)
}
for (const entry of perType.values()) {
  if (!entry.periods) continue
  let bestP = 0, bestN = 0
  for (const [p, n] of entry.periods) if (n > bestN) { bestP = p; bestN = n }
  entry.N = bestP
}

// ── 2) anteprima / applicazione ──────────────────────────────────────────────
const backup = { taken_at: new Date().toISOString(), types: types ?? [], members: members ?? [] }
if (APPLY) {
  const bakPath = path.join('scripts', `backup-rotation-${Date.now()}.json`)
  fs.writeFileSync(bakPath, JSON.stringify(backup, null, 2))
  console.log(`Backup scritto: ${bakPath}`)
}

const changes = []
for (const { type, N, members: ms } of perType.values()) {
  if (!N) { console.log(`\n${type.name}: nessun periodo deducibile, salto`); continue }
  if (N !== type.cycle_days) changes.push({ kind: 'type', id: type.id, from: type.cycle_days, to: N, name: type.name })
  console.log(`\n== ${type.name}: cycle_days ${type.cycle_days} → ${N} — pattern_start → ${COMMON_ANCHOR} ==`)
  for (const { m, seq } of ms) {
    let newPattern
    if (seq.size >= 28) {
      const ownFirst = Math.min(...seq.keys())
      const { pattern, empty } = buildPattern(seq, N, dayKey(COMMON_ANCHOR), ownFirst)
      newPattern = pattern
      if (empty > 0) console.log(`  ${m.full_name}: ${empty}/${N} classi vuote (riempite se possibile)`)
    } else {
      // niente storia PDF: ripete il pattern esistente fino a riempire N
      const old = m.pattern ?? []
      newPattern = Array.from({ length: N }, (_, i) => old[i % (old.length || 1)] ?? '')
      console.log(`  ${m.full_name}: senza storia PDF — pattern esistente ripetuto (${old.length}→${N})`)
    }
    const diff = JSON.stringify(newPattern) !== JSON.stringify(m.pattern)
    if (diff) changes.push({ kind: 'member', id: m.id, name: m.full_name, len: newPattern.length })
    const sample = newPattern.slice(0, 6).join(' ')
    console.log(`  ${m.full_name.padEnd(18)} pattern[${newPattern.length}] es: ${sample} ${diff ? '(CAMBIA)' : '(invariato)'}`)
    if (APPLY && diff) {
      await patch('shift_team_members', `?id=eq.${m.id}`, { pattern: newPattern })
    }
  }
  if (APPLY) {
    await patch('shift_types', `?id=eq.${type.id}`, { cycle_days: N, pattern_start: COMMON_ANCHOR })
  }
}

console.log(`\n── Riepilogo: ${changes.length} modifiche ${APPLY ? 'APPLICATE' : 'in anteprima (dry-run)'} ──`)
if (!APPLY) console.log('Rilancia con --apply per scrivere (prima viene salvato un backup JSON in scripts/).')
