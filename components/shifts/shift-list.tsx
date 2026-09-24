'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { User, ChevronDown, ChevronUp } from 'lucide-react'
import { useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useAppSettings } from '@/hooks/use-app-settings'
import { isDcoPlus as isProfileDcoPlus, isManager } from '@/types/database'
import { ShiftItem } from './shift-item'
import { useDisponibiliCount } from '@/hooks/use-disponibili'
import { usePerMeGroups } from '@/hooks/use-per-me-groups'
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
  // Intestazioni dei gruppi «Per me» COLlassabili (richiesta 25/09/2026): il tap
  // sull'intestazione nasconde/rimostra le card del gruppo; il contatore resta
  // visibile anche da chiuso. Lo stato sopravvive al cambio di filtro.
  const [gruppiChiusi, setGruppiChiusi] = useState<Set<string>>(new Set())
  function toggleGruppo(titolo: string) {
    setGruppiChiusi(prev => {
      const next = new Set(prev)
      if (next.has(titolo)) next.delete(titolo)
      else next.add(titolo)
      return next
    })
  }

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

  // GRUPPO «PER ME» (richiesta 25/09/2026): la chip unisce i cambi offerti
  // dall'utente (DCO+: anche quelli dei Noni) alle richieste COMPATIBILI col
  // suo turno del giorno — lo stesso criterio delle notifiche «nuovo turno
  // pubblicato» con `notify_shift_filter` (turno reale dal PDF, altrimenti
  // teorico; copre se è fra i turni cercati). Il manager resta sulla sua chip
  // «Solo compatibili» (interessati): per lui qui non c'è nulla.
  const gruppiPerMe = usePerMeGroups(baseShifts, {
    possessivo: isDcoPlus ? isOwnOrNoniShift : undefined,
    titoloMiei: isDcoPlus ? 'Offerti da te e dai Noni' : undefined,
    compatibilita: !isManagerView,
    utenteId: effectiveUserId,
  })

  const filtered = useMemo(() => {
    // «Per me»: i gruppi in sequenza (offerti → compatibili), già senza doppioni
    if (selectedFilter === 'mine') return gruppiPerMe.flatMap(g => g.shifts)
    if (selectedFilter === 'compatible') return baseShifts.filter(s => (s.shift_interested_users?.length ?? 0) > 0)
    if (!selectedFilter) return baseShifts
    return baseShifts.filter(s => s.shift_date.startsWith(selectedFilter))
  }, [baseShifts, selectedFilter, gruppiPerMe])

  const hasOwnShifts = useMemo(() => {
    // Manager (chip «Solo compatibili»): come prima, la barra appare se ha cambi propri
    if (isManagerView) return isDcoPlus ? baseShifts.some(isOwnOrNoniShift) : baseShifts.some(isMineShift)
    // «Per me» esiste anche con ZERO cambi propri, se qualcosa è compatibile
    return gruppiPerMe.length > 0
  }, [baseShifts, isManagerView, isDcoPlus, isMineShift, isOwnOrNoniShift, gruppiPerMe])

  // Conteggi per i contatori sulle chip dei filtri: «Per me» è l'UNIONE dei
  // due gruppi (possesso vince sempre, niente doppioni).
  const chipCounts = useMemo(() => {
    const mine = gruppiPerMe.reduce((n, g) => n + g.shifts.length, 0)
    const compatible = baseShifts.filter(s => (s.shift_interested_users?.length ?? 0) > 0).length
    const byMonth = new Map<string, number>()
    for (const s of baseShifts) {
      const m = s.shift_date.slice(0, 7)
      byMonth.set(m, (byMonth.get(m) ?? 0) + 1)
    }
    return { mine, compatible, byMonth, total: baseShifts.length }
  }, [baseShifts, gruppiPerMe])
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

  // Indice della card DENTRO il suo giorno (0 = prima: data «grande» + DISP);
  // per id, perché con i gruppi la posizione in `filtered` non è quella visiva.
  const dateIndexById = useMemo(() => {
    const count = new Map<string, number>()
    const out = new Map<number, number>()
    for (const s of filtered) {
      const idx = count.get(s.shift_date) ?? 0
      count.set(s.shift_date, idx + 1)
      out.set(s.id, idx)
    }
    return out
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

  // Una card cambio, identica in TUTTE le viste. `prev`/`next` sono la card
  // precedente/successiva DELLA LISTA CHE SI STA RENDERIZZANDO: nei gruppi la
  // prima card riparte «tonda» e senza margine (lo dà l'intestazione).
  function renderShiftCard(shift: Shift, index: number, prev?: Shift, next?: Shift) {
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
          dateIndex={dateIndexById.get(shift.id) ?? 0}
          onEdit={setEditingShift}
          isHighlighted={highlightShiftId === shift.id}
          duplicateCognomi={duplicateCognomi}
          isManagerView={isManagerView}
          disponibiliCount={disponibiliCount(`${shift.shift_date}T00:00:00`)}
        />
      </motion.div>
    )
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
        {/* Per me (utenti e DCO+: offerti + compatibili) / Solo compatibili (manager).
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
            Per me
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
            {selectedFilter === 'mine' ? (
              gruppiPerMe.map((gruppo, gi) => {
                const aperto = !gruppiChiusi.has(gruppo.titolo)
                return (
                <div key={gruppo.titolo} data-perme={gruppo.titolo}>
                  {/* Intestazione COLLESSABILE: separa «offerti da te» da «compatibili».
                      Un FILO stacca l'intestazione di ogni gruppo successivo
                      dall'ultima card del gruppo precedente (richiesta 25/09/2026). */}
                  <button
                    type="button"
                    onClick={() => toggleGruppo(gruppo.titolo)}
                    aria-expanded={aperto}
                    aria-controls={`gruppo-perme-${gi}`}
                    className={cn(
                      'w-full flex items-center gap-2 text-left',
                      gi > 0 ? 'mt-4 border-t border-border pt-3' : 'mt-0',
                      'mb-2',
                    )}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {gruppo.titolo}
                    </span>
                    <span className="chip-count" aria-hidden="true">{gruppo.shifts.length}</span>
                    {aperto
                      ? <ChevronUp className="w-3 h-3 ml-auto text-muted-foreground" aria-hidden="true" />
                      : <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground" aria-hidden="true" />}
                  </button>
                  <div id={`gruppo-perme-${gi}`}>
                    {aperto && gruppo.shifts.map((shift, i) =>
                      renderShiftCard(shift, i, gruppo.shifts[i - 1], gruppo.shifts[i + 1])
                    )}
                  </div>
                </div>
                )
              })
            ) : (
              filtered.map((shift, index) =>
                renderShiftCard(shift, index, filtered[index - 1], filtered[index + 1])
              )
            )}
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
