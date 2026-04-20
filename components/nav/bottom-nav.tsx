'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutGrid, Palmtree, Settings, Plus, Lock, Calendar, Bell, CheckCheck, Trash2, X, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeedbackDialog } from '@/components/settings/feedback-dialog'
import { useNotificationHistory } from '@/hooks/use-notification-history'

interface Props {
  feedbackUnread?: number
  isAdmin?: boolean
}

export function BottomNav({ feedbackUnread = 0, isAdmin = false }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const isVacanze = pathname === '/vacanze'
  const isImpostazioni = pathname === '/impostazioni'
  const isNotifiche = pathname === '/notifiche'
  const isTurni = pathname === '/turnisala' || pathname === '/turniferie'
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [notifFabOpen, setNotifFabOpen] = useState(false)
  const { markAllRead, clearAll, unreadCount, history } = useNotificationHistory()

  const leftLinks = [
    { href: '/dashboard',    icon: LayoutGrid, label: 'Cambi turno' },
    { href: '/vacanze',      icon: Palmtree,   label: 'Cambi ferie' },
  ]
  const rightLinks = [
    { href: '/impostazioni', icon: Settings,   label: 'Impostazioni', badge: feedbackUnread },
  ]

  return (
    <>
      {/* Notifiche mini-fabs overlay */}
      {isNotifiche && notifFabOpen && history.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 flex flex-col items-center gap-3 z-40 pointer-events-none">
          {unreadCount > 0 && (
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                Tutte lette
              </span>
              <button
                onClick={() => { markAllRead(); setNotifFabOpen(false) }}
                className="w-10 h-10 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Segna tutte come lette"
              >
                <CheckCheck size={18} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 pointer-events-auto">
            <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
              Elimina tutte
            </span>
            <button
              onClick={() => { clearAll(); setNotifFabOpen(false) }}
              className="w-10 h-10 rounded-full bg-destructive text-destructive-foreground shadow-md flex items-center justify-center hover:bg-destructive/90 transition-colors"
              aria-label="Elimina tutte"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-pb">
          <div className="flex items-stretch h-16 max-w-lg mx-auto relative">
            {leftLinks.map(({ href, icon: Icon, label }) => (
              <NavItem key={href} href={href} icon={Icon} label={label} active={pathname === href} />
            ))}

            {/* FAB center button */}
            <div className="flex-1 flex items-center justify-center">
              {isAdmin && isImpostazioni ? (
                <Link
                  href="/admin"
                  className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                  aria-label="Pannello admin"
                >
                  <Lock size={20} />
                </Link>
              ) : isImpostazioni ? (
                <button
                  onClick={() => setFeedbackOpen(true)}
                  className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                  aria-label="Nuova segnalazione"
                >
                  <Plus size={22} />
                </button>
              ) : isNotifiche ? (
                <button
                  onClick={() => history.length > 0 && setNotifFabOpen(v => !v)}
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors',
                    notifFabOpen
                      ? 'bg-muted text-foreground border border-border'
                      : 'bg-primary text-primary-foreground',
                    history.length === 0 && 'opacity-40 cursor-default',
                  )}
                  aria-label={notifFabOpen ? 'Chiudi menu' : 'Azioni notifiche'}
                >
                  {notifFabOpen ? <X size={20} /> : <Bell size={20} />}
                </button>
              ) : isTurni ? (
                <button
                  onClick={() => router.push(pathname === '/turnisala' ? '/turniferie' : '/turnisala')}
                  className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                  aria-label="Cambia vista turni"
                >
                  <ArrowLeftRight size={20} />
                </button>
              ) : isVacanze ? (
                <Link
                  href="/vacanze?new=1"
                  className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                  aria-label="Nuova richiesta ferie"
                >
                  <Plus size={22} />
                </Link>
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

            <NavItem href="/turnisala" icon={Calendar} label="Turni" active={isTurni} />

            {rightLinks.map(({ href, icon: Icon, label, badge }) => (
              <NavItem key={href} href={href} icon={Icon} label={label} badge={badge} active={pathname === href} />
            ))}
          </div>
      </nav>
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
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
