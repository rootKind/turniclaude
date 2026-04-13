'use client'
import { useState, useMemo, useRef } from 'react'
import { User } from 'lucide-react'
import { useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { ShiftItem } from './shift-item'
import { EditShiftDialog } from './edit-shift-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Shift } from '@/types/database'

const MONTH_LABELS: Record<string, string> = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mag', '06': 'Giu', '07': 'Lug', '08': 'Ago',
  '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic',
}

type FilterValue = 'mine' | null | string

interface ShiftListProps {
  isSecondary?: boolean
  effectiveUserId?: string
  loggedInUserId?: string
}

export function ShiftList({ isSecondary: isSecondaryProp, effectiveUserId: effectiveUserIdProp, loggedInUserId: loggedInUserIdProp }: ShiftListProps = {}) {
  const { profile } = useCurrentUser()
  const isSecondary = isSecondaryProp !== undefined ? isSecondaryProp : (profile?.is_secondary ?? false)
  const effectiveUserId = effectiveUserIdProp ?? profile?.id ?? ''
  const loggedInUserId = loggedInUserIdProp ?? profile?.id ?? ''
  const { data: shifts = [], isLoading } = useShifts(isSecondary)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>(null)

  const touchStartX = useRef<number>(0)
  const chipBarRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const months = useMemo(() => {
    const seen = new Set<string>()
    return shifts
      .map(s => s.shift_date.slice(0, 7))
      .filter(m => { if (seen.has(m)) return false; seen.add(m); return true })
  }, [shifts])

  // Navigation sequence: 'mine', null, ...months
  const navSequence = useMemo<FilterValue[]>(() => ['mine', null, ...months], [months])

  const filtered = useMemo(() => {
    if (selectedFilter === 'mine') return shifts.filter(s => s.user_id === effectiveUserId)
    if (!selectedFilter) return shifts
    return shifts.filter(s => s.shift_date.startsWith(selectedFilter))
  }, [shifts, selectedFilter, effectiveUserId])

  const dateIndexes = useMemo(() => {
    const count = new Map<string, number>()
    return filtered.map(s => {
      const idx = count.get(s.shift_date) ?? 0
      count.set(s.shift_date, idx + 1)
      return idx
    })
  }, [filtered])

  function scrollChipIntoView(filter: FilterValue) {
    const key = filter === null ? '__tutti__' : filter
    const el = chipRefs.current.get(key)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(delta) <= 50) return

    const currentIndex = navSequence.findIndex(v => v === selectedFilter)
    let nextIndex: number

    if (delta > 0) {
      // swipe right → previous
      nextIndex = Math.max(0, currentIndex - 1)
    } else {
      // swipe left → next
      nextIndex = Math.min(navSequence.length - 1, currentIndex + 1)
    }

    if (nextIndex !== currentIndex) {
      const nextFilter = navSequence[nextIndex]
      setSelectedFilter(nextFilter)
      scrollChipIntoView(nextFilter)
    }
  }

  if (isLoading) return <ShiftListSkeleton />
  if (!shifts.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      Nessun turno disponibile. Premi + per aggiungerne uno.
    </div>
  )

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Filter chip bar — shown whenever there are shifts */}
      <div ref={chipBarRef} className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
        {/* Solo miei */}
        <button
          ref={el => { if (el) chipRefs.current.set('mine', el); else chipRefs.current.delete('mine') }}
          onClick={() => setSelectedFilter('mine')}
          className={cn(
            'flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border',
            selectedFilter === 'mine'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 border-dashed border-muted-foreground/40'
          )}
        >
          <User className="w-3 h-3" />
          Solo miei
        </button>

        {/* Tutti */}
        <button
          ref={el => { if (el) chipRefs.current.set('__tutti__', el); else chipRefs.current.delete('__tutti__') }}
          onClick={() => setSelectedFilter(null)}
          className={cn(
            'flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
            selectedFilter === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          Tutti
        </button>

        {/* Month chips */}
        {months.map(m => {
          const [year, month] = m.split('-')
          const label = `${MONTH_LABELS[month]} ${year}`
          return (
            <button
              key={m}
              ref={el => { if (el) chipRefs.current.set(m, el); else chipRefs.current.delete(m) }}
              onClick={() => setSelectedFilter(m)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
                selectedFilter === m
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-0">
        {filtered.map((shift, index) => {
          const prev = filtered[index - 1]
          const isSameDateAsPrevious = !!prev && prev.shift_date === shift.shift_date
          return (
            <ShiftItem
              key={shift.id}
              shift={shift}
              currentUserId={effectiveUserId}
              loggedInUserId={loggedInUserId}
              isSecondary={isSecondary}
              isSameDateAsPrevious={isSameDateAsPrevious}
              dateIndex={dateIndexes[index]}
              onEdit={setEditingShift}
            />
          )
        })}
      </div>

      {editingShift && (
        <EditShiftDialog
          shift={editingShift}
          open={!!editingShift}
          onClose={() => setEditingShift(null)}
          isSecondary={isSecondary}
          useAdminRoute={loggedInUserId !== editingShift.user_id && loggedInUserId !== ''}
        />
      )}
    </div>
  )
}

function ShiftListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
      ))}
    </div>
  )
}
