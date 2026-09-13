/**
 * Genera tests/.auth-state.json da un file JSON di sessione Supabase
 * (tests/.sb-session.json, LOCALE e git-ignored: contiene token validi).
 *
 * Il file sessione è l'oggetto sessione di supabase-js ({ access_token,
 * refresh_token, user, expires_at, ... }) — nel preview lo si copia dal
 * cookie `sb-<ref>-auth-token` (JSON in base64url, prefisso «base64-»).
 *
 * Il cookie viene riscritto NEL FORMATO che @supabase/ssr usa davvero:
 * nome `sb-<ref>-auth-token`, valore `base64-<base64url(JSON)>` (il ref
 * arriva da NEXT_PUBLIC_SUPABASE_URL letto da .env.local — node non carica
 * il .env da solo). La sessione appena decodificata si ri-encoda identica,
 * così il client la rilegge byte per byte.
 *
 * Uso: node scripts/make-auth-state.mjs [percorso-sessione]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readEnvLocal(key) {
  try {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find(l => l.trim().startsWith(`${key}=`))
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : ''
  } catch {
    return ''
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvLocal('NEXT_PUBLIC_SUPABASE_URL') || ''
const REF = SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split('.')[0] : ''
const KEY = REF ? `sb-${REF}-auth-token` : 'sb-auth-token'

const sessionPath = resolve(process.argv[2] ?? 'tests/.sb-session.json')
const outPath = 'tests/.auth-state.json'

if (!existsSync(sessionPath)) {
  console.error(`File sessione non trovato: ${sessionPath}`)
  console.error('Copia lì la sessione supabase-js (dal cookie sb-<ref>-auth-token, decodificato).')
  process.exit(1)
}
const session = JSON.parse(readFileSync(sessionPath, 'utf8'))
if (!session.access_token || !session.user) {
  console.error('Il file non sembra una sessione supabase-js (mancano access_token/user).')
  process.exit(1)
}
// Cookie `base64-` + base64url del JSON (encoding di @supabase/ssr). Il
// risultato è ~2400 caratteri: entra in UN solo cookie senza chunking.
const encoded = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
const value = `base64-${encoded}`
const cookies = [
  { name: KEY, value, domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' },
]
mkdirSync('tests', { recursive: true })
writeFileSync(outPath, JSON.stringify({ cookies, origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: '__dev_bypass__', value: '1' }] }] }, null, 2))
console.log(`${outPath} scritto: cookie ${KEY} (${value.length} car), sessione di ${session.user.email ?? '???'}, scade ${new Date((session.expires_at ?? 0) * 1000).toISOString()}; PWA dev-bypass incluso`)
