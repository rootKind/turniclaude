// IMPORTA I MINIMI DA MASTER (27/09/2026).
//
// Perché: su master la fotografia del 1° settembre ha le tre caselle della
// JOLLY (J|M, J|N, J|P) a 0 — la jolly non esiste fino all'1° ottobre — mentre
// su dev mancavano del tutto. `lib/sala-minimi.ts`, per le caselle che la voce
// non nomina, ripiega sul DEFAULT di piantina (1 persona per una card singola):
// la JOLLY risultava quindi «scoperta」 su tutti i giorni di settembre, e il test
// dei minimi («il 6/9 turno P è scoperta solo la DCO 6°») falliva.
//
// Cosa fa: legge `sala_layout.minimums` da MASTER (produzione, via Management
// API) e lo scrive su DEV (REST, service role). TOCCA SOLO `minimums` dentro il
// documento `layout`: carte, default e periodi restano quelli di dev.
//
// Uso:  node scripts/importa-minimi-master.mjs            (dry-run, non scrive)
//       node scripts/importa-minimi-master.mjs --apply    (scrive + backup)
//       node scripts/importa-minimi-master.mjs --annulla  (ripristina dal backup)
// Il backup è `scripts/backup-minimi-<timestamp>.json`: file LOCALE, non
// tracciato (vedi .gitignore `scripts/backup-*.json`).
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
  const sopra = path.dirname(dir)
  if (sopra === dir) break
  dir = sopra
}
const MAIN = 'zrbbzfingrdpdflkndgl'
const mainQuery = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${MAIN}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}
const devGet = () => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sala_layout?select=id,layout&limit=1`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json()).then(r => r[0])
const devPatch = (id, layout) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sala_layout?id=eq.${id}`, {
  method: 'PATCH',
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({ layout }),
}).then(async r => {
  const t = await r.text()
  if (!r.ok) throw new Error(`PATCH ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)[0]
})

const stessi = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const chiavi = v => [...new Set(Object.keys(v ?? {}).map(k => k.split('|')[0]))].sort()
const descrivi = (voci, etichetta) => {
  console.log(`${etichetta}: ${voci.length} voci`)
  for (const v of voci) {
    const valori = v.values ?? {}
    const carte = chiavi(valori)
    console.log(`  dal ${v.from}${v.fromShift && v.fromShift !== 'M' ? ` turno ${v.fromShift}` : ''}: ${Object.keys(valori).length} caselle, ${carte.length} carte` +
      (carte.length ? ` [${carte.join(', ')}]` : ''))
  }
}

const modo = process.argv.slice(2).find(a => ['--apply', '--annulla'].includes(a)) ?? '--dry-run'

// ── --annulla: ripristina l'ultimo backup scritto da questo script ──────────
if (modo === '--annulla') {
  const salvati = fs.readdirSync(path.join(dir, 'scripts'))
    .filter(f => /^backup-minimi-\d+\.json$/.test(f))
    .sort()
  if (!salvati.length) { console.log('nessun backup dei minimi da ripristinare'); process.exit(0) }
  const ultimo = salvati[salvati.length - 1]
  const contenuto = JSON.parse(fs.readFileSync(path.join(dir, 'scripts', ultimo), 'utf8'))
  const riga = await devGet()
  const applicato = await devPatch(riga.id, { ...riga.layout, minimums: contenuto.minimums })
  console.log(`ripristinato da ${ultimo}`)
  descrivi(applicato.layout.minimums ?? [], 'minimi su dev')
  process.exit(0)
}

// ── letture ─────────────────────────────────────────────────────────────────
const [righeMain, rigaDev] = await Promise.all([
  mainQuery(`select layout->'minimums' as minimums from public.sala_layout limit 1`),
  devGet(),
])
const mainMins = righeMain[0]?.minimums ?? []
const devMins = rigaDev.layout?.minimums ?? []

console.log('MASTER (produzione)')
descrivi(mainMins, '  minimi')
console.log('\nDEV (prima)')
descrivi(devMins, '  minimi')

// diff casella per casella, voce per voce (stessa data+turno)
const perData = voci => new Map(voci.map(v => [`${v.from}|${v.fromShift ?? 'M'}`, v.values ?? {}]))
const mM = perData(mainMins)
const dM = perData(devMins)
const righe = []
for (const chiave of new Set([...mM.keys(), ...dM.keys()])) {
  const mv = mM.get(chiave)
  const dv = dM.get(chiave)
  if (stessi(mv, dv)) continue
  if (!mv) { righe.push(`${chiave}: solo su dev`); continue }
  if (!dv) { righe.push(`${chiave}: solo su master (${Object.keys(mv).length} caselle)`); continue }
  const k = [...new Set([...Object.keys(mv), ...Object.keys(dv)])].sort().filter(x => mv[x] !== dv[x])
  righe.push(`${chiave}: ${k.map(x => `${x} master ${JSON.stringify(mv[x])} → dev ${JSON.stringify(dv[x])}`).join(' · ')}`)
}
console.log('\nDIFFERENZE')
console.log(righe.length ? righe.map(r => `  ${r}`).join('\n') : '  (nessuna: dev è già allineato a master)')

if (modo !== '--apply') {
  console.log(`\nDRY-RUN: nessuna scrittura. Con --apply si copiano i minimi di master su dev.`)
  process.exit(0)
}

if (!righe.length) { console.log('\nnulla da fare'); process.exit(0) }

// ── backup + scrittura ──────────────────────────────────────────────────────
const stamp = Date.now()
const fileBackup = path.join(dir, 'scripts', `backup-minimi-${stamp}.json`)
fs.writeFileSync(fileBackup, JSON.stringify({ at: new Date().toISOString(), id: rigaDev.id, minimums: devMins }, null, 2))
console.log(`\nbackup di dev: scripts/backup-minimi-${stamp}.json (annulla con --annulla)`)

const nuovoLayout = { ...rigaDev.layout, minimums: mainMins }
const applicato = await devPatch(rigaDev.id, nuovoLayout)
console.log('\nminimi su dev dopo la scrittura')
descrivi(applicato.layout.minimums ?? [], '  minimi')
console.log(`carte/default/periodi della piantina: ${stessi(applicato.layout.cards, rigaDev.layout.cards) && stessi(applicato.layout.defaults, rigaDev.layout.defaults) && stessi(applicato.layout.minimumPeriods, rigaDev.layout.minimumPeriods) ? 'invariati ✓' : 'ATTENZIONE: cambiati!'}`)
