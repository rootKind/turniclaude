// Legge stato DB: utenti NEVANO + membri team. Uso: node scripts/check-nevano-state.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
let envPath = null
for (let dir = root; ; dir = path.dirname(dir)) {
  const c = path.join(dir, '.env.local')
  if (fs.existsSync(c)) { envPath = c; break }
  if (dir === path.dirname(dir)) break
}
if (!envPath) { console.error('.env.local non trovato'); process.exit(1) }
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const hdr = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const rest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, { headers: hdr }).then(r => r.json())

const users = await rest('users', '?select=id,nome,cognome&or=(cognome.ilike.*nevano*,nome.ilike.*nevano*)')
console.log('USERS:', JSON.stringify(users, null, 2))
const members = await rest('shift_team_members', '?select=id,full_name,sort_order,user_id,team_id,is_active&full_name=ilike.*NEVANO*')
console.log('MEMBERS:', JSON.stringify(members, null, 2))
