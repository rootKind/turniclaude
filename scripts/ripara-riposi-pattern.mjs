// RIPARA LE POSIZIONI RIPOSO/DISPONIBILITÀ DEI PATTERN CICLICI — 17/09/2026.
//
// PERCHÉ. Il seed dei pattern (024) deduceva i riposi dalla MAGGIORANZA del
// reale nei PDF: dove il reale è misto leave 'D'. Ma il TEORICO pre-stampato
// dei PDF dice RC in alcune di quelle posizioni (es. CAVANNA e DONNARUMMA,
// Scorte, idx 27: RC in TUTTI i mesi allineati; ROTONDO, in seconda, idx 13 e
// 34: RC a maggioranza 2/3). Risultato: il teorico generato mostra D (es.
// CAVANNA il 10/10/2026) dove la realtà di carta dice un riposo compensativo.
//
// CRITERIO (identico alla diagnosi dbg-pattern-vs-teorico.mjs):
//  - solo posizioni «rest» nel pattern (D, RM, RC, RI, '') possono cambiare;
//  - solo verso un altro token rest (mai verso turni di lavoro);
//  - il TEORICO pre-stampato dei PDF v2 alla posizione del ciclo deve essere
//    maggioritario ≥60% con almeno 3 campioni.
// Il piano è calcolato sui PDF di DEV e applicato IDENTICO a dev e prod
// (id membro uguali nei due DB, come da allineamento 17/09).
//
// USO
//   node scripts/ripara-riposi-pattern.mjs           # DRY-RUN (solo report)
//   node scripts/ripara-riposi-pattern.mjs --apply   # scrive su dev E prod
import fs from 'node:fs'
import path from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const PROD_REF = 'zrbbzfingrdpdflkndgl'
const MONTHS = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
const POS_REPOSO = new Set(['D', 'RM', 'RC', 'RI', ''])
const APPLY = process.argv.includes('--apply')
// Bersagli confermati (17/09/2026, decisione utente): solo le posizioni con
// prova PDF unanime al 100%. ROTONDO è escluso VOLUTAMENTE: la sua teoria
// stampata ha cambiato schema da fine maggio (riposi RC sabato + RI domenica,
// giorni lavorativi a «G» da confermare) rispetto al ciclo 84gg del DB
// (fedele invece a marzo-aprile): è una divergenza strutturale che richiede
// una decisione di pianificazione, non un fix puntuale.
const BERSAGLI = new Set(['CAVANNA', 'DONNARUMMA'])

// ── env ───────────────────────────────────────────────────────────────────────
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
  console.error('env mancanti in .env.local'); process.exit(1)
}
const devRest = (t, s) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  }).then(r => r.json())
const devPatch = (t, id, body) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  }).then(async r => ({ ok: r.ok, body: await r.text() }))
async function prodQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

// ── moduli reali transpilati ──────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'riposi-'))
const transpile = src =>
  ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const fixImp = js => js
  .replaceAll('@/types/database', './types-stub.js')
  .replace(/@\/lib\/utils/g, './utils-stub.js')
  .replace(/@\/lib\/([a-z-]+)/g, (_, m) => `./${m}.js`)
writeFileSync(join(tmp, 'types-stub.js'), 'module.exports = {}\n')
writeFileSync(join(tmp, 'utils-stub.js'), 'module.exports = {}\n')
for (const name of ['shift-tokens', 'altri-gruppi', 'shift-teams-matching', 'turni-teorici', 'person-shift', 'sala-month']) {
  writeFileSync(join(tmp, `${name}.js`), fixImp(transpile(fs.readFileSync(`lib/${name}.ts`, 'utf8'))))
}
const { adjustmentOffset } = await import(pathToFileURL(join(tmp, 'turni-teorici.js')).href)
const { decodeSalaMonth, isSalaMonthData } = await import(pathToFileURL(join(tmp, 'sala-month.js')).href)

const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const giorniFra = (a, b) => Math.round((pd(b) - pd(a)) / DAY)
const nomeCognome = full => (full ?? '').trim().split(/\s+/)[0].toLowerCase()

// ── 1) dati di dev + PDF v2 di dev ────────────────────────────────────────────
const [devTypes, devTeams, devMembers, devAdj, devSala] = await Promise.all([
  devRest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active&order=sort_order.asc'),
  devRest('shift_teams', '?select=id,shift_type_id,name'),
  devRest('shift_team_members', '?select=id,team_id,full_name,pattern,is_active&order=full_name.asc'),
  devRest('shift_adjustments', '?select=*'),
  devRest('sala_schedule', `?month=in.(${MONTHS.join(',')})&select=month,schedule`),
])
const mesiV2 = devSala
  .map(r => ({ month: r.month, data: r?.data ?? r?.schedule }))
  .filter(r => r.data && isSalaMonthData(r.data))
  .map(r => ({ month: r.month, people: decodeSalaMonth(r.data) }))
console.log(`Piano da DEV — mesi PDF v2: ${mesiV2.map(m => m.month).join(' ')}`)
console.log(`Modalità: ${APPLY ? 'APPLY (scrive su dev E prod)' : 'DRY-RUN (non scrive)'}\n`)

const teamById = new Map(devTeams.map(t => [t.id, t]))
const typeById = new Map(devTypes.map(t => [t.id, t]))

// ── 2) piano: maggioranza del teorico PDF per posizione rest ──────────────────
const piano = [] // { id, full_name, tipo, idx, cur, val, support, n }
for (const m of devMembers) {
  if (!m.is_active) continue
  const pat = m.pattern ?? []
  if (!pat.length) continue
  const team = teamById.get(m.team_id)
  const type = typeById.get(team?.shift_type_id)
  if (!type?.pattern_start) continue
  const cogn = nomeCognome(m.full_name)
  const samples = Array.from({ length: pat.length }, () => [])
  for (const { month, people } of mesiV2) {
    const hits = people.filter(p => (p.name ?? '').toLowerCase().split(/\s+/)[0] === cogn)
    if (hits.length !== 1) continue
    const p = hits[0]
    const [y, mo] = month.split('-').map(Number)
    const nDays = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    for (let d = 1; d <= nDays; d++) {
      const iso = `${month}-${String(d).padStart(2, '0')}`
      const off = giorniFra(type.pattern_start, iso) + adjustmentOffset(devAdj, m.team_id, iso)
      const idx = ((off % pat.length) + pat.length) % pat.length
      const t = p.teorico[d - 1] ?? ''
      if (t) samples[idx].push(t)
    }
  }
  for (let i = 0; i < pat.length; i++) {
    const cur = pat[i] ?? ''
    if (!POS_REPOSO.has(cur)) continue
    const s = samples[i]
    if (s.length < 3) continue
    const counts = new Map()
    for (const t of s) counts.set(t, (counts.get(t) ?? 0) + 1)
    const [val, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (val === cur || !POS_REPOSO.has(val) || n / s.length < 0.6) continue
    if (!BERSAGLI.has(nomeCognome(m.full_name).toUpperCase())) continue
    piano.push({ id: m.id, full_name: m.full_name, tipo: type.name, idx: i, cur: cur || '·', val, support: Math.round((n / s.length) * 100), n: s.length })
  }
}
if (!piano.length) { console.log('Nessuna posizione da correggere: pattern già allineati ai PDF.') ; process.exit(0) }
for (const p of piano) console.log(`  ${p.full_name} [${p.tipo}] idx ${p.idx}: ${p.cur} → ${p.val}  (teorico PDF ${p.support}%, n=${p.n})`)

// ── 3) stato attuale di prod per gli stessi id ────────────────────────────────
const idsSql = piano.map(p => `'${p.id}'`).join(',')
const idsRest = piano.map(p => p.id).join(',') // PostgREST: UUID nudi (niente apici)
const prodRows = await prodQuery(`select id, team_id, full_name, pattern from shift_team_members where id in (${idsSql})`)
const prodById = new Map(prodRows.map(r => [r.id, r]))
for (const p of piano) {
  const pr = prodById.get(p.id)
  if (!pr) { console.log(`⚠ membro ${p.full_name} (${p.id}) assente su prod`); continue }
  if ((pr.full_name ?? '') !== p.full_name) console.log(`⚠ nomi diversi dev/prod per ${p.id}: «${p.full_name}» vs «${pr.full_name}»`)
  if ((pr.pattern?.[p.idx] ?? '') !== (p.cur === '·' ? '' : p.cur)) console.log(`⚠ prod ${p.full_name} idx ${p.idx} = «${pr.pattern?.[p.idx]}» (atteso ${p.cur})`)
}

// ── 4) apply ──────────────────────────────────────────────────────────────────
if (APPLY) {
  // backup prod
  const bak = `scripts/backup-riposi-prod-${Date.now()}.json`
  fs.writeFileSync(bak, JSON.stringify({ at: new Date().toISOString(), rows: prodRows }, null, 1))
  console.log(`\nBackup prod scritto: ${bak}`)

  for (const p of piano) {
    const pr = prodById.get(p.id)
    if (!pr) continue
    // dev (PostgREST)
    const dm = devMembers.find(x => x.id === p.id)
    const nuovoDev = [...(dm.pattern ?? [])]
    nuovoDev[p.idx] = p.val
    const r1 = await devPatch('shift_team_members', p.id, { pattern: nuovoDev })
    // prod (SQL array)
    const nuovoProd = [...(pr.pattern ?? [])]
    nuovoProd[p.idx] = p.val
    const arr = `ARRAY[${nuovoProd.map(x => `'${String(x).replace(/'/g, "''")}'`).join(',')}]`
    const r2 = await prodQuery(`update shift_team_members set pattern = ${arr} where id = '${p.id}' returning id`)
    console.log(`  ${p.full_name} idx ${p.idx} → ${p.val}: dev=${r1.ok ? 'ok' : 'ERR ' + r1.body.slice(0, 120)} | prod=${r2.length ? 'ok' : 'ERR'}`)
  }
  console.log('\nVerifica:')
  const [devAfter, prodAfter] = await Promise.all([
    devRest('shift_team_members', `?id=in.(${idsRest})&select=id,full_name,pattern`),
    prodQuery(`select id, full_name, pattern from shift_team_members where id in (${idsSql})`),
  ])
  if (!Array.isArray(devAfter) || !Array.isArray(prodAfter)) throw new Error(`verifica: risposta inattesa dev=${JSON.stringify(devAfter).slice(0, 200)}`)
  let ok = 0, ko = 0
  for (const p of piano) {
    const d = devAfter.find(x => x.id === p.id)
    const s = prodAfter.find(x => x.id === p.id)
    const gd = (d?.pattern?.[p.idx] ?? '') === p.val
    const gp = (s?.pattern?.[p.idx] ?? '') === p.val
    if (gd && gp) ok++; else { ko++; console.log(`  ✗ ${p.full_name} idx ${p.idx}: dev=${d?.pattern?.[p.idx]} prod=${s?.pattern?.[p.idx]} (atteso ${p.val})`) }
  }
  console.log(`  posizioni verificate: ${ok} ok, ${ko} errate`)
  // CAVANNA 10 ottobre, prima e dopo
  const cav = devAfter.find(x => /cavanna/i.test(x.full_name ?? ''))
  if (cav) {
    const memDev = devMembers.find(m => m.id === cav.id)
    const type = typeById.get(teamById.get(memDev?.team_id)?.shift_type_id)
    const iso = '2026-10-10'
    const off = giorniFra(type.pattern_start, iso) + adjustmentOffset(devAdj, memDev.team_id, iso)
    const idx = ((off % cav.pattern.length) + cav.pattern.length) % cav.pattern.length
    console.log(`  CAVANNA 10/10/2026 → pattern[${idx}] = «${cav.pattern[idx]}»`)
  }
} else {
  console.log('\nDry-run: nessuna scrittura. Rilancia con --apply per scrivere su dev e prod.')
}
