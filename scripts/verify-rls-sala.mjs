// Verifica ripetibile: i turni della sala e la piantina si leggono SENZA LOGIN?
//
// Perché esiste: il 13/10/2026 la board completa (nomi compresi) rispondeva 200
// con la sola chiave pubblica — quella che sta dentro il sito. Le policy erano
// `for select using (true)` senza `to authenticated`, e in PostgreSQL una policy
// senza ruolo vale per PUBLIC. Il middleware non protegge i DATI: protegge la
// pagina. Questo script rende quel controllo una cosa che si può rifare (stessa
// idea di scripts/verify-proxy-matcher.mjs), invece di una prova fatta una volta.
//
// Usa SOLO la chiave pubblica di .env.local — quella che vede chiunque apra il
// sito — e nessuna sessione: se una tabella risponde con delle righe, quella
// tabella è aperta. Esce con codice 1 se almeno una tabella è leggibile, così
// può essere usato come controllo (a mano o in CI).
//
// Uso: node scripts/verify-rls-sala.mjs

import { readFileSync, existsSync } from 'node:fs'

const env = {}
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anon) {
  console.error('manca NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(2)
}

/** Le tabelle della sala e cosa contiene ognuna, per leggere il verdetto. */
const TABELLE = [
  ['sala_schedule', 'month', 'i turni della sala (nomi delle persone compresi)'],
  ['sala_layout', 'id', 'la piantina della sala'],
]

let aperte = 0
console.log(`Progetto: ${url}\nChiave: pubblica (anon), nessuna sessione\n`)

for (const [tabella, colonna, cosa] of TABELLE) {
  const res = await fetch(`${url}/rest/v1/${tabella}?select=${colonna}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  })
  let righe = null
  try {
    const corpo = await res.json()
    righe = Array.isArray(corpo) ? corpo.length : null
  } catch { /* corpo non JSON: resta null */ }
  const aperta = res.ok && (righe ?? 0) > 0
  if (aperta) aperte++
  console.log(
    `${aperta ? '✗ APERTA' : '✓ chiusa'}  ${tabella.padEnd(14)} HTTP ${res.status}` +
    `${righe === null ? '' : ` · ${righe} righe`}  — ${cosa}`,
  )
}

console.log()
if (aperte > 0) {
  console.log(`Ci sono ${aperte} tabell${aperte === 1 ? 'a' : 'e'} leggibil${aperte === 1 ? 'e' : 'i'} senza login: da chiudere con la migration 038_sala_read_authenticated.sql.`)
  process.exit(1)
}
console.log('Nessuna delle due si legge senza login.')
