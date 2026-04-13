'use client'
import { useState, useEffect, useCallback } from 'react'
import type { NotificationEntry } from '@/types/database'
import { readHistory, writeHistory, MAX } from '@/lib/notification-storage'

export function useNotificationHistory() {
  const [history, setHistory] = useState<NotificationEntry[]>([])

  useEffect(() => {
    setHistory(readHistory())

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

  const markAllRead = useCallback(() => {
    setHistory(prev => {
      const updated = prev.map(e => ({ ...e, read: true }))
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

  const unreadCount = history.filter(e => !e.read).length

  return { history, markAllRead, deleteEntry, clearAll, unreadCount }
}
