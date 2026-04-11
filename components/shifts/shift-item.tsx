'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pencil, Trash2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatShiftDate, formatRelativeTime, getShiftItemState, SHIFT_STATE_CLASSES, SHIFT_DATE_CLASSES, SHIFT_PILL_CLASSES } from '@/lib/utils'
import { isAdmin, isTurnista } from '@/types/database'
import type { Shift, ShiftType } from '@/types/database'
import { toggleInterest, deleteShift, toggleHighlight } from '@/lib/queries/shifts'
import { useQueryClient } from '@tanstack/react-query'
import { SHIFTS_QUERY_KEY } from '@/hooks/use-shifts'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface Props {
  shift: Shift
  currentUserId: string
  isSecondary: boolean
  isSameDateAsPrevious?: boolean
  onEdit?: (shift: Shift) => void
}

export function ShiftItem({ shift, currentUserId, isSecondary, isSameDateAsPrevious = false, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()

  const isOwn = shift.user_id === currentUserId
  const hasInterest = (shift.shift_interested_users?.length ?? 0) > 0
  const isHighlight = !!shift.highlight
  const isInterested = shift.shift_interested_users?.some(i => i.user_id === currentUserId) ?? false
  const canSeeHighlight = isTurnista(currentUserId) || isAdmin(currentUserId)

  const state = getShiftItemState({ isOwn, hasInterest, highlight: isHighlight && canSeeHighlight })
  const stateClass = SHIFT_STATE_CLASSES[state]
  const { day, month } = formatShiftDate(shift.shift_date)

  const dateBgClass = isSameDateAsPrevious
    ? 'opacity-20 ' + SHIFT_DATE_CLASSES[state]
    : SHIFT_DATE_CLASSES[state]

  const borderRadius = isSameDateAsPrevious
    ? 'rounded-t-[4px] rounded-b-[10px]'
    : expanded
    ? 'rounded-t-[10px]'
    : 'rounded-[10px]'

  async function handleInterestToggle(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await toggleInterest(shift.id, currentUserId, isInterested)
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
    } catch {
      toast.error('Errore')
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Eliminare questo turno?')) return
    try {
      await deleteShift(shift.id)
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      toast.success('Turno eliminato')
    } catch {
      toast.error('Errore eliminazione')
    }
  }

  async function handleHighlightToggle(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await toggleHighlight(shift.id, isHighlight)
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
    } catch {
      toast.error('Errore')
    }
  }

  const displayName = isOwn
    ? 'Il mio turno'
    : (() => {
        const nome = shift.user.nome
        const cognome = shift.user.cognome
        if (!cognome) return nome ?? ''
        if (/^(di|de|del|della|lo|la)/i.test(cognome)) return `${cognome} ${nome}`
        if (cognome.toLowerCase() === 'esposito' && nome?.charAt(0).toUpperCase() === 'A') return 'Esposito A'
        return cognome
      })()

  return (
    <div className="mb-0.5 last:mb-0">
      {/* Main row */}
      <div
        className={cn('flex items-stretch overflow-hidden cursor-pointer select-none', stateClass, borderRadius)}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Date block */}
        <div className={cn('w-[52px] flex-shrink-0 flex flex-col items-center justify-center py-3', dateBgClass)}>
          <span className={cn('text-[20px] font-extrabold leading-none', isOwn && hasInterest ? 'text-green-400 dark:text-green-300' : isHighlight && canSeeHighlight ? 'text-yellow-300 dark:text-yellow-200' : '')}>
            {day}
          </span>
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{month}</span>
        </div>

        {/* Content */}
        <div className="flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={cn('font-semibold text-[13px] leading-none', isOwn ? 'text-yellow-300 dark:text-yellow-200' : '')}>
                {displayName}
              </span>
              {isOwn && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">TUO</span>
              )}
              {isHighlight && canSeeHighlight && (
                <Zap size={12} className="text-yellow-400 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <ShiftPill type={shift.offered_shift} />
              <span className="text-muted-foreground text-[11px]">→</span>
              {shift.requested_shifts.map(r => (
                <ShiftPill key={r} type={r as ShiftType} />
              ))}
            </div>
          </div>

          {/* Interest count */}
          <div className="flex-shrink-0 text-[11px]">
            {isOwn ? (
              <span className={hasInterest ? 'text-green-400 dark:text-green-400' : 'text-muted-foreground'}>
                {hasInterest ? `${shift.shift_interested_users!.length} ❤️` : '0 ♡'}
              </span>
            ) : (
              <span className={isInterested ? 'text-green-400' : 'text-muted-foreground'}>
                {(shift.shift_interested_users?.length ?? 0) > 0
                  ? `${shift.shift_interested_users!.length} ❤️`
                  : '0 ♡'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={cn(
              'px-3 py-3 rounded-b-[10px] border-t border-white/5',
              isOwn && hasInterest ? 'bg-[#0c180c] dark:bg-[#0c180c] bg-[#f0fdf4]' :
              isOwn ? 'bg-[#22223a] dark:bg-[#22223a] bg-[#dcdcf0]' :
              'bg-[#111] dark:bg-[#111] bg-[#e0e0e0]'
            )}>
              {isOwn ? (
                <>
                  {hasInterest ? (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-green-400 uppercase tracking-wide mb-1.5">
                        Interessati
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                              <span className="text-[12px]">{i.user.cognome ?? i.user.nome}</span>
                              <span className="text-[10px] text-muted-foreground">{formatRelativeTime(i.created_at!)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground mb-3">Nessuno interessato ancora</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); onEdit?.(shift) }}>
                      <Pencil size={13} className="mr-1" /> Modifica
                    </Button>
                    <Button variant="destructive" size="sm" className="flex-1 h-8 text-[11px]" onClick={handleDelete}>
                      <Trash2 size={13} className="mr-1" /> Elimina
                    </Button>
                    {canSeeHighlight && (
                      <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={handleHighlightToggle}>
                        <Zap size={13} className={isHighlight ? 'text-yellow-400' : ''} />
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {hasInterest && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                        Anche interessati
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {shift.shift_interested_users!
                          .filter(i => i.user_id !== currentUserId)
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                              <span className="text-[12px]">{i.user.cognome ?? i.user.nome}</span>
                              <span className="text-[10px] text-muted-foreground">{formatRelativeTime(i.created_at!)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  <Button
                    className={cn('w-full h-9 text-[12px] font-semibold', isInterested && 'bg-green-600 hover:bg-green-700 text-white')}
                    variant={isInterested ? 'default' : 'outline'}
                    onClick={handleInterestToggle}
                  >
                    {isInterested ? '✓ Sono interessato' : '♡ Sono interessato'}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ShiftPill({ type }: { type: ShiftType }) {
  return (
    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', SHIFT_PILL_CLASSES[type])}>
      {type}
    </span>
  )
}
