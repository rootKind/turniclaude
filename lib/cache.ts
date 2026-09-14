// lib/cache.ts
// User-scoped localStorage caches. Keys are namespaced by the current user id
// so that on shared devices user B never sees user A's cached data. All caches
// are also wiped on logout / account switch (see AuthCacheGuard + handleLogout).
import { useUserStore } from '@/stores/user-store'
import { wipeSalaScheduleCache } from '@/lib/sala-schedule-cache'
import { wipeQueryCache } from '@/lib/query-idb-cache'

const CACHE_PREFIX = 'cache:'

// Persisted by AuthCacheGuard as soon as a session resolves; survives renders
// where the zustand store hasn't rehydrated yet.
export const LAST_USER_KEY = 'cache:last-user-id'

/** Synchronous current user id (or 'anon' before any session). */
function getCacheUser(): string {
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

/**
 * Wipes ALL local browser data on logout: localStorage, sessionStorage,
 * IndexedDB (incl. la coda notifiche del service worker), Cache Storage (SW)
 * e cookie. Chiamato da handleLogout DOPO signOut, così un account diverso
 * sullo stesso dispositivo non carica mai tabelle/dati errati.
 */
export function clearAllLocalData(): void {
  if (typeof window === 'undefined') return
  try { localStorage.clear() } catch { /* ignore */ }
  try { sessionStorage.clear() } catch { /* ignore */ }
  // Cache mesi /turnisala + query anagrafiche (IndexedDB): mai lasciare i
  // dati di un utente leggibili dal successivo sullo stesso dispositivo.
  // Fire-and-forget: l'operazione IDB completa in pochi ms dopo il signOut
  // già avvenuto.
  try { void wipeSalaScheduleCache() } catch { /* ignore */ }
  try { void wipeQueryCache() } catch { /* ignore */ }
  try {
    // Cache Storage del service worker (asset statici)
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {})
    }
  } catch { /* ignore */ }
  try {
    if ('indexedDB' in window) {
      if (typeof indexedDB.databases === 'function') {
        indexedDB.databases().then(dbs =>
          Promise.all(dbs.map(d => d.name && indexedDB.deleteDatabase(d.name)))
        ).catch(() => {})
      } else {
        // Fallback per browser senza indexedDB.databases(): elimina il DB noto
        indexedDB.deleteDatabase('turni-notifications')
      }
    }
  } catch { /* ignore */ }
  try {
    document.cookie.split(';').forEach(c => {
      const eq = c.indexOf('=')
      const name = eq > -1 ? c.substring(0, eq).trim() : c.trim()
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
  } catch { /* ignore */ }
  useUserStore.setState({ profile: null })
}
