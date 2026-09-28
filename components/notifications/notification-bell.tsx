'use client'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { NotificationBadge } from '@/components/ui/notification-badge'

export function NotificationBell() {
  const { unreadCount } = useNotificationHistory()
  return (
    <Link
      href="/notifiche"
      prefetch
      aria-label={unreadCount > 0 ? `${unreadCount} notifiche non lette` : 'Notifiche'}
      className="fixed right-4 top-[calc(env(safe-area-inset-top,0px)_+_0.75rem)] z-40 flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        <Bell size={19} strokeWidth={1.8} />
        {unreadCount > 0 && <NotificationBadge count={unreadCount} className="absolute -right-1 -top-1" />}
      </div>
    </Link>
  )
}
