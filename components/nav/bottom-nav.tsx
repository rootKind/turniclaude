'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeftRight,
  CalendarDays,
  CheckCheck,
  GitCompareArrows,
  History,
  LayoutGrid,
  Palette,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Upload,
  UserRound,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeedbackDialog } from '@/components/settings/feedback-dialog'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { useCurrentUser } from '@/hooks/use-current-user'

interface Props {
  feedbackUnread?: number
  isAdmin?: boolean
  isManager?: boolean
}

const MANAGER_CYCLE = ['/dashboard', '/vacanze', '/turnisala', '/turniferie']

const destinations = [
  { href: '/tuoturno', label: 'Il tuo turno', icon: CalendarDays, paths: ['/tuoturno'] },
  { href: '/dashboard', label: 'Cambi turno', icon: ArrowLeftRight, paths: ['/dashboard', '/vacanze'] },
  { href: '/turnisala', label: 'Turni sala', icon: CalendarDays, paths: ['/turnisala', '/turniferie'] },
]

export function BottomNav({ feedbackUnread = 0, isAdmin = false, isManager = false }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [comparing, setComparing] = useState(false)
  const { profile } = useCurrentUser()
  const { markAllRead, clearAll, unreadCount, history } = useNotificationHistory()
  const isTuoTurno = pathname === '/tuoturno'
  const canManageSala = isAdmin || isManager

  useEffect(() => {
    const update = () => setComparing(
      typeof window !== 'undefined' && (window as { __tuoturnoCompareActive?: boolean }).__tuoturnoCompareActive === true,
    )
    update()
    document.addEventListener('tuoturno-compare-state', update)
    return () => document.removeEventListener('tuoturno-compare-state', update)
  }, [])

  const activeDestinationHref = pathname === '/vacanze' || pathname === '/turniferie' || pathname === '/turnisala' || pathname === '/dashboard'
    ? pathname
    : null

  function runPageAction(eventName: string) {
    document.dispatchEvent(new CustomEvent(eventName))
    setMenuOpen(false)
  }

  function renderActions() {
    if (isTuoTurno) {
      return <>
        <Action onClick={() => runPageAction(comparing ? 'tuoturno-exit-compare' : 'tuoturno-open-confronta')} icon={Users} label={comparing ? 'Il tuo turno' : 'Confronta i turni di più dipendenti'} />
        <Action onClick={() => runPageAction('tuoturno-open-personalizza')} icon={Palette} label="Personalizza colori e stile delle card" />
      </>
    }
    if (pathname === '/notifiche') {
      return <>
        {unreadCount > 0 && <Action onClick={() => { markAllRead(); setMenuOpen(false) }} icon={CheckCheck} label="Segna tutte come lette" />}
        {history.length > 0 && <Action onClick={() => { clearAll(); setMenuOpen(false) }} icon={Trash2} label="Elimina tutte le notifiche" destructive />}
      </>
    }
    if (pathname === '/impostazioni') {
      return <Action onClick={() => { setFeedbackOpen(true); setMenuOpen(false) }} icon={Plus} label="Invia segnalazione" />
    }
    if (pathname === '/turnisala' && canManageSala) {
      return <>
        {isAdmin && <>
          <Action onClick={() => runPageAction('sala-admin-edit')} icon={Pencil} label="Modifica piantina" />
          <Action onClick={() => runPageAction('sala-admin-theodiff')} icon={GitCompareArrows} label="Teorico ≠ reale" />
          <Action onClick={() => runPageAction('sala-admin-minimi')} icon={UserCog} label="Minimi per card" />
        </>}
        <Action onClick={() => runPageAction('sala-admin-history')} icon={History} label="Cronologia PDF" />
        <Action onClick={() => runPageAction('sala-admin-upload')} icon={Upload} label="Carica PDF" primary />
      </>
    }
    if (pathname === '/turniferie' && canManageSala) {
      return <Action onClick={() => runPageAction('ferie-admin-swap')} icon={ArrowLeftRight} label="Sposta o scambia periodi" primary />
    }
    return null
  }

  const actions = renderActions()
  const createRequestHref = isManager && !isAdmin
    ? null
    : pathname === '/dashboard' || pathname === '/turnisala' ? '/dashboard?new=1'
      : pathname === '/vacanze' || pathname === '/turniferie' ? '/vacanze?new=1'
        : null
  const managerNextPage = isManager && !isAdmin
    ? MANAGER_CYCLE[(MANAGER_CYCLE.indexOf(pathname) + 1) % MANAGER_CYCLE.length]
    : null
  const fabLabel = pathname === '/dashboard' ? 'Nuovo turno'
    : pathname === '/vacanze' ? 'Nuova richiesta ferie'
      : pathname === '/turnisala' ? (canManageSala ? 'Azioni turni sala' : 'Nuovo turno')
        : pathname === '/turniferie' ? (canManageSala ? 'Azioni turni ferie' : 'Nuova richiesta ferie')
          : isTuoTurno ? 'Azioni turno'
            : pathname === '/notifiche' ? 'Azioni notifiche'
              : pathname === '/impostazioni' ? 'Invia segnalazione'
                : 'Azioni'

  return (
    <>
      <div className="fixed left-4 top-[calc(env(safe-area-inset-top,0px)_+_0.75rem)] z-40">
        <button
          type="button"
          onClick={() => setAccountOpen(value => !value)}
          aria-label="Apri menu account e impostazioni"
          aria-expanded={accountOpen}
          className="flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {profile?.nome || profile?.cognome ? (
            <span aria-hidden="true" className="text-xs font-semibold">
              {(profile.nome?.[0] ?? profile.cognome?.[0])?.toLocaleUpperCase('it')}
            </span>
          ) : (
            <UserRound size={18} aria-hidden="true" />
          )}
        </button>
        {accountOpen && (
          <>
            <button type="button" aria-label="Chiudi menu account" className="fixed inset-0 -z-10 cursor-default" onClick={() => setAccountOpen(false)} />
            <div className="absolute left-0 top-12 flex w-56 flex-col gap-1 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
              <Link href="/impostazioni" onClick={() => setAccountOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-muted">
                <span className="relative"><Settings size={18} />{feedbackUnread > 0 && <span className="absolute -right-2 -top-2 size-2 rounded-full bg-destructive" />}</span>
                Impostazioni
              </Link>
              {isAdmin && <Link href="/admin" onClick={() => setAccountOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-muted"><UserCog size={18} />Pannello admin</Link>}
            </div>
          </>
        )}
      </div>

      {menuOpen && actions && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)_+_5.5rem)] left-1/2 flex max-h-[65dvh] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-1 overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-xl"
            onClick={event => event.stopPropagation()}
          >
            {actions}
          </div>
        </div>
      )}

      <nav
        aria-label="Navigazione principale"
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)_+_0.75rem)] left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[30rem] -translate-x-1/2 items-center gap-2"
      >
        <div className="app-liquid-surface flex min-w-0 flex-1 items-center justify-around rounded-full border border-border/70 px-1.5 py-1.5">
          {destinations.map(({ href, label, icon: Icon, paths }) => {
            const active = paths.includes(pathname)
            const target = active ? activeDestinationHref ?? href : href
            return (
              <Link
                key={href}
                href={target}
                prefetch
                aria-current={active ? 'page' : undefined}
                aria-label={label === 'Cambi turno' ? 'Cambi' : label}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon size={19} strokeWidth={active ? 2.4 : 1.7} />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            )
          })}
        </div>

        {actions ? (
          <button
            type="button"
            aria-label={menuOpen ? 'Chiudi menu' : fabLabel}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(value => !value)}
            className={cn(
              'app-liquid-fab flex size-[3.25rem] shrink-0 items-center justify-center rounded-full border border-border/70 bg-primary text-primary-foreground transition-transform hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              menuOpen && 'rotate-45',
            )}
          >
            {menuOpen ? <X size={21} /> : <LayoutGrid size={20} />}
          </button>
        ) : createRequestHref ? (
          <Link
            href={createRequestHref}
            aria-label={fabLabel}
            className="app-liquid-fab flex size-[3.25rem] shrink-0 items-center justify-center rounded-full border border-border/70 bg-primary text-primary-foreground transition-transform hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus size={22} />
          </Link>
        ) : managerNextPage ? (
          <button
            type="button"
            aria-label={fabLabel}
            onClick={() => router.push(managerNextPage)}
            className="app-liquid-fab flex size-[3.25rem] shrink-0 items-center justify-center rounded-full border border-border/70 bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeftRight size={20} />
          </button>
        ) : (
          <button type="button" aria-label={fabLabel} disabled className="app-liquid-fab flex size-[3.25rem] shrink-0 items-center justify-center rounded-full border border-border/70 bg-primary text-primary-foreground opacity-50">
            <ArrowLeftRight size={20} />
          </button>
        )}
      </nav>

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  )
}

function Action({
  onClick,
  icon: Icon,
  label,
  destructive = false,
  primary = false,
}: {
  onClick: () => void
  icon: React.ElementType
  label: string
  destructive?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors hover:bg-muted',
        destructive && 'text-destructive',
        primary && 'font-semibold text-primary',
      )}
    >
      <Icon size={18} />
      {label}
    </button>
  )
}
