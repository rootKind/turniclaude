/**
 * LE CHIAVI PUBBLICHE DEL PROGETTO (JWKS), CON CACHE IN MODULO (13/10/2026).
 *
 * Servono a verificare la firma del token IN LOCALE (`auth.getClaims`): il
 * progetto firma con chiavi asimmetriche ES256, quindi la verifica non ha
 * bisogno di chiedere niente a Supabase. Il JWKS però andrebbe scaricato a ogni
 * richiesta, perché il client si crea da zero ogni volta — nel middleware come
 * nelle route /api — e la cache interna di auth-js (10 minuti) muore con lui:
 * per questo la teniamo qui, dove sopravvive alle richieste della stessa
 * istanza.
 *
 * Se il progetto tornasse alla chiave SIMMETRICA, `getClaims` non userà queste
 * chiavi e ricadrà su `getUser` (una chiamata di rete): stesso esito di prima,
 * nessun errore. Se la fetch fallisce si restituisce `undefined` e decide lui.
 */
const JWKS_TTL_MS = 10 * 60 * 1000
let jwksCache: { keys: unknown[] } | null = null
let jwksCachedAt = 0

export async function getProjectJwks(): Promise<{ keys: unknown[] } | undefined> {
  if (jwksCache && Date.now() - jwksCachedAt < JWKS_TTL_MS) return jwksCache
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!url) return undefined
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { keys?: unknown[] }
    if (!Array.isArray(data.keys) || data.keys.length === 0) return undefined
    jwksCache = { keys: data.keys }
    jwksCachedAt = Date.now()
    return jwksCache
  } catch {
    return undefined // decide auth-js: JWKS suo, o getUser
  }
}
