// ALLINEA LA NUMERAZIONE DEI MEMBRI FRA DEV E PRODUZIONE (27/09/2026).
//
// LA DIFFERENZA. `sort_order` non è un asset: ordina l'elenco dei membri di una
// squadra e non entra nel calcolo dei turni. Dopo gli allineamenti di settembre
// i due ambienti erano uguali in TUTTE le colonne tranne due numeri, in Squadra
// A: D'ELIA (0 su dev, 1 su produzione) e PASSANNANTI (1 su dev, 2 su
// produzione). Su dev la squadra contava da 0 e aveva un buco al 2, il posto di
// qualcuno tolto; produzione contava da 1 senza buchi. L'ordine delle persone
// era identico: cambiavano solo le etichette.
//
// PERCHÉ SI RIFERISCE A PRODUZIONE. È l'ambiente in cui le persone lavorano:
// se i due numeri non tornano, il riferimento giusto è il suo, e dev si
// adegua. Coprire i numeri alla cieca avrebbe potuto far sballare un elenco
// per un campo che non cambia nulla.
//
// COSA NON FA. Non rinumera le squadre che sui due ambienti sono già d'accordo
// anche se la numerazione non è contigua (Squadra arancione ha due membri con 1,
// Squadra rosa salta dal 5 all'8, le Rilievo hanno buchi): sononumeri storici
// di spostamenti passati, identici nei due ambienti, e rinumerarli cambierebbe
// numeri che l'utenza non vede senza allineare niente. Se un giorno si vuole la
// pulizia globale è un'altra operazione, e va decisa con l'utenza.
//
// USO
//   node scripts/allinea-sort-order.mjs            # DRY-RUN
//   node scripts/allinea-sort-order.mjs --apply    # scrive su DEV
//   node scripts/allinea-sort-order.mjs --annulla  # dal backup
import fs from 'node:fs'
import path from 'node:path'

const PROD_REF = 'zrbbzfingrdpdflkndgl'
const APPLY = process.argv.includes('--apply')
const ANNULLA = process.argv.includes('--annulla')
const DA = (process.argv.find(a => a.startsWith('--da=')) ?? '').slice('--da='.length).trim()

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
const devPatch = (id, corpo) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/shift_team_members?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(corpo),
  }).then(r => r.json())
async function prodQuery(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

const bakFiles = fs.readdirSync('scripts').filter(f => /^backup-sort-order-[\w-]*\d+\.json$/.test(f)).sort()
if (ANNULLA) {
  const file = DA || bakFiles[bakFiles.length - 1]
  if (!file || !fs.existsSync(path.join('scripts', file))) { console.error('Nessun backup scripts/backup-sort-order-*.json'); process.exit(1) }
  const bak = JSON.parse(fs.readFileSync(path.join('scripts', file), 'utf8'))
  console.log(`Ripristino da ${file}`)
  for (const r of bak) console.log(`  ${JSON.stringify(await devPatch(r.id, { sort_order: r.sort_order })).slice(0, 80)}`)
  console.log('Fatto.')
  process.exit(0)
}

const [devSquadre, devMembri, prodSquadre, prodMembri] = await Promise.all([
  devRest('shift_teams', '?select=id,name'),
  devRest('shift_team_members', '?select=id,team_id,full_name,sort_order'),
  prodQuery('select id, name from shift_teams'),
  prodQuery('select id, team_id, full_name, sort_order from shift_team_members'),
])
const nomeSquadra = (tid, map) => map.get(tid) ?? tid
const dn = new Map(devSquadre.map(t => [t.id, t.name]))
const pn = new Map(prodSquadre.map(t => [t.id, t.name]))
const pmi = new Map(prodMembri.map(m => [m.id, m]))
const dmi = new Map(devMembri.map(m => [m.id, m]))

console.log(`Modalità: ${APPLY ? 'APPLY (scrive su DEV)' : 'DRY-RUN (non scrive)'}`)
console.log('Riferimento: PRODUZIONE. Scopo: i due ambienti contano le persone allo stesso modo.\n')

const piano = []
for (const dm of devMembri) {
  const pm = pmi.get(dm.id)
  if (!pm) { console.log(`  ⚠ ${dm.full_name} non esiste su produzione: niente da confrontare`); continue }
  if (dm.sort_order !== pm.sort_order) {
    piano.push({
      id: dm.id, nome: dm.full_name,
      squadra: nomeSquadra(dm.team_id, dn),
      da: dm.sort_order, a: pm.sort_order,
    })
  }
}
console.log(`== MEMBRI da rinumerare su DEV (${piano.length}) ==`)
for (const u of piano) console.log(`  ${u.nome.padEnd(16)} ${u.squadra.padEnd(18)} sort_order ${u.da} → ${u.a}`)

// Informazione: squadre la cui numerazione non è contigua ma è UGUALE nei due
// ambienti. Non si toccano, e si dice perché.
const squadre = [...new Set(devMembri.map(m => nomeSquadra(m.team_id, dn)))]
const contigue = new Map()
for (const s of squadre) {
  const numeri = devMembri.filter(m => nomeSquadra(m.team_id, dn) === s).sort((a, b) => a.sort_order - b.sort_order).map(m => m.sort_order)
  const atteso = Array.from({ length: numeri.length }, (_, i) => i + 1)
  if (JSON.stringify(numeri) !== JSON.stringify(atteso)) contigue.set(s, numeri)
}
if (contigue.size) {
  console.log(`\n== NON contigue ma IDENTICHE nei due ambienti: non si toccano (${contigue.size}) ==`)
  for (const [s, n] of contigue) console.log(`  ${s.padEnd(18)} [${n.join(',')}]`)
}

if (!APPLY) {
  console.log(`\nDry-run: niente scritto${piano.length ? `. Rilancia con --apply (backup automatico).` : ': i due ambienti sono già allineati.'}`)
  process.exit(0)
}

const bakPath = path.join('scripts', `backup-sort-order-${Date.now()}.json`)
fs.writeFileSync(bakPath, JSON.stringify(piano.map(u => ({ id: u.id, nome: u.nome, sort_order: u.da })), null, 2))
console.log(`\nBackup scritto: ${bakPath}`)
for (const u of piano) {
  await devPatch(u.id, { sort_order: u.a })
  console.log(`  ${u.nome} → ${u.a}`)
}
const dopo = await devRest('shift_team_members', '?select=id,full_name,sort_order')
const staccati = dopo.filter(m => pmi.has(m.id) && pmi.get(m.id).sort_order !== m.sort_order)
console.log(`\nDopo: ${staccati.length} differenze rimaste${staccati.length ? ` (${staccati.map(m => `${m.full_name} dev ${m.sort_order}/prod ${pmi.get(m.id).sort_order}`).join(', ')})` : ' ✓'}`)
console.log(`rollback: node scripts/allinea-sort-order.mjs --annulla`)
