// SONDA: PERCHÉ UNA PERSONA NON COMPAIRE NEL TEORICO ≠ REALE (27/09/2026).
//
//   node scripts/sonda-persona.mjs [COGNOME] [YYYY-MM]
//
// Solo lettura, e calcola il confronto con il codice REALE (lib/turni-teorici.ts,
// importato davvero: nessuna reimplementazione) sui dati di PRODUZIONE. Per ogni
// giorno del mese dice: dove sta la persona nel PDF (turno/sezione reali), che
// turno le dà il teorico, e in quali righe/extra del confronto finisce — oppure
// che cosa l'ha fatta sparire.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

const QUI = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(QUI, '..')
process.env.PROBE_ROOT = ROOT
register('./_alias-loader.mjs', import.meta.url)

const { theoRealSectionCompare, normName, surnameKey, tokenForMember } = await import('../lib/turni-teorici.ts')
const { parseShiftCode, isShiftCode } = await import('../lib/shift-tokens.ts')
const { decodeSalaMonth, buildScheduleFromMonthData, isSalaMonthData } = await import('../lib/sala-month.ts')
const { buildBareOwners } = await import('../lib/shift-teams-matching.ts')
const { buildDuplicateCognomi } = await import('../lib/utils.ts')

const PROD_REF = 'zrbbzfingrdpdflkndgl'
let dir = ROOT
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
if (!env?.SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN mancante in .env.local')
  process.exit(1)
}

const q = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

const COGNOME = (process.argv[2] ?? 'SEMOLA').toUpperCase()
const MESE = process.argv[3] ?? null

const [types, teams, members, adjustments, patterns, users, mesi, layoutRow] = await Promise.all([
  q('select id, name, cycle_days, pattern_start, is_active, sort_order from shift_types order by sort_order'),
  q('select id, shift_type_id, name, phase_offset_days, sort_order from shift_teams order by sort_order'),
  q('select id, team_id, full_name, user_id, pattern, sort_order, is_active, is_lead from shift_team_members order by sort_order'),
  q('select id, effective_date, delta_days, scope, team_id, note from shift_adjustments order by effective_date'),
  q('select id, member_id, from_date, pattern, note from shift_member_patterns order by from_date'),
  q('select id, nome, cognome from users'),
  q('select month, schedule from sala_schedule order by month'),
  q('select layout from sala_layout where id = 1'),
])

// stesso albero di lib/queries/shift-teams.ts (fetchShiftTeamTree)
const cicliPerMembro = new Map()
for (const p of patterns) {
  if (!p?.member_id) continue
  const l = cicliPerMembro.get(p.member_id) ?? []
  l.push({ ...p, from_date: String(p.from_date).slice(0, 10), pattern: (p.pattern ?? []).map(String) })
  cicliPerMembro.set(p.member_id, l)
}
const tree = {
  types: types.map(t => ({
    ...t,
    teams: teams
      .filter(team => team.shift_type_id === t.id)
      .map(team => ({
        ...team,
        members: members
          .filter(m => m.team_id === team.id)
          .map(m => ({ ...m, user_id: m.user_id ?? null, pattern: (m.pattern ?? []).map(String), patterns: cicliPerMembro.get(m.id) ?? [] })),
      })),
  })),
  adjustments,
}
const cards = (layoutRow?.[0]?.layout?.cards ?? []).map(c => ({ key: c.sectionKey ?? c.title, title: c.title }))
console.log(`piantina: ${cards.length} card — ${cards.map(c => `${c.key}=${c.title}`).join(', ')}`)

const dupCognomi = buildDuplicateCognomi(users)
const bareOwners = buildBareOwners(tree, dupCognomi, users)

const membri = []
for (const t of tree.types) for (const team of t.teams) for (const m of team.members) membri.push({ ...m, squadra: team.name, tipo: t.name })
const cercati = membri.filter(m => (m.full_name ?? '').toUpperCase().includes(COGNOME))
console.log(`membri con «${COGNOME}»: ${cercati.length}`)
for (const m of cercati) {
  console.log(`  ${m.full_name}  squadra=${m.squadra} (${m.tipo})  attivo=${m.is_active}  user_id=${m.user_id ?? '—'}`)
  console.log(`    colonna  = ${(m.pattern ?? []).join(' ')}`)
  for (const h of m.patterns ?? []) console.log(`    storico dal ${h.from_date} = ${(h.pattern ?? []).join(' ')}`)
}

const senza = new Set(cercati.map(m => normName(m.full_name)))
for (const row of mesi) {
  if (MESE && row.month !== MESE) continue
  const raw = row.schedule
  if (!isSalaMonthData(raw)) {
    console.log(`${row.month}: mese v1 (niente dati compatti): salto`)
    continue
  }
  const schedule = buildScheduleFromMonthData(raw)
  const persone = decodeSalaMonth(raw)
  const giorni = Object.keys(schedule).map(Number).sort((a, b) => a - b)
  for (const day of giorni) {
    const dateISO = `${row.month}-${String(day).padStart(2, '0')}`
    // dove sta davvero nel PDF
    const reali = []
    for (const p of persone) {
      const tok = p.days[day - 1] ?? ''
      if (!tok) continue
      if (normName(p.name) === '' ) continue
      if (!((p.name ?? '').toUpperCase().includes(COGNOME))) continue
      reali.push(`${p.name}=${tok}${p.yellow?.includes(day) ? ' [GIALLA]' : ''}`)
    }
    const theo = cercati
      .filter(m => m.is_active)
      .map(m => {
        const tipo = tree.types.find(t => t.teams.some(x => x.id === m.team_id))
        const tok = tipo ? tokenForMember(tipo, m, m.team_id, adjustments, dateISO) : ''
        return `${m.full_name}=${tok || '(vuoto)'}`
      })
    if (!reali.length && !theo.some(t => !t.endsWith('(vuoto)'))) continue
    const realCodes = new Map()
    for (const p of persone) {
      const code = p.days[day - 1] ?? ''
      if (!code) continue
      const k = surnameKey(p.name)
      if (k && !realCodes.has(k)) realCodes.set(k, code)
      realCodes.set(normName(p.name), code)
    }
    const gialli = new Set(persone.filter(p => p.yellow.includes(day)).map(p => normName(p.name)))
    const cmp = theoRealSectionCompare(row.month, day, tree, adjustments, schedule[day], realCodes, bareOwners, dupCognomi, gialli)
    const dove = []
    for (const [k, v] of cmp) {
      for (const r of v.rows) if (senza.has(normName(r.name))) dove.push(`riga  ${k}  ${r.name} teo=${r.theo} reale=${r.real}`)
      for (const e of v.extras) if ((e.name ?? '').toUpperCase().includes(COGNOME)) dove.push(`extra ${k}  ${e.name} reale=${e.real} teo=${e.theo || '(nessuno)'} gruppo=${e.group ?? ''}`)
    }
    console.log(`${dateISO}  reale: ${reali.join(' | ') || '—'}   teorico: ${theo.join(' | ')}`)
    console.log(`   → ${dove.length ? dove.join(' ; ') : 'NESSUNA riga nel confronto'}`)
    if (dove.length === 0 && reali.length) {
      const tok = persone.find(p => (p.name ?? '').toUpperCase().includes(COGNOME))?.days[day - 1] ?? ''
      const parsed = isShiftCode(tok) ? parseShiftCode(tok) : null
      console.log(`   sezione reale = ${parsed ? `${parsed.shift}|${parsed.section}` : '(nessuna sezione)'} · card omonima = ${cards.filter(c => c.key === parsed?.section).map(c => c.title).join(',') || 'NESSUNA'}`)
    }
  }
}
