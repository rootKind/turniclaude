'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Palmtree, Bell, Settings, Plus, Lock, Trash2, CheckCheck, Ellipsis } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { useState } from 'react'

interface Props {
  feedbackUnread?: number
  isAdmin?: boolean
}

export function BottomNav({ feedbackUnread = 0, isAdmin = false }: Props) {
  const pathname = usePathname()
  const { unreadCount, clearAll, markAllRead } = useNotificationHistory()
  const [fabOpen, setFabOpen] = useState(false)
  const isNotifiche = pathname === '/notifiche'

  const links = [
    { href: '/dashboard',    icon: LayoutGrid, label: 'Turni' },
    { href: '/vacanze',      icon: Palmtree,   label: 'Ferie' },
    { href: '/notifiche',    icon: Bell,       label: 'Notifiche', badge: unreadCount },
    { href: '/impostazioni', icon: Settings,   label: 'Impostazioni', badge: feedbackUnread },
  ]

  return (
    <>
      {/* Speed-dial backdrop */}
      {isNotifiche && fabOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setFabOpen(false)}
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-pb">
        <div className="flex items-stretch h-16 max-w-lg mx-auto relative">
          {links.slice(0, 2).map(({ href, icon: Icon, label, badge }) => (
            <NavItem key={href} href={href} icon={Icon} label={label} badge={badge} active={pathname === href} />
          ))}

          {/* FAB center button */}
          <div className="flex-1 flex items-center justify-center">
            {isAdmin && pathname === '/impostazioni' ? (
              <Link
                href="/admin"
                className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                aria-label="Pannello admin"
              >
                <Lock size={20} />
              </Link>
            ) : isNotifiche ? (
              <div className="relative flex items-center justify-center">
                {/* Speed-dial actions */}
                <div
                  className={cn(
                    'absolute bottom-14 flex flex-row items-end gap-3 transition-all duration-200',
                    fabOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'
                  )}
                >
                  <SpeedDialItem
                    icon={CheckCheck}
                    label="Segna lette"
                    variant="primary"
                    onClick={() => { markAllRead(); setFabOpen(false) }}
                  />
                  <SpeedDialItem
                    icon={Trash2}
                    label="Elimina"
                    variant="destructive"
                    onClick={() => { clearAll(); setFabOpen(false) }}
                  />
                </div>
                <button
                  onClick={() => setFabOpen(v => !v)}
                  className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                  aria-label="Azioni notifiche"
                >
                  <Ellipsis size={22} />
                </button>
              </div>
            ) : (
              <Link
                href="/dashboard?new=1"
                className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                aria-label="Nuovo turno"
              >
                <Plus size={22} />
              </Link>
            )}
          </div>

          {links.slice(2).map(({ href, icon: Icon, label, badge }) => (
            <NavItem key={href} href={href} icon={Icon} label={label} badge={badge} active={pathname === href} />
          ))}
        </div>
      </nav>
    </>
  )
}

function SpeedDialItem({ icon: Icon, label, variant, onClick }: {
  icon: React.ElementType
  label: string
  variant: 'destructive' | 'primary'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1"
    >
      <span className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center shadow-md',
        variant === 'destructive'
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-primary text-primary-foreground'
      )}>
        <Icon size={18} />
      </span>
      <span className="text-[10px] text-foreground whitespace-nowrap">
        {label}
      </span>
    </button>
  )
}

function NavItem({ href, icon: Icon, label, badge = 0, active }: {
  href: string; icon: React.ElementType; label: string; badge?: number; active: boolean
}) {
  return (
    <Link href={href} prefetch={true} className={cn(
      'flex-1 flex flex-col items-center justify-center gap-0.5 relative',
      active ? 'text-foreground' : 'text-muted-foreground'
    )}>
      <div className="relative">
        <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
        {badge > 0 && (
          <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className="text-[10px]">{label}</span>
    </Link>
  )
}
