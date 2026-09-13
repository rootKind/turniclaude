// Genera le INSERT dei cicli pronti (shift_cycle_templates) dai pattern ATTUALI
// dei membri in DB. Nome deterministico: etichetta della squadra (capisquadra
// uniti da '-', altrimenti nome senza «Squadra»); se una squadra ha pattern
// distinti multipli, si aggiunge « · Cognome» del primo membro (ordine alfabetico).
// L'output va incollato in supabase/migrations/025_shift_cycle_templates.sql.
// Uso: node scripts/gen-cycle-templates.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = process.cwd()
let env = {}
for (let dir = root; ; dir = path.dirname(dir)) {
  const p = path.join(dir, '.env.local')
  if (fs.existsSync(p)) {
    for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)=\$\{([^}]+)\}$/)
      if (m && env[m[2]] !== undefined) env[m[1]] = env[m[2]]
      else { const n = l.match(/^([A-Z0-9_]+)=(.*)$/); if (n) env[n[1]] = n[2].replace(/^['"]|['"]$/g, '') }
    }
    break
  }
  if (dir === path.dirname(dir)) break
}
const { createClient } = require('@supabase/supabase-js')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const [{ data: types, error: e1 }, { data: teams, error: e2 }, { data: members, error: e3 }] = await Promise.all([
  db.from('shift_types').select('id,name,cycle_days,pattern_start,is_active,sort_order').order('sort_order'),
  db.from('shift_teams').select('id,shift_type_id,name,sort_order').order('sort_order'),
  db.from('shift_team_members').select('team_id,full_name,pattern,is_lead,is_active,sort_order').order('sort_order'),
])
if (e1 || e2 || e3) {
  console.error('FETCH ERROR:', e1?.message, e2?.message, e3?.message)
  process.exit(1)
}
if (!types?.length) { console.error('Nessuna tipologia: env/key mancanti?'); process.exit(1) }

const typeById = new Map((types ?? []).map(t => [t.id, t]))
const teamsByType = new Map()
for (const t of teams ?? []) teamsByType.set(t.shift_type_id, [...(teamsByType.get(t.shift_type_id) ?? []), t])

function teamLabel(team) {
  const leads = (members ?? []).filter(m => m.team_id === team.id && m.is_lead).map(m => m.full_name)
  if (leads.length) return leads.join('-')
  return team.name.replace(/^Squadra\s+/i, '').replace(/^./, c => c.toUpperCase())
}

const lines = []
for (const t of types ?? []) {
  if (!t.is_active) continue
  const tTeams = teamsByType.get(t.id) ?? []
  for (const team of tTeams) {
    const mem = (members ?? []).filter(m => m.team_id === team.id && m.is_active)
    if (!mem.length) continue
    const uniq = new Map()
    for (const m of mem) if (!uniq.has(m.pattern.join('|'))) uniq.set(m.pattern.join('|'), m)
    for (const [pat, first] of uniq) {
      const pattern = pat.split('|')
      const suffix = uniq.size > 1 ? ` · ${first.full_name}` : ''
      const name = `${teamLabel(team)}${suffix}`
      lines.push({ type: t, teamId: team.id, name, pattern })
    }
  }
}

console.log('-- generato da scripts/gen-cycle-templates.mjs il', new Date().toISOString().slice(0, 10))
console.log()
for (const { type, teamId, name, pattern } of lines) {
  const toks = pattern.map(p => `'${p}'`).join(', ')
  console.log(`insert into public.shift_cycle_templates (shift_type_id, team_id, name, pattern, cycle_days, pattern_start, is_builtin)`)
  console.log(`select '${type.id}', '${teamId}', '${name.replace(/'/g, "''")}', array[${toks}], ${type.cycle_days}, '${type.pattern_start}', true`)
  console.log(`where not exists (select 1 from public.shift_cycle_templates where shift_type_id = '${type.id}' and name = '${name.replace(/'/g, "''")}');`)
  console.log()
}
console.log('-- templates:', lines.length)

// debug counters
console.error('DEBUG types=' + (types?.length ?? 0), 'teams=' + (teams?.length ?? 0), 'members=' + (members?.length ?? 0), 'lines=' + lines.length)
