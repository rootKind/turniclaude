'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
  highlightShiftId?: number
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? -32 : 32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
}

export function ShiftList({ isSecondary: isSecondaryProp, effectiveUserId: effectiveUserIdProp, loggedInUserId: loggedInUserIdProp, highlightShiftId }: ShiftListProps = {}) {
  const { profile } = useCurrentUser()
  const isSecondary = isSecondaryProp !== undefined ? isSecondaryProp : (profile?.is_secondary ?? false)
  const effectiveUserId = effectiveUserIdProp ?? profile?.id ?? ''
  const loggedInUserId = loggedInUserIdProp ?? profile?.id ?? ''
  const { data: shifts = [], isLoading } = useShifts(isSecondary)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>(null)

  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // 1 = going to previous (swipe right), -1 = going to next (swipe left)
  const swipeDirection = useRef<1 | -1>(-1)

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

  const hasOwnShifts = useMemo(() => shifts.some(s => s.user_id === effectiveUserId), [shifts, effectiveUserId])
  const showChipBar = months.length > 1 || hasOwnShifts

  // Show all shifts so the highlighted one is visible
  useEffect(() => {
    if (highlightShiftId) setSelectedFilter(null)
  }, [highlightShiftId])

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

  function navigateTo(newFilter: FilterValue) {
    const newIndex = navSequence.findIndex(v => v === newFilter)
    const currentIndex = navSequence.findIndex(v => v === selectedFilter)
    swipeDirection.current = newIndex > currentIndex ? -1 : 1
    setSelectedFilter(newFilter)
    scrollChipIntoView(newFilter)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const deltaY = e.changedTouches[0].clientY - touchStartY.current
    // Don't trigger if the motion is more vertical than horizontal
    if (Math.abs(deltaX) <= 50 || Math.abs(deltaY) > Math.abs(deltaX)) return

    const currentIndex = navSequence.findIndex(v => v === selectedFilter)
    let nextIndex: number

    if (deltaX > 0) {
      // swipe right → previous
      nextIndex = Math.max(0, currentIndex - 1)
    } else {
      // swipe left → next
      nextIndex = Math.min(navSequence.length - 1, currentIndex + 1)
    }

    if (nextIndex !== currentIndex) {
      swipeDirection.current = deltaX > 0 ? 1 : -1
      const nextFilter = navSequence[nextIndex]
      setSelectedFilter(nextFilter)
      scrollChipIntoView(nextFilter)
    } else {
      // At boundary — ensure the chip is still scrolled into view
      scrollChipIntoView(selectedFilter)
    }
  }

  if (isLoading) return <ShiftListSkeleton />
  if (!shifts.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      Nessun turno disponibile. Premi + per aggiungerne uno.
    </div>
  )

  return (
    <div>
      {/* Filter chip bar */}
      {showChipBar && <div
        className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar"
      >
        {/* Solo miei */}
        <button
          ref={el => { if (el) chipRefs.current.set('mine', el); else chipRefs.current.delete('mine') }}
          onClick={() => navigateTo('mine')}
          className={cn(
            'flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border',
            selectedFilter === 'mine'
              ? 'chip-selected'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 border-dashed border-muted-foreground/40'
          )}
        >
          <User className="w-3 h-3" />
          Solo miei
        </button>

        {/* Tutti */}
        <button
          ref={el => { if (el) chipRefs.current.set('__tutti__', el); else chipRefs.current.delete('__tutti__') }}
          onClick={() => navigateTo(null)}
          className={cn(
            'flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
            selectedFilter === null
              ? 'chip-selected'
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
              onClick={() => navigateTo(m)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
                selectedFilter === m
                  ? 'chip-selected'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>}

      <div
        className="overflow-hidden min-h-[60vh]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait" custom={swipeDirection.current}>
          <motion.div
            key={selectedFilter ?? '__tutti__'}
            custom={swipeDirection.current}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex flex-col gap-0"
          >
            {filtered.map((shift, index) => {
              const prev = filtered[index - 1]
              const isSameDateAsPrevious = !!prev && prev.shift_date === shift.shift_date
              return (
                <motion.div
                  key={shift.id}
                  className={index === 0 ? 'mt-0' : isSameDateAsPrevious ? 'mt-0.5' : 'mt-3'}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(index * 0.03, 0.25), ease: 'easeOut' }}
                >
                  <ShiftItem
                    shift={shift}
                    currentUserId={effectiveUserId}
                    loggedInUserId={loggedInUserId}
                    isSecondary={isSecondary}
                    isSameDateAsPrevious={isSameDateAsPrevious}
                    dateIndex={dateIndexes[index]}
                    onEdit={setEditingShift}
                    isHighlighted={highlightShiftId === shift.id}
                  />
                </motion.div>
              )
            })}
          </motion.div>
        </AnimatePresence>
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
