// VERIFICA COPERTURA/MINIMI DEL PIANO DI OTTOBRE–NOVEMBRE 2026 — 26/09/2026.
//
// Domanda a cui risponde: applicando `scripts/piano-pattern-2026-10.json` i
// turni teorici di ottobre e novembre COPRONO i minimi di `sala_layout`?
// In particolare per i due casi scoperti dal piano:
//   · ROTONDO, che passa dalla serie di G (46 G su 84) alla rotazione
//     4/5/6/7/10 come gli altri della squadra rosa (fase 1);
//   · il POSTO VACANTE della squadra verde (fase 4), che resta scoperto: il
//     template è salvato ma nessun membro lo occupa.
//
// Il confronto è teorico-vs-minimi (non c'è PDF di novembre), quindi si
// contano le persone che il PIANO mette su ogni card e si confronta il numero
// con il minimo in vigore quel giorno e quel turno.
//
// USO
//   node scripts/verifica-minimi-piano.mjs                # ottobre + novembre
//   node scripts/verifica-minimi-piano.mjs 2026-11        # un solo mese
//   node scripts/verifica-minimi-piano.mjs 2026-10 J|M    # dettaglio di una card
import fs from 'node:fs'
import path from 'node:path'

// ── env (stessa catena di ricava-pattern-ottobre.mjs) ──────────────────────
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
if (!env?.NEXT_PUBLIC_SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('env mancanti in .env.local')
  process.exit(1)
}
const devRest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json())
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
// La PIANTINA dei minimi è quella di MAIN (produzione): su dev è indietro (una
// sola voce, dal 01/09, e senza la card J). I turni teorici invece si leggono da
// dev, che è il database che il piano andrà a scrivere.
const [layoutRow] = await mainQuery(`select layout from sala_layout where id = 1`)

// ── logica copiata da lib/ (i .ts non si importano da node) ────────────────
// lib/turni-teorici.ts → tokenForMember
// lib/shift-tokens.ts  → parseShiftCode / isShiftWorkCode / isPresentNoSection
// lib/sala-month.ts    → yellowSectionToken / yellowCardKey
// lib/sala-minimi.ts   → cardKeyOf / defaultMinFor / NIGHT_MIN_DEFAULTS /
//                        effectiveEntry / minValuesForDay
const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const gf = (a, b) => Math.round((pd(b) - pd(a)) / DAY)
const addD = (iso, n) => new Date(pd(iso) + n * DAY).toISOString().slice(0, 10)
const isoOf = (m, d) => `${m}-${String(d).padStart(2, '0')}`
const nGiorni = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()
const ordineTurno = s => (s === 'M' ? 0 : s === 'P' ? 1 : 2)
const SALA_SHIFTS = ['M', 'P', 'N']

const ABSENT_CODES = new Set(['A', 'AG', 'F', 'RM', 'RC', 'RI', 'VS', 'D'])
const NON_SECTION_DUTIES = new Set(['TUTOR'])
const isShiftWorkCode = t => { const s = (t ?? '').trim(); return /^[MNP][A-Z0-9]/.test(s) || /^[MNP]$/.test(s) || (/^[MNPmnp][a-z]/.test(s) && !/^na$/i.test(s)) }
const isPresentNoSection = t => !ABSENT_CODES.has(t) && (/^Sp[A-Za-z@]/i.test(t) || /^ISp[A-Za-z]/i.test(t) || /^N?Dis[A-Za-z]/i.test(t))
function parseShiftCode(token) {
  const shift = token[0].toUpperCase()
  const isTir = /TIR$/i.test(token)
  const raw = token.slice(1).replace(/TIR$/i, '')
  const m = raw.match(/^(\d+)([ST])?$/)
  if (m) return { shift, section: m[1], slot: m[2] ?? null, isTir }
  return { shift, section: /^[A-Za-z]+$/.test(raw) ? raw.toUpperCase() : raw, slot: null, isTir }
}
/** Chiave «SEZIONE|TURNO» della card su cui il token finisce (null se nessuna). */
function cardKeyOfToken(t) {
  const token = (t ?? '').trim()
  if (!token) return null
  if (!isShiftWorkCode(token)) return null
  if (isPresentNoSection(token)) return null
  const p = parseShiftCode(token)
  if (NON_SECTION_DUTIES.has(p.section.toUpperCase())) return null
  return `${p.section}|${p.shift}`
}
const cardKeyOf = c => c.sectionKey ?? c.title
const NIGHT_MIN_DEFAULTS = { RIC: 0, DCCM: 1, DCIF: 0, 4: 1, 5: 2, 6: 2, 7: 2, 8: 0, 9: 0, 10: 2, 11: 0, M3M40: 0, DCP: 1 }
function defaultMinFor(card, shift) {
  if (shift !== 'N') return card.type === 'double' ? 2 : 1
  const known = NIGHT_MIN_DEFAULTS[cardKeyOf(card)]
  return known ?? (card.type === 'double' ? 2 : 1)
}
const entryShift = e => e.fromShift ?? 'M'
function confronto(a, b) {
  if (a.from !== b.from) return a.from.localeCompare(b.from)
  return ordineTurno(entryShift(a)) - ordineTurno(entryShift(b))
}
function effectiveEntry(entries, dayISO, shift) {
  const ordine = ordineTurno(shift)
  let best = null
  for (const e of entries ?? []) {
    if (!e?.from || e.from > dayISO) continue
    if (e.from === dayISO && ordineTurno(entryShift(e)) > ordine) continue
    if (!best || confronto(e, best) > 0) best = e
  }
  return best
}
/** Come `minValuesForDay`, ma i periodi per casella sono ignorati: sotto sono
 *  letti e riportati, e la verifica li segnala come «da controllare a mano». */
function minValuesForDay(layout, cards, dayISO, shift) {
  const entry = effectiveEntry(layout.minimums, dayISO, shift)
  const periodi = (layout.minimumPeriods ?? []).filter(p => p?.shift === shift)
  if (!entry && !periodi.length) return null
  const keysConPeriodi = new Set(periodi.map(p => p.card))
  const out = new Map()
  for (const card of cards) {
    const key = `${cardKeyOf(card)}|${shift}`
    if (keysConPeriodi.has(cardKeyOf(card))) { out.set(key, defaultMinFor(card, shift)); continue }
    const v = entry?.values?.[key]
    out.set(key, Number.isFinite(v) ? Math.max(0, Math.round(v)) : defaultMinFor(card, shift))
  }
  return out
}
const adjustmentOffset = (adj, teamId, dateISO) => {
  let off = 0
  for (const a of adj ?? []) {
    if (a.effective_date > dateISO) continue
    if (a.scope === 'global' || a.team_id === teamId) off += a.delta_days
  }
  return off
}
function tokenForMember(type, member, teamId, adj, dateISO) {
  const anchor = addD(type.pattern_start, adjustmentOffset(adj, teamId, dateISO))
  const period = Math.max(1, member.pattern.length || type.cycle_days)
  const idx = ((gf(anchor, dateISO) % period) + period) % period
  return member.pattern[idx] ?? ''
}

// ── dati ─────────────────────────────────────────────────────────────────────
const MESE = process.argv[2] && /^\d{4}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : null
const DETTAGLIO = process.argv[2] && !MESE ? process.argv[2] : process.argv[3] ?? null
const MESI = MESE ? [MESE] : ['2026-10', '2026-11']
const piano = JSON.parse(fs.readFileSync(path.join('scripts', 'piano-pattern-2026-10.json'), 'utf8'))
const [types, teams, membriDb, adj, storico] = await Promise.all([
  devRest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active'),
  devRest('shift_teams', '?select=id,shift_type_id,name,sort_order'),
  devRest('shift_team_members', '?select=id,team_id,full_name,pattern,sort_order,is_active'),
  devRest('shift_adjustments', '?select=effective_date,delta_days,scope,team_id'),
  devRest('shift_member_patterns', '?select=member_id,from_date,pattern&order=from_date'),
])
// I cicli in vigore vengono dal DB (migration 037): è lo stato reale di dev,
// non una ricostruzione a mano.
const cicliPerMembro = new Map()
for (const r of storico ?? []) {
  const l = cicliPerMembro.get(r.member_id) ?? []
  l.push({ from_date: String(r.from_date).slice(0, 10), pattern: (r.pattern ?? []).map(String) })
  cicliPerMembro.set(r.member_id, l)
}
const patternInVigore = (m, data) => {
  let best = null
  for (const c of cicliPerMembro.get(m.id) ?? []) {
    if (c.from_date > data) continue
    if (!best || c.from_date > best.from_date) best = c
  }
  return best?.pattern ?? (m.pattern ?? []).map(String)
}
const members = membriDb
const layout = layoutRow?.layout ?? {}
const cards = layout.cards ?? []
if (!layoutRow) console.error('⚠ sala_layout non trovata su main: i minimi restano quelli di default della piantina')
else console.log(`pianta e minimi letti da MAIN · card: ${cards.length} · voci dei minimi: ${(layout.minimums ?? []).length}`)
const typeById = new Map(types.map(t => [t.id, t]))
const teamById = new Map(teams.map(t => [t.id, t]))
const aggiustamenti = (adj ?? []).filter(a => a.delta_days)
if (aggiustamenti.length) console.log(`ATTENZIONE: ${aggiustamenti.length} aggiustamenti in vigore (offset applicati): ${JSON.stringify(aggiustamenti)}`)

// ── scenari: «attuale» (dev come è) e «piano» (patterns + spostamenti) ─────
/** Applica il piano a una copia dei membri: pattern nuovi e squadra nuova. */
function scenarioConPiano(conVacante = false) {
  const out = members.map(m => ({ ...m, pattern: [...(m.pattern ?? [])], cicli: [] }))
  const perNome = new Map(out.map(m => [m.full_name, m]))
  for (const p of piano.membri) {
    const m = perNome.get(p.membro)
    if (!m) { console.log(`  ⚠ ${p.membro}: non trovato in dev, ignorato`); continue }
    m.pattern = [...p.pattern]
  }
  const teamPerNome = new Map(teams.map(t => [t.name, t]))
  for (const s of piano.spostamenti ?? []) {
    const m = perNome.get(s.membro)
    const t = teamPerNome.get(s.a)
    if (!m || !t) { console.log(`  ⚠ spostamento ${s.membro}: squadra ${s.a} non trovata, ignorato`); continue }
    m.team_id = t.id
  }
  // Il posto vacante è un TEMPLATE salvato (nessun membro lo occupa): qui lo si
  // mette a confronto come membro fantasma, per misurare quanto coprirebbe.
  if (conVacante) {
    for (const v of piano.postiVacanti ?? []) {
      const t = teamPerNome.get(v.squadra)
      if (!t) { console.log(`  ⚠ posto vacante: squadra ${v.squadra} non trovata`); continue }
      out.push({
        id: `vacante-${v.squadra}`, team_id: t.id, full_name: `VACANTE (${v.squadra})`,
        pattern: [...v.template], sort_order: 999, is_active: true,
      })
    }
  }
  return out
}
const SCENARI = {
  'dev (col DB)': members,
  'piano ovunque': scenarioConPiano(),
  'piano+vacante': scenarioConPiano(true),
}

/** Persone su ogni card in un mese: «SEZIONE|TURNO» → [nomi] per ogni giorno.
 *  `cicli = false` usa il pattern di base in colonna (l'assetto di prima),
 *  `cicli = true` usa quello in vigore nella data (migration 037). */
function copertura(membri, mese, cicli = true) {
  const giorni = []
  for (let d = 1; d <= nGiorni(mese); d++) {
    const dateISO = isoOf(mese, d)
    const perCard = new Map()
    for (const m of membri) {
      if (!m.is_active) continue
      const team = teamById.get(m.team_id)
      if (!team) continue
      const type = typeById.get(team.shift_type_id)
      if (!type?.is_active) continue
      const pattern = cicli ? patternInVigore(m, dateISO) : (m.pattern ?? []).map(String)
      if (!pattern.length) continue
      const t = tokenForMember({ ...type, pattern_start: type.pattern_start }, { pattern, patterns: [] }, team.id, adj, dateISO)
      const key = cardKeyOfToken(t)
      if (!key) continue
      const l = perCard.get(key) ?? []
      l.push(m.full_name)
      perCard.set(key, l)
    }
    giorni.push({ d, dateISO, perCard })
  }
  return giorni
}

const ordinaCard = (a, b) => a.localeCompare(b, undefined, { numeric: true })
const chiaviCard = new Set(cards.map(c => `${cardKeyOf(c)}`))

for (const scenario of ['dev (col DB)', 'piano ovunque', 'piano+vacante']) {
  const cicli = scenario === 'dev (col DB)'
  console.log(`\n${'═'.repeat(78)}\n═══ SCENARIO «${scenario.toUpperCase()}»`)
  for (const mese of MESI) {
    const giorni = copertura(SCENARI[scenario], mese, cicli)
    // min/max/medio per card
    const stat = new Map()
    for (const g of giorni) {
      for (const s of SALA_SHIFTS) {
        const mins = minValuesForDay(layout, cards, g.dateISO, s)
        if (!mins) continue
        for (const card of cards) {
          const key = `${cardKeyOf(card)}|${s}`
          const reale = (g.perCard.get(key) ?? []).length
          const min = mins.get(key) ?? 0
          if (min <= 0) continue
          const st = stat.get(key) ?? { min, sotto: 0, tot: 0, somma: 0, minReale: 99, maxReale: 0, esempi: [] }
          st.tot++; st.somma += reale
          st.minReale = Math.min(st.minReale, reale); st.maxReale = Math.max(st.maxReale, reale)
          if (reale < min) {
            st.sotto++
            if (st.esempi.length < 3) st.esempi.push(`${g.dateISO} (${reale}/${min}: ${(g.perCard.get(key) ?? []).join(', ') || 'NESSUNO'})`)
          }
          stat.set(key, st)
        }
      }
    }
    const sotto = [...stat.entries()].filter(([, st]) => st.sotto > 0).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    const sommaMancanti = sotto.reduce((acc, [, st]) => acc + st.sotto * st.min, 0)
    console.log(`\n  ── ${mese} (${giorni.length} giorni) · card sotto minimo: ${sotto.length}, somma mancanti: ${sommaMancanti}`)
    if (!sotto.length) { console.log('     ✓ nessuna card sotto il minimo'); continue }
    for (const [key, st] of sotto) {
      console.log(`     ⚠ ${key.padEnd(9)} min ${st.min} · reale ${st.minReale}–${st.maxReale} (media ${(st.somma / st.tot).toFixed(2)}) · sotto in ${st.sotto}/${st.tot} giorni`)
      for (const e of st.esempi) console.log(`        · ${e}`)
    }
  }
}

// ── dettaglio richiesto dalla riga di comando ───────────────────────────────
if (DETTAGLIO) {
  const [sez, turno] = DETTAGLIO.split('|')
  for (const scenario of ['dev (col DB)', 'piano ovunque']) {
    const cicli = scenario === 'dev (col DB)'
    console.log(`\n── ${DETTAGLIO} · scenario ${scenario}`)
    for (const mese of MESI) {
      for (const g of copertura(SCENARI[scenario], mese, cicli)) {
        const nomi = g.perCard.get(DETTAGLIO) ?? []
        console.log(`   ${g.dateISO}  ${String(nomi.length).padStart(2)}  ${nomi.join(', ')}`)
      }
    }
  }
}

// ── le due persone del piano, giorno per giorno ────────────────────────────
const SEGUITI = ['ROTONDO', 'TURCO', 'COSENZA', 'MAROTTA', 'LONI A.', 'DONZELLI']
for (const scenario of ['dev (col DB)', 'piano ovunque']) {
  const cicli = scenario === 'dev (col DB)'
  console.log(`\n${'═'.repeat(78)}\n═══ SEGUIMENTO · scenario ${scenario}`)
  for (const nome of SEGUITI) {
    const m = SCENARI[scenario].find(x => x.full_name === nome)
    if (!m) { console.log(`\n  ${nome}: non presente`); continue }
    const team = teamById.get(m.team_id)
    const perMese = MESI.map(mese => {
      const seq = []
      for (let d = 1; d <= nGiorni(mese); d++) {
        const dateISO = isoOf(mese, d)
        const pattern = cicli ? patternInVigore(m, dateISO) : (m.pattern ?? []).map(String)
        const t = tokenForMember(typeById.get(team.shift_type_id), { pattern, patterns: [] }, team.id, adj, dateISO)
        seq.push(cardKeyOfToken(t) ?? t ?? '')
      }
      return `${mese}: ${seq.join(' ')}`
    })
    console.log(`\n  ${nome} (${team.name}, ciclo ${m.pattern.length})`)
    for (const s of perMese) console.log(`   ${s}`)
  }
}
console.log('')
void chiaviCard
