// CORREZIONE DEI CICLI DI BASE DELLE SCORTE DI RILIEVO (26/09/2026).
//
// L'utente: il ciclo da 252 giorni valeva GIÀ prima del 1° ottobre; a cambiare
// è solo il significato del jolly, che era «la mattina della sezione che
// corrisponde alla notte appena dopo» (M5T, verificato in 12 celle su 12 dei
// PDF di luglio–settembre) e da ottobre è il turno J (MJ).
//
// In DB i 9 membri delle scorte avevano nella colonna un ciclo di 28 token:
// un'approssimazione che azzecca il solo mese di settembre (perché un pezzo di
// 28 giorni del ciclo vero, ripetuto, coincide solo lì) e sbaglia luglio (68%)
// e agosto (74%). Il ciclo da 252 con lo STESSO sfalsamento di ottobre
// riproduce invece luglio, agosto e settembre al 97–100%.
//
// CORRETTO qui: il ciclo di base (dal pattern_start) dei 8 membri che erano
// già nelle scorte diventa il 252 risolto con M5T. MAROTTA resta con il suo
// ciclo da 28 fino al 30/09 (è quello vero suo: 100% su tutti e tre i mesi) e
// prende lo slot 16 del 252 dal 1° ottobre, riga già presente.
//
//   node scripts/cicli-base-rilievo-252.mjs           # dry-run
//   node scripts/cicli-base-rilievo-252.mjs --apply
import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')
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
const devRest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json())
const devPatch = (t, body, q = '') => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${q}`, {
  method: 'PATCH',
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify(body),
}).then(async r => { if (!r.ok) throw new Error(`PATCH ${t}: ${r.status} ${(await r.text()).slice(0, 200)}`); return true })
const devUpsert = (t, body, q = '') => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${q}`, {
  method: 'POST',
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(body),
}).then(async r => { if (!r.ok) throw new Error(`POST ${t}: ${r.status} ${(await r.text()).slice(0, 200)}`); return true })

const blocchi = JSON.parse(fs.readFileSync(path.join('scripts', 'dati-template-ottobre.json'), 'utf8'))
const grezzo = blocchi.find(b => b.titolo === 'SCORTE RILIEVO').righe.flat()
const sezDi = t => t.replace(/^[MNP]/, '').replace(/[TS]$/, '')
/** Il jolly PRIMA del 1° ottobre: la mattina della sezione della notte che
 *  viene subito dopo, come «titolare» — è what dicono i PDF (12 celle su 12). */
const jollyVecchio = t => {
  const turno = t[0]
  for (let k = 0; k < grezzo.length; k++) {
    const prox = grezzo[(k + 1) % grezzo.length]
    if (prox?.startsWith('N')) return `${turno}${sezDi(prox)}T`
  }
  return t
}
const T252 = grezzo.map(t => (t.includes('*') ? jollyVecchio(t) : t))
const stelle = grezzo.map((t, i) => (t.includes('*') ? i : -1)).filter(i => i >= 0)
console.log(`ciclo da 252 (${T252.length} token), jolly vecchio risolto in:`)
for (const i of stelle) console.log(`  posizione ${String(i).padStart(3)}: ${grezzo[i]} → ${T252[i]}`)

// Lo SLOT è una posizione nel ciclo da 252, e può CAMBIARE: dai PDF di
// luglio–settembre risulta che COCOZZA sta sullo slot 37 e dal 1° ottobre
// sullo 226 (gli altri otto stanno sullo stesso slot prima e dopo). Per questo
// il ciclo di base e quello di ottobre non sono sempre la stessa rotazione.
const SLOT = {
  BOCCHETTI: 233, 'DE GIOVANNI': 9, COCOZZA: 37, CENTOMANI: 247, CORBI: 23,
  MUCCI: 2, GRECO: 30, 'NEVANO P.': 240,
}
const ruota = (p, o) => Array.from({ length: p.length }, (_, i) => p[(i + o) % p.length])
const [members, storico] = await Promise.all([
  devRest('shift_team_members', '?select=id,full_name,pattern,team_id'),
  devRest('shift_member_patterns', '?select=member_id,from_date,pattern&order=from_date'),
])
const righeOttobre = new Map()
const righeBase = new Map()
for (const r of storico ?? []) {
  const d = String(r.from_date).slice(0, 10)
  if (d === '2026-10-01') righeOttobre.set(r.member_id, (r.pattern ?? []).map(String))
  if (d === '2026-03-01') righeBase.set(r.member_id, (r.pattern ?? []).map(String))
}

const daCorreggere = []
for (const [nome, slot] of Object.entries(SLOT)) {
  const m = members.find(x => x.full_name === nome)
  if (!m) { console.log(`  ${nome}: non trovato`); continue }
  const nuovo = ruota(T252, slot)
  const gia = righeOttobre.get(m.id)
  const rigaBase = righeBase.get(m.id)
  const stessa = a => (a ?? []).length === nuovo.length && (a ?? []).every((t, i) => t === nuovo[i])
  console.log(`  ${nome.padEnd(12)} slot ${String(slot).padStart(3)} · colonna ${(m.pattern ?? []).length} · riga 03/01 ${rigaBase ? rigaBase.length : 0} · riga 10/01 ${gia ? gia.length : 0} token`)
  if (stessa(m.pattern) && stessa(rigaBase)) {
    console.log('      già corretto')
    continue
  }
  if (stessa(m.pattern) && !stessa(rigaBase)) {
    console.log('      ⚠ la COLONNA è giusta ma la riga di storico 2026-03-01 la ombreggia: va riallineata')
  }
  daCorreggere.push({ m, slot, nuovo, haRiga: !!gia })
}
const mar = members.find(x => x.full_name === 'MAROTTA')
if (mar) console.log(`  MAROTTA      resta sul suo ciclo da ${(mar.pattern ?? []).length} token fino al 30/09 (dal 1° ottobre prende lo slot 16, riga già presente): non si tocca`)
console.log(`\nmembri da correggere: ${daCorreggere.length}`)
if (!APPLY) {
  console.log('DRY-RUN: niente scritto. Rilancia con --apply (backup automatico).')
  process.exit(0)
}
const bakPath = path.join('scripts', `backup-base-rilievo-252-${Date.now()}.json`)
fs.writeFileSync(bakPath, JSON.stringify({
  salvato: new Date().toISOString(),
  membri: daCorreggere.map(x => ({ id: x.m.id, full_name: x.m.full_name, pattern: x.m.pattern, riga_2026_03_01: righeBase.get(x.m.id) ?? null })),
}, null, 2))
console.log(`backup: ${bakPath}`)
for (const x of daCorreggere) {
  await devPatch('shift_team_members', { pattern: x.nuovo }, `?id=eq.${x.m.id}`)
  // La riga di storico 2026-03-01 (creata dal backfill della 037) è il ciclo di
  // base: se non la riallineo, tokenForMember la sceglie al posto della colonna e
  // la correzione non si vede. Le due vanno tenute allineate per costruzione.
  await devUpsert('shift_member_patterns', { member_id: x.m.id, from_date: '2026-03-01', pattern: x.nuovo, note: 'ciclo di base: super-ciclo da 252 con il jolly vecchio risolto in M5T' }, '?on_conflict=member_id,from_date')
  console.log(`  scritto: ${x.m.full_name} (${x.nuovo.length} token, slot ${x.slot}) in colonna e nella riga 2026-03-01`)
}
console.log(`\nrollback: ripristina i pattern da ${path.basename(bakPath)}`)
