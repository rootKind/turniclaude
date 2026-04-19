'use client'
import { NotificationList } from '@/components/notifications/notification-list'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { CheckCheck, Trash2 } from 'lucide-react'

export default function NotifichePage() {
  const { markAllRead, clearAll, unreadCount, history } = useNotificationHistory()

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">Notifiche</h1>
        {history.length > 0 && (
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Segna tutte come lette"
              >
                <CheckCheck size={15} />
                <span>Tutte lette</span>
              </button>
            )}
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Elimina tutte"
            >
              <Trash2 size={15} />
              <span>Elimina</span>
            </button>
          </div>
        )}
      </div>
      <NotificationList />
    </main>
  )
}
