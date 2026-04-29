'use client'
import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pencil, Trash2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatShiftDate, formatRelativeTime, formatDisplayName, getShiftItemState, SHIFT_STATE_CLASSES, SHIFT_DATE_CLASSES, SHIFT_PILL_CLASSES } from '@/lib/utils'
import { isAdmin } from '@/types/database'
import type { Shift, ShiftType } from '@/types/database'
import { toggleInterest, deleteShift } from '@/lib/queries/shifts'
import { useQueryClient } from '@tanstack/react-query'
import { SHIFTS_QUERY_KEY } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  shift: Shift
  currentUserId: string
  loggedInUserId: string
  isSecondary: boolean
  isSameDateAsPrevious?: boolean
  dateIndex?: number
  onEdit?: (shift: Shift) => void
  isHighlighted?: boolean
  duplicateCognomi?: Set<string>
  isManagerView?: boolean
}

export function ShiftItem({ shift, currentUserId, loggedInUserId, isSecondary, isSameDateAsPrevious = false, dateIndex = 0, onEdit, isHighlighted = false, duplicateCognomi, isManagerView = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showRing, setShowRing] = useState(isHighlighted)
  const cardRef = useRef<HTMLDivElement>(null)
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
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()

  const isOwn = shift.user_id === currentUserId
  const canAdminAct = isAdmin(loggedInUserId)
  const isImpersonating = currentUserId !== loggedInUserId
  const hasInterest = (shift.shift_interested_users?.length ?? 0) > 0
  const isInterested = shift.shift_interested_users?.some(i => i.user_id === currentUserId) ?? false

  const state = getShiftItemState({ isOwn, hasInterest, highlight: false })
  const stateClass = SHIFT_STATE_CLASSES[state]
  const { day, month, weekday } = formatShiftDate(shift.shift_date)

  const dateBgClass = isSameDateAsPrevious
    ? 'opacity-20 ' + SHIFT_DATE_CLASSES[state]
    : SHIFT_DATE_CLASSES[state]

  const borderRadius = isSameDateAsPrevious
    ? expanded ? 'rounded-t-[4px]' : 'rounded-t-[4px] rounded-b-[10px]'
    : expanded ? 'rounded-t-[10px]' : 'rounded-[10px]'

  async function handleInterestToggle(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      if (isImpersonating) {
        const res = await fetch('/api/admin/interests', {
          method: isInterested ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shift_id: shift.id, user_id: currentUserId }),
        })
        if (!res.ok) throw new Error('Interest toggle failed')
      } else {
        await toggleInterest(shift.id, currentUserId, isInterested)
        if (!isInterested) {
          // Notify shift owner when adding interest (not removing)
          const actorName = profile ? `${profile.cognome ?? ''} ${profile.nome ?? ''}`.trim() : 'Qualcuno'
          fetch('/api/push/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'interest', shiftId: shift.id, actorName }),
          }).catch(() => {})
        }
      }
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
    } catch {
      toast.error('Errore')
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setConfirmDelete(false)
    try {
      if (isOwn && !isImpersonating) {
        await deleteShift(shift.id)
      } else {
        const res = await fetch(`/api/admin/shifts/${shift.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Delete failed')
      }
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      toast.success('Turno eliminato')
    } catch {
      toast.error('Errore eliminazione')
    }
  }

  async function handleManagerReject() {
    setManagerLoading(true)
    try {
      const res = await fetch(`/api/manager/shift-requests/${shift.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason.trim() || undefined }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
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
    const interestedUsers = shift.shift_interested_users ?? []
    if (interestedUsers.length > 1 && !selectedInterestUserId) {
      setManagerAction('confirm')
      return
    }
    const userId = interestedUsers.length === 1 ? interestedUsers[0].user_id : selectedInterestUserId
    setManagerLoading(true)
    try {
      const res = await fetch(`/api/manager/shift-requests/${shift.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', selectedUserId: userId || undefined }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
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
    if (shift.is_pending) {
      setManagerLoading(true)
      try {
        const res = await fetch(`/api/manager/shift-requests/${shift.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pending' }),
        })
        if (!res.ok) throw new Error()
        queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      } catch {
        toast.error('Errore')
      } finally {
        setManagerLoading(false)
      }
      return
    }
    const interestedUsers = shift.shift_interested_users ?? []
    if (interestedUsers.length > 1 && !selectedInterestUserId) {
      setExpanded(true)
      setManagerAction('pending')
      return
    }
    const userId = interestedUsers.length === 1 ? interestedUsers[0].user_id : selectedInterestUserId
    setManagerLoading(true)
    try {
      const res = await fetch(`/api/manager/shift-requests/${shift.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pending', selectedUserId: userId || undefined }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      setManagerAction(null)
      setSelectedInterestUserId('')
    } catch {
      toast.error('Errore')
    } finally {
      setManagerLoading(false)
    }
  }

  const displayName = formatDisplayName(shift.user, duplicateCognomi)

  return (
    <div
      ref={cardRef}
      className={cn(
        'rounded-[10px] transition-shadow duration-700',
        showRing && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        shift.is_pending && 'ring-1 ring-amber-500/60',
        !shift.is_pending && isManagerView && hasInterest && 'ring-1 ring-green-500/60',
      )}
    >
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
              <span className="text-[8px] uppercase tracking-wide text-muted-foreground">{weekday}</span>
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
            <div className="flex items-center gap-1.5 mb-1">
              <span className={cn('font-semibold text-[13px] leading-none', isOwn ? 'text-own-name' : '')}>
                {displayName}
              </span>
              {isOwn && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">TUO</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <ShiftPill type={shift.offered_shift} />
              <span className="text-muted-foreground text-[11px]">→</span>
              {shift.requested_shifts.map((r, i) => (
                <span key={r} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground text-[11px]">o</span>}
                  <ShiftPill type={r as ShiftType} />
                </span>
              ))}
            </div>
          </div>

          {/* Interest count */}
          <div className="flex-shrink-0 text-[11px]">
            {isManagerView ? (
              <button
                className={cn(
                  'flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors',
                  shift.is_pending
                    ? 'text-amber-500 hover:text-amber-600'
                    : hasInterest
                      ? 'text-green-600 hover:text-green-700'
                      : 'text-muted-foreground hover:text-foreground',
                  managerLoading && 'opacity-50 pointer-events-none',
                )}
                onClick={handleManagerPending}
                aria-label="Segna come in attesa"
              >
                <Clock size={11} className={shift.is_pending ? 'fill-amber-500/30' : ''} />
                {shift.shift_interested_users?.length ?? 0}
              </button>
            ) : isOwn ? (
              <span className={hasInterest ? 'text-interest-date' : 'text-muted-foreground'}>
                {hasInterest ? `${shift.shift_interested_users!.length} ❤️` : '0 ♡'}
              </span>
            ) : (
              <button
                className={cn('leading-none', isInterested ? 'text-red-500' : 'text-muted-foreground')}
                onClick={handleInterestToggle}
                aria-label={isInterested ? 'Rimuovi interesse' : 'Sono interessato'}
              >
                {(shift.shift_interested_users?.length ?? 0) > 0
                  ? `${shift.shift_interested_users!.filter(i => i.user_id !== currentUserId).length + (isInterested ? 1 : 0)} ${isInterested ? '❤️' : '♡'}`
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
                  {/* Interested users list */}
                  {hasInterest ? (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-match uppercase tracking-wide mb-1.5">Interessati</p>
                      <div className="flex flex-col gap-0.5">
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                              <span className="text-[12px]">{formatDisplayName(i.user, duplicateCognomi)}</span>
                              <span className="text-[10px] text-muted-foreground">{formatRelativeTime(i.created_at!)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground mb-3">Nessuno interessato ancora</p>
                  )}

                  {/* Reject popup */}
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

                  {/* Pending: select interested user if multiple */}
                  {managerAction === 'pending' && (shift.shift_interested_users?.length ?? 0) > 1 && (
                    <div className="mb-3 flex flex-col gap-2">
                      <p className="text-[11px] text-muted-foreground">Seleziona il dipendente per la notifica di attesa:</p>
                      <select
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={selectedInterestUserId}
                        onChange={e => setSelectedInterestUserId(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="">Seleziona…</option>
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
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

                  {/* Confirm: select interested user if multiple */}
                  {managerAction === 'confirm' && (shift.shift_interested_users?.length ?? 0) > 1 && (
                    <div className="mb-3 flex flex-col gap-2">
                      <p className="text-[11px] text-muted-foreground">Seleziona il dipendente con cui fare il cambio:</p>
                      <select
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={selectedInterestUserId}
                        onChange={e => setSelectedInterestUserId(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="">Seleziona…</option>
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
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

                  {/* Conferma / Rifiuta buttons */}
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
                  {/* Interested users list — show for own shifts OR admin */}
                  {(isOwn || canAdminAct) && hasInterest && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-match uppercase tracking-wide mb-1.5">
                        Interessati
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                              <span className="text-[12px]">{formatDisplayName(i.user, duplicateCognomi)}</span>
                              <span className="text-[10px] text-muted-foreground">{formatRelativeTime(i.created_at!)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* No interest yet — show for own shifts or admin */}
                  {(isOwn || canAdminAct) && !hasInterest && (
                    <p className="text-[12px] text-muted-foreground mb-3">Nessuno interessato ancora</p>
                  )}

                  {/* Also-interested others — show for non-own shifts when NOT admin */}
                  {!isOwn && !canAdminAct && hasInterest && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                        Anche interessati
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                              <span className="text-[12px]">{formatDisplayName(i.user, duplicateCognomi)}</span>
                              <span className="text-[10px] text-muted-foreground">{formatRelativeTime(i.created_at!)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Modifica + Elimina — own shifts OR admin on any shift */}
                  {(isOwn || canAdminAct) && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); onEdit?.(shift) }}>
                        <Pencil size={13} className="mr-1" /> Modifica
                      </Button>
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

                  {/* Interest button — non-own shifts (users and admin can both express interest) */}
                  {!isOwn && (
                    <Button
                      className={cn('w-full h-9 text-[12px] font-semibold mt-2', isInterested && 'btn-interest-on')}
                      variant={isInterested ? 'default' : 'outline'}
                      onClick={handleInterestToggle}
                    >
                      {isInterested ? '✓ Sono interessato' : '♡ Sono interessato'}
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

function ShiftPill({ type }: { type: ShiftType }) {
  return (
    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', SHIFT_PILL_CLASSES[type])}>
      {type}
    </span>
  )
}
