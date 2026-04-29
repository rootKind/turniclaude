'use client'
import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2, Clock } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
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
  isHighlighted?: boolean
  duplicateCognomi?: Set<string>
  isManagerView?: boolean
}

function formatRequestDate(createdAt: string): { day: string; month: string } {
  const date = new Date(createdAt)
  return {
    day:   format(date, 'd', { locale: it }),
    month: format(date, 'MMM', { locale: it }).replace('.', ''),
  }
}

const PERIOD_PILL_CLASS: Record<number, string> = {
  1: 'p1-pill', 2: 'p2-pill', 3: 'p3-pill', 4: 'p4-pill', 5: 'p5-pill', 6: 'p6-pill',
}

function PeriodPill({ period }: { period: VacationPeriod }) {
  const label = VACATION_PERIOD_LABELS[period].label
  return (
    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap', PERIOD_PILL_CLASS[period] ?? 'offered-box text-offered-label')}>
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
  isHighlighted = false,
  duplicateCognomi,
  isManagerView = false,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showRing, setShowRing] = useState(isHighlighted)
  const cardRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  // Manager-specific state
  const [managerAction, setManagerAction] = useState<'reject' | 'confirm' | 'pending' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [selectedInterestUserId, setSelectedInterestUserId] = useState<string>('')
  const [managerLoading, setManagerLoading] = useState(false)

  useEffect(() => {
    if (!isHighlighted) return
    setShowRing(true)
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setShowRing(false), 3000)
    return () => clearTimeout(t)
  }, [isHighlighted])
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
          body: JSON.stringify({ type: 'vacation_interest', requestId: request.id, actorName, year }),
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
      if (!isOwn && canAdminAct) {
        const res = await fetch(`/api/admin/vacation-requests?id=${request.id}`, { method: 'DELETE' })
        if (!res.ok) { const b = await res.json(); throw new Error(b.error) }
      } else {
        const supabase = createClient()
        const { error } = await supabase
          .from('vacation_requests')
          .delete()
          .eq('id', request.id)
        if (error) throw error
      }
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      toast.success('Richiesta eliminata')
    } catch {
      toast.error('Errore eliminazione')
    }
  }

  async function handleManagerReject() {
    setManagerLoading(true)
    try {
      const res = await fetch(`/api/manager/vacation-requests/${request.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason.trim() || undefined }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      toast.success('Richiesta rifiutata')
      setManagerAction(null)
      setRejectReason('')
    } catch {
      toast.error('Errore')
    } finally {
      setManagerLoading(false)
    }
  }

  async function handleManagerConfirm() {
    const interestedUsers = request.vacation_request_interests
    if (interestedUsers.length > 1 && !selectedInterestUserId) {
      setManagerAction('confirm')
      return
    }
    const userId = interestedUsers.length === 1 ? interestedUsers[0].user_id : selectedInterestUserId
    setManagerLoading(true)
    try {
      const res = await fetch(`/api/manager/vacation-requests/${request.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', selectedUserId: userId || undefined }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      toast.success('Richiesta confermata')
      setManagerAction(null)
      setSelectedInterestUserId('')
    } catch {
      toast.error('Errore')
    } finally {
      setManagerLoading(false)
    }
  }

  async function handleManagerPending(e: React.MouseEvent) {
    e.stopPropagation()
    if (request.is_pending) {
      setManagerLoading(true)
      try {
        const res = await fetch(`/api/manager/vacation-requests/${request.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pending' }),
        })
        if (!res.ok) throw new Error()
        queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      } catch {
        toast.error('Errore')
      } finally {
        setManagerLoading(false)
      }
      return
    }
    const interestedUsers = request.vacation_request_interests
    if (interestedUsers.length > 1 && !selectedInterestUserId) {
      setExpanded(true)
      setManagerAction('pending')
      return
    }
    const userId = interestedUsers.length === 1 ? interestedUsers[0].user_id : selectedInterestUserId
    setManagerLoading(true)
    try {
      const res = await fetch(`/api/manager/vacation-requests/${request.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pending', selectedUserId: userId || undefined }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      setManagerAction(null)
      setSelectedInterestUserId('')
    } catch {
      toast.error('Errore')
    } finally {
      setManagerLoading(false)
    }
  }

  const displayName = formatDisplayName(request.user, duplicateCognomi)
  const interestCount = request.vacation_request_interests.length

  return (
    <div ref={cardRef} className={cn(
      isSameDateAsPrevious ? 'mt-0.5' : 'mt-3',
      'first:mt-0 rounded-[10px] transition-shadow duration-700',
      showRing && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
    )}>
      {/* Main row */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className={cn('flex items-stretch overflow-hidden cursor-pointer select-none', stateClass, borderRadius,
          !request.is_pending && isManagerView && hasInterest && 'bg-green-500/[0.08]',
          request.is_pending && 'bg-amber-500/[0.08]',
        )}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v) } }}
      >
        {/* Date block */}
        <div className={cn('relative w-[52px] flex-shrink-0 flex flex-col items-center justify-center py-3', dateBgClass)}>
          {!request.is_pending && isManagerView && hasInterest && <span className="absolute inset-0 bg-green-500/[0.08] pointer-events-none" />}
          {request.is_pending && <span className="absolute inset-0 bg-amber-500/[0.08] pointer-events-none" />}
          {dateIndex > 0 ? (
            <span className="text-[16px] font-extrabold leading-none text-muted-foreground">{dateIndex + 1}°</span>
          ) : (
            <>
              <span className={cn('text-[20px] font-extrabold leading-none', isOwn && hasInterest ? 'text-interest-date' : '')}>
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
              <span className={cn('font-semibold text-[13px] leading-none', isOwn ? 'text-own-name' : '')}>
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
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full offered-box text-offered-label whitespace-nowrap">
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
            {isManagerView ? (
              <div className="flex items-center gap-1">
                {(hasInterest || request.is_pending) && (
                  <button
                    className={cn(
                      'flex items-center justify-center w-5 h-5 rounded-full border transition-colors',
                      request.is_pending
                        ? 'border-amber-500/70 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
                        : 'border-green-600/40 text-green-600 bg-green-500/10 hover:bg-green-500/20',
                      managerLoading && 'opacity-50 pointer-events-none',
                    )}
                    onClick={handleManagerPending}
                    aria-label="Segna come in attesa"
                  >
                    <Clock size={10} />
                  </button>
                )}
                {interestCount > 0 && (
                  <span className={cn(request.is_pending ? 'text-amber-500' : 'text-green-600')}>
                    {interestCount}
                  </span>
                )}
              </div>
            ) : isOwn ? (
              <span className={hasInterest ? 'text-interest-date' : 'text-muted-foreground'}>
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
              {/* ── MANAGER VIEW ── */}
              {isManagerView && (
                <>
                  {hasInterest ? (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-match uppercase tracking-wide mb-1.5">Interessati</p>
                      <div className="flex flex-col gap-0.5">
                        {request.vacation_request_interests
                          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0 gap-2">
                              <span className="text-[12px] shrink-0">{formatDisplayName(i.user, duplicateCognomi)}</span>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap', PERIOD_PILL_CLASS[i.period_this_year] ?? 'offered-box text-offered-label')}>
                                {VACATION_PERIOD_LABELS[i.period_this_year].label}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(i.created_at)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground mb-3">Nessuno interessato ancora</p>
                  )}

                  {managerAction === 'reject' && (
                    <div className="mb-3 flex flex-col gap-2">
                      <Textarea
                        placeholder="Motivo (opzionale)"
                        className="text-[12px] min-h-[60px] resize-none"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); setManagerAction(null); setRejectReason('') }}>
                          Annulla
                        </Button>
                        <Button variant="destructive" size="sm" className="flex-1 h-8 text-[11px]" disabled={managerLoading} onClick={e => { e.stopPropagation(); handleManagerReject() }}>
                          {managerLoading ? '...' : 'Conferma rifiuto'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {managerAction === 'pending' && request.vacation_request_interests.length > 1 && (
                    <div className="mb-3 flex flex-col gap-2">
                      <p className="text-[11px] text-muted-foreground">Seleziona il dipendente per la notifica di attesa:</p>
                      <select
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={selectedInterestUserId}
                        onChange={e => setSelectedInterestUserId(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="">Seleziona…</option>
                        {request.vacation_request_interests
                          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                          .map(i => (
                            <option key={i.user_id} value={i.user_id}>{formatDisplayName(i.user, duplicateCognomi)}</option>
                          ))}
                      </select>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); setManagerAction(null); setSelectedInterestUserId('') }}>
                          Annulla
                        </Button>
                        <Button size="sm" className="flex-1 h-8 text-[11px] bg-amber-500 hover:bg-amber-600 text-white" disabled={!selectedInterestUserId || managerLoading} onClick={e => { e.stopPropagation(); handleManagerPending(e) }}>
                          {managerLoading ? '...' : 'Segna in attesa'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {managerAction === 'confirm' && request.vacation_request_interests.length > 1 && (
                    <div className="mb-3 flex flex-col gap-2">
                      <p className="text-[11px] text-muted-foreground">Seleziona il dipendente con cui fare il cambio:</p>
                      <select
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={selectedInterestUserId}
                        onChange={e => setSelectedInterestUserId(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="">Seleziona…</option>
                        {request.vacation_request_interests
                          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                          .map(i => (
                            <option key={i.user_id} value={i.user_id}>{formatDisplayName(i.user, duplicateCognomi)}</option>
                          ))}
                      </select>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); setManagerAction(null); setSelectedInterestUserId('') }}>
                          Annulla
                        </Button>
                        <Button size="sm" className="flex-1 h-8 text-[11px] bg-green-600 hover:bg-green-700 text-white" disabled={!selectedInterestUserId || managerLoading} onClick={e => { e.stopPropagation(); handleManagerConfirm() }}>
                          {managerLoading ? '...' : 'Conferma'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {managerAction === null && (
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1 h-8 text-[11px]"
                        onClick={e => { e.stopPropagation(); setManagerAction('reject') }}
                      >
                        Rifiuta
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-[11px] bg-green-600 hover:bg-green-700 text-white"
                        disabled={managerLoading}
                        onClick={e => { e.stopPropagation(); handleManagerConfirm() }}
                      >
                        Conferma
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* ── NORMAL / ADMIN VIEW ── */}
              {!isManagerView && (
                <>
                  {(isOwn || canAdminAct) && hasInterest && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-match uppercase tracking-wide mb-1.5">
                        Interessati
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {request.vacation_request_interests
                          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0 gap-2">
                              <span className="text-[12px] shrink-0">{formatDisplayName(i.user, duplicateCognomi)}</span>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap', PERIOD_PILL_CLASS[i.period_this_year] ?? 'offered-box text-offered-label')}>
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
                              <span className="text-[12px] shrink-0">{formatDisplayName(i.user, duplicateCognomi)}</span>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap', PERIOD_PILL_CLASS[i.period_this_year] ?? 'offered-box text-offered-label')}>
                                {VACATION_PERIOD_LABELS[i.period_this_year].label}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(i.created_at)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

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

                  {!isOwn && (
                    <Button
                      className={cn(
                        'w-full h-9 text-[12px] font-semibold mt-2',
                        isInterested && 'btn-interest-on',
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
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
