'use client'
import { useEffect } from 'react'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { Bell, BellOff } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'

export function NotificationList() {
  const { history, markAllRead } = useNotificationHistory()

  useEffect(() => {
    markAllRead()
  }, [markAllRead])

  if (!history.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <BellOff size={40} strokeWidth={1.5} />
        <p className="text-sm">Nessuna notifica ricevuta</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {history.map(entry => (
        <div key={entry.id} className="py-3 px-1">
          <div className="flex items-start gap-3">
            <Bell size={16} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{entry.title}</p>
              <p className="text-sm text-muted-foreground">{entry.body}</p>
            </div>
            <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">
              {formatRelativeTime(new Date(entry.timestamp).toISOString())}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
