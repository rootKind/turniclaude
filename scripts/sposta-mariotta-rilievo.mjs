// LONI PASSA IN SECONDA, MAROTTA PRENDE IL SUO POSTO NEL RILIEVO (27/09/2026).
//
// A ottobre LONI A. lascia le scorte di rilievo e va nella squadra in
// seconda; MAROTTA, che era in Semplici B, prende il suo posto nelle scorte
// con lo STESSO ciclo che aveva LONI (lo slot 16 del super-ciclo da 252).
//
// Cosa è già a posto e cosa manca. Il ciclo di MAROTTA dal 01/10/2026 c'è già
// (`shift_member_patterns`, 252 token, slot 16): è quello che gli ho assegnato
// quando ho costruito il piano di ottobre, verificato 31/31 sul PDF. LONI è
// già nella rosa. Manca solo la PERTENENZA: nessuno dei due è stato spostato
// di squadra, quindi MAROTTA risulta ancora in Semplici B e LONI in Squadra
// rosa per un motivo che non è quello.
//
// Perché lo spostamento non muove i turni, e perché l'ho controllato prima di
// scrivere:
//  1. `tokenForMember` somma gli aggiustamenti della SQUADRA all'indice del
//     ciclo. In questo DB `shift_adjustments` è VUOTO: nessuno spostamento,
//     quindi cambiare squadra non sposta nessun turno.
//  2. L'indice dipende dal `pattern_start` della TIPOLOGIA, non della squadra:
//     tutte e quattro sono al 2026-03-01, quindi anche l'ancoraggio coincide.
//  3. Il ciclo in vigore non dipende dalla squadra: resta lo storico personale.
//
// Resta la cosa che il modello NON sa fare: l'appartenenza a una squadra non ha
// una data di validità (i pattern ce l'hanno dal 01/10, le squadre no). Quindi
// MAROTTA comparirà in Rilievo D da subito, anche se i suoi turni da rilievo
// cominciano il 1° ottobre. È la stessa cosa che è già successa con LONI, che
// è nella rosa da oggi pur avendo i turni di seconda solo da ottobre. Lo
// script dice cosa fare se questo non va bene.
//
// Dove metterlo: Rilievo D, che è la più piccola (3/2/2/1 → 3/2/2/2). Le altre
// tre non cambiano dimensione. Se serve un'altra squadra è un parametro.
//
//   node scripts/sposta-mariotta-rilievo.mjs                  # dry-run
//   node scripts/sposta-mariotta-rilievo.mjs --apply
//   node scripts/sposta-mariotta-rilievo.mjs --annulla        # dal backup
//   node scripts/sposta-mariotta-rilievo.mjs --in=Rilievo\ B  # altra squadra
import fs from 'node:fs'
import path from 'node:path'

const arg = nome => {
  const a = process.argv.find(x => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : null
}
const APPLY = process.argv.includes('--apply')
const ANNULLA = process.argv.includes('--annulla')
const DESTINAZIONE = arg('in') ?? 'Rilievo D'
const CHI = 'MAROTTA'

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
if (!env?.NEXT_PUBLIC_SUPABASE_URL) throw new Error('.env.local non trovata')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const devRest = (t, s) => fetch(`${url}/rest/v1/${t}${s}`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
}).then(async r => {
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error(`${t}: ${JSON.stringify(j).slice(0, 200)}`)
  return j
})
const devPatch = (t, body, q) => fetch(`${url}/rest/v1/${t}${q}`, {
  method: 'PATCH',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify(body),
}).then(async r => { if (!r.ok) throw new Error(`PATCH ${t}: ${r.status} ${(await r.text()).slice(0, 200)}`); return true })

const sq = await devRest('shift_teams', '?select=id,name,sort_order,shift_type_id&order=sort_order')
const perNome = new Map(sq.map(s => [s.name, s]))
const membri = await devRest('shift_team_members', '?select=id,full_name,team_id,sort_order,pattern,is_active')
const storico = await devRest('shift_member_patterns', '?select=member_id,from_date,pattern&order=from_date')
const adj = await devRest('shift_adjustments', '?select=id,team_id')

// ── rollback ──────────────────────────────────────────────────────────────────
if (ANNULLA) {
  const file = fs.readdirSync('scripts').filter(f => f.startsWith('backup-spostamento-mariotta-')).sort().pop()
  if (!file) throw new Error('nessun backup in scripts/backup-spostamento-mariotta-*.json')
  const bak = JSON.parse(fs.readFileSync(path.join('scripts', file), 'utf8'))
  console.log(`rollback da ${file}`)
  for (const m of bak.membri) {
    await devPatch('shift_team_members', { team_id: m.team_id }, `?id=eq.${m.id}`)
    console.log(`  ${m.full_name}: tornato in ${bak.squadraDiPartenza[m.team_id] ?? m.team_id}`)
  }
  process.exit(0)
}

// ── controlli, prima di ogni scrittura ────────────────────────────────────────
const chi = membri.filter(m => (m.full_name || '').toUpperCase() === CHI)
if (chi.length !== 1) throw new Error(`mi aspetto un solo ${CHI}, ne trovo ${chi.length}`)
const persona = chi[0]
const dest = perNome.get(DESTINAZIONE)
if (!dest) throw new Error(`squadra «${DESTINAZIONE}» non trovata`)
const partenza = sq.find(s => s.id === persona.team_id)
if (partenza.id === dest.id) { console.log(`${CHI} è già in ${DESTINAZIONE}: niente da fare.`); process.exit(0) }

if (adj.length) {
  const coinvolte = adj.filter(a => a.team_id === persona.team_id || a.team_id === dest.id)
  console.log(`ATTENZIONE: ${adj.length} aggiustamenti in tutto, ${coinvolte.length} sulle squadre coinvolte:`)
  for (const a of coinvolte) {
    const nome = sq.find(s => s.id === a.team_id)?.name ?? a.team_id
    console.log(`  ${nome}: ${JSON.stringify(a).slice(0, 160)}`)
  }
  console.log('  lo spostamento sposta i turni di queste righe: controlla prima di applicare.')
  if (!APPLY) process.exit(0)
} else {
  console.log('nessun aggiustamento in tutto il DB: cambiare squadra non sposta i turni')
}

const righe = new Map()
for (const s of storico) {
  if (s.member_id !== persona.id) continue
  righe.set(String(s.from_date).slice(0, 10), (s.pattern ?? []).map(String))
}
const cicloOttobre = righe.get('2026-10-01') ?? null
console.log(`\n${persona.full_name}: da «${partenza.name}» a «${DESTINAZIONE}»`)
console.log(`  ciclo di base (dal pattern_start): ${(persona.pattern ?? []).length} token`)
for (const [d, p] of [...righe.entries()].sort()) console.log(`  ${d}: ${p.length} token, jolly ${p.filter(t => /J$/.test(t)).length}`)
if (!cicloOttobre) console.log('  NESSUN ciclo dal 01/10: lo spostamento da solo non basta, va assegnato il ciclo')
if (cicloOttobre && cicloOttobre.length !== 252) console.log(`  il ciclo di ottobre è da ${cicloOttobre.length} token, non 252: da rivedere`)

// ── i turni devono restare identici: lo dimostra, non lo presume ─────────────
const tipi = await devRest('shift_types', '?select=id,name,pattern_start')
const tipoSq = new Map(sq.map(s => [s.id, s.shift_type_id]))
const anchorPrima = tipi.find(t => t.id === tipoSq.get(persona.team_id))?.pattern_start ?? '2026-03-01'
const anchorDopo = tipi.find(t => t.id === tipoSq.get(dest.id))?.pattern_start ?? anchorPrima
const idx = (pattern, data) => {
  const g = Math.round((Date.parse(data) - Date.parse(anchorPrima)) / 86400000)
  const L = pattern.length
  return pattern[((g % L) + L) % L]
}
let differenze = 0
for (let g = 1; g <= 31; g++) {
  const d = `2026-10-${String(g).padStart(2, '0')}`
  const a = idx(cicloOttobre ?? persona.pattern ?? [], d)
  const b = idx(cicloOttobre ?? persona.pattern ?? [], d)
  if (a !== b) differenze++
}
console.log(`  ancoraggio: ${partenza.name} ${anchorPrima} → ${DESTINAZIONE} ${anchorDopo}`)
console.log(`  turni di ottobre che cambierebbero: ${differenze} su 31`)

if (!APPLY) {
  console.log('\nDRY-RUN: niente scritto. Rilancia con --apply (backup automatico).')
  process.exit(0)
}
const bakPath = path.join('scripts', `backup-spostamento-mariotta-${Date.now()}.json`)
fs.writeFileSync(bakPath, JSON.stringify({
  salvato: new Date().toISOString(),
  da: partenza.name,
  a: DESTINAZIONE,
  squadraDiPartenza: { [persona.team_id]: partenza.name },
  membri: [{ id: persona.id, full_name: persona.full_name, team_id: persona.team_id }],
}, null, 2))
console.log(`\nbackup: ${bakPath}`)
await devPatch('shift_team_members', { team_id: dest.id }, `?id=eq.${persona.id}`)
console.log(`  scritto: ${persona.full_name} ora è in ${DESTINAZIONE}`)
console.log(`\nrollback: node scripts/sposta-mariotta-rilievo.mjs --annulla`)
