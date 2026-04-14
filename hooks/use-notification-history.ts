'use client'
import { useState, useEffect, useCallback } from 'react'
import type { NotificationEntry } from '@/types/database'
import { readHistory, writeHistory, MAX } from '@/lib/notification-storage'

const DB_NAME = 'turni-notifications'
const STORE_NAME = 'pending'

async function drainIDB(): Promise<NotificationEntry[]> {
  if (typeof indexedDB === 'undefined') return []
  return new Promise((resolve) => {
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
  })
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
        const updated = [entry, ...prev].slice(0, MAX)
        writeHistory(updated)
        return updated
      })
    }
    navigator.serviceWorker?.addEventListener('message', handler)
    return () => navigator.serviceWorker?.removeEventListener('message', handler)
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

  return { history, markAllRead, markEntryRead, deleteEntry, clearAll, unreadCount }
}
