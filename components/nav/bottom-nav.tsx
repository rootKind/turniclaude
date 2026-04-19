'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Palmtree, Settings, Plus, Lock, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeedbackDialog } from '@/components/settings/feedback-dialog'

interface Props {
  feedbackUnread?: number
  isAdmin?: boolean
}

export function BottomNav({ feedbackUnread = 0, isAdmin = false }: Props) {
  const pathname = usePathname()
  const isVacanze = pathname === '/vacanze'
  const isImpostazioni = pathname === '/impostazioni'
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const leftLinks = [
    { href: '/dashboard',    icon: LayoutGrid, label: 'Turni' },
    { href: '/vacanze',      icon: Palmtree,   label: 'Ferie' },
  ]
  const rightLinks = [
    { href: '/impostazioni', icon: Settings,   label: 'Impostazioni', badge: feedbackUnread },
  ]

  return (
    <>
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

            {/* Turni placeholder */}
            <div className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground opacity-40">
              <Calendar size={22} strokeWidth={1.5} />
              <span className="text-[10px]">Turni</span>
            </div>

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
