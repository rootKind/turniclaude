'use client'
import { useState, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { User } from 'lucide-react'
import { useVacationRequests } from '@/hooks/use-vacation-requests'
import { useCurrentUser } from '@/hooks/use-current-user'
import { VacationRequestItem } from './vacation-request-item'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { VacationPeriod } from '@/types/database'

const MONTH_LABELS: Record<string, string> = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mag', '06': 'Giu', '07': 'Lug', '08': 'Ago',
  '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic',
}

type FilterValue = 'mine' | null | string

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? -32 : 32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
}

interface Props {
  isSecondary: boolean
  effectiveUserId: string
  loggedInUserId: string
  myPeriodThisYear: VacationPeriod | null
}

// Extract YYYY-MM from a timestamptz string
function monthKey(createdAt: string) {
  return createdAt.slice(0, 7)
}

// Extract YYYY-MM-DD from a timestamptz string for same-day comparison
function dayKey(createdAt: string) {
  return new Date(createdAt).toISOString().slice(0, 10)
}

export function VacationRequestList({ isSecondary, effectiveUserId, loggedInUserId, myPeriodThisYear }: Props) {
  const { data: requests = [], isLoading } = useVacationRequests(isSecondary)
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>(null)
  const swipeDirection = useRef<1 | -1>(-1)
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const months = useMemo(() => {
    const seen = new Set<string>()
    return requests
      .map(r => monthKey(r.created_at))
      .filter(m => { if (seen.has(m)) return false; seen.add(m); return true })
  }, [requests])

  const navSequence = useMemo<FilterValue[]>(() => ['mine', null, ...months], [months])

  const filtered = useMemo(() => {
    if (selectedFilter === 'mine') return requests.filter(r => r.user_id === effectiveUserId)
    if (!selectedFilter) return requests
    return requests.filter(r => monthKey(r.created_at) === selectedFilter)
  }, [requests, selectedFilter, effectiveUserId])

  const hasOwn = useMemo(() => requests.some(r => r.user_id === effectiveUserId), [requests, effectiveUserId])
  const showChipBar = months.length > 1 || hasOwn

  // dateIndex: ordinal per richieste nello stesso giorno
  const dateIndexes = useMemo(() => {
    const count = new Map<string, number>()
    return filtered.map(r => {
      const k = dayKey(r.created_at)
      const idx = count.get(k) ?? 0
      count.set(k, idx + 1)
      return idx
    })
  }, [filtered])

  function scrollChipIntoView(filter: FilterValue) {
    const key = filter === null ? '__tutti__' : filter
    chipRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
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
    if (Math.abs(deltaX) <= 50 || Math.abs(deltaY) > Math.abs(deltaX)) return

    const currentIndex = navSequence.findIndex(v => v === selectedFilter)
    const nextIndex = deltaX > 0
      ? Math.max(0, currentIndex - 1)
      : Math.min(navSequence.length - 1, currentIndex + 1)

    if (nextIndex !== currentIndex) {
      swipeDirection.current = deltaX > 0 ? 1 : -1
      const nextFilter = navSequence[nextIndex]
      setSelectedFilter(nextFilter)
      scrollChipIntoView(nextFilter)
    } else {
      scrollChipIntoView(selectedFilter)
    }
  }

  if (isLoading) return <VacationListSkeleton />
  if (!requests.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      Nessuna richiesta di scambio ferie.
    </div>
  )

  return (
    <div>
      {showChipBar && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
          <button
            ref={el => { if (el) chipRefs.current.set('mine', el); else chipRefs.current.delete('mine') }}
            onClick={() => navigateTo('mine')}
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

          <button
            ref={el => { if (el) chipRefs.current.set('__tutti__', el); else chipRefs.current.delete('__tutti__') }}
            onClick={() => navigateTo(null)}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
              selectedFilter === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Tutti
          </button>

          {months.map(m => {
            const [year, month] = m.split('-')
            return (
              <button
                key={m}
                ref={el => { if (el) chipRefs.current.set(m, el); else chipRefs.current.delete(m) }}
                onClick={() => navigateTo(m)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
                  selectedFilter === m
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {MONTH_LABELS[month]} {year}
              </button>
            )
          })}
        </div>
      )}

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
            {filtered.map((request, index) => {
              const prev = filtered[index - 1]
              const isSameDateAsPrevious = !!prev && dayKey(prev.created_at) === dayKey(request.created_at)
              return (
                <VacationRequestItem
                  key={request.id}
                  request={request}
                  currentUserId={effectiveUserId}
                  loggedInUserId={loggedInUserId}
                  isSecondary={isSecondary}
                  myPeriodThisYear={myPeriodThisYear}
                  isSameDateAsPrevious={isSameDateAsPrevious}
                  dateIndex={dateIndexes[index]}
                />
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function VacationListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
      ))}
    </div>
  )
}
