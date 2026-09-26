// VERIFICA: confronto del PDF di ottobre (righe teoriche) con i pattern che
// dev sta usando davvero, squadra per squadra: dice quanto del piano è stato
// realmente scritto e quali membri ne restano fuori. Serve a capire se i
// buchi sotto il minimo dipendono dal piano o dalle squadre NON coperte.
import fs from 'node:fs'
import path from 'node:path'

let dir = process.cwd()
let env = null
for (;;) {
  const f = path.join(dir, '.env.local')
  if (fs.existsSync(f)) {
    env = {}
    for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    break
  }
  const su = path.dirname(dir)
  if (su === dir) break
  dir = su
}
const MAIN = 'zrbbzfingrdpdflkndgl'
const mainQuery = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${MAIN}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}
const devRest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json())

const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const gf = (a, b) => Math.round((pd(b) - pd(a)) / DAY)
const isoOf = (m, d) => `${m}-${String(d).padStart(2, '0')}`
const MESE = '2026-10'
const piano = JSON.parse(fs.readFileSync(path.join('scripts', 'piano-pattern-2026-10.json'), 'utf8'))
const nelPiano = new Set(piano.membri.map(p => p.membro))

const [types, teams, members, [pdfRow], storico] = await Promise.all([
  devRest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active'),
  devRest('shift_teams', '?select=id,shift_type_id,name,sort_order'),
  devRest('shift_team_members', '?select=id,team_id,full_name,pattern,sort_order,is_active'),
  mainQuery(`select schedule from sala_schedule where month='${MESE}'`),
  devRest('shift_member_patterns', '?select=member_id,from_date,pattern&order=from_date'),
])
// «in vigore» è il ciclo che dev sta usando nel mese (migration 037), non la
// colonna: dal 1° ottobre i due possono essere diversi.
const cicliPerMembro = new Map()
for (const r of storico ?? []) {
  const l = cicliPerMembro.get(r.member_id) ?? []
  l.push({ from_date: String(r.from_date).slice(0, 10), pattern: (r.pattern ?? []).map(String) })
  cicliPerMembro.set(r.member_id, l)
}
const patternInVigore = (m, data) => {
  let best = null
  for (const c of cicliPerMembro.get(m.id) ?? []) {
    if (c.from_date > data) continue
    if (!best || c.from_date > best.from_date) best = c
  }
  return best?.pattern ?? (m.pattern ?? []).map(String)
}
const pdf = pdfRow.schedule
const typeById = new Map(types.map(t => [t.id, t]))
const teamById = new Map(teams.map(t => [t.id, t]))
const tokenFor = (m, dateISO, pattern) => {
  const team = teamById.get(m.team_id)
  const type = typeById.get(team.shift_type_id)
  const L = (pattern ?? []).length
  if (!L) return ''
  const idx = ((gf(type.pattern_start, dateISO) % L) + L) % L
  return pattern[idx] ?? ''
}
// righe del PDF per cognome (il PDF ha 99 nomi, i membri hanno il nome completo)
const pdfPerNome = new Map()
pdf.names.forEach((n, i) => {
  const row = pdf.rows[i] ?? {}
  const tokens = Array.from({ length: pdf.days }, (_, k) => pdf.codes[row.t?.[k] ?? 0] ?? '')
  const k = n.toUpperCase()
  pdfPerNome.set(k, tokens)
})
const trovaPdf = nome => {
  const U = nome.toUpperCase()
  if (pdfPerNome.has(U)) return U
  const senza = U.replace(/ [A-Z]\.?$/, '')
  for (const k of pdfPerNome.keys()) if (k === senza || k.replace(/ [A-Z]\.?$/, '') === senza) return k
  return null
}

const perSquadra = new Map()
for (const m of members) {
  const team = teamById.get(m.team_id)
  const type = typeById.get(team.shift_type_id)
  const chiave = nelPiano.has(m.full_name) ? 'PIANO' : 'fuori piano'
  const st = perSquadra.get(`${type.name} / ${team.name}`) ?? { tipo: type.name, squadra: team.name, gruppo: chiave, ok: 0, cell: 0, membri: 0, senzaPdf: [] }
  const pdfName = trovaPdf(m.full_name)
  if (!pdfName) { st.senzaPdf.push(m.full_name); st.membri++; perSquadra.set(`${type.name} / ${team.name}`, st); continue }
  const rigaPdf = pdfPerNome.get(pdfName)
  const pInVigore = patternInVigore(m, `${MESE}-01`)
  const pPiano = nelPiano.has(m.full_name) ? piano.membri.find(x => x.membro === m.full_name).pattern : pInVigore
  let ok = 0, cell = 0, okPiano = 0
  for (let d = 1; d <= pdf.days; d++) {
    const t = rigaPdf[d - 1]
    if (!t) continue
    cell++
    if (tokenFor(m, isoOf(MESE, d), pInVigore) === t) ok++
    if (tokenFor(m, isoOf(MESE, d), pPiano) === t) okPiano++
  }
  st.membri++; st.ok += ok; st.cell += cell
  st.okPiano = (st.okPiano ?? 0) + okPiano
  st.membriTot = (st.membriTot ?? 0) + cell
  perSquadra.set(`${type.name} / ${team.name}`, st)
}

console.log(`═══ dev: ${members.length} membri · PDF ottobre: ${pdf.names.length} persone\n`)
console.log('  squadra                                   gruppo        membri   in vigore   template')
for (const [, st] of [...perSquadra].sort()) {
  const a = st.cell ? `${st.ok}/${st.cell} (${(100 * st.ok / st.cell).toFixed(0)}%)` : '—'
  const p = st.membriTot ? `${st.okPiano}/${st.membriTot} (${(100 * st.okPiano / st.membriTot).toFixed(0)}%)` : '—'
  console.log(`  ${`${st.tipo} / ${st.squadra}`.padEnd(42)} ${st.gruppo.padEnd(12)} ${String(st.membri).padStart(3)}   ${a.padEnd(9)} ${p}${st.senzaPdf.length ? `   [no PDF: ${st.senzaPdf.join(', ')}]` : ''}`)
}
const tot = [...perSquadra.values()]
console.log(`\n  TOTALE in vigore su dev ${tot.reduce((a, s) => a + s.ok, 0)}/${tot.reduce((a, s) => a + s.cell, 0)} · template applicato ovunque ${tot.reduce((a, s) => a + (s.okPiano ?? 0), 0)}/${tot.reduce((a, s) => a + (s.membriTot ?? 0), 0)}`)
const membriPdf = new Set(members.map(m => trovaPdf(m.full_name)).filter(Boolean))
console.log(`\n  persone del PDF senza membro in dev: ${pdf.names.filter(n => !membriPdf.has(n.toUpperCase())).join(', ') || 'nessuna'}`)
