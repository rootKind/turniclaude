'use client'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { usePathname } from 'next/navigation'

export function NotificationBell() {
  const { unreadCount } = useNotificationHistory()
  const pathname = usePathname()

  if (pathname === '/notifiche') return null

  return (
    <Link
      href="/notifiche"
      className="fixed top-4 right-4 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-background border border-border shadow-sm hover:bg-muted transition-colors"
      aria-label={unreadCount > 0 ? `${unreadCount} notifiche non lette` : 'Notifiche'}
    >
      <div className="relative">
        <Bell size={20} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>
    </Link>
  )
}
