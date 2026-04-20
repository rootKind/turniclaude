'use client'
import { useState } from 'react'
import { NotificationList } from '@/components/notifications/notification-list'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { Bell, CheckCheck, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function NotifichePage() {
  const { markAllRead, clearAll, unreadCount, history } = useNotificationHistory()
  const [fabOpen, setFabOpen] = useState(false)

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <h1 className="text-lg font-bold mb-4">Notifiche</h1>
      <NotificationList />

      {history.length > 0 && (
        <div className="fixed bottom-20 right-4 flex flex-col items-end gap-3 z-40">
          {fabOpen && (
            <>
              {unreadCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                    Tutte lette
                  </span>
                  <button
                    onClick={() => { markAllRead(); setFabOpen(false) }}
                    className="w-10 h-10 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
                    aria-label="Segna tutte come lette"
                  >
                    <CheckCheck size={18} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                  Elimina tutte
                </span>
                <button
                  onClick={() => { clearAll(); setFabOpen(false) }}
                  className="w-10 h-10 rounded-full bg-destructive text-destructive-foreground shadow-md flex items-center justify-center hover:bg-destructive/90 transition-colors"
                  aria-label="Elimina tutte"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </>
          )}

          <button
            onClick={() => setFabOpen(v => !v)}
            className={cn(
              'w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors',
              fabOpen
                ? 'bg-muted text-foreground border border-border'
                : 'bg-primary text-primary-foreground',
            )}
            aria-label={fabOpen ? 'Chiudi menu' : 'Azioni notifiche'}
          >
            {fabOpen ? <X size={22} /> : <Bell size={22} />}
          </button>
        </div>
      )}
    </main>
  )
}
