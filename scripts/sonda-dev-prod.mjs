// SONDA: CHE COSA MANCA SU PRODUZIONE RISPETTO A DEV (27/09/2026).
//
// Solo lettura: nessuna scrittura, nessun parametro. Serve a decidere che cosa
// allineare dopo il merge di dev in master (squadre, membri, template, storico
// dei pattern) senza toccare nulla.
//
//   node scripts/sonda-dev-prod.mjs
//
// Produce: diff dei tipi, delle squadre, dei membri (per id e per nome), dei
// template e dello storico `shift_member_patterns`, più la verifica che la
// tabella dello storico esista su produzione (migrazione 037).
import fs from 'node:fs'
import path from 'node:path'

const PROD_REF = 'zrbbzfingrdpdflkndgl'

let dir = process.cwd()
let env = null
for (;;) {
  const f = path.join(dir, '.env.local')
  if (fs.existsSync(f)) {
    env = {}
    for (const riga of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    break
  }
  const su = path.dirname(dir)
  if (su === dir) break
  dir = su
}
if (!env?.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ACCESS_TOKEN) {
  console.error('env mancanti in .env.local')
  process.exit(1)
}

const devRest = (t, s) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  }).then(r => r.json())

const prodQuery = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

const sameArr = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

const [devTypes, devTeams, devMembers, devTemplates, devStorico] = await Promise.all([
  devRest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active,sort_order&order=sort_order.asc'),
  devRest('shift_teams', '?select=id,name,shift_type_id,sort_order&order=sort_order'),
  devRest('shift_team_members', '?select=id,team_id,full_name,pattern,is_active&order=full_name.asc'),
  devRest('shift_cycle_templates', '?select=id,name,team_id,cycle_days,pattern_start,pattern'),
  devRest('shift_member_patterns', '?select=member_id,from_date,pattern&order=from_date.asc'),
])
const [prodTypes, prodTeams, prodMembers, prodTemplates, tabella] = await Promise.all([
  prodQuery(`select id, name, cycle_days, pattern_start, is_active, sort_order from shift_types order by sort_order`),
  prodQuery(`select id, name, shift_type_id, sort_order from shift_teams order by sort_order`),
  prodQuery(`select id, team_id, full_name, pattern, is_active from shift_team_members order by full_name`),
  prodQuery(`select id, name, team_id, cycle_days, pattern_start, pattern from shift_cycle_templates order by name`),
  prodQuery(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='shift_member_patterns'`),
])
let prodStorico = []
if (tabella?.[0]?.n) prodStorico = await prodQuery(`select member_id, from_date, pattern from shift_member_patterns order by from_date`)

const nomeSquadra = (tid, map) => map.get(tid)?.name ?? tid
const devTeamById = new Map(devTeams.map(t => [t.id, t]))
const prodTeamById = new Map(prodTeams.map(t => [t.id, t]))
const devTypeById = new Map(devTypes.map(t => [t.id, t]))
const U = s => String(s ?? '').trim().toUpperCase()

console.log(`dev: ${devMembers.length} membri, ${devTemplates.length} template, ${devStorico.length} righe di storico`)
console.log(`prod: ${prodMembers.length} membri, ${prodTemplates.length} template, ${prodStorico.length} righe di storico, tabella storico ${tabella?.[0]?.n ? 'PRESENTE' : 'ASSENTE (migrazione 037 da applicare)'}`)

console.log(`\n== TIPI ==`)
for (const dt of devTypes) {
  const pt = prodTypes.find(x => x.name === dt.name)
  if (!pt) { console.log(`  ⚠ su prod manca il tipo «${dt.name}»`); continue }
  const d = []
  if (pt.cycle_days !== dt.cycle_days) d.push(`cycle_days ${pt.cycle_days}→${dt.cycle_days}`)
  if (pt.pattern_start !== dt.pattern_start) d.push(`pattern_start ${pt.pattern_start}→${dt.pattern_start}`)
  console.log(`  ${dt.name}: ${d.length ? d.join(', ') : 'uguale'}`)
}
for (const pt of prodTypes) if (!devTypes.some(d => d.name === pt.name)) console.log(`  ℹ solo su prod: tipo «${pt.name}»`)

console.log(`\n== SQUADRE ==`)
for (const dt of devTeams) {
  const pt = prodTeams.find(x => x.name === dt.name)
  if (!pt) { console.log(`  ⚠ su prod manca la squadra «${dt.name}»`); continue }
  const tipoDev = devTypeById.get(dt.shift_type_id)?.name
  const tipoProd = prodTypes.find(t => t.id === pt.shift_type_id)?.name
  console.log(`  ${dt.name}: ${tipoDev === tipoProd ? 'stesso tipo' : `⚠ tipo ${tipoProd} su prod, ${tipoDev} su dev`}`)
}
for (const pt of prodTeams) if (!devTeams.some(d => d.name === pt.name)) console.log(`  ℹ solo su prod: squadra «${pt.name}»`)

console.log(`\n== MEMBRI ==`)
const prodMemberById = new Map(prodMembers.map(m => [m.id, m]))
const devNomi = new Set(devMembers.map(m => U(m.full_name)))
let stessiId = 0, patternDiversi = 0, soloDev = [], soloProd = []
for (const dm of devMembers) {
  const pm = prodMemberById.get(dm.id)
  if (!pm) { soloDev.push(dm); continue }
  stessiId++
  if (!sameArr(dm.pattern, pm.pattern)) {
    patternDiversi++
    console.log(`  ${dm.full_name.padEnd(16)} ${nomeSquadra(dm.team_id, devTeamById).padEnd(24)} colonna dev[${dm.pattern?.length ?? 0}] ≠ prod[${pm.pattern?.length ?? 0}]`)
  }
}
for (const pm of prodMembers) if (!devMembers.some(d => d.id === pm.id)) soloProd.push(pm)
console.log(`  membri con id in comune: ${stessiId}; colonna pattern diversa: ${patternDiversi}`)
console.log(`  solo su dev (${soloDev.length}): ${soloDev.map(m => `${m.full_name} [${m.pattern?.length ?? 0}]`).join(', ') || '—'}`)
console.log(`  solo su prod (${soloProd.length}): ${soloProd.map(m => `${m.full_name} [${m.pattern?.length ?? 0}] in ${nomeSquadra(m.team_id, prodTeamById)}`).join(', ') || '—'}`)
for (const pm of soloProd) {
  const gemello = devMembers.find(d => U(d.full_name) === U(pm.full_name))
  if (gemello) console.log(`    ℹ ${pm.full_name} esiste su dev con altro id: i due id vanno messi in relazione a mano`)
}

console.log(`\n== TEMPLATE ==`)
const devTplById = new Map(devTemplates.map(t => [t.id, t]))
const prodTplById = new Map(prodTemplates.map(t => [t.id, t]))
const tplIdComuni = devTemplates.filter(t => prodTplById.has(t.id))
const tplDiversi = tplIdComuni.filter(t => {
  const p = prodTplById.get(t.id)
  return !sameArr(t.pattern, p.pattern) || t.cycle_days !== p.cycle_days || t.pattern_start !== p.pattern_start
})
console.log(`  id in comune: ${tplIdComuni.length}; diversi: ${tplDiversi.length}`)
for (const t of tplDiversi.slice(0, 20)) {
  const p = prodTplById.get(t.id)
  console.log(`    ${t.name}: dev[${t.pattern?.length}] vs prod[${p.pattern?.length}]`)
}
if (tplDiversi.length > 20) console.log(`    …altri ${tplDiversi.length - 20}`)
console.log(`  solo su dev: ${devTemplates.filter(t => !prodTplById.has(t.id)).length} → ${devTemplates.filter(t => !prodTplById.has(t.id)).slice(0, 8).map(t => t.name).join(', ')}`)
console.log(`  solo su prod: ${prodTemplates.filter(t => !devTplById.has(t.id)).length} → ${prodTemplates.filter(t => !devTplById.has(t.id)).slice(0, 8).map(t => t.name).join(', ')}`)

console.log(`\n== STORICO PATTERN (shift_member_patterns) ==`)
if (!prodStorico.length) {
  const perData = new Map()
  for (const s of devStorico) {
    const d = perData.get(s.from_date) ?? { n: 0, len: new Set() }
    d.n++
    d.len.add(s.pattern?.length ?? 0)
    perData.set(s.from_date, d)
  }
  console.log('  su prod non c\'è ancora nessuna riga. Su dev:')
  for (const [data, d] of perData) console.log(`    dal ${data}: ${d.n} membri, lunghezze ${[...d.len].sort((a, b) => a - b).join('/')}`)
} else {
  const chiave = r => `${r.member_id}|${r.from_date}`
  const prodMap = new Map(prodStorico.map(r => [chiave(r), r]))
  let mancanti = 0, diversi = 0, inPiu = 0
  for (const s of devStorico) {
    const p = prodMap.get(chiave(s))
    if (!p) { mancanti++; continue }
    if (!sameArr(s.pattern, p.pattern)) diversi++
    prodMap.delete(chiave(s))
  }
  inPiu = prodMap.size
  console.log(`  righe su dev: ${devStorico.length}; su prod: ${prodStorico.length}`)
  console.log(`  da copiare: ${mancanti}; con pattern diverso: ${diversi}; solo su prod: ${inPuo(inPiu)}`)
}
function inPuo(n) { return n }
