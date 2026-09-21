import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

interface EmployeeSession {
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
 * Le sessioni sono CACHATE per processo (17/09/2026): i test dello stesso file
 * chiedono piu volte la stessa persona (un candidato per test, i tre turni, i
 * due temi) e ogni giro faceva link magico + verifyOtp, cioe due andate e
 * ritorno di rete per niente. La sessione dura ~1 h: quanto basta a un run.
 */
const sessioni = new Map<string, EmployeeSession>()

/**
 * Dove i WORKER si passano le sessioni già pronte (una per dipendente): file JSON
 * di cookie a vita breve, come `tests/.auth-state.json` — cartella git-ignored.
 */
const CARTELLA_SESSIONI = 'tests/.sessions'
/** Una sessione salvata vale mezz'ora (la vita vera è ~1 h): mai riusare token scaduti. */
const VITA_SESSIONE_SALVATA_MS = 30 * 60 * 1000

function sessioneSalvata(id: string): EmployeeSession | null {
  try {
    const salvata = JSON.parse(readFileSync(`${CARTELLA_SESSIONI}/${id}.json`, 'utf8')) as { salvata: number; session: EmployeeSession }
    if (Date.now() - salvata.salvata > VITA_SESSIONE_SALVATA_MS) return null
    return salvata.session
  } catch { return null }
}

function salvaSessione(session: EmployeeSession): void {
  try {
    mkdirSync(CARTELLA_SESSIONI, { recursive: true })
    writeFileSync(`${CARTELLA_SESSIONI}/${session.id}.json`, JSON.stringify({ salvata: Date.now(), session }))
  } catch { /* cartella non scrivibile: si resta con la cache in memoria */ }
}

/**
 * LOCK fra processi per il link magico, che è a POSTO UNICO per utente.
 *
 * GoTrue tiene UNA sola `recovery_token` per persona: due worker che entrano come
 * lo STESSO dipendente si invalidano il token a vicenda — «Email link is invalid
 * or has expired», visto il 17/09/2026 appena la suite è passata a 4 worker in
 * parallelo. Con `mkdir` (atomico: fallisce se la cartella esiste) chi arriva
 * secondo aspetta, e siccome il primo SALVA la sessione, il secondo la trova già
 * pronta invece di rigenerare il link: una generazione per dipendente per run.
 * Un lock più vecchio di 30 s è di un processo morto e si butta.
 */
async function conLock<T>(nome: string, azione: () => Promise<T>): Promise<T> {
  const lock = `${CARTELLA_SESSIONI}/${nome}.lock`
  const scadenza = Date.now() + 30_000
  for (;;) {
    try {
      mkdirSync(CARTELLA_SESSIONI, { recursive: true })
      mkdirSync(lock)
      break
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 30_000) rmSync(lock, { recursive: true, force: true })
      } catch { /* il lock è sparito da solo: si ritenta */ }
      if (Date.now() > scadenza) throw new Error(`lock ${nome} non acquisito in 30 s (file ${lock} stantio?)`)
      await new Promise(r => setTimeout(r, 40 + Math.random() * 80))
    }
  }
  try { return await azione() } finally { try { rmSync(lock, { recursive: true, force: true }) } catch { /* già tolto */ } }
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
  const inMemoria = sessioni.get(employee.id)
  if (inMemoria) return inMemoria

  return conLock(`sessione-${employee.id}`, async () => {
    // Un altro worker può averla creata mentre aspettavamo il lock: la si legge
    // SUBITO (prima di generare un link che invaliderebbe il suo).
    const pronta = sessioneSalvata(employee.id) ?? (await creaSessione(sb, url, anon, employee))
    sessioni.set(employee.id, pronta)
    salvaSessione(pronta)
    return pronta
  })
}

/** Un giro completo: link magico admin + `verifyOtp` con cookie-jar in memoria. */
async function creaSessione(
  sb: SupabaseClient,
  url: string,
  anon: string,
  employee: { id: string; email: string; cognome: string; nome: string },
): Promise<EmployeeSession> {
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
