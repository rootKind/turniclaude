// Diagnostica: perché il 23 settembre non è «giallo» per Minino?
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
let envPath = null
for (let dir = root; ; dir = path.dirname(dir)) {
  const c = path.join(dir, '.env.local')
  if (fs.existsSync(c)) { envPath = c; break }
}
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const base = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const get = async (table, qs) => {
  const r = await fetch(`${base}/rest/v1/${table}?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const j = await r.json()
  if (!Array.isArray(j)) { console.error('ERRORE API', table, r.status, JSON.stringify(j).slice(0, 300)); process.exit(1) }
  return j
}

const [month] = await get('sala_schedule', 'month=eq.2026-09&select=month,schedule')
const data = month.schedule
const code = i => data.codes[i ?? 0] ?? ''
const ri = data.names.findIndex(n => n.toUpperCase().includes('MININO'))
const row = data.rows[ri]
console.log('Persona:', data.names[ri])
for (let d = 18; d <= 30; d++) {
  console.log(
    String(d).padStart(2),
    'reale=' + (code(row.d[d - 1]) || '·').padEnd(6),
    'base=' + (code(row.t[d - 1]) || '·').padEnd(6),
    data.rows[ri].y?.includes(d) ? 'GIALLO' : '',
  )
}
console.log('yellow completo:', JSON.stringify(row.y ?? []))
