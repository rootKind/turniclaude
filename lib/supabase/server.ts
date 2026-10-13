import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * La VERIFICA della sessione sta in lib/supabase/local-session.ts (un'unica
 * porta per il middleware e per le route /api). Da qui si ri-esporta perché ogni
 * chiamante abbia un solo import:
 *
 *   import { createClient, sessionUser } from '@/lib/supabase/server'
 */
export { sessionUser, type SessionUser } from './local-session'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (e) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[supabase/server] setAll suppressed:', e)
            }
          }
        },
      },
    }
  )
}
