// Persistenza react-query su IndexedDB (richiesta 20/09/2026, fase 2 del
// cache-first): anagrafiche LENTE e RARAMENTE cambiate — utenti, albero
// squadre — sopravvivono alla chiusura dell'app: la PWA a freddo disegna
// dall'IDB e riconvalida in rete solo se scadute o su evento realtime.
//
// Perché IndexedDB: come per lib/sala-schedule-cache.ts, localStorage ha un
// tetto di ~5 MB per origine condiviso con token auth e preferenze; l'IDB è
// asincrono e capiente. DB «turni-query-cache», store unico chiave→valore.
//
// Scoping: le query anagrafiche sono IDENTICHE per ogni utente (stesso payload
// «users» e «albero squadre» per tutti gli autenticati), quindi NON serve
// namespacing per utente; clearAllLocalData rimuove comunque il DB al logout
// per non lasciare nulla al prossimo account sullo stesso dispositivo.
import type { Query, QueryKey } from '@tanstack/react-query'

const QUERY_CACHE_DB = 'turni-query-cache'
const STORE = 'kv'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(QUERY_CACHE_DB, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb()
  return new Promise<T | undefined>((resolve, reject) => {
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
  })
}

/**
 * Solo query ANAGRAFICHE: rigenerabili da una fetch, senza stato locale
 * (a differenza di shifts/vacanze che alimentano form e UI ottimistiche).
 * La whitelist è anche una barriera dimensionale: mai serializzare elenchi
 * grandi o payload one-off.
 */
const PERSISTABLE_PREFIXES: readonly string[] = ['users', 'shift-team-tree']

export function isPersistableQuery(query: Query): boolean {
  const [root] = query.queryKey
  return typeof root === 'string' && PERSISTABLE_PREFIXES.includes(root)
}

export function queryKeyToIdbKey(queryKey: QueryKey): string {
  return JSON.stringify(queryKey)
}

interface StoredEntry {
  key: string   // duplicata nel valore: getAll() restituisce SOLO i valori
  data: unknown
  at: number    // dataUpdatedAt originale: preserva la freschezza al restore
}

/** Scrive/aggiorna una voce (chiamato dal provider su fetch riuscita). */
export async function writeQueryCache(queryKey: QueryKey, data: unknown, at = Date.now()): Promise<void> {
  try {
    const key = queryKeyToIdbKey(queryKey)
    await withStore('readwrite', s => {
      s.put({ key, data, at } satisfies StoredEntry, key)
    })
  } catch { /* best effort */ }
}

/** Istantanea COMPLETA delle voci whitelist (restore all'avvio del provider). */
export async function readAllQueryCache(): Promise<Array<{ key: string; data: unknown; at: number }>> {
  try {
    const raw = (await withStore<Array<{ key: string; data: unknown; at: number }>>('readonly', s =>
      s.getAll() as IDBRequest<Array<{ key: string; data: unknown; at: number }>>)) ?? []
    return raw.filter(e => e && typeof e.key === 'string' && 'data' in e && typeof e.at === 'number')
  } catch {
    return []
  }
}

/**
 * Rimozione per PREFISSO di chiave (es. tutte le ['users',…]): il realtime
 * invalida l'albero query con lo stesso criterio. Range cursor [p, p+\\uffff].
 */
export async function removeQueryCacheByPrefix(prefixKey: QueryKey): Promise<void> {
  try {
    const prefix = JSON.stringify(prefixKey).slice(0, -1) // senza la ']' finale
    const end = prefix + '\\uffff'
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const range = IDBKeyRange.bound(prefix, end, false, true)
      const req = tx.objectStore(STORE).openCursor(range)
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

/** Cancellazione TOTALE (logout / cambio account, via clearAllLocalData). */
export async function wipeQueryCache(): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return
    await withStore('readwrite', s => { s.clear() })
  } catch { /* ignore */ }
}
