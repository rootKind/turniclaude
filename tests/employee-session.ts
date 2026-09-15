import { existsSync, readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

/**
 * SESSIONE DI QUALUNQUE DIPENDENTE per i test E2E (27/09/2026).
 *
 * I test «come la vedrebbe quella persona» (es. la card evidenziata col proprio
 * turno giallo) hanno bisogno della sua sessione, non di quella dell'utente di
 * test. Qui si entra SENZA leggere né toccare password:
 *
 *  1. `admin.generateLink({ type: 'magiclink' })` col service-role → token a uso
 *     singolo per l'email del dipendente (ricavata dall'anagrafica `users`);
 *  2. `verifyOtp({ type: 'magiclink', token_hash })` su un client
 *     `@supabase/ssr` con un cookie-jar in memoria → i cookie di sessione
 *     escono nel formato e nei chunk ESATTI che l'app si aspetta (stessa
 *     libreria, nessun formato da indovinare);
 *  3. i cookie si iniettano nel contesto Playwright e la pagina è autenticata.
 *
 * NB: far CONSUMARE IL LINK MAGICO AL BROWSER non funziona (atterra su
 * `/login?error=auth-error`): la route `/auth/confirm` dell'app scambia solo
 * `?code` (PKCE) mentre il link generato dal pannello admin torna coi token nel
 * fragment. Da qui il cookie-jar.
 *
 * Serve la service-role key (in `.env.local`, git-ignored): senza, qui si dice
 * chiaramente `null` e i test che la usano si SALTANO invece di fallire.
 */

/** URL dell'app sotto test: `E2E_BASE_URL` (default porta 3000 come i test esistenti). */
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

// Le variabili non stanno in `.env.e2e` (credenziali di login) ma in `.env.local`
// (chiavi Supabase): qui si leggono entrambi, senza sovrascrivere l'ambiente.
for (const file of ['.env.e2e', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

export interface Employee {
  cognome: string
  nome?: string
}

export interface EmployeeSession {
  email: string
  id: string
  cognome: string
  nome: string
  /** Cookie di sessione (nome+valore) da iniettare nel contesto Playwright. */
  cookies: Array<{ name: string; value: string }>
}

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** true se c'è la service-role: senza, i test «come dipendente» si saltano. */
export function employeeLoginEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * Email + anagrafica del dipendente. `cognome` combacia anche sui cognomi
 * composti; se `nome` è indicato disambigua gli omonimi. Passando una stringa
 * con «@» si intende direttamente l'email.
 */
export async function findEmployee(who: Employee | string): Promise<{ id: string; email: string; cognome: string; nome: string } | null> {
  const sb = admin()
  if (!sb) return null
  let id: string
  if (typeof who === 'string' && who.includes('@')) {
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const found = data?.users.find(u => u.email?.toLowerCase() === who.toLowerCase())
    if (!found) return null
    id = found.id
  } else {
    const cognome = typeof who === 'string' ? who : who.cognome
    const nome = typeof who === 'string' ? undefined : who.nome
    const { data: rows } = await sb.from('users').select('id, cognome, nome').ilike('cognome', cognome)
    const row = (rows ?? []).find(r => !nome || (r.nome ?? '').trim().toUpperCase().startsWith(nome.trim().toUpperCase())) ?? rows?.[0]
    if (!row) return null
    id = row.id
  }

  const { data: authUser } = await sb.auth.admin.getUserById(id)
  const email = authUser?.user?.email
  if (!email) return null
  const { data: profilo } = await sb.from('users').select('cognome, nome').eq('id', id).maybeSingle()
  const fallback = typeof who === 'string' && !who.includes('@') ? who : ''
  return { id, email, cognome: profilo?.cognome ?? fallback, nome: profilo?.nome ?? '' }
}

/**
 * Sessione pronta per il dipendente: crea il token (admin), lo verifica con lo
 * stesso `@supabase/ssr` dell'app e restituisce i cookie da iniettare. Lancia un
 * errore descrittivo se qualcosa manca: i test lo traducono in uno skip.
 */
export async function sessionForEmployee(who: Employee | string): Promise<EmployeeSession> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const sb = admin()
  if (!sb || !url || !anon) throw new Error('manca SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_* (.env.local): login dei dipendenti non disponibile')
  const employee = await findEmployee(who)
  if (!employee) throw new Error(`dipendente non trovato in anagrafica: ${typeof who === 'string' ? who : `${who.cognome} ${who.nome ?? ''}`.trim()}`)

  const { data: link, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email: employee.email })
  const tokenHash = link?.properties?.hashed_token
  if (error || !tokenHash) throw new Error(`link magico non generato: ${error?.message ?? 'token assente'}`)

  const jar = new Map<string, string>()
  const ssr = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: list => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const { error: otpError } = await ssr.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (otpError || !jar.size) throw new Error(`sessione non creata: ${otpError?.message ?? 'nessun cookie scritto'}`)

  return { ...employee, cookies: [...jar.entries()].map(([name, value]) => ({ name, value })) }
}

/** Cookie nel formato di `context.addCookies` per l'URL dell'app. */
export function asPlaywrightCookies(session: EmployeeSession) {
  return session.cookies.map(({ name, value }) => ({ name, value, url: E2E_BASE_URL }))
}
