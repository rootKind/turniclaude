'use client'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { usePathname } from 'next/navigation'
import { NotificationBadge } from '@/components/ui/notification-badge'

export function NotificationBell() {
  const { unreadCount } = useNotificationHistory()
  const pathname = usePathname()

  if (pathname === '/notifiche') return null

  return (
    <Link
      href="/notifiche"
      prefetch={true}
      className="fixed top-[calc(env(safe-area-inset-top,0px)_+_1rem)] right-4 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-background border border-border shadow-sm hover:bg-muted transition-colors"
      aria-label={unreadCount > 0 ? `${unreadCount} notifiche non lette` : 'Notifiche'}
    >
      <div className="relative">
        <Bell size={20} strokeWidth={1.5} />
        {unreadCount > 0 && (
          /* Fondo opaco «taglio» + badge: niente icona che traspare. */
          <NotificationBadge count={unreadCount} className="absolute -top-1 -right-1.5" />
        )}
      </div>
    </Link>
  )
}
