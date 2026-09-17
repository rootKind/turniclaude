// APPLICA LE MIGRATION DELLA RELEASE V5 AL PROGETTO (richiesta 18/09/2026).
//
// PERCHÉ ESISTE. Il database di produzione ha la history delle migration a
// TIMESTAMP (non riconosce i file numerati 001-017: vedi la nota della release
// 26/08/2026 in knowledge.md), quindi `supabase db push` NON va usato lì. La via
// è la Management API, e questo script la usa un file per volta — in ordine, con
// il controllo di quello che c'è già.
//
// USO
//   node scripts/apply-release-migrations.mjs                    # VERIFICA (sola lettura)
//   node scripts/apply-release-migrations.mjs --prod             # verifica su PRODUZIONE
//   node scripts/apply-release-migrations.mjs --prod --apply     # applica su PRODUZIONE
//   node scripts/apply-release-migrations.mjs --prod --bundle release-v5.sql   # solo il file da incollare
//
// Il token della Management API sta in `.env.local` come `SUPABASE_ACCESS_TOKEN`
// (su Windows: Credential Manager → «Supabase CLI:supabase»). Senza token lo
// script NON tocca niente: scrive il bundle SQL da incollare nell'SQL editor.
//
// REGOLE DI SICUREZZA
//  - Di default si lavora sul progetto di `.env.local` (dev). Su produzione si
//    deve dire `--prod`, che usa il ref noto `zrbbzfingrdpdflkndgl`: nessun
//    accidente da typo.
//  - Senza `--apply` non si scrive NIENTE (solo letture).
//  - Ogni file si applica dentro una transazione, e la sua versione si registra
//    in `supabase_migrations.schema_migrations` nella stessa transazione: se
//    qualcosa va storto, non resta mezzo applicato. Un file già registrato si
//    salta (idempotente per costruzione, non per fiducia).
import fs from 'node:fs'
import path from 'node:path'

const PROD_REF = 'zrbbzfingrdpdflkndgl'
const MIGRAZIONI = 'supabase/migrations'

const args = process.argv.slice(2)
const ha = (n) => args.includes(n)
const valore = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d
}

/** Le variabili di `.env.local`, cercando verso l'alto (come gli altri script). */
function leggiEnv() {
  let dir = process.cwd()
  for (;;) {
    const f = path.join(dir, '.env.local')
    if (fs.existsSync(f)) {
      const env = {}
      for (const riga of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
      return env
    }
    const su = path.dirname(dir)
    if (su === dir) return {}
    dir = su
  }
}

const env = leggiEnv()
const refDev = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([^.]+)\.supabase\./)?.[1] ?? null
const ref = ha('--prod') ? PROD_REF : refDev
const token = env.SUPABASE_ACCESS_TOKEN

if (!ref) {
  console.error('Ref del progetto non trovato: manca NEXT_PUBLIC_SUPABASE_URL in .env.local?')
  process.exit(1)
}
console.log(`Progetto: ${ref}${ha('--prod') ? '  (PRODUZIONE)' : '  (dev, da .env.local)'}`)

const da = valore('--from', '018')
const a = valore('--to', '033')
const files = fs
  .readdirSync(MIGRAZIONI)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => {
    const n = f.slice(0, 3)
    return n >= da && n <= a
  })
  .sort()

if (files.length === 0) {
  console.error(`Nessuna migration fra ${da} e ${a} in ${MIGRAZIONI}`)
  process.exit(1)
}
console.log(`Migration nel giro: ${files.length} (${files[0]} → ${files[files.length - 1]})\n`)

/** Il SQL di una migration, senza le righe di commento pure (restano utili in testa). */
function leggiSql(file) {
  return fs.readFileSync(path.join(MIGRAZIONI, file), 'utf8').replace(/^\uFEFF/, '')
}

/** La versione come la registra la CLI: il prefisso numerico del nome file. */
function versione(file) {
  return file.slice(0, 3)
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const testo = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}: ${testo.slice(0, 500)}`)
  try {
    return JSON.parse(testo)
  } catch {
    return testo
  }
}

/**
 * Il bundle per l'SQL editor: ogni file in una transazione, con la sua
 * registrazione in `schema_migrations`. Senza questo, incollando il SQL l'utente
 * applicherebbe lo schema ma la history resterebbe indietro.
 */
function bundle() {
  const pezzi = [
    '-- RELEASE V5 — migration applicate a mano (SQL editor).',
    '-- Ogni blocco è indipendente: se uno fallisce, il successivo non ha senso.',
    '',
  ]
  for (const file of files) {
    pezzi.push(`-- ════ ${file} ════`, 'begin;', leggiSql(file).trim(), '')
    pezzi.push(
      `insert into supabase_migrations.schema_migrations (version, name)`,
      `  values ('${versione(file)}', '${file.replace(/\.sql$/, '')}')`,
      `  on conflict (version) do nothing;`,
      'commit;',
      '',
    )
  }
  return pezzi.join('\n')
}

const outBundle = valore('--bundle', null)
if (outBundle) {
  fs.writeFileSync(outBundle, bundle())
  console.log(`Bundle scritto: ${outBundle} (${files.length} migration)\n`)
}

if (!token) {
  console.error('MANCA SUPABASE_ACCESS_TOKEN in .env.local: non posso né verificare né applicare.')
  console.error('Aggiungilo (Credential Manager → «Supabase CLI:supabase») oppure incolla il bundle')
  console.error('nell\'SQL editor del progetto. Non ho toccato niente.')
  process.exit(1)
}

const registrate = await query(
  `select version from supabase_migrations.schema_migrations order by version`,
).catch((e) => {
  console.error(`Non riesco a leggere la history delle migration: ${e.message}`)
  process.exit(1)
})
const fatte = new Set((Array.isArray(registrate) ? registrate : []).map((r) => String(r.version).slice(0, 3)))

const daFare = files.filter((f) => !fatte.has(versione(f)))
console.log(`Già applicate: ${files.length - daFare.length} · da applicare: ${daFare.length}`)
for (const f of daFare) console.log(`  · ${f}`)
console.log('')

if (!ha('--apply')) {
  console.log('VERIFICA soltanto (nessuna scrittura). Per applicare: aggiungi --apply')
  process.exit(0)
}
if (daFare.length === 0) {
  console.log('Niente da fare: il progetto è già allineato.')
  process.exit(0)
}

for (const file of daFare) {
  process.stdout.write(`→ ${file} … `)
  try {
    await query(
      [
        'begin;',
        leggiSql(file).trim(),
        `insert into supabase_migrations.schema_migrations (version, name)`,
        `  values ('${versione(file)}', '${file.replace(/\.sql$/, '')}')`,
        `  on conflict (version) do nothing;`,
        'commit;',
      ].join('\n'),
    )
    console.log('APPLICATA')
  } catch (e) {
    console.log('ERRORE')
    console.error(`\n${e.message}\n`)
    console.error('Mi fermo qui: le migration successive darebbero errori a catena.')
    process.exit(1)
  }
}

const dopo = await query(`select version from supabase_migrations.schema_migrations order by version`)
const ora = new Set((Array.isArray(dopo) ? dopo : []).map((r) => String(r.version).slice(0, 3)))
const mancanti = files.filter((f) => !ora.has(versione(f)))
console.log(`\nFatto. Migration della release mancanti: ${mancanti.length ? mancanti.join(', ') : 'nessuna'}`)
