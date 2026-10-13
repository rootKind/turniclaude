import { test, expect } from '@playwright/test'
import { sessionForEmployee, employeeLoginEnabled } from './employee-session'

/**
 * LE ROUTE /API RICONOSCONO ANCORA CHI SEI (13/10/2026).
 *
 * Da oggi la sessione lato server non si chiede più a Supabase: la firma del
 * token si verifica IN LOCALE (lib/supabase/local-session.ts, con le chiavi
 * pubbliche del progetto). È un cambio che tocca tutte le route insieme, quindi
 * merita un controllo che non dipenda dall'interfaccia: qui si chiamano gli
 * endpoint come li chiama l'app.
 *
 * I tre casi che contano:
 *   1. senza credenziali        → 401 (la porta resta chiusa);
 *   2. con la sessione vera     → 200 e i dati giusti (la firma locale FUNZIONA:
 *      se la verifica locale fosse rotta, qui arriverebbe 401 a tutti);
 *   3. con UN CARATTERE della firma cambiato → 401 (non basta DECODIFICARE il
 *      token: la firma è davvero controllata, e il controllo rifiuta).
 *
 * Il caso 3 manomissione è anche verificato contro Supabase (GET /auth/v1/user,
 * cioè la strada che si usava prima): così il test dice che la manomissione è
 * vera, non che il token è scaduto o malformato per altri motivi.
 *
 * Serve la service-role in `.env.local` (come gli altri test «come dipendente»):
 * senza, il file si salta invece di fallire.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

function intestazioneCookie(cookies: { name: string; value: string }[]) {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ')
}

/** Il valore intero del cookie di sessione (i pezzi lunghi viaggiano spezzati). */
function valoreCookie(cookies: { name: string; value: string }[]) {
  return cookies.map(c => c.value).join('')
}

function decodifica(valore: string) {
  return JSON.parse(
    valore.startsWith('base64-') ? Buffer.from(valore.slice(7), 'base64url').toString('utf8') : valore,
  )
}

/** Cambia UN carattere della firma: la sessione non è più genuina. */
function cookieConFirmaManomessa(cookies: { name: string; value: string }[]) {
  const intero = valoreCookie(cookies)
  const prefisso = intero.startsWith('base64-') ? 'base64-' : ''
  const json = decodifica(intero)
  const t = json.access_token as string
  const taglio = t.lastIndexOf('.')
  const firma = t.slice(taglio + 1)
  // IN MEZZO, non in fondo: gli ultimi caratteri di una base64 portano solo bit di
  // riempimento, e cambiarli può lasciare intatti i byte decodificati (firma valida).
  const k = Math.floor(firma.length / 2)
  json.access_token = t.slice(0, taglio + 1) + firma.slice(0, k) + (firma[k] === 'a' ? 'b' : 'a') + firma.slice(k + 1)
  const nuovo = prefisso
    ? prefisso + Buffer.from(JSON.stringify(json), 'utf8').toString('base64url')
    : JSON.stringify(json)
  // Un carattere cambiato non cambia la lunghezza: si rispezza come era spezzato.
  let i = 0
  return cookies.map(c => ({ name: c.name, value: nuovo.slice(i, (i += c.value.length)) }))
}

test.describe('sessione locale nelle route /api', () => {
  test.skip(!employeeLoginEnabled(), 'serve la service-role in .env.local')

  test('senza credenziali 401 · con la sessione 200 · con la firma manomessa 401', async () => {
    const sessione = await sessionForEmployee(process.env.E2E_EMAIL ?? 'Barra')
    const cookieBuoni = intestazioneCookie(sessione.cookies)

    // 1. Nessuna credenziale: la porta è chiusa.
    expect((await fetch(`${BASE}/api/changelog`)).status, 'changelog senza sessione').toBe(401)

    // 2. Sessione vera: la verifica locale riconosce la persona e i dati arrivano.
    const vera = await fetch(`${BASE}/api/changelog`, { headers: { cookie: cookieBuoni } })
    expect(vera.status, 'changelog con sessione').toBe(200)
    const corpo = await vera.json()
    expect(Array.isArray(corpo.entries), 'entries').toBe(true)
    expect(typeof corpo.lastSeenVersion, 'lastSeenVersion').toBe('number')

    // 3. Una route che usa anche user.id in una query.
    expect(
      (await fetch(`${BASE}/api/shift-compat?date=2026-10-14&offered=Notte`, { headers: { cookie: cookieBuoni } })).status,
      'shift-compat con sessione',
    ).toBe(200)
    expect(
      (await fetch(`${BASE}/api/shift-compat?date=2026-10-14&offered=Notte`)).status,
      'shift-compat senza sessione',
    ).toBe(401)

    // 4. Firma manomessa: deve cadere.
    const cookieRotti = cookieConFirmaManomessa(sessione.cookies)
    expect(
      (await fetch(`${BASE}/api/changelog`, { headers: { cookie: intestazioneCookie(cookieRotti) } })).status,
      'changelog con firma manomessa',
    ).toBe(401)

    // 4b. La manomissione è VERA: Supabase stesso rifiuta quel token.
    const tokenRotto = decodifica(valoreCookie(cookieRotti)).access_token as string
    const rete = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        authorization: `Bearer ${tokenRotto}`,
      },
    })
    // 403 `bad_jwt`: «invalid JWT … token signature is invalid» (la verifica lato
    // server non passa). L'app, che verifica in locale, risponde 401 al punto 4.
    expect(rete.status, 'Supabase rifiuta il token manomesso').toBe(403)

    // 5. La pagina protetta passa dalla stessa porta (il middleware): con la
    //    sessione si entra, senza si finisce su /login.
    const conSessione = await fetch(`${BASE}/turnisala`, { headers: { cookie: cookieBuoni }, redirect: 'manual' })
    expect(conSessione.status, '/turnisala con sessione').toBe(200)
    const senzaSessione = await fetch(`${BASE}/turnisala`, { redirect: 'manual' })
    expect(senzaSessione.status, '/turnisala senza sessione').toBe(307)
    expect(senzaSessione.headers.get('location'), 'destinazione').toContain('/login')
  })
})
