// SQUADRE E PATTERN DI PRODUZIONE ← QUELLI DI DEV (27/09/2026).
//
// PERCHÉ ESISTE. Il merge di `dev` in `master` porta il CODICE (migrazione 037,
// `lib/turni-teorici.ts` con lo storico dei cicli, i template per slot di
// ottobre, il subentro COPPOLA↔CASTELLONE, il ciclo da 252 delle scorte di
// rilievo). Ma il codice da solo non basta: se i DATI di produzione restano
// quelli di settembre, la board mostra «≠» da ottobre in poi. Questo script
// porta su produzione what dev ha già verificato sui PDF reali.
//
// CHE COSA VIENE COPIATO, E CHE COSA NO
//  - shift_types: cycle_days e pattern_start per NOME (tipologia).
//  - shift_team_members: la COLONNA `pattern` per ID, e i membri che esistono
//    solo su dev (COPPOLA) come righe nuove. MAI user_id, is_lead, sort_order
//    dei membri esistenti: sono scelte di persona, non di asset. Sul membro
//    NUOVO si copiano i valori di dev, con user_id SEMPRE null (un membro è un
//    nominativo in squadra, non un account: CASTELLONE non ce l'ha e COPPOLA
//    non lo vuole).
//  - shift_member_patterns: TUTTO lo storico dev ← prod, per (membro, from_date).
//    È la parte che rende i mesi già chiusi intatti: la riga dal 2026-03-01
//    vale per luglio–settembre, quella dal 2026-10-01 per ottobre in poi.
//    Un ciclo vuoto (CASTELLONE dal 1° ottobre) viene copiato VERAMENTE vuoto:
//    è il modo del modello di dire «non in squadra da quella data».
//  - shift_cycle_templates: il catalogo di dev per ID (gli 82 template su
//    produzione hanno nomi diversi — uno per persona — e vengono sostituiti dai
//    88 per slot; nessuna tabella punta a questi id, quindi non si rompe
//    niente). I template che esistono solo su prod non si copiano: si
//    cancellano, e sono nel backup.
//  - MAI si tocca: `sala_layout` (i minimi per card sono giàthose di master),
//    `shifts`, `sala_schedule` (i PDF), `shift_adjustments`, gli `user_id`.
//
// VERIFICA. Per ogni mese con PDF in v2 (2026-04…2026-10) si calcola il turno
// teorico di ogni persona con la STESSA regola di `lib/turni-teorici.ts`
// (riga di storico in vigore → colonna; periodo = lunghezza del pattern del
// membro; anchor = pattern_start della tipologia + aggiustamenti cumulativi) e
// si confronta cella per cella col PDF. Il piano viene valutato in dry-run
// PRIMA di scrivere, e il risultato post-apply è confrontato con quello di
// dev: se un mese su prod fa peggio che su dev, il piano è sbagliato.
//
// USO
//   node scripts/allinea-squadre-prod.mjs            # DRY-RUN (non scrive)
//   node scripts/allinea-squadre-prod.mjs --apply    # scrive su PRODUZIONE
//   node scripts/allinea-squadre-prod.mjs --annulla  # ripristina dal backup
//   node scripts/allinea-squadre-prod.mjs --only=MAROTTA   # un membro
//
// Il token della Management API sta in .env.local come SUPABASE_ACCESS_TOKEN.
// Ref produzione «noto» (come apply-release-migrations.mjs): zrbbzfingrdpdflkndgl.
import fs from 'node:fs'
import path from 'node:path'

const PROD_REF = 'zrbbzfingrdpdflkndgl'
const APPLY = process.argv.includes('--apply')
const ANNULLA = process.argv.includes('--annulla')
const ONLY = (process.argv.find(a => a.startsWith('--only=')) ?? '').slice('--only='.length).trim().toUpperCase()
const selezionato = n => !ONLY || n.toUpperCase().includes(ONLY)
const SOGLIA = 90 // % di corrispondenza sotto la quale il post-apply è «male»

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
  return JSON.parse(t)
}
/** Più statement in un batch; ritorna il testo se la Management API si è fatta
 *  vivo qualcosa (lo statement non è transazionale con i precedenti: i chunk
 *  sono piccoli e ogni riga è indipendente dalle altre). */
async function prodExec(statements) {
  if (!statements.length) return ''
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: statements.join(';\n') + ';' }),
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`Management API ${res.status}: ${t.slice(0, 400)}`)
  return t
}

const qVal = s => `'${String(s).replace(/'/g, "''")}'`
const arrPg = a => `ARRAY[${(a ?? []).map(qVal).join(',')}]::text[]`
/** Come qVal ma per una colonna che accetta NULL (team_id, description, note). */
const qArr = s => (s === null || s === undefined || s === '') ? 'null' : qVal(s)

const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const giorniFra = (a, b) => Math.round((pd(b) - pd(a)) / DAY)
const sameArr = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
const U = s => String(s ?? '').trim().toUpperCase()

// ── ROLLBACK ────────────────────────────────────────────────────────────────
//   node scripts/allinea-squadre-prod.mjs --annulla --da=backup-squadre-prod-<ts>.json
// Utile quando un apply è stato interrotto a metà: il rollback prende per
// default il backup PIÙ RECENTE, che in quel caso non è quello integro.
const DA = (process.argv.find(a => a.startsWith('--da=')) ?? '').slice('--da='.length).trim()
const bakFiles = fs.readdirSync('scripts').filter(f => /^backup-squadre-prod-[\w-]*\d+\.json$/.test(f)).sort()
if (ANNULLA) {
  const ultimo = DA || bakFiles[bakFiles.length - 1]
  if (!ultimo || !fs.existsSync(path.join('scripts', ultimo))) { console.error('Nessun backup scripts/backup-squadre-prod-*.json: niente da ripristinare.'); process.exit(1) }
  const bak = JSON.parse(fs.readFileSync(path.join('scripts', ultimo), 'utf8'))
  console.log(`Ripristino da ${ultimo} (${bak.taken_at})`)
  const stmts = []
  // I membri creati da questo script spariscono (le righe di storico che gli
  // appartengono cadono con la cascata); per gli altri si torna al pattern
  // di prima, che è quello che i PDF di luglio–settembre descrivono.
  for (const id of bak.membri_ins ?? []) stmts.push(`delete from shift_team_members where id = ${qVal(id)}`)
  for (const m of bak.members ?? []) stmts.push(`update shift_team_members set pattern = ${arrPg(m.pattern)} where id = ${qVal(m.id)}`)
  stmts.push(`delete from shift_member_patterns`)
  for (const r of bak.patterns ?? []) {
    stmts.push(`insert into shift_member_patterns (member_id, from_date, pattern, note) values (${qVal(r.member_id)}, ${qVal(r.from_date)}, ${arrPg(r.pattern)}, ${qArr(r.note)})`)
  }
  // Il catalogo dei template è autonomo: si svuota e si rimette com'era.
  stmts.push(`delete from shift_cycle_templates`)
  for (const t of bak.templates ?? []) {
    stmts.push(`insert into shift_cycle_templates (id, shift_type_id, team_id, name, description, pattern, cycle_days, pattern_start, is_builtin)
      values (${qVal(t.id)}, ${qVal(t.shift_type_id)}, ${qArr(t.team_id)}, ${qVal(t.name)}, ${qArr(t.description)}, ${arrPg(t.pattern)}, ${t.cycle_days}, ${qVal(t.pattern_start)}, ${t.is_builtin})`)
  }
  const CHUNK = 15
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await prodExec(stmts.slice(i, i + CHUNK))
    process.stdout.write(`  ripristinato ${Math.min(i + CHUNK, stmts.length)}/${stmts.length}\n`)
  }
  console.log('Fatto. Ricontrolla con: node scripts/allinea-squadre-prod.mjs')
  process.exit(0)
}

// ── 1) lettura di entrambi i DB ─────────────────────────────────────────────
const [devTypes, devTeams, devMembers, devPatterns, devTemplates, devAdjust] = await Promise.all([
  devRest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active,sort_order&order=sort_order.asc'),
  devRest('shift_teams', '?select=id,name,shift_type_id,sort_order&order=sort_order'),
  devRest('shift_team_members', '?select=id,team_id,full_name,user_id,pattern,is_active,is_lead,sort_order&order=full_name.asc'),
  devRest('shift_member_patterns', '?select=member_id,from_date,pattern,note&order=from_date.asc'),
  devRest('shift_cycle_templates', '?select=id,shift_type_id,team_id,name,description,pattern,cycle_days,pattern_start,is_builtin&order=name'),
  devRest('shift_adjustments', '?select=team_id,effective_date,delta_days,scope'),
])
const [prodTypes, prodTeams, prodMembers, prodPatterns, prodTemplates, prodAdjust] = await Promise.all([
  prodQuery(`select id, name, cycle_days, pattern_start, is_active, sort_order from shift_types order by sort_order`),
  prodQuery(`select id, name, shift_type_id, sort_order from shift_teams order by sort_order`),
  prodQuery(`select id, team_id, full_name, user_id, pattern, is_active, is_lead, sort_order from shift_team_members order by full_name`),
  prodQuery(`select member_id, from_date, pattern, note from shift_member_patterns order by from_date`),
  prodQuery(`select id, shift_type_id, team_id, name, description, pattern, cycle_days, pattern_start, is_builtin from shift_cycle_templates order by name`),
  prodQuery(`select team_id, effective_date, delta_days, scope from shift_adjustments`),
])

console.log(`Modalità: ${APPLY ? 'APPLY (scrive su PRODUZIONE)' : 'DRY-RUN (non scrive)'}${ONLY ? ` — only=${ONLY}` : ''}`)
console.log(`dev: ${devMembers.length} membri, ${devPatterns.length} righe di storico, ${devTemplates.length} template`)
console.log(`prod: ${prodMembers.length} membri, ${prodPatterns.length} righe di storico, ${prodTemplates.length} template`)

const devTeamByName = new Map(devTeams.map(t => [U(t.name), t]))
const prodTeamByName = new Map(prodTeams.map(t => [U(t.name), t]))
const devTypeByName = new Map(devTypes.map(t => [U(t.name), t]))
const prodTypeById = new Map(prodTypes.map(t => [t.id, t]))
const devTypeById = new Map(devTypes.map(t => [t.id, t]))
const squadra = (tid, map) => [...map.values()].find(t => t.id === tid)?.name ?? tid

// ── 2) tipologie ────────────────────────────────────────────────────────────
const typeUpdates = []
for (const dt of devTypes) {
  const pt = prodTypes.find(x => U(x.name) === U(dt.name))
  if (!pt) { console.log(`⚠ tipo «${dt.name}» assente su prod: non si crea nulla (id e uuid delle tipologie sono semi di impianto)`); continue }
  if (pt.cycle_days !== dt.cycle_days || pt.pattern_start !== dt.pattern_start) {
    typeUpdates.push({ id: pt.id, name: dt.name, cycle_days: dt.cycle_days, pattern_start: dt.pattern_start, from: `${pt.cycle_days}/${pt.pattern_start}` })
  }
}

// ── 3) membri ───────────────────────────────────────────────────────────────
const prodMemberById = new Map(prodMembers.map(m => [m.id, m]))
const memberUpdates = []   // {id, name, team, pattern, len}
const memberInserts = []   // membri solo su dev
const onlyProd = []
for (const dm of devMembers) {
  const pm = prodMemberById.get(dm.id)
  if (!pm) {
    const squadraDev = devTeamByName.get(U(squadra(dm.team_id, new Map(devTeams.map(t => [t.id, t])))))
    const squadraProd = squadraDev ? prodTeamByName.get(U(squadraDev.name)) : null
    if (!squadraProd) { console.log(`⚠ ${dm.full_name} è su dev nella squadra «${squadraDev?.name}», che su prod non c'è: non si può creare il membro`); continue }
    memberInserts.push({ id: dm.id, name: dm.full_name, squadra: squadraProd.name, team_id: squadraProd.id, sort_order: dm.sort_order, is_lead: dm.is_lead, is_active: dm.is_active, hasAccount: !!dm.user_id, patternLen: dm.pattern?.length ?? 0 })
    continue
  }
  if (U(dm.full_name) !== U(pm.full_name)) {
    console.log(`⚠ id ${dm.id.slice(0, 8)}: su dev «${dm.full_name}», su prod «${pm.full_name}» — il nome NON viene toccato, si allinea solo il pattern`)
  }
  if (dm.is_active !== pm.is_active) console.log(`ℹ ${dm.full_name}: is_active dev=${dm.is_active} prod=${pm.is_active} — decisione di personale per ambiente, non si tocca`)
  if (!sameArr(dm.pattern, pm.pattern) && selezionato(dm.full_name)) {
    memberUpdates.push({ id: pm.id, name: pm.full_name, team: squadra(pm.team_id, prodTeamByName), pattern: dm.pattern, len: dm.pattern?.length ?? 0, fromLen: pm.pattern?.length ?? 0 })
  }
}
for (const pm of prodMembers) {
  if (devMembers.some(d => d.id === pm.id)) continue
  onlyProd.push(pm)
}

// ── 4) storico dei pattern ──────────────────────────────────────────────────
// Chiave: id membro su dev. Per i membri NUOVI l'id su prod non esiste ancora:
// su --apply l'inserimento restituisce l'id nuovo e la mappa si aggiorna lì.
const memberIdOnProd = new Map(devMembers.filter(d => prodMemberById.has(d.id)).map(d => [d.id, d.id]))
const patternPlan = []  // {memberIdDev, from_date, len, stato}
const prodPatternKey = new Map(prodPatterns.map(r => [`${r.member_id}|${r.from_date}`, r]))
const devPatternKeys = new Set(devPatterns.map(r => `${r.member_id}|${r.from_date}`))
for (const dp of devPatterns) {
  const pid = memberIdOnProd.get(dp.member_id)
  if (!pid) { patternPlan.push({ memberIdDev: dp.member_id, from_date: dp.from_date, len: dp.pattern?.length ?? 0, stato: 'membro non ancora su prod: verrà creato poco sopra' }); continue }
  const live = prodPatternKey.get(`${pid}|${dp.from_date}`)
  if (!live) patternPlan.push({ memberIdDev: dp.member_id, memberIdProd: pid, from_date: dp.from_date, len: dp.pattern?.length ?? 0, stato: 'NUOVA' })
  else if (!sameArr(live.pattern, dp.pattern)) patternPlan.push({ memberIdDev: dp.member_id, memberIdProd: pid, from_date: dp.from_date, len: dp.pattern?.length ?? 0, stato: `DIVERSA (prod[${live.pattern?.length ?? 0}])` })
}
const patternExtra = prodPatterns.filter(r => !devPatternKeys.has(`${r.member_id}|${r.from_date}`))
const perData = new Map()
for (const p of patternPlan) {
  const d = perData.get(p.from_date) ?? { n: 0, len: new Set() }
  d.n++
  d.len.add(p.len)
  perData.set(p.from_date, d)
}

// ── 5) catalogo dei template ────────────────────────────────────────────────
const prodTemplateById = new Map(prodTemplates.map(t => [t.id, t]))
const templateIns = []
const templateUpd = []
for (const dt of devTemplates) {
  const tipoProd = devTypeById.get(dt.shift_type_id) ? prodTypeById.get(prodTypes.find(t => U(t.name) === U(devTypeById.get(dt.shift_type_id).name))?.id) : null
  const tipoIdProd = tipoProd?.id ?? null
  if (!tipoIdProd) { console.log(`⚠ template «${dt.name}»: il tipo non esiste su prod, saltato`); continue }
  const teamIdProd = dt.team_id ? (devTeams.find(t => t.id === dt.team_id) ? prodTeamByName.get(U(devTeams.find(t => t.id === dt.team_id).name))?.id ?? null : null) : null
  const live = prodTemplateById.get(dt.id)
  const riga = { id: dt.id, name: dt.name, tipoIdProd, teamIdProd, pattern: dt.pattern, cycle_days: dt.cycle_days, pattern_start: dt.pattern_start, description: dt.description, is_builtin: dt.is_builtin }
  if (!live) { templateIns.push(riga); continue }
  if (!sameArr(live.pattern, dt.pattern) || live.cycle_days !== dt.cycle_days || live.pattern_start !== dt.pattern_start || live.team_id !== teamIdProd || live.shift_type_id !== tipoIdProd) {
    templateUpd.push({ ...riga, da: `pattern[${live.pattern?.length ?? 0}] → pattern[${dt.pattern?.length ?? 0}]` })
  }
}
const templateDel = prodTemplates.filter(t => !devTemplates.some(d => d.id === t.id))

// ── 6) report del piano ─────────────────────────────────────────────────────
console.log(`\n== TIPOLOGIE (${typeUpdates.length}) ==`)
for (const u of typeUpdates) console.log(`  ${u.name}: ${u.from} → ${u.cycle_days}/${u.pattern_start}`)

console.log(`\n== MEMBRI: colonna pattern da allineare (${memberUpdates.length}) ==`)
for (const u of memberUpdates) console.log(`  ${u.name.padEnd(16)} ${u.team.padEnd(18)} pattern[${u.fromLen}] → pattern[${u.len}]`)
console.log(`\n== MEMBRI da creare (${memberInserts.length}) ==`)
for (const u of memberInserts) console.log(`  ${u.name} in «${u.squadra}» (ordine ${u.sort_order}, account ${u.hasAccount ? 'PRESENTE → verrà creato NULL' : 'nessuno'})`)
console.log(`\n== MEMBRI solo su prod (${onlyProd.length}): NON si toccano, la loro fase resta quella di prod ==`)
for (const m of onlyProd) console.log(`  ${m.full_name} in «${squadra(m.team_id, prodTeamByName)}»`)

console.log(`\n== STORICO DEI CICLI: righe da scrivere (${patternPlan.length}) ==`)
for (const [data, d] of perData) console.log(`  dal ${data}: ${d.n} membri, lunghezze ${[...d.len].sort((a, b) => a - b).join('/')}`)
const perStato = new Map()
for (const p of patternPlan) perStato.set(p.stato.split(' ')[0], (perStato.get(p.stato.split(' ')[0]) ?? 0) + 1)
console.log(`  ${[...perStato].map(([k, v]) => `${k}: ${v}`).join(' · ')}`)
if (patternExtra.length) console.log(`  ⚠ su prod ci sono ${patternExtra.length} righe di storico che su dev non esistono: NON vengono cancellate (--annulla le ripristina), segnalate per ogni evenienza`)

console.log(`\n== TEMPLATE: ${templateIns.length} nuovi, ${templateUpd.length} aggiornati, ${templateDel.length} da prod sostituiti ==`)
for (const u of templateUpd.slice(0, 10)) console.log(`  ~ ${u.name}: ${u.da}`)
if (templateUpd.length > 10) console.log(`  …altri ${templateUpd.length - 10}`)
for (const u of templateIns.slice(0, 6)) console.log(`  + ${u.name} [${u.pattern?.length}]`)
if (templateIns.length > 6) console.log(`  …altri ${templateIns.length - 6}`)
for (const t of templateDel.slice(0, 6)) console.log(`  − ${t.name}`)
if (templateDel.length > 6) console.log(`  …altri ${templateDel.length - 6} (tutti nel backup)`)

// ── 7) verifica: il turno teorico di prod contro i PDF di prod, PRIMA e DOPO ─
// Stessa regola di lib/turni-teorici.ts: riga di storico in vigore (from_date
// più vicina non successiva) altrimenti colonna; periodo = lunghezza del
// pattern; anchor = pattern_start del tipo + aggiustamenti cumulativi.
function tokenIn(member, patterns, tipo, adjust, teamId, iso) {
  let inVigore = null
  for (const p of patterns) {
    if (p.from_date > iso) continue
    if (!inVigore || p.from_date > inVigore.from_date) inVigore = p
  }
  const pattern = inVigore?.pattern ?? member.pattern ?? []
  if (!pattern.length) return ''
  let offset = 0
  for (const a of adjust) {
    if (a.effective_date > iso) continue
    if (a.scope === 'global' || a.team_id === teamId) offset += a.delta_days
  }
  const anchor = giorniFra('1970-01-01', tipo.pattern_start) + offset
  const p = pattern.length
  return pattern[((giorniFra('1970-01-01', iso) - anchor) % p + p) % p] ?? ''
}

const pdfMesi = await prodQuery(`select month, schedule from sala_schedule where schedule->>'v' = '2' order by month`)
const pdfSeq = new Map()
for (const s of pdfMesi) {
  const d = s.schedule
  for (let i = 0; i < (d.names?.length ?? 0); i++) {
    const key = U(d.names[i])
    const seq = pdfSeq.get(key) ?? new Map()
    for (let g = 1; g <= (d.days ?? 0); g++) seq.set(`${s.month}-${String(g).padStart(2, '0')}`, d.codes?.[d.rows?.[i]?.t?.[g - 1]] ?? '')
    pdfSeq.set(key, seq)
  }
}

/** Tasso di corrispondenza su un insieme di membri con i loro pattern. */
function tasso(membri, patterns, tipi, teams, adjust, { soloMesiPieni = true } = {}) {
  const perMese = new Map()
  for (const m of membri) {
    const seq = pdfSeq.get(U(m.full_name))
    if (!seq?.size) continue
    const mio = patterns.filter(p => p.member_id === m.id)
    const team = teams.find(t => t.id === m.team_id)
    const tipo = tipi.find(t => t.id === team?.shift_type_id)
    if (!tipo) continue
    for (const [giorno, code] of seq) {
      if (!code) { if (soloMesiPieni) continue } // le celle vuote del PDF non si contano
      const mese = giorno.slice(0, 7)
      const t = perMese.get(mese) ?? { tot: 0, ok: 0 }
      t.tot++
      if (tokenIn(m, mio, tipo, adjust, m.team_id, giorno) === code) t.ok++
      perMese.set(mese, t)
    }
  }
  return perMese
}
const riepilogo = perMese => [...perMese].sort().map(([mese, t]) => `${mese} ${t.ok}/${t.tot} (${t.tot ? Math.round((1000 * t.ok) / t.tot) / 10 : 0}%)`).join('  ')

const pre = tasso(prodMembers, prodPatterns, prodTypes, prodTeams, prodAdjust)
// Lo stato DI DOPO = prod con il piano sopra applicato in memoria.
const dopoMembers = [
  ...prodMembers.map(m => {
    const u = memberUpdates.find(x => x.id === m.id)
    return u ? { ...m, pattern: u.pattern } : m
  }),
  ...memberInserts.map(u => ({ id: `NUOVO:${u.id}`, team_id: u.team_id, full_name: u.name, pattern: new Array(0) })),
]
const dopoPatterns = [
  ...prodPatterns.map(r => {
    const dp = devPatterns.find(x => x.member_id === r.member_id && x.from_date === r.from_date)
    return dp ? { ...r, pattern: dp.pattern, note: dp.note } : r
  }),
  ...patternPlan.filter(p => p.stato !== 'membro non ancora su prod: verrà creato poco sopra' && !prodPatternKey.has(`${p.memberIdProd}|${p.from_date}`))
      .map(p => ({ member_id: p.memberIdProd, from_date: p.from_date, pattern: devPatterns.find(x => x.member_id === p.memberIdDev && x.from_date === p.from_date).pattern })),
  ...devPatterns.filter(dp => !prodMemberById.has(dp.member_id) && memberInserts.some(u => u.id === dp.member_id))
      .map(dp => ({ member_id: `NUOVO:${dp.member_id}`, from_date: dp.from_date, pattern: dp.pattern })),
]
const dopo = tasso(dopoMembers, dopoPatterns, prodTypes, prodTeams, prodAdjust)

console.log(`\n== VERIFICA: turno teorico di PRODUZIONE contro i PDF di produzione ==`)
console.log(`  ADESSO : ${riepilogo(pre) || '—'}`)
console.log(`  DOPO   : ${riepilogo(dopo) || '—'}`)
// Lo stesso calcolo su dev, per avere il riferimento: se prod fa peggio di
// dev su un mese, il piano non riproduce l'asset verificato.
const devPatternsPerDev = devPatterns
const devPre = tasso(devMembers, devPatternsPerDev, devTypes, devTeams, devAdjust)
console.log(`  DEV    : ${riepilogo(devPre) || '—'}`)

const mesiPeggiori = []
for (const [mese, t] of dopo) {
  const d = devPre.get(mese)
  if (d && t.tot >= 20 && (1000 * t.ok) / t.tot < (1000 * d.ok) / d.tot - 2) mesiPeggiori.push(mese)
}
if (mesiPeggiori.length) console.log(`  ⚠ mesi su cui il piano starebbe PEGGIO che su dev: ${mesiPeggiori.join(', ')}`)
else console.log('  ✓ nessun mese sta peggio che su dev')

// ── 8) APPLY ────────────────────────────────────────────────────────────────
if (!APPLY) {
  console.log('\nDry-run: niente scritto. Rilancia con --apply per scrivere su produzione (backup automatico prima).')
  process.exit(0)
}

const bak = {
  taken_at: new Date().toISOString(),
  prod_ref: PROD_REF,
  da: 'allinea-squadre-prod.mjs',
  members: prodMembers,
  patterns: prodPatterns,
  templates: prodTemplates,
  membri_ins: memberInserts.map(u => u.id),
}
const bakPath = path.join('scripts', `backup-squadre-prod-${Date.now()}.json`)
fs.writeFileSync(bakPath, JSON.stringify(bak, null, 2))
console.log(`\nBackup scritto: ${bakPath}`)

const stmts = []
for (const u of typeUpdates) stmts.push(`update shift_types set cycle_days = ${u.cycle_days}, pattern_start = ${qVal(u.pattern_start)} where id = ${qVal(u.id)}`)
for (const u of memberUpdates) stmts.push(`update shift_team_members set pattern = ${arrPg(u.pattern)} where id = ${qVal(u.id)}`)
for (const u of memberInserts) {
  // user_id SEMPRE null: un membro è un nominativo in squadra, l'account serve
  // solo per gli omonimi, i cambi e le ferie (e COPPOLA non ce l'ha).
  stmts.push(`insert into shift_team_members (id, team_id, full_name, user_id, pattern, sort_order, is_active, is_lead)
    values (${qVal(u.id)}, ${qVal(u.team_id)}, ${qVal(u.name)}, null, ARRAY[]::text[], ${u.sort_order}, ${u.is_active}, ${u.is_lead})`)
}
// I template solo su prod escono PRIMA: il catalogo ha un unique su
// (shift_type_id, name) e le nuove righe portano gli id di dev.
for (const t of templateDel) stmts.push(`delete from shift_cycle_templates where id = ${qVal(t.id)}`)
const insTemplate = t => `insert into shift_cycle_templates (id, shift_type_id, team_id, name, description, pattern, cycle_days, pattern_start, is_builtin)
  values (${qVal(t.id)}, ${qVal(t.tipoIdProd)}, ${qArr(t.teamIdProd)}, ${qVal(t.name)}, ${qArr(t.description)}, ${arrPg(t.pattern)}, ${t.cycle_days}, ${qVal(t.pattern_start)}, ${t.is_builtin})
  on conflict (id) do update set shift_type_id = excluded.shift_type_id, team_id = excluded.team_id, name = excluded.name,
    description = excluded.description, pattern = excluded.pattern, cycle_days = excluded.cycle_days, pattern_start = excluded.pattern_start, is_builtin = excluded.is_builtin`
for (const t of [...templateUpd, ...templateIns]) stmts.push(insTemplate(t))
for (const p of patternPlan) {
  if (!p.memberIdProd) continue
  const dp = devPatterns.find(x => x.member_id === p.memberIdDev && x.from_date === p.from_date)
  stmts.push(`insert into shift_member_patterns (member_id, from_date, pattern, note) values (${qVal(p.memberIdProd)}, ${qVal(p.from_date)}, ${arrPg(dp.pattern)}, ${qArr(dp.note)})
    on conflict (member_id, from_date) do update set pattern = excluded.pattern, note = excluded.note`)
}

console.log(`Statement: ${stmts.length}`)
const CHUNK = 15
for (let i = 0; i < stmts.length; i += CHUNK) {
  await prodExec(stmts.slice(i, i + CHUNK))
  process.stdout.write(`  applicati ${Math.min(i + CHUNK, stmts.length)}/${stmts.length}\n`)
}

// storico dei membri nuovi: dopo l'insert i loro id sono quelli di dev
for (const u of memberInserts) {
  const righe = devPatterns.filter(dp => dp.member_id === u.id)
  if (!righe.length) continue
  await prodExec(righe.map(dp =>
    `insert into shift_member_patterns (member_id, from_date, pattern, note) values (${qVal(u.id)}, ${qVal(dp.from_date)}, ${arrPg(dp.pattern)}, ${qArr(dp.note)})
     on conflict (member_id, from_date) do update set pattern = excluded.pattern, note = excluded.note`))
  console.log(`  storico di ${u.name}: ${righe.length} righe`)
}

// ── 9) verifica POST sul DB vero ────────────────────────────────────────────
const [postMembers, postPatterns, postTemplates] = await Promise.all([
  prodQuery(`select id, team_id, full_name, pattern from shift_team_members`),
  prodQuery(`select member_id, from_date, pattern from shift_member_patterns`),
  prodQuery(`select id, name, pattern from shift_cycle_templates`),
])
const post = tasso(postMembers, postPatterns, prodTypes, prodTeams, prodAdjust)
console.log(`\n== POST-APPLY (DB letto dopo la scrittura) ==`)
console.log(`  ${riepilogo(post) || '—'}`)
console.log(`  membri ${postMembers.length} (dev ${devMembers.length}) · storico ${postPatterns.length} (dev ${devPatterns.length}) · template ${postTemplates.length} (dev ${devTemplates.length})`)
// Gli id dei template devono combaciare uno a uno: è la garanzia che il prossimo
// allineamento (allinea-rotazione-prod.mjs) li riconosca per id e non per nome.
const templateOrfani = postTemplates.filter(t => !devTemplates.some(d => d.id === t.id))
console.log(`  template con id diverso da dev: ${templateOrfani.length}${templateOrfani.length ? ` (${templateOrfani.slice(0, 3).map(t => t.name).join(', ')})` : ''}`)

const peggio = [...post].filter(([mese, t]) => {
  const d = devPre.get(mese)
  return t.tot >= 20 && d && (1000 * t.ok) / t.tot < (1000 * d.ok) / d.tot - 2
})
const pctPerMese = [...post.values()].filter(t => t.tot >= 20).map(t => (1000 * t.ok) / t.tot)
const pctMinimo = pctPerMese.length ? Math.min(...pctPerMese) : 100
if (peggio.length || pctMinimo < SOGLIA) {
  console.log(`  ⚠ VERIFICA NON SODDISFATTA (minimo ${Math.round(pctMinimo / 10)}%, mesi sotto dev: ${peggio.map(([m]) => m).join(', ') || 'nessuno'}).`)
  console.log(`  rollback: node scripts/allinea-squadre-prod.mjs --annulla`)
  process.exitCode = 2
} else {
  console.log(`  OK ✓ (minimo ${Math.round(pctMinimo / 10)}%)`)
}
console.log(`\nrollback: node scripts/allinea-squadre-prod.mjs --annulla`)
