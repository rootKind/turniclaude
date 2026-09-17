// ALLINEA LA ROTAZIONE TEORICA DI PRODUZIONE A QUELLA DI DEV — 17/09/2026.
//
// PERCHÉ ESISTE. Il bug: su produzione il teorico di ottobre «riparte dal giorno
// 1» (es. BORRELLI, ciclo 28gg che riprende il 13/09: il 01/10 deve cadere sul
// giorno 19, invece ricomincia). Su dev la radice era stata riparata nel DB con
// scripts/apply-super-cycle.mjs (anchor comune 2026-03-01, ciclo 84gg per
// «in terza» con pattern completi turno+sezione, pattern 024 da consenso).
// A produzione erano arrivate SOLO le migration 018-033: nessuna di esse tocca
// cycle_days/pattern_start/pattern, quindi prod è rimasta al seed 020
// (pattern_start=2026-07-01, «in terza» a 28gg troncata).
//
// PERCHÉ L'ALLINEAMENTO E NON IL RICALCOLO. Su prod i mesi PDF 2026-03..08 sono
// ancora in formato v1 (solo 2026-09 è v2): lì apply-super-cycle leggerebbe un
// solo mese e dedurrebbe pattern peggiori di quelli di dev, che sono già
// verificati sui PDF (verify-tuoturno: BORRELLI 214/214, MININO 98,6%…).
// Quindi: prod ← dev, membro per membro (match per id, fallback per nome),
// tipologia per tipologia (match per nome).
//
// REGOLE
//  - shift_types per NOME: cycle_days e pattern_start ← dev.
//  - shift_team_members per ID (fallback nome+squadra): pattern (e is_active se
//    diverso) ← dev. MAI user_id/is_lead/sort_order/full_name.
//  - Membri SOLO su prod (assunti locali, 4): la loro fase va PRESERVATA. Si
//    cerca la rotazione del loro pattern attuale contro il pattern VECCHIO di un
//    compagno di squadra prod (stesso DB, stessa anchor: la fase relativa non
//    dipende dall'anchor) e si applica lo stesso scorrimento al pattern NUOVO
//    (dev) del compagno. Se non c'è corrispondenza: NON si tocca, solo report.
//  - shift_cycle_templates: per ID ← dev (pattern, cycle_days, pattern_start).
//    I template SOLO su prod seguono la stessa regola dei membri (copia del
//    pattern di un membro): riallineati se sono la copia di un pattern
//    allineato, altrimenti intoccati con avviso.
//  - Prima di scrive: backup JSON completo delle righe prod toccate.
//  - Dopo: verifica — Borrelli 01/10 = giorno 19, tasso di corrispondenza col
//    teorico del PDF di settembre 2026 (v2) per ogni membro, e nessun membro che
//    «riparte» cambiando fase attraverso il confine settembre→ottobre.
//
// USO
//   node scripts/allinea-rotazione-prod.mjs                # DRY-RUN (solo report)
//   node scripts/allinea-rotazione-prod.mjs --apply        # scrive su PRODUZIONE
//   node scripts/allinea-rotazione-prod.mjs --apply --only=BORRELLI   # un membro
//
// Il token della Management API sta in .env.local come SUPABASE_ACCESS_TOKEN.
// Ref produzione «noto» (come apply-release-migrations.mjs): zrbbzfingrdpdflkndgl.
import fs from 'node:fs'
import path from 'node:path'

const PROD_REF = 'zrbbzfingrdpdflkndgl'
const COMMON_ANCHOR = '2026-03-01' // anchor valida su dev (verificata sui PDF)

const APPLY = process.argv.includes('--apply')
const ONLY = (process.argv.find(a => a.startsWith('--only=')) ?? '').slice('--only='.length).trim().toUpperCase()
const selezionato = n => !ONLY || n.toUpperCase().includes(ONLY)

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
if (!env?.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ACCESS_TOKEN) {
  console.error('env mancanti in .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN)')
  process.exit(1)
}

const devRest = (t, s) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  }).then(r => r.json())

async function prodQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}: ${t.slice(0, 400)}`)
  const j = JSON.parse(t)
  return j
}

/** UPDATE multi-statement in un batch; ritorna il testo di errore se presente. */
async function prodExec(statements) {
  const sql = statements.join(';\n') + ';'
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}: ${t.slice(0, 400)}`)
  return t
}

const q = s => `'${String(s).replace(/'/g, "''")}'`
const arrPg = a => `ARRAY[${(a ?? []).map(q).join(',')}]`

const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const giorniFra = (a, b) => Math.round((pd(b) - pd(a)) / DAY)
function idxPer(anchor, period, iso) { return ((giorniFra(anchor, iso) % period) + period) % period }

// ── 1) lettura di entrambi i DB ──────────────────────────────────────────────
const [devTypes, devTeams, devMembers, devTemplates] = await Promise.all([
  devRest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active,sort_order&order=sort_order.asc'),
  devRest('shift_teams', '?select=id,shift_type_id,name,sort_order'),
  devRest('shift_team_members', '?select=id,team_id,full_name,pattern,is_active&order=full_name.asc'),
  devRest('shift_cycle_templates', '?select=id,name,team_id,cycle_days,pattern_start,pattern,is_builtin'),
])
const liveTypes = await prodQuery(`select id, name, cycle_days, pattern_start, is_active, sort_order from shift_types order by sort_order`)
const liveTeams = await prodQuery(`select id, shift_type_id, name, sort_order from shift_teams order by sort_order`)
const liveMembers = await prodQuery(`select id, team_id, full_name, pattern, is_active from shift_team_members order by full_name`)
const liveTemplates = await prodQuery(`select id, name, team_id, cycle_days, pattern_start, pattern, is_builtin from shift_cycle_templates`)

// Base di PIANIFICAZIONE: il backup PIÙ VECCHIO (= stato pristine, prima di
// qualsiasi scrittura) se esiste. Rende il piano IDEMPOTENTE: le rotazioni di
// fallback si calcolano dallo stato di partenza, non da quello corrente che
// cambia a ogni apply — rilanciare converge sempre allo stesso stato finale.
const bakFiles = fs.readdirSync('scripts').filter(f => /^backup-rotazione-prod-\d+\.json$/.test(f)).sort()
const BAK = bakFiles.length ? path.join('scripts', bakFiles[0]) : null
let prodTypes = liveTypes, prodMembers = liveMembers, prodTemplates = liveTemplates
if (BAK) {
  const bak = JSON.parse(fs.readFileSync(BAK, 'utf8'))
  prodTypes = bak.types ?? prodTypes
  prodMembers = bak.members ?? prodMembers
  prodTemplates = bak.templates ?? prodTemplates
  console.log(`Base di pianificazione: BACKUP pristine ${BAK} (piano idempotente)\n`)
} else {
  console.log('⚠ Nessun backup pristine trovato: pianifico sullo stato live\n')
}
const prodTeams = liveTeams

const devTeamById = new Map(devTeams.map(t => [t.id, t]))
const prodTeamById = new Map(prodTeams.map(t => [t.id, t]))
const devTypeById = new Map(devTypes.map(t => [t.id, t]))
const prodTypeById = new Map(prodTypes.map(t => [t.id, t]))
const liveTypeById = new Map(liveTypes.map(t => [t.id, t]))
const liveMemberById = new Map(liveMembers.map(t => [t.id, t]))
const liveTemplateById = new Map(liveTemplates.map(t => [t.id, t]))
const sameArr = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
const teamLabel = (tid, map) => map.get(tid)?.name ?? tid

console.log(`Modalità: ${APPLY ? 'APPLY (scrive su PRODUZIONE)' : 'DRY-RUN (non scrive)'}${ONLY ? ` — only=${ONLY}` : ''}`)

// ── 2) piano: tipologie ──────────────────────────────────────────────────────
const typeUpdates = []
for (const dt of devTypes) {
  const pt = prodTypes.find(x => x.name === dt.name)
  if (!pt) { console.log(`⚠ tipo «${dt.name}» assente su prod`); continue }
  if (pt.cycle_days !== dt.cycle_days || pt.pattern_start !== dt.pattern_start) {
    typeUpdates.push({ id: pt.id, name: dt.name, cycle_days: dt.cycle_days, pattern_start: dt.pattern_start, from: `${pt.cycle_days}/${pt.pattern_start}` })
  }
}

// ── 3) piano: membri ─────────────────────────────────────────────────────────
const prodMemberById = new Map(prodMembers.map(m => [m.id, m]))
const memberUpdates = []   // {id, name, pattern, is_active?}
const onlyProd = []        // membri senza controparte dev
for (const dm of devMembers) {
  const pm = prodMemberById.get(dm.id)
  if (!pm) { console.log(`⚠ membro dev senza controparte prod: ${dm.full_name}`); continue }
  const cambia = !sameArr(dm.pattern, pm.pattern)
  if (dm.is_active !== pm.is_active) console.log(`ℹ ${dm.full_name}: is_active dev=${dm.is_active} prod=${pm.is_active} — NON si tocca (decisione di personale per ambiente)`)
  if (cambia && selezionato(dm.full_name)) {
    memberUpdates.push({ id: pm.id, name: dm.full_name, team: teamLabel(dm.team_id, devTeamById), pattern: dm.pattern, len: dm.pattern?.length ?? 0 })
  }
}
for (const pm of prodMembers) {
  if (prodMemberById.has(pm.id) && devMembers.some(d => d.id === pm.id)) continue
  if (devMembers.some(d => d.id === pm.id)) continue
  onlyProd.push(pm)
}

// fase dei soli-prod: rotazione contro il VECCHIO pattern di un compagno prod
function rotazioneCheSpiega(target, base) {
  const N = base.length
  if (!N || target.length !== N) return -1
  for (let k = 0; k < N; k++) {
    let ok = true
    for (let i = 0; i < N && ok; i++) if (target[i] !== base[(i + k) % N]) ok = false
    if (ok) return k
  }
  return -1
}
const ruota = (a, k) => a.map((_, i) => a[(i + k) % a.length])

const onlyProdPlan = []
for (const pm of onlyProd) {
  const type = prodTypeById.get(prodTeamById.get(pm.team_id)?.shift_type_id)
  const compagniProd = prodMembers.filter(x => x.team_id === pm.team_id && x.id !== pm.id)
  const label = `${pm.full_name} (${teamLabel(pm.team_id, prodTeamById)} / ${type?.name ?? '?'})`
  let done = false
  for (const comp of compagniProd) {
    const devComp = devMembers.find(d => d.id === comp.id)
    if (!devComp?.pattern?.length || !comp.pattern?.length || comp.pattern.length !== (pm.pattern?.length ?? -1)) continue
    const k = rotazioneCheSpiega(pm.pattern ?? [], comp.pattern)
    if (k >= 0) {
      onlyProdPlan.push({ id: pm.id, name: pm.full_name, label, via: `rotazione +${k} dal compagno ${comp.full_name}`, pattern: ruota(devComp.pattern, k) })
      done = true
      break
    }
  }
  if (!done) {
    // Fallback di CALENDARIO: l'ancora della tipologia passa da 2026-07-01 a
    // 2026-03-01 (−122 giorni); per NON cambiare ciò che la persona mostra sulle
    // date reali, il pattern si scorre della stessa quantità: newPattern[j] =
    // oldPattern[(j + Δ) mod p] con Δ = (−122) mod p.
    const p = Math.max(1, pm.pattern?.length ?? 0)
    const delta = ((giorniFra('2026-07-01', COMMON_ANCHOR) % p) + p) % p
    onlyProdPlan.push({ id: pm.id, name: pm.full_name, label, via: `nessuna corrispondenza: rotazione di calendario +${delta} (preserva la fase col cambio d'ancora)`, pattern: pm.pattern?.length ? ruota(pm.pattern, delta) : null })
  }
}

// ── 4) piano: template ───────────────────────────────────────────────────────
const prodTemplateById = new Map(prodTemplates.map(t => [t.id, t]))
const templateUpdates = []
for (const dt of devTemplates) {
  const pt = prodTemplateById.get(dt.id)
  if (!pt) continue // solo su dev: il catalogo è un comodino, niente insert
  if (!sameArr(dt.pattern, pt.pattern) || dt.cycle_days !== pt.cycle_days || dt.pattern_start !== pt.pattern_start) {
    templateUpdates.push({ id: pt.id, name: dt.name, pattern: dt.pattern, cycle_days: dt.cycle_days, pattern_start: dt.pattern_start })
  }
}
// template solo-prod che sono copie di pattern di membri allineati
const oldProdPatternByMember = new Map(prodMembers.map(m => [m.id, m.pattern]))
const newPatternByMemberId = new Map(memberUpdates.map(u => [u.id, u.pattern]))
for (const plan of onlyProdPlan) if (plan.pattern) newPatternByMemberId.set(plan.id, plan.pattern)
const templateOnlyProd = []
for (const pt of prodTemplates) {
  if (prodTemplateById.has(pt.id) && devTemplates.some(d => d.id === pt.id)) continue
  if (devTemplates.some(d => d.id === pt.id)) continue
  const membriSquadra = prodMembers.filter(m => m.team_id === pt.team_id)
  let done = false
  for (const m of membriSquadra) {
    const nuovo = newPatternByMemberId.get(m.id)
    if (!nuovo) continue
    const k = rotazioneCheSpiega(pt.pattern ?? [], oldProdPatternByMember.get(m.id) ?? [])
    if (k >= 0) {
      const type = prodTypeById.get(prodTeamById.get(pt.team_id)?.shift_type_id)
      templateOnlyProd.push({ id: pt.id, name: pt.name, pattern: ruota(nuovo, k), cycle_days: nuovo.length, pattern_start: COMMON_ANCHOR, via: `copia riallineata di ${m.full_name} (rot +${k})` })
      done = true
      break
    }
  }
  if (!done) {
    // Fallback di CALENDARIO: come per i membri, la rotazione preserva la fase
    // reale attraverso il cambio d'ancora (07-01 → 03-01).
    const p = Math.max(1, pt.pattern?.length ?? 0)
    const delta = ((giorniFra('2026-07-01', COMMON_ANCHOR) % p) + p) % p
    templateOnlyProd.push({ id: pt.id, name: pt.name, pattern: pt.pattern?.length ? ruota(pt.pattern, delta) : null, cycle_days: pt.cycle_days, pattern_start: COMMON_ANCHOR, via: `non riconducibile a un membro: rotazione di calendario +${delta}` })
  }
}

// ── 5) report del piano ──────────────────────────────────────────────────────
console.log(`\n== TIPI (${typeUpdates.length}) ==`)
for (const u of typeUpdates) console.log(`  ${u.name}: ${u.from} → ${u.cycle_days}/${u.pattern_start}`)
console.log(`\n== MEMBRI da allineare a dev (${memberUpdates.length}) ==`)
for (const u of memberUpdates.slice(0, 200)) console.log(`  ${u.name.padEnd(16)} ${u.team} → pattern[${u.len}]`)
console.log(`\n== MEMBRI solo su prod (${onlyProdPlan.length}) ==`)
for (const u of onlyProdPlan) console.log(`  ${u.label}: ${u.via}${u.pattern ? ` → pattern[${u.pattern.length}]` : ''}`)
console.log(`\n== TEMPLATE per id da dev (${templateUpdates.length}) + solo-prod riallineati (${templateOnlyProd.filter(t => t.pattern).length}/${templateOnlyProd.length}) ==`)
for (const u of [...templateUpdates, ...templateOnlyProd.filter(t => t.pattern)].slice(0, 40)) console.log(`  ${u.name} → pattern[${u.pattern?.length}] ${u.cycle_days ?? ''} ${u.pattern_start ?? ''}`)
for (const u of templateOnlyProd.filter(t => !t.pattern)) console.log(`  ⚠ ${u.name}: ${u.via}`)

// ── 6) verifica PRE (opzionale ma utile nel report) ─────────────────────────
// Il «PRIMA» usa lo stato LIVE; il «DOPO il piano» sovrappone le modifiche del
// piano (base pristine + update) sul live — così riflette la reality anche su
// DB già corretto: il tasso DEVREBBE essere uguale a quello post-apply.
const prodPdfV2 = await prodQuery(`select month, schedule from sala_schedule where schedule->>'v' = '2' order by month`)
const pdfSeq = new Map() // full_name UPPER → Map(dayKey → code)
for (const s of prodPdfV2) {
  const data = s.schedule
  for (let i = 0; i < (data.names?.length ?? 0); i++) {
    const key = (data.names[i] ?? '').trim().toUpperCase()
    const seq = pdfSeq.get(key) ?? new Map()
    const code = j => data.codes[j ?? 0] ?? ''
    for (let d = 1; d <= (data.days ?? 0); d++) seq.set(giorniFra('1970-01-01', `${s.month}-${String(d).padStart(2, '0')}`), code(data.rows[i]?.t?.[d - 1]))
    pdfSeq.set(key, seq)
  }
}

function tassoMatch(prodotto /* prodMembers o synth */) {
  let tot = 0, ok = 0
  for (const r of prodotto) {
    const seq = pdfSeq.get(r.full_name.trim().toUpperCase())
    if (!seq?.size) continue
    const period = Math.max(1, r.pattern?.length || 1)
    const anchor = r.anchor
    for (const [k, code] of seq) {
      if (!code) continue
      const iso = new Date(k * DAY).toISOString().slice(0, 10)
      tot++
      if ((r.pattern ?? [])[((k - pd(anchor) / DAY) % period + period) % period] === code) ok++
    }
  }
  return { tot, ok, pct: tot ? Math.round((1000 * ok) / tot) / 10 : 0 }
}

const prodDopoPiano = prodMembers.map(m => {
  const u = memberUpdates.find(x => x.id === m.id)
  const p = onlyProdPlan.find(x => x.id === m.id && x.pattern)
  const type = prodTypeById.get(prodTeamById.get(m.team_id)?.shift_type_id)
  const nuovotype = typeUpdates.find(x => x.id === type?.id)
  return {
    full_name: m.full_name,
    pattern: u?.pattern ?? p?.pattern ?? m.pattern,
    anchor: nuovotype?.pattern_start ?? type?.pattern_start,
  }
})
const pre = tassoMatch(liveMembers.map(m => {
  const type = prodTypeById.get(prodTeamById.get(m.team_id)?.shift_type_id)
  return { full_name: m.full_name, pattern: m.pattern, anchor: type?.pattern_start }
}))
const post = tassoMatch(prodDopoPiano.map(m => ({ ...m, anchor: m.anchor })))
console.log(`\n== VERIFICA contro il teorico del PDF di settembre (v2) ==`)
console.log(`  LIVE ORA: ${pre.ok}/${pre.tot} (${pre.pct}%) — DOPO il piano: ${post.ok}/${post.tot} (${post.pct}%)`)

const bor = prodDopoPiano.find(m => /borrelli/i.test(m.full_name))
if (bor?.pattern?.length) {
  const i = idxPer(bor.anchor, bor.pattern.length, '2026-10-01')
  console.log(`  BORRELLI il 2026-10-01: giorno ${i + 1}/${bor.pattern.length} token='${bor.pattern[i]}' (atteso: 19)`)
}

// ── 7) APPLY ─────────────────────────────────────────────────────────────────
if (APPLY) {
  const bak = { taken_at: new Date().toISOString(), prod_ref: PROD_REF, types: liveTypes, teams: liveTeams, members: liveMembers, templates: liveTemplates }
  const bakPath = path.join('scripts', `backup-rotazione-prod-${Date.now()}.json`)
  fs.writeFileSync(bakPath, JSON.stringify(bak, null, 2))
  console.log(`\nBackup scritto: ${bakPath}`)

  const stmts = []
  // Ogni UPDATE parte SOLO se lo stato LIVE differisce dal target: rilanciare
  // dopo un apply riuscito produce 0 statement (convergenza, non riscritture).
  for (const u of typeUpdates) {
    const lt = liveTypeById.get(u.id)
    if (lt && lt.cycle_days === u.cycle_days && lt.pattern_start === u.pattern_start) continue
    stmts.push(`update shift_types set cycle_days = ${u.cycle_days}, pattern_start = ${q(u.pattern_start)} where id = ${q(u.id)}`)
  }
  for (const u of memberUpdates) {
    const lm = liveMemberById.get(u.id)
    if (lm && sameArr(lm.pattern, u.pattern)) continue
    stmts.push(`update shift_team_members set pattern = ${arrPg(u.pattern)} where id = ${q(u.id)}`)
  }
  for (const u of onlyProdPlan) {
    if (!u.pattern) continue
    const lm = liveMemberById.get(u.id)
    if (lm && sameArr(lm.pattern, u.pattern)) continue
    stmts.push(`update shift_team_members set pattern = ${arrPg(u.pattern)} where id = ${q(u.id)}`)
  }
  for (const u of [...templateUpdates, ...templateOnlyProd.filter(t => t.pattern)]) {
    const lt = liveTemplateById.get(u.id)
    if (lt && sameArr(lt.pattern, u.pattern) && lt.cycle_days === u.cycle_days && lt.pattern_start === u.pattern_start) continue
    stmts.push(`update shift_cycle_templates set pattern = ${arrPg(u.pattern)}, cycle_days = ${u.cycle_days}, pattern_start = ${q(u.pattern_start)} where id = ${q(u.id)}`)
  }
  console.log(`Statement UPDATE: ${stmts.length}`)
  const CHUNK = 20
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await prodExec(stmts.slice(i, i + CHUNK))
    process.stdout.write(`  applicati ${Math.min(i + CHUNK, stmts.length)}/${stmts.length}\n`)
  }

  // verifica POST su DB
  const dopo = await prodQuery(`select m.full_name, m.pattern, ty.pattern_start, ty.cycle_days
    from shift_team_members m join shift_teams t on t.id = m.team_id join shift_types ty on ty.id = t.shift_type_id
    where m.is_active`)
  const post2 = tassoMatch(dopo.map(r => ({ full_name: r.full_name, pattern: r.pattern, anchor: r.pattern_start })))
  const dopoBor = dopo.find(m => /borrelli/i.test(m.full_name))
  const iBor = dopoBor ? idxPer(dopoBor.pattern_start, Math.max(1, dopoBor.pattern?.length || dopoBor.cycle_days), '2026-10-01') : -1
  console.log(`\n== POST-APPLY ==`)
  console.log(`  match PDF settembre: ${post2.ok}/${post2.tot} (${post2.pct}%)`)
  console.log(`  BORRELLI 01/10: giorno ${iBor + 1} (atteso 19)`)
  if (post2.pct < 90 || iBor !== 18) {
    console.log('  ⚠ VERIFICA NON SODDISFATTA: controllare il backup e il report qui sopra.')
    process.exitCode = 2
  } else {
    console.log('  OK ✓')
  }
} else {
  console.log('\nDry-run: niente scritto. Rilancia con --apply per scrivere su produzione (backup automatico prima).')
}
