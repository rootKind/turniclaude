'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Palmtree, Settings, Plus, Lock, Calendar, Bell, CheckCheck, Trash2, X, ArrowLeftRight, Upload, History, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeedbackDialog } from '@/components/settings/feedback-dialog'
import { useNotificationHistory } from '@/hooks/use-notification-history'

interface Props {
  feedbackUnread?: number
  isAdmin?: boolean
  isManager?: boolean
}

export function BottomNav({ feedbackUnread = 0, isAdmin = false, isManager = false }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const isVacanze = pathname === '/vacanze'
  const isImpostazioni = pathname === '/impostazioni'
  const isNotifiche = pathname === '/notifiche'
  const isTurni = pathname === '/turnisala' || pathname === '/turniferie'
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [notifFabOpen, setNotifFabOpen] = useState(false)
  const [adminFabOpen, setAdminFabOpen] = useState(false)
  const [ferieAdminFabOpen, setFerieAdminFabOpen] = useState(false)
  const [turniLastPage, setTurniLastPage] = useState('/turnisala')
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  const ferieLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ferieLongPressTriggered = useRef(false)

  useEffect(() => {
    const saved = localStorage.getItem('turni-last-page')
    if (saved === '/turnisala' || saved === '/turniferie') setTurniLastPage(saved)
  }, [])

  useEffect(() => {
    if (isTurni) {
      localStorage.setItem('turni-last-page', pathname)
      setTurniLastPage(pathname)
    }
  }, [isTurni, pathname])
  const { markAllRead, clearAll, unreadCount, history } = useNotificationHistory()

  function handleTurniSalaFabPointerDown() {
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      setAdminFabOpen(v => !v)
    }, 500)
  }

  function handleTurniSalaFabPointerUp() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleTurniSalaFabClick() {
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    setAdminFabOpen(false)
    router.push('/turniferie')
  }

  function dispatchSalaAdmin(event: string) {
    document.dispatchEvent(new CustomEvent(event))
    setAdminFabOpen(false)
  }

  function handleFerieFabPointerDown() {
    ferieLongPressTriggered.current = false
    ferieLongPressTimer.current = setTimeout(() => {
      ferieLongPressTriggered.current = true
      setFerieAdminFabOpen(v => !v)
    }, 500)
  }

  function handleFerieFabPointerUp() {
    if (ferieLongPressTimer.current) {
      clearTimeout(ferieLongPressTimer.current)
      ferieLongPressTimer.current = null
    }
  }

  function handleFerieFabClick() {
    if (ferieLongPressTriggered.current) {
      ferieLongPressTriggered.current = false
      return
    }
    setFerieAdminFabOpen(false)
    router.push('/turnisala')
  }

  const leftLinks = [
    { href: '/dashboard',    icon: CalendarSwitchIcon, label: 'Cambi turno' },
    { href: '/vacanze',      icon: PalmSwitchIcon,     label: 'Cambi ferie' },
  ]
  const rightLinks = [
    { href: '/impostazioni', icon: Settings,   label: 'Impostazioni', badge: feedbackUnread },
  ]

  return (
    <>
      {/* Manager mini-fabs overlay — turnisala only (no "Modifica piantina") */}
      {pathname === '/turnisala' && isManager && !isAdmin && adminFabOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setAdminFabOpen(false)}
        >
          <div className="absolute bottom-20 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                Cronologia PDF
              </span>
              <button
                onClick={e => { e.stopPropagation(); dispatchSalaAdmin('sala-admin-history') }}
                className="w-10 h-10 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Cronologia PDF"
              >
                <History size={18} />
              </button>
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                Upload PDF
              </span>
              <button
                onClick={e => { e.stopPropagation(); dispatchSalaAdmin('sala-admin-upload') }}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90 transition-colors"
                aria-label="Upload PDF"
              >
                <Upload size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin mini-fabs overlay — turnisala only */}
      {pathname === '/turnisala' && isAdmin && adminFabOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setAdminFabOpen(false)}
        >
          <div className="absolute bottom-20 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                Modifica piantina
              </span>
              <button
                onClick={e => { e.stopPropagation(); dispatchSalaAdmin('sala-admin-edit') }}
                className="w-10 h-10 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Modifica piantina"
              >
                <Pencil size={18} />
              </button>
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                Cronologia PDF
              </span>
              <button
                onClick={e => { e.stopPropagation(); dispatchSalaAdmin('sala-admin-history') }}
                className="w-10 h-10 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
                aria-label="Cronologia PDF"
              >
                <History size={18} />
              </button>
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                Upload PDF
              </span>
              <button
                onClick={e => { e.stopPropagation(); dispatchSalaAdmin('sala-admin-upload') }}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90 transition-colors"
                aria-label="Upload PDF"
              >
                <Upload size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager mini-fabs overlay — turniferie only */}
      {pathname === '/turniferie' && isManager && !isAdmin && ferieAdminFabOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setFerieAdminFabOpen(false)}
        >
          <div className="absolute bottom-20 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                Sposta ferie
              </span>
              <button
                onClick={e => {
                  e.stopPropagation()
                  document.dispatchEvent(new CustomEvent('ferie-admin-swap'))
                  setFerieAdminFabOpen(false)
                }}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90 transition-colors"
                aria-label="Sposta dipendente tra periodi"
              >
                <ArrowLeftRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin mini-fabs overlay — turniferie only */}
      {pathname === '/turniferie' && isAdmin && ferieAdminFabOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setFerieAdminFabOpen(false)}
        >
          <div className="absolute bottom-20 left-0 right-0 flex flex-col items-center gap-3 pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 shadow-sm whitespace-nowrap">
                Sposta ferie
              </span>
              <button
                onClick={e => {
                  e.stopPropagation()
                  document.dispatchEvent(new CustomEvent('ferie-admin-swap'))
                  setFerieAdminFabOpen(false)
                }}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90 transition-colors"
                aria-label="Sposta dipendente tra periodi"
              >
                <ArrowLeftRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifiche mini-fabs overlay */}
      {isNotifiche && notifFabOpen && history.length > 0 && (
        <div className="fixed left-0 right-0 flex flex-col items-center gap-3 z-40 pointer-events-none" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 1rem)' }}>
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
                pathname === '/turnisala' && (isAdmin || isManager) ? (
                  <button
                    onPointerDown={handleTurniSalaFabPointerDown}
                    onPointerUp={handleTurniSalaFabPointerUp}
                    onPointerLeave={handleTurniSalaFabPointerUp}
                    onClick={handleTurniSalaFabClick}
                    onContextMenu={e => e.preventDefault()}
                    className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors',
                      adminFabOpen
                        ? 'bg-muted text-foreground border border-border'
                        : 'bg-primary text-primary-foreground',
                    )}
                    aria-label={adminFabOpen ? 'Chiudi menu' : 'Azioni sala'}
                  >
                    {adminFabOpen ? <X size={20} /> : <ArrowLeftRight size={20} />}
                  </button>
                ) : pathname === '/turniferie' && (isAdmin || isManager) ? (
                  <button
                    onPointerDown={handleFerieFabPointerDown}
                    onPointerUp={handleFerieFabPointerUp}
                    onPointerLeave={handleFerieFabPointerUp}
                    onClick={handleFerieFabClick}
                    onContextMenu={e => e.preventDefault()}
                    className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors',
                      ferieAdminFabOpen
                        ? 'bg-muted text-foreground border border-border'
                        : 'bg-primary text-primary-foreground',
                    )}
                    aria-label={ferieAdminFabOpen ? 'Chiudi menu' : 'Azioni ferie'}
                  >
                    {ferieAdminFabOpen ? <X size={20} /> : <ArrowLeftRight size={20} />}
                  </button>
                ) : (
                  <button
                    onClick={() => router.push(pathname === '/turnisala' ? '/turniferie' : '/turnisala')}
                    className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                    aria-label="Cambia vista turni"
                  >
                    <ArrowLeftRight size={20} />
                  </button>
                )
              ) : isVacanze ? (
                isManager ? (
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                    aria-label="Vai a cambi turno"
                  >
                    <ArrowLeftRight size={20} />
                  </button>
                ) : (
                  <Link
                    href="/vacanze?new=1"
                    className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                    aria-label="Nuova richiesta ferie"
                  >
                    <Plus size={22} />
                  </Link>
                )
              ) : (
                isManager ? (
                  <button
                    onClick={() => router.push('/vacanze')}
                    className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                    aria-label="Vai a cambi ferie"
                  >
                    <ArrowLeftRight size={20} />
                  </button>
                ) : (
                  <Link
                    href="/dashboard?new=1"
                    className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg"
                    aria-label="Nuovo turno"
                  >
                    <Plus size={22} />
                  </Link>
                )
              )}
            </div>

            <button
              onClick={() => router.push(isTurni ? (pathname === '/turnisala' ? '/turniferie' : '/turnisala') : turniLastPage)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
            >
              <div className="flex items-center gap-0.5">
                <Calendar
                  size={17}
                  strokeWidth={pathname === '/turnisala' ? 2.5 : 1.5}
                  className={pathname === '/turnisala' ? 'text-foreground' : 'text-muted-foreground'}
                />
                <span className="text-muted-foreground text-[9px] leading-none select-none">/</span>
                <Palmtree
                  size={17}
                  strokeWidth={pathname === '/turniferie' ? 2.5 : 1.5}
                  className={pathname === '/turniferie' ? 'text-foreground' : 'text-muted-foreground'}
                />
              </div>
              <span className={cn('text-[10px]', isTurni ? 'text-foreground' : 'text-muted-foreground')}>Turni</span>
            </button>

            {rightLinks.map(({ href, icon: Icon, label, badge }) => (
              <NavItem key={href} href={href} icon={Icon} label={label} badge={badge} active={pathname === href} />
            ))}
          </div>
      </nav>
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  )
}


function CalendarSwitchIcon({ size = 22, strokeWidth = 1.5 }: { size?: number; strokeWidth?: number }) {
  return (
    <span className="relative inline-block">
      <Calendar size={size} strokeWidth={strokeWidth} />
      <ArrowLeftRight size={9} strokeWidth={2.5} className="absolute -right-2 -bottom-0.5" />
    </span>
  )
}

function PalmSwitchIcon({ size = 22, strokeWidth = 1.5 }: { size?: number; strokeWidth?: number }) {
  return (
    <span className="relative inline-block">
      <Palmtree size={size} strokeWidth={strokeWidth} />
      <ArrowLeftRight size={9} strokeWidth={2.5} className="absolute -right-2 -bottom-0.5" />
    </span>
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
