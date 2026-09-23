'use client'
import { useState, useEffect, useCallback } from 'react'
import type { NotificationEntry } from '@/types/database'
import { readHistory, writeHistory, MAX, HISTORY_CHANGED_EVENT } from '@/lib/notification-storage'

const DB_NAME = 'turni-notifications'
const STORE_NAME = 'pending'

// Multiple hooks (Bell, BottomNav, List) mount simultaneously and would each drain
// IndexedDB. Share a single in-flight drain so concurrent mounts drain once;
// reset afterwards so a later mount picks up entries the SW wrote meanwhile.
let drainPromise: Promise<NotificationEntry[]> | null = null

async function drainIDB(): Promise<NotificationEntry[]> {
  if (typeof indexedDB === 'undefined') return []
  if (drainPromise) return drainPromise
  drainPromise = new Promise<NotificationEntry[]>((resolve) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getAll = store.getAll()
      getAll.onsuccess = () => {
        store.clear()
        tx.oncomplete = () => resolve(getAll.result as NotificationEntry[])
      }
      getAll.onerror = () => resolve([])
    }
    req.onerror = () => resolve([])
  }).finally(() => {
    drainPromise = null
  })
  return drainPromise
}

export function useNotificationHistory() {
  const [history, setHistory] = useState<NotificationEntry[]>([])

  const unreadCount = history.filter(e => !e.read).length

  useEffect(() => {
    // Drain any notifications saved by SW while app was closed (iOS)
    drainIDB().then(pending => {
      const current = readHistory()
      let loaded: NotificationEntry[]
      if (pending.length === 0) {
        loaded = current
      } else {
        const existingIds = new Set(current.map(e => e.id))
        const newEntries = pending.filter(e => !existingIds.has(e.id))
        loaded = [...newEntries, ...current].slice(0, MAX)
      }
      writeHistory(loaded)
      setHistory(loaded)
    })

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'PUSH_RECEIVED') return
      const entry: NotificationEntry = event.data.entry
      setHistory(prev => {
        if (prev.some(e => e.id === entry.id)) return prev
        const updated = [entry, ...prev].slice(0, MAX)
        writeHistory(updated)
        return updated
      })
    }
    navigator.serviceWorker?.addEventListener('message', handler)

    const syncHandler = () => setHistory(readHistory())
    window.addEventListener(HISTORY_CHANGED_EVENT, syncHandler)

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handler)
      window.removeEventListener(HISTORY_CHANGED_EVENT, syncHandler)
    }
  }, [])

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount).catch(() => {})
    } else {
      navigator.clearAppBadge().catch(() => {})
    }
  }, [unreadCount])

  const markAllRead = useCallback(() => {
    setHistory(prev => {
      const updated = prev.map(e => ({ ...e, read: true }))
      writeHistory(updated)
      return updated
    })
  }, [])

  const markEntryRead = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, read: true } : e)
      writeHistory(updated)
      return updated
    })
  }, [])

  const deleteEntry = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(e => e.id !== id)
      writeHistory(updated)
      return updated
    })
  }, [])

  const clearAll = useCallback(() => {
    writeHistory([])
    setHistory([])
  }, [])

  /**
   * M12 — IL RITORNO (23/09/2026).
   *
   * «Annulla» in uno snackbar ha bisogno di rimettere le cose come stavano, e
   * l'unico modo di farlo BENE è riavere l'elenco intero: ricostruire una voce
   * cancellata pezzo per pezzo (la posizione, l'ordine, le altre voci nel
   * frattempo arrivate) è il tipo di ricostruzione che sbaglia un caso su dieci —
   * la voce che torna in fondo invece che al suo posto, o che riappare letta.
   * L'istantanea la prende chi chiama, al momento del gesto: la cronologia è
   * scritta su `localStorage`, quindi rimetterla è esatto per definizione.
   */
  const ripristina = useCallback((istantanea: NotificationEntry[]) => {
    writeHistory(istantanea)
    setHistory(istantanea)
  }, [])

  return { history, markAllRead, markEntryRead, deleteEntry, clearAll, ripristina, unreadCount }
}
