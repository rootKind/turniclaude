// Applica la migration 029 (app_settings.notif_template_overrides) tramite la
// Management API di Supabase (stessa via di apply-super-cycle per DDL leve).
// Se la Management API non è disponibile, stampa l'SQL da eseguire nell'SQL editor.
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

const projectRef = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\./)?.[1]
if (!projectRef) { console.error('REF non trovato in NEXT_PUBLIC_SUPABASE_URL'); process.exit(1) }

const SQL = `alter table public.app_settings add column if not exists notif_template_overrides jsonb;`

// 1) Prova con la Management API (richiede SUPABASE_ACCESS_TOKEN)
if (env.SUPABASE_ACCESS_TOKEN) {
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SQL }),
    })
    if (res.ok) {
      console.log('MIGRATION 029 APPLIED via Management API')
      process.exit(0)
    }
    console.error('Management API risposta', res.status, await res.text().catch(() => ''))
  } catch (err) {
    console.error('Management API errore:', err.message)
  }
}

// 2) Verifica se la colonna esiste GIÀ (service role + PostgREST su app_settings)
const hdr = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const probe = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?select=notif_template_overrides&limit=1`, { headers: hdr })
if (probe.ok) {
  console.log('MIGRATION 029 GIÀ APPLICATA (la colonna esiste ed è leggibile)')
  process.exit(0)
}

console.error('Impossibile applicare la migration automaticamente.')
console.error('Esegui nell\'SQL editor di Supabase:\n' + SQL)
process.exit(1)
