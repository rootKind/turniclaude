'use client'
import { useState, useEffect, useCallback } from 'react'
import type { NotificationEntry } from '@/types/database'

const KEY = 'notification-history'
const MAX = 50

function readHistory(): NotificationEntry[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

function writeHistory(entries: NotificationEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)))
}

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

  const unreadCount = history.filter(e => !e.read).length

  return { history, markAllRead, unreadCount }
}
