// Caricamento DATI condiviso dalle sonde (sonda-persona, sonda-giorno).
//
// Lettura sola su PRODUZIONE e albero costruito come fa
// lib/queries/shift-teams.ts (fetchShiftTeamTree). Le sonde importano il
// codice REALE (lib/turni-teorici.ts) attraverso il loader `_alias-loader`,
// quindi nessuna reimplementazione del confronto.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

const QUI = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(QUI, '..')
process.env.PROBE_ROOT = ROOT
register('./_alias-loader.mjs', import.meta.url)

const PROD_REF = 'zrbbzfingrdpdflkndgl'

function leggiEnv() {
  let dir = ROOT
  for (;;) {
    const f = path.join(dir, '.env.local')
    if (fs.existsSync(f)) {
      const env = {}
      for (const riga of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
      return env
    }
    const su = path.dirname(dir)
    if (su === dir) return null
    dir = su
  }
}

const env = leggiEnv()
if (!env?.SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN mancante in .env.local')
  process.exit(1)
}

/** Query SQL in sola lettura su produzione (Management API). */
export const q = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

export const turnoTeorico = await import('../lib/turni-teorici.ts')
export const tokeni = await import('../lib/shift-tokens.ts')
export const sala = await import('../lib/sala-month.ts')
const { buildBareOwners } = await import('../lib/shift-teams-matching.ts')
const { buildDuplicateCognomi } = await import('../lib/utils.ts')

/** Tutto quello che le sonde devono guardare, letto una volta sola. */
export async function caricaDati() {
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
  const cards = (layoutRow?.[0]?.layout?.cards ?? []).map(c => ({ key: c.sectionKey ?? c.title, title: c.title, type: c.type }))
  const dupCognomi = buildDuplicateCognomi(users)
  const bareOwners = buildBareOwners(tree, dupCognomi, users)
  return { tree, cards, dupCognomi, bareOwners, users, mesi }
}

/** Membro dell'albero con quel full_name (per il turno teorico). */
export function membroDi(tree, fullName) {
  for (const t of tree.types) for (const team of t.teams) for (const m of team.members) if (m.full_name === fullName) return { tipo: t, team, m }
  return null
}
