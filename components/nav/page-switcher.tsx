'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type PageSwitcherProps = {
  group?: 'cambi' | 'turni'
  className?: string
}

const OPTIONS = {
  cambi: [
    { href: '/dashboard', label: 'Cambi turno', shortLabel: 'Turno' },
    { href: '/vacanze', label: 'Cambi ferie', shortLabel: 'Ferie' },
  ],
  turni: [
    { href: '/turnisala', label: 'Turni quotidiani', shortLabel: 'Quotidiani' },
    { href: '/turniferie', label: 'Turni ferie', shortLabel: 'Ferie' },
  ],
} as const

export function PageSwitcher({ group, className }: PageSwitcherProps) {
  const pathname = usePathname()
  const activeGroup = group ?? (
    pathname === '/dashboard' || pathname === '/vacanze' ? 'cambi'
      : pathname === '/turnisala' || pathname === '/turniferie' ? 'turni'
        : null
  )

  if (!activeGroup) return null
  const options = OPTIONS[activeGroup]

  return (
    <nav
      aria-label={activeGroup === 'cambi' ? 'Tipo di cambi' : 'Tipo di turni'}
      className={cn(
        'inline-flex max-w-full items-center rounded-full border border-border/80 bg-muted/70 p-1 shadow-sm',
        className,
      )}
    >
      {options.map(option => {
        const active = pathname === option.href
        return (
          <Link
            key={option.href}
            href={option.href}
            prefetch
            aria-current={active ? 'page' : undefined}
            className={cn(
              'min-h-10 flex-1 whitespace-nowrap rounded-full px-3 text-center text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="flex h-full items-center justify-center">              <span className="sm:hidden">{option.shortLabel}</span>
              <span className="hidden sm:inline">{option.label}</span>
</span>
          </Link>
        )
      })}
    </nav>
  )
}
