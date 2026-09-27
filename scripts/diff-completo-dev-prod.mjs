// DIFF COMPLETO FRA DEV E PRODUZIONE, colonna per colonna (27/09/2026).
//
// A cosa serve: dopo due allineamenti, la domanda non è più «manca LONI?» ma
// «tutto il resto è uguale?». Questo script confronta TUTTE le colonne delle
// tabelle delle squadre, così l'elenco delle differenze è chiuso e non si
// scopre una alla volta. Sola lettura.
//
//   node scripts/diff-completo-dev-prod.mjs
import fs from 'node:fs'
let env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const P = 'zrbbzfingrdpdflkndgl'
const q = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${P}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) })
  const t = await r.text(); if (!r.ok) throw new Error(r.status + ': ' + t.slice(0, 300)); return JSON.parse(t)
}
const U = s => String(s ?? '').trim().toUpperCase()
const stessa = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

async function confronta(titolo, dev, prod, chiavi, colonne, etichette = {}) {
  const dMap = new Map(dev.map(r => [chiavi(r), r]))
  const pMap = new Map(prod.map(r => [chiavi(r), r]))
  const diff = []
  for (const [k, d] of dMap) {
    const p = pMap.get(k)
    const nome = etichette[d] ?? etichette[k] ?? k
    if (!p) { diff.push(`  ${nome}: solo su DEV`); continue }
    for (const c of colonne) {
      if (c === 'id' || c === 'team_id' || c === 'member_id' || c === 'shift_type_id' || c === 'from_date') continue
      if (!stessa(d[c], p[c])) diff.push(`  ${nome}: ${c}  dev=${JSON.stringify(d[c])}  prod=${JSON.stringify(p[c])}`)
    }
  }
  for (const [k, p] of pMap) if (!dMap.has(k)) diff.push(`  ${etichette[p] ?? k}: solo su PROD`)
  console.log(`\n== ${titolo}: ${dev.length} su dev, ${prod.length} su prod, ${diff.length} differenze ==`)
  for (const r of diff) console.log(r)
  if (!diff.length) console.log('  (nessuna differenza)')
  return diff.length
}// dev via REST (il select='*' su PostgREST va bene per la lettura, ma si
// elencano le colonne per non dipendere dall'ordine di arrivo)
const g = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }).then(r => r.json())
const [devTipi, devSquadre, devMembri, devStorico, devTpl] = await Promise.all([
  g('shift_types', '?select=*'),
  g('shift_teams', '?select=*'),
  g('shift_team_members', '?select=*'),
  g('shift_member_patterns', '?select=*'),
  g('shift_cycle_templates', '?select=*'),
])
const [prodTipi, prodSquadre, prodMembri, prodStorico, prodTpl, cols] = await Promise.all([
  q(`select * from shift_types`),
  q(`select * from shift_teams`),
  q(`select * from shift_team_members`),
  q(`select * from shift_member_patterns`),
  q(`select * from shift_cycle_templates`),
  q(`select table_name, column_name from information_schema.columns
     where table_schema='public' and table_name in ('shift_types','shift_teams','shift_team_members','shift_member_patterns','shift_cycle_templates')
     order by table_name, ordinal_position`),
])
const colonneDi = t => cols
  .filter(c => c.table_name === t)
  .map(c => c.column_name)
  // `created_at`/`updated_at` dicono solo quando i due ambienti sono stati
  // costruiti: dev è stato seminato l'8 settembre, master il 17. Non sono un
  // asset e non hanno nessun effetto, quindi non contano come differenze.
  .filter(c => !/^(created_at|updated_at)$/.test(c))
const nomi = (arr, k = 'full_name') => Object.fromEntries(arr.map(r => [r.id, r[k]]))

let totale = 0
totale += await confronta('shift_types', devTipi, prodTipi, r => U(r.name), colonneDi('shift_types'), Object.fromEntries(devTipi.map(t => [U(t.name), t.name])))
totale += await confronta('shift_teams', devSquadre, prodSquadre, r => U(r.name), colonneDi('shift_teams'), Object.fromEntries(devSquadre.map(t => [U(t.name), t.name])))
totale += await confronta('shift_team_members', devMembri, prodMembri, r => r.id, colonneDi('shift_team_members'), nomi(devMembri))
totale += await confronta('shift_member_patterns', devStorico, prodStorico, r => `${r.member_id}|${r.from_date}`, ['pattern', 'note'], {})
totale += await confronta('shift_cycle_templates', devTpl, prodTpl, r => r.id, colonneDi('shift_cycle_templates'), Object.fromEntries(devTpl.map(t => [t.id, t.name])))

// Le squadre hanno id diversi: il confronto per nome è quello giusto, ma due
// rigge hanno id DIVERSI fra i due ambienti. Serve saperlo, perché un
// allineamento per id sulle squadre scriverebbe un riferimento inesistente.
const idDiversi = devSquadre.filter(d => !prodSquadre.some(p => p.id === d.id)).map(d => d.name)
console.log(`\n== squadre con id diverso fra i due ambienti: ${idDiversi.length} ==`)
console.log(`  ${idDiversi.join(', ')}`)
console.log(`\nTOTALE DIFFERENZE: ${totale}`)
