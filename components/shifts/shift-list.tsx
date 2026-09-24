'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { User } from 'lucide-react'
import { useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useAppSettings } from '@/hooks/use-app-settings'
import { isDcoPlus as isProfileDcoPlus, isManager } from '@/types/database'
import { ShiftItem } from './shift-item'
import { useDisponibiliCount } from '@/hooks/use-disponibili'
import { EditShiftDialog } from './edit-shift-dialog'
import { FilterChip } from '@/components/ui/filter-chip'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, todayRome } from '@/lib/utils'
import { useDuplicateCognomi } from '@/hooks/use-users'
import type { Shift } from '@/types/database'
import { addDays, parseISO, format } from 'date-fns'

const MONTH_LABELS: Record<string, string> = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mag', '06': 'Giu', '07': 'Lug', '08': 'Ago',
  '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic',
}

type FilterValue = 'mine' | 'compatible' | null | string

interface ShiftListProps {
  isSecondary?: boolean
  isDcoPlus?: boolean
  effectiveUserId?: string
  loggedInUserId?: string
  highlightShiftId?: number
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? -32 : 32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
}

export function ShiftList({ isSecondary: isSecondaryProp, isDcoPlus: isDcoPlusProp, effectiveUserId: effectiveUserIdProp, loggedInUserId: loggedInUserIdProp, highlightShiftId }: ShiftListProps = {}) {
  const { profile } = useCurrentUser()
  const isSecondary = isSecondaryProp !== undefined ? isSecondaryProp : (profile?.is_secondary ?? false)
  const isDcoPlus = isDcoPlusProp !== undefined ? isDcoPlusProp : (profile ? isProfileDcoPlus(profile) : false)
  const effectiveUserId = effectiveUserIdProp ?? profile?.id ?? ''
  const loggedInUserId = loggedInUserIdProp ?? profile?.id ?? ''
  const isManagerView = profile ? isManager(profile) : false
  const { data: shifts = [], isLoading } = useShifts(isSecondary, isDcoPlus)
  const appSettings = useAppSettings()
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>(null)

  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const chipRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // 1 = going to previous (swipe right), -1 = going to next (swipe left)
  const swipeDirection = useRef<1 | -1>(-1)

  const baseShifts = useMemo(() => {
    if (
      appSettings?.shift_swap_limit_enabled &&
      appSettings.hide_shifts_beyond_limit &&
      appSettings.max_shift_swap_days > 0
    ) {
      const maxDateStr = format(addDays(parseISO(todayRome()), appSettings.max_shift_swap_days), 'yyyy-MM-dd')
      return shifts.filter(s => s.shift_date <= maxDateStr)
    }
    return shifts
  }, [shifts, appSettings])

  const months = useMemo(() => {
    const seen = new Set<string>()
    return baseShifts
      .map(s => s.shift_date.slice(0, 7))
      .filter(m => { if (seen.has(m)) return false; seen.add(m); return true })
  }, [baseShifts])

  // Navigation sequence: 'mine'/'compatible', null, ...months
  const navSequence = useMemo<FilterValue[]>(
    () => [isManagerView ? 'compatible' : 'mine', null, ...months],
    [isManagerView, months]
  )

  // DCO+: "Solo mansioni" = propri cambi + cambi dei Noni (esclusi gli altri DCO+)
  const isOwnOrNoniShift = useMemo(
    () => (s: Shift) => s.user_id === effectiveUserId || s.user?.is_secondary === true,
    [effectiveUserId]
  )
  const isMineShift = useMemo(
    () => (s: Shift) => s.user_id === effectiveUserId,
    [effectiveUserId]
  )

  const filtered = useMemo(() => {
    if (selectedFilter === 'mine') {
      if (isDcoPlus) return baseShifts.filter(isOwnOrNoniShift)
      return baseShifts.filter(isMineShift)
    }
    if (selectedFilter === 'compatible') return baseShifts.filter(s => (s.shift_interested_users?.length ?? 0) > 0)
    if (!selectedFilter) return baseShifts
    return baseShifts.filter(s => s.shift_date.startsWith(selectedFilter))
  }, [baseShifts, selectedFilter, isDcoPlus, isOwnOrNoniShift, isMineShift])

  const hasOwnShifts = useMemo(() => {
    // DCO+: la chip bar mostra "Solo mansioni" anche se esistono solo cambi dei Noni
    if (isDcoPlus) return baseShifts.some(isOwnOrNoniShift)
    return baseShifts.some(isMineShift)
  }, [baseShifts, isDcoPlus, isOwnOrNoniShift, isMineShift])

  // Conteggi per i contatori sulle chip dei filtri
  const chipCounts = useMemo(() => {
    const mine = isDcoPlus
      ? baseShifts.filter(isOwnOrNoniShift).length
      : baseShifts.filter(isMineShift).length
    const compatible = baseShifts.filter(s => (s.shift_interested_users?.length ?? 0) > 0).length
    const byMonth = new Map<string, number>()
    for (const s of baseShifts) {
      const m = s.shift_date.slice(0, 7)
      byMonth.set(m, (byMonth.get(m) ?? 0) + 1)
    }
    return { mine, compatible, byMonth, total: baseShifts.length }
  }, [baseShifts, isDcoPlus, isOwnOrNoniShift, isMineShift])
  const duplicateCognomi = useDuplicateCognomi(isSecondary, isDcoPlus)
  const showChipBar = months.length > 1 || hasOwnShifts
  // DISPONIBILI «D» (richiesta 25/09/2026): conteggio per data, scope in base
  // al viewer (DCO → senza noni; Noni → solo noni; manager → tutti). Una sola
  // lettura dati condivisa per tutte le card.
  const disponibiliCount = useDisponibiliCount()

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
  if (!baseShifts.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      {isManagerView ? 'Nessuna richiesta di cambio turno.' : 'Nessun turno disponibile. Premi + per aggiungerne uno.'}
    </div>
  )

  return (
    <div>
      {/* Filter chip bar */}
      {showChipBar && <div
        className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar"
      >
        {/* Solo miei (utenti) / Solo mansioni (DCO+) / Solo compatibili (manager).
            Le chip sono `FilterChip` (M4): la geometria sta nei token, non copiata
            in ogni bottone — cinque copie dello stesso markup erano cinque posti
            in cui correggere la stessa cosa. */}
        {!isManagerView ? (
          <FilterChip
            ref={el => { if (el) chipRefs.current.set('mine', el); else chipRefs.current.delete('mine') }}
            onClick={() => navigateTo('mine')}
            selected={selectedFilter === 'mine'}
            dashed={selectedFilter !== 'mine'}
            icon={<User className="w-3 h-3" />}
            count={chipCounts.mine}
          >
            {isDcoPlus ? 'Solo mansioni' : 'Solo miei'}
          </FilterChip>
        ) : (
          <FilterChip
            ref={el => { if (el) chipRefs.current.set('compatible', el); else chipRefs.current.delete('compatible') }}
            onClick={() => navigateTo('compatible')}
            selected={selectedFilter === 'compatible'}
            dashed={selectedFilter !== 'compatible'}
            icon={<User className="w-3 h-3" />}
            count={chipCounts.compatible}
          >
            Solo compatibili
          </FilterChip>
        )}

        {/* Tutti */}
        <FilterChip
          ref={el => { if (el) chipRefs.current.set('__tutti__', el); else chipRefs.current.delete('__tutti__') }}
          onClick={() => navigateTo(null)}
          selected={selectedFilter === null}
          count={chipCounts.total}
        >
          Tutti
        </FilterChip>

        {/* Month chips */}
        {months.map(m => {
          const [year, month] = m.split('-')
          const label = `${MONTH_LABELS[month]} ${year}`
          return (
            <FilterChip
              key={m}
              ref={el => { if (el) chipRefs.current.set(m, el); else chipRefs.current.delete(m) }}
              onClick={() => navigateTo(m)}
              selected={selectedFilter === m}
              count={chipCounts.byMonth.get(m) ?? 0}
            >
              {label}
            </FilterChip>
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
              const next = filtered[index + 1]
              const isSameDateAsPrevious = !!prev && prev.shift_date === shift.shift_date
              const isSameDateAsNext = !!next && next.shift_date === shift.shift_date
              return (
                <motion.div
                  key={shift.id}
                  className={index === 0 ? 'mt-0' : isSameDateAsPrevious ? 'mt-0' : 'mt-3'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(index * 0.04, 0.3), ease: 'easeOut' }}
                >
                  <ShiftItem
                    shift={shift}
                    currentUserId={effectiveUserId}
                    loggedInUserId={loggedInUserId}
                    isSecondary={isSecondary}
                    isDcoPlus={isDcoPlus}
                    isSameDateAsPrevious={isSameDateAsPrevious}
                    isSameDateAsNext={isSameDateAsNext}
                    dateIndex={dateIndexes[index]}
                    onEdit={setEditingShift}
                    isHighlighted={highlightShiftId === shift.id}
                    duplicateCognomi={duplicateCognomi}
                    isManagerView={isManagerView}
                    disponibiliCount={disponibiliCount(`${shift.shift_date}T00:00:00`)}
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
          isDcoPlus={isDcoPlus}
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
