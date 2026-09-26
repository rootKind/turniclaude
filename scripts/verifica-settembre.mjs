// NON-REGRESSIONE SETTEMBRE: che cosa cambia a settembre se si applica il
// piano? I pattern sono cicli ancorati al 2026-03-01, quindi sostituirli
// cambia i turni anche dei giorni già passati. Serve a misurare quanto, e a
// confrontare i pattern ATTUALI con il PDF di settembre su main.
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
const MESI = ['2026-07', '2026-08', '2026-09', '2026-10']
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
const nGiorni = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()

const piano = JSON.parse(fs.readFileSync(path.join('scripts', 'piano-pattern-2026-10.json'), 'utf8'))
const nelPiano = new Map(piano.membri.map(p => [p.membro, p]))
const [types, teams, members, pdfRows, storico] = await Promise.all([
  devRest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active'),
  devRest('shift_teams', '?select=id,shift_type_id,name'),
  devRest('shift_team_members', '?select=id,team_id,full_name,pattern,is_active'),
  mainQuery(`select month, schedule from sala_schedule where month in (${MESI.map(m => `'${m}'`).join(',')}) order by month`),
  devRest('shift_member_patterns', '?select=member_id,from_date,pattern&order=from_date'),
])
// Lo storico letto da dev è la VERITÀ di quello che vale in ogni data: la
// verifica gira contro il database, non contro il piano su carta.
const cicliPerMembro = new Map()
for (const r of storico ?? []) {
  const l = cicliPerMembro.get(r.member_id) ?? []
  l.push({ from_date: String(r.from_date).slice(0, 10), pattern: r.pattern ?? [] })
  cicliPerMembro.set(r.member_id, l)
}
const patternInVigore = (m, data) => {
  let best = null
  for (const c of cicliPerMembro.get(m.id) ?? []) {
    if (c.from_date > data) continue
    if (!best || c.from_date > best.from_date) best = c
  }
  return (best?.pattern ?? m.pattern ?? []).map(String)
}
const tyById = new Map(types.map(t => [t.id, t]))
const tById = new Map(teams.map(t => [t.id, t]))
// spostamenti: la squadra del piano vale per l'ancoraggio, che è lo stesso
const teamPiano = new Map(piano.spostamenti.map(s => [s.membro, s.a]))
const info = m => {
  const nomeNuovo = teamPiano.get(m.full_name)
  const t = nomeNuovo ? teams.find(x => x.name === nomeNuovo) : tById.get(m.team_id)
  if (!t) throw new Error(`squadra non trovata per ${m.full_name}`)
  const ty = tyById.get(t.shift_type_id)
  return { squadra: t.name, tipo: ty.name, anchor: ty.pattern_start }
}
const pdfPerMese = new Map()
for (const r of pdfRows) {
  const per = new Map()
  r.schedule.names.forEach((n, i) => {
    const row = r.schedule.rows[i] ?? {}
    per.set(n.toUpperCase(), Array.from({ length: r.schedule.days }, (_, k) => r.schedule.codes[row.t?.[k] ?? 0] ?? ''))
  })
  pdfPerMese.set(r.month, per)
}
const trovaNome = nome => {
  const U = nome.toUpperCase()
  for (const per of pdfPerMese.values()) {
    if (per.has(U)) return U
    const senza = U.replace(/ [A-Z]\.?$/, '')
    if (per.has(senza)) return senza
  }
  return null
}
const teorico = (pattern, anchor, mese) => Array.from({ length: nGiorni(mese) }, (_, i) => {
  const L = (pattern ?? []).length
  return L ? pattern[((gf(anchor, isoOf(mese, i + 1)) % L) + L) % L] : ''
})

const perGruppo = (mese, gruppo) => {
  const pdf = pdfPerMese.get(mese)
  if (!pdf) return null
  let celle = 0, cambiate = 0, okAttuale = 0, okPiano = 0
  for (const m of members) {
    const p = nelPiano.get(m.full_name)
    if (!p || p.gruppo !== gruppo) continue
    const nomePdf = trovaNome(m.full_name)
    if (!nomePdf) continue
    const riga = pdf.get(nomePdf)
    const a = teorico(patternInVigore(m, `${mese}-01`), info(m).anchor, mese)
    const b = teorico(p.pattern, info(m).anchor, mese)
    for (let i = 0; i < riga.length; i++) {
      if (!riga[i]) continue
      celle++
      if (a[i] !== b[i]) cambiate++
      if (a[i] === riga[i]) okAttuale++
      if (b[i] === riga[i]) okPiano++
    }
  }
  return { celle, cambiate, okAttuale, okPiano }
}
const GRUPPI = ['terza', 'seconda', 'rilievo']
console.log('Verifica CONTRO IL DATABASE di dev: «in vigore» è il ciclo che dev sta usando in quel mese (migration 037), «piano» è il ciclo nuovo applicato ovunque.\n')
console.log('  mese      giorni  celle   cambiate  cambia%   in vigore combacia  piano combacia')
for (const mese of MESI) {
  const pdf = pdfPerMese.get(mese)
  let celle = 0, cambiate = 0, okAttuale = 0, okPiano = 0
  for (const m of members) {
    const p = nelPiano.get(m.full_name)
    if (!p) continue
    const nomePdf = trovaNome(m.full_name)
    if (!nomePdf || !pdf) continue
    const riga = pdf.get(nomePdf)
    const a = teorico(patternInVigore(m, `${mese}-01`), info(m).anchor, mese)
    const b = teorico(p.pattern, info(m).anchor, mese)
    for (let i = 0; i < riga.length; i++) {
      if (!riga[i]) continue
      celle++
      if (a[i] !== b[i]) cambiate++
      if (a[i] === riga[i]) okAttuale++
      if (b[i] === riga[i]) okPiano++
    }
  }
  if (!celle) { console.log(`  ${mese}  ${nGiorni(mese)}  nessun PDF su main`); continue }
  console.log(`  ${mese}  ${String(nGiorni(mese)).padStart(5)}  ${String(celle).padStart(5)}  ${String(cambiate).padStart(8)}  ${(100 * cambiate / celle).toFixed(1).padStart(6)}%   ${(100 * okAttuale / celle).toFixed(1).padStart(14)}%  ${(100 * okPiano / celle).toFixed(1).padStart(13)}%`)
}
console.log('\n  per gruppo (celle che cambiano / come combacia prima e dopo)\n')
for (const gruppo of GRUPPI) {
  console.log(`  ${gruppo}`)
  for (const mese of MESI) {
    const r = perGruppo(mese, gruppo)
    if (!r || !r.celle) continue
    console.log(`    ${mese}  cambiate ${String(r.cambiate).padStart(4)}/${r.celle} (${(100 * r.cambiate / r.celle).toFixed(1).padStart(5)}%)  attuale ${(100 * r.okAttuale / r.celle).toFixed(1).padStart(5)}%  piano ${(100 * r.okPiano / r.celle).toFixed(1).padStart(5)}%`)
  }
}
console.log(`\n  mesi con PDF su main: ${[...pdfPerMese.keys()].join(' ') || 'nessuno'}`)
