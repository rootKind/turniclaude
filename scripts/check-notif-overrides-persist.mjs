// Verifica end-to-end degli override dei template (14/09/2026):
//  1. la colonna app_settings.notif_template_overrides esiste (migration 029)
//  2. PATCH di un override di prova (stesso percorso del PUT del pannello)
//  3. rilettura e confronto del valore persistito
//  4. reset a null e ricontrollo (stato pulito come prima del test)
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
const hdr = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const rest = (t, q, opt) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${q}`, { headers: hdr, ...opt })

// 1. la colonna esiste ed è leggibile
const probe = await rest('app_settings', '?select=notif_template_overrides&limit=1')
if (!probe.ok) { console.error('FALITO: colonna non leggibile (migration 029 non applicata?)'); process.exit(1) }

// 2. override di prova (chiave reale del registry, valore non-default)
const testOverride = { 'interest.title': { title: 'PROVA PERSISTENZA', body: 'Test {cognome_attore} {data}' } }
const patch = await rest('app_settings', '?id=eq.true', {
  method: 'PATCH',
  body: JSON.stringify({ notif_template_overrides: testOverride }),
})
if (!patch.ok) { console.error('FALITO PATCH:', await patch.text()); process.exit(1) }

// 3. rilettura con GET dedicato (la rappresentazione del PATCH non è usata)
const readBack = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?select=notif_template_overrides&id=eq.true`, {
  headers: { apikey: hdr.apikey, Authorization: hdr.Authorization },
})
if (!readBack.ok) { console.error('FALITO GET:', readBack.status, await readBack.text()); process.exit(1) }
const after = await readBack.json()
const saved = after?.[0]?.notif_template_overrides
if (!saved || saved['interest.title']?.title !== 'PROVA PERSISTENZA') {
  console.error('FALITO LETTURA:', JSON.stringify(saved))
  process.exit(1)
}
console.log('OK — override scritto e riletto:', JSON.stringify(saved))

// 4. reset (stato pulito) e ricontrollo
await rest('app_settings', '?id=eq.true', { method: 'PATCH', body: JSON.stringify({ notif_template_overrides: null }) })
const readReset = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?select=notif_template_overrides&id=eq.true`, {
  headers: { apikey: hdr.apikey, Authorization: hdr.Authorization },
})
const { data: reset } = await readReset.json()
console.log('OK — reset a null:', JSON.stringify(reset?.[0]?.notif_template_overrides))
