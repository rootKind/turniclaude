// Nelle celle che oggi sono `M*` (turno J), che cosa c'era PRIMA del 1° ottobre?
// Interrogo i PDF di luglio, agosto e settembre nei giorni in cui il ciclo da
// 252 cade su quelle posizioni: se dicono `M5` la regola è «la mattina della
// sezione della notte dopo», se dicono altro la regola è un'altra.
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
  const su = path.dirname(dir)
  if (su === dir) break
  dir = su
}
const MAIN = 'zrbbzfingrdpdflkndgl'
const mainQuery = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${MAIN}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}
const devRest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json())

const MESI = ['2026-07', '2026-08', '2026-09']
const blocchi = JSON.parse(fs.readFileSync(path.join('scripts', 'dati-template-ottobre.json'), 'utf8'))
const grezzo = blocchi.find(b => b.titolo === 'SCORTE RILIEVO').righe.flat()
const stelle = grezzo.map((t, i) => (t.includes('*') ? i : -1)).filter(i => i >= 0)
const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const gf = (a, b) => Math.round((pd(b) - pd(a)) / DAY)
const isoOf = (m, d) => `${m}-${String(d).padStart(2, '0')}`
const nGiorni = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()

const [types, teams, pdfRows] = await Promise.all([
  devRest('shift_types', '?select=id,name,pattern_start'),
  devRest('shift_teams', '?select=id,shift_type_id,name'),
  mainQuery(`select month, schedule from sala_schedule where month in (${MESI.map(m => `'${m}'`).join(',')}) order by month`),
])
const tyById = new Map(types.map(t => [t.id, t]))
const anchor = tyById.get(teams.find(t => t.name === 'Rilievo A').shift_type_id).pattern_start
const pdfPerMese = new Map()
for (const r of pdfRows) {
  const per = new Map()
  r.schedule.names.forEach((n, i) => {
    const row = r.schedule.rows[i] ?? {}
    per.set(n.toUpperCase(), Array.from({ length: r.schedule.days }, (_, k) => r.schedule.codes[row.t?.[k] ?? 0] ?? ''))
  })
  pdfPerMese.set(r.month, per)
}
const slotDi = { BOCCHETTI: 233, 'DE GIOVANNI': 9, COCOZZA: 226, CENTOMANI: 247, CORBI: 23, MUCCI: 2, GRECO: 30, 'NEVANO P.': 240 }
const nomePdf = n => n.toUpperCase().replace('NEVANO P.', 'NEVANO')
const L = grezzo.length

console.log(`ciclo da 252, ancoraggio ${anchor}. Il * cade su queste posizioni del ciclo: ${stelle.join(', ')}\n`)
const conta = new Map()
for (const nome of Object.keys(slotDi)) {
  for (const mese of MESI) {
    const riga = pdfPerMese.get(mese)?.get(nomePdf(nome))
    if (!riga) continue
    for (let d = 1; d <= nGiorni(mese); d++) {
      const data = isoOf(mese, d)
      const idx = (gf(anchor, data) + slotDi[nome]) % L
      if (!stelle.includes(((idx % L) + L) % L)) continue
      const t = riga[d - 1] ?? ''
      const chiave = t || '(vuota)'
      conta.set(chiave, (conta.get(chiave) ?? 0) + 1)
      if ((conta.get('__tot') ?? 0) < 24) {
        conta.set('__tot', (conta.get('__tot') ?? 0) + 1)
        console.log(`  ${nome.padEnd(12)} ${data}  posizione ${String(idx).padStart(3)}  pdf: ${chiave}`)
      }
    }
  }
}
console.log(`\nriepilogo delle celle sui giorni del * (luglio–settembre):`)
for (const [k, n] of [...conta].sort((a, b) => b[1] - a[1])) {
  if (k.startsWith('__')) continue
  console.log(`  ${k.padEnd(10)} ${n} volte`)
}
