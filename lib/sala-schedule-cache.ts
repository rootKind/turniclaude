// Cache IndexedDB dei mesi di /turnisala (richiesta 20/09/2026): la board
// apre il mese dalla cache LOCALE e riconvalida in background — a caldo
// (PWA già aperta) zero download bloccanti, a freddo solo UNA chiamata.
//
// Perché IndexedDB e non localStorage: gli snapshot mensili possono essere
// decine di KB ciascuno e localStorage ha un tetto di ~5 MB PER ORIGINE
// condiviso con token auth e preferenze. IndexedDB è asincrono (non blocca
// il thread UI) e ha capi di centinaia di MB.
//
// Convenzioni del progetto: DB separato dal SW («turni-notifications»),
// chiavi user-scoped come lib/cache.ts (cache:{userId}:…), e pulizia in
// clearAllLocalData → wipeSalaScheduleCache() su logout/cambio account.
import type { SalaSchedule } from '@/types/database'

const SALA_SCHEDULE_DB = 'turni-sala-cache'
const STORE = 'months'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(SALA_SCHEDULE_DB, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE) // chiave: `${userId}:${month}`
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then(
    db =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const store = tx.objectStore(STORE)
        let result: T | undefined
        const req = fn(store)
        if (req) {
          req.onsuccess = () => { result = req.result }
          req.onerror = () => reject(req.error)
        }
        tx.oncomplete = () => {
          db.close()
          resolve(result)
        }
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
      }),
  )
}

/** Tutte le chiavi cache:{userId}:sala-* di QUESTO utente. */
async function ownKeys(userId: string): Promise<string[]> {
  try {
    const all = (await withStore<IDBValidKey[]>('readonly', s => s.getAllKeys())) ?? []
    const prefix = `${userId}:sala-`
    return all.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix))
  } catch {
    return []
  }
}

/** Legge il mese dalla cache; null se assente (prima visita a quel mese). */
export async function readCachedSchedule(
  userId: string,
  month: string,
): Promise<SalaSchedule | null> {
  try {
    const hit = (await withStore<CachedSchedule | undefined>(
      'readonly',
      s => s.get(`${userId}:sala-${month}`) as IDBRequest<CachedSchedule | undefined>,
    )) ?? undefined
    return hit ? hit.schedule : null
  } catch {
    return null // privacy/incognito/quota: la board riparte dalla rete
  }
}

/** Scrive/aggiorna la cache del mese dopo un fetch di rete riuscito. */
export async function writeCachedSchedule(
  userId: string,
  schedule: SalaSchedule,
): Promise<void> {
  try {
    await withStore('readwrite', s => {
      s.put({ schedule, cachedAt: Date.now() } satisfies CachedSchedule, `${userId}:sala-${schedule.month}`)
    })
  } catch { /* best effort: la UI usa comunque i dati appena scaricati */ }
}

/** Reset mirato del mese: dopo DELETE admin o realtime DELETE. */
export async function deleteCachedSchedule(userId: string, month: string): Promise<void> {
  try {
    await withStore('readwrite', s => { s.delete(`${userId}:sala-${month}`) })
  } catch { /* ignore */ }
}

/**
 * Eviction: l'upload multiplo può portare a casa mesi vecchi che restano nel
 * browser per sempre. Teniamo gli ultimi MAX_CACHED_MONTHS MESI — criterio:
 * (1) gli attuali uploaded, (2) altrimenti i mesi teorici attorno a oggi
 * (mese-1..+12, finestra di generateTheoreticalMonth). Il resto si elimina.
 */
export async function pruneSalaScheduleCache(
  userId: string,
  uploadedMonths: string[],
): Promise<void> {
  try {
    const keys = await ownKeys(userId)
    if (keys.length <= MAX_CACHED_MONTHS) return
    const keep = new Set<string>()
    for (const m of uploadedMonths) keep.add(`${userId}:sala-${m}`)
    const now = new Date()
    for (let delta = -1; delta <= 12; delta++) {
      const d = new Date(now.getFullYear(), now.getMonth() + delta, 1)
      keep.add(`${userId}:sala-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const stale = keys.filter(k => !keep.has(k))
    if (stale.length === 0) return
    await withStore('readwrite', s => { stale.forEach(k => s.delete(k)) })
  } catch { /* ignore */ }
}

/** Cancellazione TOTALE dei mesi in cache (logout / cambio account). */
export async function wipeSalaScheduleCache(): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return
    await withStore('readwrite', s => { s.clear() })
  } catch { /* ignore */ }
}

// ── Tipi (jsonb-serializzabili, nessun referenziale esterno) ─────────────────

interface CachedSchedule {
  schedule: SalaSchedule
  cachedAt: number
}

const MAX_CACHED_MONTHS = 24
