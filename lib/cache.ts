// lib/cache.ts
// User-scoped localStorage caches. Keys are namespaced by the current user id
// so that on shared devices user B never sees user A's cached data. All caches
// are also wiped on logout / account switch (see AuthCacheGuard + handleLogout).
import { useUserStore } from '@/stores/user-store'

const CACHE_PREFIX = 'cache:'

// Persisted by AuthCacheGuard as soon as a session resolves; survives renders
// where the zustand store hasn't rehydrated yet.
export const LAST_USER_KEY = 'cache:last-user-id'

/** Synchronous current user id (or 'anon' before any session). */
export function getCacheUser(): string {
  if (typeof window === 'undefined') return 'anon'
  try {
    const last = localStorage.getItem(LAST_USER_KEY)
    if (last) return last
  } catch { /* ignore */ }
  return useUserStore.getState().profile?.id ?? 'anon'
}

/** Build a user-scoped cache key, e.g. `cache:{userId}:shifts-false`. */
export function makeCacheKey(suffix: string): string {
  return `${CACHE_PREFIX}${getCacheUser()}:${suffix}`
}

/** Remove every `cache:*` key and reset the persisted profile store. */
export function clearUserCaches(): void {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_PREFIX)) keys.push(key)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
  useUserStore.setState({ profile: null })
}
