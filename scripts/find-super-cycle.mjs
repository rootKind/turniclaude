// Trova il ciclo «sup» minimo per tipologia: il numero di giorni dopo cui SIAMO
// (turno M/P/N) e SEZIONE tornano in fase (es. LCM(28,42)=84 per «in terza»).
// Metodo: per ogni membro con storia PDF, ricerca del periodo p più piccolo la
// cui sequenza di codici completi si ripete (maggioranza per classe di resto,
// tollerando i ritocchi di piano); poi verifica out-of-sample sull'ultimo mese.
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
const rest = (t, s) => fetch(`${URL}/rest/v1/${t}${s}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).then(r => r.json())

console.log(`Progetto: ${URL.replace('https://', '').split('.')[0]} (atteso dev: uokfixddsuqcjddbfkln)`)

const dayKey = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000) }
const norm = t => (t ?? '').trim().replace(/TIR$/, '')

// Periodo minimo p tale che la sequenza (codici completi) si ripeta ogni p giorni.
// Per ogni classe di resto vince il codice più frequente (parità → il più recente);
// si tollera una piccola quota di conflitti (ritocchi di piano).
function minimalPeriod(seq, { minP = 14, maxP = 168, maxConflict = 0.03 } = {}) {
  const keys = [...seq.keys()].sort((a, b) => a - b)
  if (keys.length < 28) return null
  const first = keys[0]
  const last = keys[keys.length - 1]
  const span = last - first + 1
  const days = [...seq.entries()].sort((a, b) => a[0] - b[0])
  for (let p = minP; p <= Math.min(maxP, span - 28); p++) {
    const tally = Array.from({ length: p }, () => new Map()) // chiave→{n, last}
    let compared = 0
    for (const [k, raw] of days) {
      const t = norm(raw)
      if (!t) continue
      compared++
      const m = tally[(k - first) % p]
      const cur = m.get(t)
      if (cur) { cur.n++; cur.last = k }
      else m.set(t, { n: 1, last: k })
    }
    if (tally.some(m => m.size === 0)) continue
    let agree = 0
    let conflict = 0
    for (const m of tally) {
      let tot = 0, bestN = 0
      for (const { n } of m.values()) { tot += n; if (n > bestN) bestN = n }
      agree += bestN
      conflict += tot - bestN
    }
    if (compared > 0 && conflict / compared > maxConflict) continue
    return { p, consistency: agree / compared }
  }
  return null
}

// Pattern di lunghezza N ancorato ad ANCHOR: per ogni resto il codice più
// frequente tra le date osservate (parità → la più recente).
function buildPattern(seq, N, anchorKey) {
  const tally = Array.from({ length: N }, () => new Map())
  for (const [k, raw] of [...seq.entries()].sort((a, b) => a[0] - b[0])) {
    const t = norm(raw)
    if (!t) continue
    const m = tally[((k - anchorKey) % N + N) % N]
    const cur = m.get(t)
    if (cur) { cur.n++; cur.last = k }
    else m.set(t, { n: 1, last: k })
  }
  const pattern = []
  let filled = 0
  for (const m of tally) {
    if (m.size === 0) { pattern.push(''); continue }
    let best = null
    for (const [t, { n, last }] of m) {
      if (!best || n > best.n || (n === best.n && last > best.last)) best = { t, n, last }
    }
    pattern.push(best.t)
    filled++
  }
  return { pattern, filled }
}

const [types, teams, members, adjustments, schedules] = await Promise.all([
  rest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active,sort_order&order=sort_order.asc'),
  rest('shift_teams', '?select=id,shift_type_id,name,phase_offset_days,sort_order&order=sort_order.asc'),
  rest('shift_team_members', '?select=id,team_id,full_name,user_id,pattern,sort_order,is_active,is_lead&order=sort_order.asc'),
  rest('shift_adjustments', '?select=id,effective_date,delta_days,scope,team_id,note'),
  rest('sala_schedule', '?select=month,schedule&order=month.asc'),
])

console.log('\n── Tipologie nel DB ──')
for (const t of types ?? []) {
  console.log(`${t.is_active ? 'ATTIVA ' : 'inatt. '} ${t.name}: cycle_days=${t.cycle_days} pattern_start=${t.pattern_start}`)
}
console.log(`Aggiustamenti registrati: ${(adjustments ?? []).length}`)
for (const a of adjustments ?? []) console.log(`  ${a.effective_date} delta=${a.delta_days} scope=${a.scope} note=${a.note ?? '-'}`)

const pdfMonths = new Map()
for (const s of schedules ?? []) if (s.schedule?.v === 2) pdfMonths.set(s.month, s.schedule)
const months = [...pdfMonths.keys()].sort()
console.log('Mesi PDF:', months.join(', '))

const typeById = new Map((types ?? []).map(t => [t.id, t]))
const teamById = new Map((teams ?? []).map(t => [t.id, t]))

function memberSeq(fullName) {
  const seq = new Map()
  for (const month of months) {
    const data = pdfMonths.get(month)
    const idx = data.names.findIndex(n => n.trim().toUpperCase() === fullName.trim().toUpperCase())
    if (idx < 0) continue
    const row = data.rows[idx]
    const code = i => data.codes[i ?? 0] ?? ''
    for (let d = 1; d <= data.days; d++) seq.set(dayKey(`${month}-${String(d).padStart(2, '0')}`), code(row?.t?.[d - 1]))
  }
  return seq
}

const report = new Map() // tipo → [{name, p, consistency, filled, oos}]
for (const m of members ?? []) {
  if (!m.is_active) continue
  const team = teamById.get(m.team_id)
  const type = typeById.get(team?.shift_type_id)
  if (!type?.is_active) continue
  const seq = memberSeq(m.full_name)
  if (seq.size < 28) continue
  const found = minimalPeriod(seq)
  const list = report.get(type.name) ?? []
  list.push({ name: m.full_name, found, seq })
  report.set(type.name, list)
}

console.log('\n── Periodo minimo per membro (codici completi turno+sezione) ──')
const typeCycle = new Map()
for (const [typeName, list] of [...report.entries()].sort()) {
  const counts = new Map()
  for (const { found } of list) {
    if (!found) continue
    counts.set(found.p, (counts.get(found.p) ?? 0) + 1)
  }
  let bestP = 0, bestN = 0
  for (const [p, n] of counts) if (n > bestN) { bestP = p; bestN = n }
  typeCycle.set(typeName, bestP)
  const dist = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `p${p}×${n}`).join(' ')
  console.log(`\n${typeName}: ciclo modale = ${bestP}gg  (${dist})`)
  for (const { name, found } of list.sort((a, b) => (a.found?.p ?? 999) - (b.found?.p ?? 999))) {
    console.log(`  ${String(found?.p ?? '—').padStart(3)}gg  conf ${(found ? (found.consistency * 100) : 0).toFixed(1)}%  ${name}`)
  }
}

// ── out-of-sample: pattern dai mesi [0..-2], verifica sull'ultimo mese ──────
console.log('\n── Out-of-sample: pattern costruito SENZA l\'ultimo mese, verificato su di esso ──')
const testMonth = months[months.length - 1]
const trainMonths = months.slice(0, -1)
const trainPdf = new Map(trainMonths.map(m => [m, pdfMonths.get(m)]))

function memberSeqFrom(mapMonths, fullName) {
  const seq = new Map()
  for (const month of mapMonths.keys()) {
    const data = mapMonths.get(month)
    const idx = data.names.findIndex(n => n.trim().toUpperCase() === fullName.trim().toUpperCase())
    if (idx < 0) continue
    const row = data.rows[idx]
    const code = i => data.codes[i ?? 0] ?? ''
    for (let d = 1; d <= data.days; d++) seq.set(dayKey(`${month}-${String(d).padStart(2, '0')}`), code(row?.t?.[d - 1]))
  }
  return seq
}

for (const [typeName, list] of [...report.entries()].sort()) {
  const N = typeCycle.get(typeName)
  if (!N) continue
  console.log(`\n${typeName} (ciclo ${N}gg):`)
  let good = 0, tot = 0
  for (const { name } of list) {
    const seqT = memberSeqFrom(trainPdf, name)
    if (seqT.size < 28) continue
    const first = Math.min(...seqT.keys())
    const { pattern, filled } = buildPattern(seqT, N, first)
    if (filled < N) continue
    const data = pdfMonths.get(testMonth)
    const idx = data.names.findIndex(n => n.trim().toUpperCase() === name.trim().toUpperCase())
    if (idx < 0) continue
    const row = data.rows[idx]
    const code = i => data.codes[i ?? 0] ?? ''
    let ok = 0, cmp = 0
    for (let d = 1; d <= data.days; d++) {
      const iso = `${testMonth}-${String(d).padStart(2, '0')}`
      const pred = pattern[((dayKey(iso) - first) % N + N) % N] ?? ''
      const real = code(row?.t?.[d - 1])
      if (!norm(pred) && !norm(real)) continue
      cmp++
      if (norm(pred) === norm(real)) ok++
    }
    const pct = cmp ? Math.round(100 * ok / cmp) : -1
    tot++; if (pct >= 95) good++
    console.log(`  ${String(pct).padStart(3)}%  (${filled}/${N} residue)  ${name}`)
  }
  console.log(`  ≥95%: ${good}/${tot}`)
}
