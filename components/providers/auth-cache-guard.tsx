'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clearUserCaches, LAST_USER_KEY } from '@/lib/cache'

/**
 * Wipes user-scoped caches whenever the authenticated user changes
 * (SIGNED_IN with a different id, or SIGNED_OUT). Mounted once in the
 * root layout. Without this, a shared device could show the previous
 * user's cached profile/shifts/vacations after logout → login.
 */
export function AuthCacheGuard() {
  useEffect(() => {
    let lastUserId: string | null = null
    try { lastUserId = localStorage.getItem(LAST_USER_KEY) } catch { /* ignore */ }

    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null
      if (event === 'SIGNED_OUT' || uid === null) {
        clearUserCaches()
        try { localStorage.removeItem(LAST_USER_KEY) } catch { /* ignore */ }
        lastUserId = null
        return
      }
      if (uid !== lastUserId) {
        clearUserCaches()
        try { localStorage.setItem(LAST_USER_KEY, uid) } catch { /* ignore */ }
        lastUserId = uid
      }
    })

    return () => { subscription.unsubscribe() }
  }, [])

  return null
}
