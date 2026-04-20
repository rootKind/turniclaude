'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { formatRelativeTime, formatDisplayName, SHIFT_STATE_CLASSES, SHIFT_DATE_CLASSES } from '@/lib/utils'
import { isAdmin } from '@/types/database'
import type { VacationRequestWithInterests, VacationPeriod } from '@/types/database'
import { VACATION_PERIOD_LABELS } from '@/lib/vacations'
import { toggleVacationInterest } from '@/lib/queries/vacations'
import { useQueryClient } from '@tanstack/react-query'
import { VACATION_REQUESTS_QUERY_KEY } from '@/hooks/use-vacation-requests'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks/use-current-user'

interface Props {
  request: VacationRequestWithInterests
  currentUserId: string
  loggedInUserId: string
  isSecondary: boolean
  myPeriodThisYear: VacationPeriod | null
  isSameDateAsPrevious?: boolean
  dateIndex?: number
  year: number
}

function formatRequestDate(createdAt: string): { day: string; month: string } {
  const date = new Date(createdAt)
  return {
    day:   format(date, 'd', { locale: it }),
    month: format(date, 'MMM', { locale: it }).replace('.', ''),
  }
}

function PeriodPill({ period }: { period: VacationPeriod }) {
  const label = VACATION_PERIOD_LABELS[period].label
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 whitespace-nowrap">
      {label}
    </span>
  )
}

export function VacationRequestItem({
  request,
  currentUserId,
  loggedInUserId,
  isSecondary,
  myPeriodThisYear,
  isSameDateAsPrevious = false,
  dateIndex = 0,
  year,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()

  const isOwn        = request.user_id === currentUserId
  const canAdminAct  = isAdmin(loggedInUserId)
  const hasInterest  = request.vacation_request_interests.length > 0
  const isInterested = request.vacation_request_interests.some(i => i.user_id === currentUserId)

  // Non puoi esprimerti interessato se offri lo stesso periodo che hai già
  const alreadyHasThatPeriod = myPeriodThisYear !== null && request.offered_period === myPeriodThisYear

  const state = isOwn && hasInterest ? 'own-interest' : isOwn ? 'own-empty' : 'others'
  const stateClass   = SHIFT_STATE_CLASSES[state]
  const { day, month } = formatRequestDate(request.created_at)

  const dateBgClass = isSameDateAsPrevious
    ? 'opacity-20 ' + SHIFT_DATE_CLASSES[state]
    : SHIFT_DATE_CLASSES[state]

  const borderRadius = isSameDateAsPrevious
    ? expanded ? 'rounded-t-[4px]' : 'rounded-t-[4px] rounded-b-[10px]'
    : expanded ? 'rounded-t-[10px]' : 'rounded-[10px]'

  async function handleInterestToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (alreadyHasThatPeriod) return
    try {
      const supabase = createClient()
      await toggleVacationInterest(supabase, request.id, currentUserId, isInterested)
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      if (!isInterested) {
        const actorName = [profile?.nome, profile?.cognome].filter(Boolean).join(' ')
        fetch('/api/push/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'vacation_interest', requestId: request.id, actorName }),
        }).catch(() => {})
      }
    } catch {
      toast.error('Errore')
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setConfirmDelete(false)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('vacation_requests')
        .delete()
        .eq('id', request.id)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      toast.success('Richiesta eliminata')
    } catch {
      toast.error('Errore eliminazione')
    }
  }

  const displayName = formatDisplayName(request.user)
  const interestCount = request.vacation_request_interests.length

  return (
    <div className={cn(isSameDateAsPrevious ? 'mt-0.5' : 'mt-3', 'first:mt-0 rounded-[10px]')}>
      {/* Main row */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className={cn('flex items-stretch overflow-hidden cursor-pointer select-none', stateClass, borderRadius)}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v) } }}
      >
        {/* Date block */}
        <div className={cn('w-[52px] flex-shrink-0 flex flex-col items-center justify-center py-3', dateBgClass)}>
          {dateIndex > 0 ? (
            <span className="text-[16px] font-extrabold leading-none text-muted-foreground">{dateIndex + 1}°</span>
          ) : (
            <>
              <span className={cn('text-[20px] font-extrabold leading-none', isOwn && hasInterest ? 'text-green-400 dark:text-green-300' : '')}>
                {day}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{month}</span>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={cn('font-semibold text-[13px] leading-none', isOwn ? 'text-yellow-700 dark:text-yellow-200' : '')}>
                {displayName}
              </span>
              {isOwn && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">TUO</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <PeriodPill period={request.offered_period} />
              <span className="text-muted-foreground text-[11px]">→</span>
              {request.target_periods.length >= 5 ? (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 whitespace-nowrap">
                  qualsiasi periodo
                </span>
              ) : (
                request.target_periods.map((p, i) => (
                  <span key={p} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground text-[11px]">o</span>}
                    <PeriodPill period={p} />
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Interest count */}
          <div className="flex-shrink-0 text-[11px]">
            {isOwn ? (
              <span className={hasInterest ? 'text-green-400 dark:text-green-400' : 'text-muted-foreground'}>
                {hasInterest ? `${interestCount} ❤️` : '0 ♡'}
              </span>
            ) : (
              <button
                className={cn('leading-none', isInterested ? 'text-red-500' : 'text-muted-foreground')}
                onClick={handleInterestToggle}
                aria-label={isInterested ? 'Rimuovi interesse' : 'Sono interessato'}
              >
                {interestCount > 0
                  ? `${interestCount} ${isInterested ? '❤️' : '♡'}`
                  : `0 ${isInterested ? '❤️' : '♡'}`}
              </button>
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
              isOwn && hasInterest ? 'bg-[#f0fdf4] dark:bg-[#0c180c]' :
              isOwn ? 'bg-[#dcdcf0] dark:bg-[#22223a]' :
              'bg-[#e0e0e0] dark:bg-[#111]'
            )}>
              {/* Interested users — owner or admin */}
              {(isOwn || canAdminAct) && hasInterest && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-green-400 uppercase tracking-wide mb-1.5">
                    Interessati
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {request.vacation_request_interests
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map(i => (
                        <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0 gap-2">
                          <span className="text-[12px] shrink-0">{i.user.cognome ?? i.user.nome}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 whitespace-nowrap">
                            {VACATION_PERIOD_LABELS[i.period_this_year].label}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(i.created_at)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {(isOwn || canAdminAct) && !hasInterest && (
                <p className="text-[12px] text-muted-foreground mb-3">Nessuno interessato ancora</p>
              )}

              {/* Anche interessati — non-own, non-admin */}
              {!isOwn && !canAdminAct && hasInterest && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Anche interessati
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {request.vacation_request_interests
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map(i => (
                        <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0 gap-2">
                          <span className="text-[12px] shrink-0">{i.user.cognome ?? i.user.nome}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 whitespace-nowrap">
                            {VACATION_PERIOD_LABELS[i.period_this_year].label}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(i.created_at)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Elimina — owner o admin */}
              {(isOwn || canAdminAct) && (
                <div className="flex gap-2">
                  {confirmDelete ? (
                    <>
                      <Button variant="destructive" size="sm" className="flex-1 h-8 text-[11px]" onClick={handleDelete}>
                        Conferma
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}>
                        Annulla
                      </Button>
                    </>
                  ) : (
                    <Button variant="destructive" size="sm" className="flex-1 h-8 text-[11px]" onClick={handleDelete}>
                      <Trash2 size={13} className="mr-1" /> Elimina
                    </Button>
                  )}
                </div>
              )}

              {/* Interest button — non-own */}
              {!isOwn && (
                <Button
                  className={cn(
                    'w-full h-9 text-[12px] font-semibold mt-2',
                    isInterested && 'bg-green-600 hover:bg-green-700 text-white',
                    alreadyHasThatPeriod && 'opacity-50 cursor-not-allowed',
                  )}
                  variant={isInterested ? 'default' : 'outline'}
                  onClick={alreadyHasThatPeriod ? undefined : handleInterestToggle}
                  disabled={alreadyHasThatPeriod}
                  title={alreadyHasThatPeriod ? 'Hai già questo periodo da rotazione' : undefined}
                >
                  {isInterested ? '✓ Sono interessato' : alreadyHasThatPeriod ? '✗ Hai già questo periodo' : '♡ Sono interessato'}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
