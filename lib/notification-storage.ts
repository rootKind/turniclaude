import type { NotificationEntry } from '@/types/database'

const KEY = 'notification-history'
const MAX = 50

export function readHistory(): NotificationEntry[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function writeHistory(entries: NotificationEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)))
}

export function saveNotificationEntry(entry: NotificationEntry) {
  const current = readHistory()
  const updated = [entry, ...current].slice(0, MAX)
  writeHistory(updated)
}
