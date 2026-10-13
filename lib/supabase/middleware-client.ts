import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

/**
 * Il client Supabase del middleware: legge i cookie dalla richiesta e li
 * riscrive (rinnovo di sessione) sulla risposta.
 *
 * La verifica della sessione NON è più una chiamata di rete: la fa
 * `sessionUser()` di lib/supabase/local-session.ts, che il middleware chiama
 * subito dopo. Vedi quel file per il perché (chiavi asimmetriche ES256, firma
 * controllata in locale) e per la misura del guadagno.
 */
export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )
}
