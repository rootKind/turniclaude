// IMPORTA SU DEV LA CARD JOLLY E LE SUE REGOLE SUI MINIMI, DA MAIN — 26/09/2026.
//
// Perché: su dev la piantina (`sala_layout`) è indietro rispetto a main — non
// ha la card «JOLLY» e le voci dei minimi del 24/09, 25/09 e 01/10. La card
// JOLLY è quella che il nuovo asset mette in evidenza (dal 1° ottobre i 44
// della squadra in terza passano a `PJ`/`MJ`), quindi senza di essa la board di
// dev non può mostrare la jolly né segnalarne la scopertura.
//
// COSA VIENE IMPORTATO, E COSA NO:
//  - la CARD «JOLLY» (row 4, single, allineata a sinistra, sectionKey «J»),
//    al posto che ha in main: fra la 7 e la 9;
//  - le REGOLE SUI MINIMI della jolly: `J|M`, `J|P`, `J|N` nelle voci che main
//    già ha. La voce nuova (dal 01/10) nasce copiando i valori che sono oggi in
//    vigore su dev e sovrascrivendo SOLO i tre valori della jolly (1, 1, 0): così
//    nessun'altra card cambia minima, ed è esattamente quello che è stato
//    chiesto. Le voci del 24/9 e del 25/9 di main NON vengono importate: non
//    riguardano la jolly (che da allora valeva 0) e cambierebbero i minimi di
//    altre card.
//
// USO
//   node scripts/importa-card-jolly-dev.mjs           # dry-run: cosa cambia
//   node scripts/importa-card-jolly-dev.mjs --apply   # scrive su DEV (backup)
import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')

// ── env / connessioni ───────────────────────────────────────────────────────
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
if (!env?.NEXT_PUBLIC_SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY || !env?.SUPABASE_ACCESS_TOKEN) {
  console.error('env mancanti in .env.local')
  process.exit(1)
}
const MAIN = 'zrbbzfingrdpdflkndgl'
const devRest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json())
const devPatch = (t, body) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}`, {
  method: 'PATCH',
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(body),
}).then(async r => { if (!r.ok) throw new Error(`PATCH ${t}: ${r.status} ${(await r.text()).slice(0, 300)}`); return r.json() })
const mainQuery = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${MAIN}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

const [devRow] = await devRest('sala_layout', '?select=id,layout&limit=1')
const [mainRow] = await mainQuery(`select layout from sala_layout where id = 1`)
if (!devRow) { console.error('sala_layout non trovata su dev'); process.exit(1) }
if (!mainRow) { console.error('sala_layout non trovata su main'); process.exit(1) }
const dev = structuredClone(devRow.layout ?? {})
const main = mainRow.layout ?? {}
const key = c => c.sectionKey ?? c.title

// ── 1. la card JOLLY, al posto che ha in main ───────────────────────────────
const cardMain = (main.cards ?? []).find(c => key(c) === 'J')
if (!cardMain) { console.error('su main non c\'è una card con sectionKey «J»'); process.exit(1) }
const cardDev = (dev.cards ?? []).find(c => key(c) === 'J')
const carte = [...(dev.cards ?? [])]
if (cardDev) {
  console.log(`· la card «JOLLY» c'è già su dev: ${JSON.stringify(cardDev)}`)
} else {
  const iMain = main.cards.findIndex(c => key(c) === 'J')
  const precedente = main.cards[iMain - 1] ? key(main.cards[iMain - 1]) : null
  const iDev = precedente ? carte.findIndex(c => key(c) === precedente) : -1
  const posizione = iDev >= 0 ? iDev + 1 : carte.length
  carte.splice(posizione, 0, structuredClone(cardMain))
  console.log(`· card «JOLLY» inserita in posizione ${posizione + 1}, dopo «${precedente ?? '—'}» (row ${cardMain.row}, ${cardMain.type}, «${cardMain.title}»)`)
}

// ── 2. le regole sui minimi della jolly ─────────────────────────────────────
// La voce che si applica da ottobre: i valori di oggi su dev, con i tre della
// jolly presi da main. Niente periodi per casella (su main sono vuoti).
const ordineTurno = { M: 0, P: 1, N: 2 }
const inVigore = (voci, giorno, turno) => {
  let best = null
  for (const v of voci) {
    if (!v?.from || v.from > giorno) continue
    if (v.from === giorno && ordineTurno[v.fromShift ?? 'M'] > ordineTurno[turno]) continue
    if (!best || v.from > best.from || (v.from === best.from && ordineTurno[v.fromShift ?? 'M'] >= ordineTurno[best.fromShift ?? 'M'])) best = v
  }
  return best
}
const oggi = inVigore(dev.minimums ?? [], '2026-10-01', 'M')
if (!oggi) { console.error('su dev non c\'è nessuna voce dei minimi in vigore al 01/10'); process.exit(1) }
const jollyMain = main.minimums?.at(-1)
const valoriJolly = Object.fromEntries(Object.entries(jollyMain?.values ?? {}).filter(([k]) => k.startsWith('J|')))
if (Object.keys(valoriJolly).length !== 3) { console.error(`su main la voce del ${jollyMain?.from} non ha i tre valori della jolly`); process.exit(1) }
const nuoviValori = { ...(oggi.values ?? {}), ...valoriJolly }
const voci = [...(dev.minimums ?? [])]
const i = voci.findIndex(v => v.from === (jollyMain?.from ?? '2026-10-01'))
const voce = { from: jollyMain.from, fromShift: jollyMain.fromShift ?? 'M', values: nuoviValori }
if (i >= 0) { voci[i] = voce; console.log(`· voce dei minimi del ${voce.from} aggiornata`) } else {
  voci.push(voce)
  voci.sort((a, b) => String(a.from).localeCompare(String(b.from)))
  console.log(`· nuova voce dei minimi: dal ${voce.from} (turno ${voce.fromShift})`)
}
console.log(`  valori della jolly: ${Object.entries(valoriJolly).map(([k, n]) => `${k}=${n}`).join(' · ')}`)
const cambi = Object.keys(nuoviValori).filter(k => (oggi.values ?? {})[k] !== nuoviValori[k] && !k.startsWith('J|'))
console.log(`  valori di altre card che cambiano: ${cambi.length ? cambi.map(k => `${k}: ${oggi.values?.[k]}→${nuoviValori[k]}`).join(', ') : 'nessuno'}`)

// ── 3. confronto e scrittura ───────────────────────────────────────────────
const nuovo = { ...dev, cards: carte, minimums: voci }
const diffCarde = (nuovo.cards ?? []).filter((c, i2) => JSON.stringify(c) !== JSON.stringify(dev.cards?.[i2])).length
// L'ordine sulla board lo decide il `row` (a parità di row, l'ordine
// nell'array): si confronta quello di dev dopo il cambiamento con quello di main.
const perRow = l => [...(l.cards ?? [])].sort((a, b) => (a.row ?? 0) - (b.row ?? 0)).map(key).join(' ')
console.log(`\ncard: ${dev.cards?.length ?? 0} → ${nuovo.cards.length} · voci dei minimi: ${dev.minimums?.length ?? 0} → ${voci.length} · campi diversi: ${diffCarde}`)
console.log(`ordine per row su dev   : ${perRow(nuovo)}`)
console.log(`ordine per row su main  : ${perRow(main)}`)
if (perRow(nuovo) !== perRow(main)) console.log('⚠ l\'ordine delle card non coincide con main')
if (diffCarde > 1) console.log('⚠ più di una card cambia: controlla il diff qui sopra prima di applicare')

if (!APPLY) {
  console.log('\nDRY-RUN: niente scritto. Rilancia con --apply per scrivere su dev.')
  process.exit(0)
}
const bakPath = path.join('scripts', `backup-sala-layout-dev-${Date.now()}.json`)
fs.writeFileSync(bakPath, JSON.stringify({ id: devRow.id, layout: devRow.layout, salvato: new Date().toISOString() }, null, 2))
console.log(`\nbackup della piantina precedente: ${bakPath}`)
const [scritto] = await devPatch('sala_layout?id=eq.1', { layout: nuovo })
const riletta = scritto?.layout ?? {}
console.log(`scritto: card ${riletta.cards?.length} · voci ${riletta.minimums?.length} · jolly presente: ${(riletta.cards ?? []).some(c => key(c) === 'J') ? 'sì' : 'NO'}`)
const ordine = (riletta.cards ?? []).map(key)
console.log(`ordine delle card: ${ordine.join(' ')}`)
const voceOttobre = riletta.minimums?.find(v => v.from === '2026-10-01')
console.log(`minimi dal 01/10 per la jolly: ${Object.entries(voceOttobre?.values ?? {}).filter(([k]) => k.startsWith('J|')).map(([k, n]) => `${k}=${n}`).join(' · ')}`)
