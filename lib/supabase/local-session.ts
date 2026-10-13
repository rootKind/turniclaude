import type { SupabaseClient } from '@supabase/supabase-js'
import { getProjectJwks } from './jwks'

/**
 * CHI SEI, SENZA CHIEDERE A SUPABASE (13/10/2026).
 *
 * Un'unica porta per la verifica della sessione lato server: la usano il
 * middleware e TUTTE le route /api. Prima ogni controllo era
 * `supabase.auth.getUser()` — una chiamata di rete a Supabase Auth per OGNI
 * richiesta, con Vercel (o la route) ferma ad aspettare la risposta prima di
 * fare qualsiasi altra cosa. Misurato: 70–80 ms per giro, 241 ms a freddo.
 *
 * Ora `getClaims`: il progetto firma i token con chiavi ASIMMETRICHE (ES256,
 * visto sul suo /.well-known/jwks.json), quindi la firma si verifica IN LOCALE
 * con la chiave pubblica — che sta in cache in lib/supabase/jwks.ts, perché il
 * client rinasce a ogni richiesta e la cache interna di auth-js non gli
 * sopravvive.
 *
 * Cosa NON cambia: auth-js continua a controllare la scadenza del token
 * (validateExp) e a RINNOVARE la sessione quando serve, perché anche `getClaims`
 * passa da `getSession()` — quindi il rinnovo avviene una volta ogni ora, non a
 * ogni richiesta. E i cookie riscritti continuano a viaggiare sulla risposta
 * dello stesso client.
 *
 * Sicurezza: la firma è verificata davvero, non solo decodificata — auth-js
 * importa la chiave pubblica e la confronta con crypto.subtle.verify; se non
 * torna, errore. Resta quindi lo stesso grado di fiducia di getUser: qui non si
 * «crede» a un token, lo si controlla. E se il progetto tornasse alla chiave
 * SIMMETRICA, `getClaims` ricade da solo su `getUser`: stesso esito di prima,
 * un giro di rete in più, nessun errore.
 *
 * La forma restituita è quella minima che i chiamanti usavano già — `user.id` e
 * `user.email` — così le route non cambiano nient'altro.
 */
export interface SessionUser {
  id: string
  email: string | null
}

export async function sessionUser(supabase: SupabaseClient): Promise<SessionUser | null> {
  type ClaimsOptions = NonNullable<Parameters<SupabaseClient['auth']['getClaims']>[1]>
  const jwks = await getProjectJwks()
  const options: ClaimsOptions | undefined = jwks ? { jwks: jwks as ClaimsOptions['jwks'] } : undefined
  const { data, error } = await supabase.auth.getClaims(undefined, options)
  const claims = data?.claims as { sub?: string; email?: string } | undefined
  if (error || !claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null }
}
