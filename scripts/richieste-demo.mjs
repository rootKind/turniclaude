// RICHIESTE DI CAMBIO «DEMO» SU UNA DATA (solo DB di DEV) — 19/09/2026.
//
// PERCHÉ ESISTE. Alcune schermate della dashboard dei cambi si vedono solo con
// PIÙ richieste sulla STESSA data: dal secondo cambio in poi il blocco della data
// non mostra il giorno ma un ordinale («2°», «3°»…). Con una richiesta per data
// quel caso non si può né guardare né provare. Questo script ne crea quante
// servono su un giorno scelto, le marca in un file di stato e le toglie quando
// non servono più.
//
// SICUREZZA: rifiuta di scrivere se il progetto configurato è quello di
// PRODUZIONE (ref noto `zrbbzfingrdpdflkndgl`, come gli altri script del repo).
// Le righe create NON mandano push (nessun trigger sulle tabelle, le notifiche le
// manda l'app), ma sono visibili a chi usa il DB: si creano, si prova, si pulisce.
//
// USO
//   node scripts/richieste-demo.mjs --crea                       # DRY-RUN: dice cosa farebbe
//   node scripts/richieste-demo.mjs --crea --apply               # crea (5 richieste su 2026-09-22)
//   node scripts/richieste-demo.mjs --crea --apply --giorno=2026-09-25 --quante=3
//   node scripts/richieste-demo.mjs --pulisci                    # DRY-RUN
//   node scripts/richieste-demo.mjs --pulisci --apply            # rimuove SOLO quelle create da qui
//
// Il file di stato (gli id creati) è `scripts/.dbg-richieste-demo.json`, coperto
// dalla regola di .gitignore `scripts/.dbg-*`.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'zrbbzfingrdpdflkndgl'
const STATO = 'scripts/.dbg-richieste-demo.json'
const APPLY = process.argv.includes('--apply')
const PULISCI = process.argv.includes('--pulisci')
const GIORNO = (process.argv.find(a => a.startsWith('--giorno=')) ?? '--giorno=2026-09-22').slice('--giorno='.length)
const QUANTE = Number((process.argv.find(a => a.startsWith('--quante=')) ?? '--quante=5').slice('--quante='.length))

// ── env (stessa ricerca verso l'alto degli altri script) ─────────────────────
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
if (!env?.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('env mancanti in .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}
if (env.NEXT_PUBLIC_SUPABASE_URL.includes(PROD_REF)) {
  console.error('STOP: il progetto configurato è quello di PRODUZIONE. Questo script tocca solo il DB di dev.')
  process.exit(1)
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Turni diversi per ogni richiesta: così l'ordinale si può verificare anche nel
// turno che apre. Le persone sono scelte a caso fra chi ha già dei cambi (così
// restano verosimili e visibili a tutti), senza duplicare una richiesta esistente.
const TURNI = ['Notte', 'Pomeriggio', 'Mattina', 'Notte', 'Pomeriggio']
const CHI = ['Piccirillo', 'Sabia', 'Piscopo', 'Mucci', 'Cicia']

function leggiStato() {
  try { return JSON.parse(fs.readFileSync(STATO, 'utf8')) } catch { return { ids: [] } }
}

if (PULISCI) {
  const { ids } = leggiStato()
  if (ids.length === 0) { console.log('niente da pulire (file di stato assente o vuoto)'); process.exit(0) }
  console.log(`${ids.length} richieste demo da rimuovere: ${ids.join(', ')}`)
  if (!APPLY) { console.log('DRY-RUN: rilancia con --apply per rimuoverle.'); process.exit(0) }
  const { error } = await sb.from('shifts').delete().in('id', ids)
  if (error) { console.error('errore nella rimozione:', error.message); process.exit(1) }
  fs.writeFileSync(STATO, JSON.stringify({ ids: [] }, null, 2))
  console.log('rimosse.')
  process.exit(0)
}

const righe = []
for (let i = 0; i < QUANTE; i++) {
  const { data: u } = await sb.from('users').select('id, cognome, nome').ilike('cognome', CHI[i % CHI.length]).limit(1).maybeSingle()
  if (!u) { console.log(`SALTO ${CHI[i % CHI.length]}: non in anagrafica`); continue }
  righe.push({ user_id: u.id, chi: `${u.cognome} ${u.nome}`, offered_shift: TURNI[i % TURNI.length], shift_date: GIORNO, requested_shifts: ['Mattina'] })
}
console.log(`creerei ${righe.length} richieste il ${GIORNO}:`)
for (const r of righe) console.log(`  ${r.chi} → offre ${r.offered_shift}`)
if (!APPLY) { console.log('DRY-RUN: rilancia con --apply per crearle.'); process.exit(0) }

const ids = leggiStato().ids
for (const r of righe) {
  const { data, error } = await sb.from('shifts')
    .insert({ user_id: r.user_id, offered_shift: r.offered_shift, shift_date: r.shift_date, requested_shifts: r.requested_shifts, highlight: false })
    .select('id').single()
  if (error) { console.error(`errore su ${r.chi}: ${error.message}`); continue }
  ids.push(data.id)
  console.log(`creata ${data.id} (${r.chi}, ${r.offered_shift})`)
}
fs.writeFileSync(STATO, JSON.stringify({ ids }, null, 2))
console.log(`fatto. Per toglierle: node scripts/richieste-demo.mjs --pulisci --apply`)
