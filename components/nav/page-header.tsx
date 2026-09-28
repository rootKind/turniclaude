'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PageSwitcher } from '@/components/nav/page-switcher'

type PageHeaderProps = {
  group?: 'cambi' | 'turni'
  period?: ReactNode
  datepicker?: ReactNode
  filters?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

export function PageHeader({ group, period, datepicker, filters, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-4 flex flex-col gap-3', className)}>
      {group && (
        <div className="flex min-h-11 items-center justify-center px-12">
          <PageSwitcher group={group} className="w-full max-w-sm" />
        </div>
      )}
      {(period || actions) && (
        <div className="flex min-w-0 items-center justify-between gap-2">
          {period && <div className="min-w-0 flex-1">{period}</div>}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {datepicker && <div className="min-w-0">{datepicker}</div>}
      {filters && <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>}
      {children}
    </header>
  )
}
