// Verifica binding completi dei due Nevano + composizione Rilievo D.
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
let envPath = null
for (let dir = root; ; dir = path.dirname(dir)) {
  const c = path.join(dir, '.env.local')
  if (fs.existsSync(c)) { envPath = c; break }
  if (dir === path.dirname(dir)) break
}
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const hdr = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const rest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, { headers: hdr }).then(r => r.json())

const pietro = 'f37103b0-fb94-47e4-84ef-43c9cfc3a9f2'
const giuseppe = 'a579530f-6a6d-4b51-a568-9b025b222efc'

const bound = await rest('shift_team_members', `?select=id,full_name,user_id,team_id&user_id=in.(${pietro},${giuseppe})`)
console.log('BOUND TO NEVANO USERS:', JSON.stringify(bound, null, 2))

const teamId = 'f4f910ff-0120-42cd-aa6e-c58da94e38c7'
const team = await rest('shift_teams', `?select=id,name,shift_type_id&id=eq.${teamId}`)
console.log('TEAM:', JSON.stringify(team, null, 2))
const mates = await rest('shift_team_members', `?select=full_name,sort_order,user_id&team_id=eq.${teamId}&order=sort_order.asc`)
console.log('MEMBERS OF TEAM:', JSON.stringify(mates, null, 2))
