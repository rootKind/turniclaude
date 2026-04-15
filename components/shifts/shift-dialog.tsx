'use client'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { cn, todayRome, formatDisplayName, formatRelativeTime, SHIFT_PILL_CLASSES } from '@/lib/utils'
import { createShift, findCompatibleShifts, toggleInterest } from '@/lib/queries/shifts'
import { SHIFTS_QUERY_KEY, useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { toast } from 'sonner'
import { it } from 'date-fns/locale'
import { format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import type { Shift, ShiftType } from '@/types/database'

const SHIFT_TYPES: ShiftType[] = ['Mattina', 'Pomeriggio', 'Notte']

const SHIFT_STYLES: Record<ShiftType, { base: string; active: string }> = {
  Mattina:    { base: 'border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300', active: 'bg-blue-100 border-blue-400 dark:bg-blue-900/40 dark:border-blue-500' },
  Pomeriggio: { base: 'border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300', active: 'bg-amber-100 border-amber-400 dark:bg-amber-900/40 dark:border-amber-500' },
  Notte:      { base: 'border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-300', active: 'bg-purple-100 border-purple-400 dark:bg-purple-900/40 dark:border-purple-500' },
}

interface Props {
  open: boolean
  onClose: () => void
  isSecondary: boolean
  impersonatingUserId?: string
}

export function ShiftDialog({ open, onClose, isSecondary, impersonatingUserId }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>()
  const [offeredShift, setOfferedShift] = useState<ShiftType | null>(null)
  const [requestedShifts, setRequestedShifts] = useState<ShiftType[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [compatibleMatches, setCompatibleMatches] = useState<Shift[]>([])
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()
  const { data: shifts = [] } = useShifts(isSecondary)

  const effectiveUserId = impersonatingUserId ?? profile?.id ?? ''

  useEffect(() => {
    if (open) {
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
    }
  }, [open, isSecondary, queryClient])

  const occupiedDates = new Set(
    shifts
      .filter(s => s.user_id === effectiveUserId)
      .map(s => s.shift_date)
  )

  function toggleRequested(type: ShiftType) {
    if (type === offeredShift) return
    setRequestedShifts(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : prev.length < 2 ? [...prev, type] : prev
    )
  }

  function handleClose() {
    onClose()
    setSelectedDate(undefined)
    setOfferedShift(null)
    setRequestedShifts([])
    setCompatibleMatches([])
  }

  async function doPublish() {
    setCompatibleMatches([])
    setIsSubmitting(true)
    try {
      const shiftDate = format(selectedDate!, 'yyyy-MM-dd')
      let newShiftId: number | null = null
      if (impersonatingUserId) {
        const res = await fetch('/api/admin/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offered_shift: offeredShift,
            shift_date: shiftDate,
            requested_shifts: requestedShifts,
            user_id: impersonatingUserId,
          }),
        })
        if (!res.ok) throw new Error('Admin shift create failed')
        const json = await res.json()
        newShiftId = json.id ?? null
      } else {
        newShiftId = await createShift({
          offered_shift: offeredShift!,
          shift_date: shiftDate,
          requested_shifts: requestedShifts,
        })
      }
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      if (!impersonatingUserId) {
        // Fire-and-forget push notification
        const actorName = profile ? `${profile.cognome ?? ''} ${profile.nome ?? ''}`.trim() : 'Qualcuno'
        fetch('/api/push/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'new_shift',
            isSecondary,
            actorName,
            shiftId: newShiftId,
            offeredShift,
            requestedShifts,
            shiftDate,
          }),
        }).catch(() => {})
        // Track event
        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: 'new_shift' }),
        }).catch(() => {})
      }
      toast.success('Turno pubblicato')
      handleClose()
    } catch {
      toast.error('Errore pubblicazione')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit() {
    if (!selectedDate || !offeredShift || requestedShifts.length === 0) {
      toast.error('Compila tutti i campi')
      return
    }
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const matches = findCompatibleShifts(shifts, dateStr, offeredShift, requestedShifts, effectiveUserId)
    if (matches.length > 0) {
      setCompatibleMatches(matches)
      return
    }
    await doPublish()
  }

  async function handleInterest(shift: Shift) {
    const alreadyInterested = shift.shift_interested_users?.some(i => i.user_id === effectiveUserId) ?? false
    if (alreadyInterested) {
      toast.success('Sei già interessato a questo turno')
      handleClose()
      return
    }
    try {
      if (impersonatingUserId) {
        const res = await fetch('/api/admin/interests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shift_id: shift.id, user_id: effectiveUserId }),
        })
        if (!res.ok) throw new Error('Interest failed')
      } else {
        await toggleInterest(shift.id, effectiveUserId, false)
        const actorName = profile ? `${profile.cognome ?? ''} ${profile.nome ?? ''}`.trim() : 'Qualcuno'
        fetch('/api/push/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'interest', shiftId: shift.id, actorName }),
        }).catch(() => {})
        // Track event
        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: 'interest', metadata: { shift_id: shift.id } }),
        }).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      toast.success('Interesse registrato')
      handleClose()
    } catch {
      toast.error('Errore')
      handleClose()
    }
  }

  const canSubmit = !!selectedDate && !!offeredShift && requestedShifts.length > 0

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-sm w-full p-0 overflow-hidden flex flex-col shift-dialog" style={{ maxHeight: '85svh' }}>
        <div className="overflow-y-auto flex-1 min-h-0 px-5 pb-5 pt-5 space-y-5">
          {compatibleMatches.length > 0 ? (
            <CompatibilityPanel
              matches={compatibleMatches}
              onInterest={handleInterest}
              onPublishAnyway={doPublish}
              isSubmitting={isSubmitting}
            />
          ) : (
            <>
              {/* Date picker */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Data</p>
                <div className="relative rounded-xl">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    locale={it}
                    disabled={(date) => {
                      const str = format(date, 'yyyy-MM-dd')
                      return str <= todayRome() || occupiedDates.has(str)
                    }}
                    className="rounded-xl border w-full"
                  />
                </div>
              </div>

              {/* Offered shift */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Turno che offri</p>
                <div className="flex gap-2">
                  {SHIFT_TYPES.map(type => (
                    <ShiftTypeBtn
                      key={type}
                      type={type}
                      selected={offeredShift === type}
                      disabled={false}
                      onClick={() => {
                        setOfferedShift(type)
                        setRequestedShifts(prev => prev.filter(t => t !== type))
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Requested shifts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Turni che accetti</p>
                  <span className="text-[10px] text-muted-foreground">max 2</span>
                </div>
                <div className="flex gap-2">
                  {SHIFT_TYPES.map(type => (
                    <ShiftTypeBtn
                      key={type}
                      type={type}
                      selected={requestedShifts.includes(type)}
                      disabled={type === offeredShift}
                      onClick={() => toggleRequested(type)}
                    />
                  ))}
                </div>
              </div>

              {/* Summary */}
              {canSubmit && (
                <div className="rounded-xl bg-muted px-4 py-3 flex items-center gap-2 text-sm">
                  <span className="font-medium">{format(selectedDate!, 'd MMM', { locale: it })}</span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className={cn('text-xs font-semibold', SHIFT_STYLES[offeredShift!].base.split(' ')[1])}>{offeredShift}</span>
                  <ArrowRight size={13} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {requestedShifts.join(' o ')}
                  </span>
                </div>
              )}

              <Button onClick={handleSubmit} disabled={isSubmitting || !canSubmit} className="w-full">
                {isSubmitting ? 'Pubblicazione...' : 'Pubblica'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ShiftTypeBtn({ type, selected, disabled, onClick }: {
  type: ShiftType; selected: boolean; disabled: boolean; onClick: () => void
}) {
  const { base, active } = SHIFT_STYLES[type]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 py-2.5 rounded-xl text-[13px] font-semibold border-2 transition-all',
        base,
        selected ? active : 'bg-transparent',
        disabled && 'opacity-25 cursor-not-allowed'
      )}
    >
      {type}
    </button>
  )
}

function CompatibilityPanel({
  matches,
  onInterest,
  onPublishAnyway,
  isSubmitting,
}: {
  matches: Shift[]
  onInterest: (shift: Shift) => void
  onPublishAnyway: () => void
  isSubmitting: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-600/40 bg-green-950/20 dark:bg-green-950/30 p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-green-400">
          ⚡ {matches.length === 1 ? 'Match compatibile trovato' : `${matches.length} match compatibili trovati`}
        </p>

        {matches.map(shift => {
          const interested = shift.shift_interested_users ?? []
          const alreadyCount = interested.length
          return (
            <div key={shift.id} className="rounded-lg bg-black/20 dark:bg-black/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">{formatDisplayName(shift.user)}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-900/50 text-green-400">MATCH ✓</span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', SHIFT_PILL_CLASSES[shift.offered_shift])}>
                  {shift.offered_shift}
                </span>
                <ArrowRight size={11} className="text-muted-foreground flex-shrink-0" />
                {shift.requested_shifts.map((r, i) => (
                  <span key={r} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground text-[10px]">o</span>}
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', SHIFT_PILL_CLASSES[r])}>
                      {r}
                    </span>
                  </span>
                ))}
              </div>

              {alreadyCount === 0 ? (
                <p className="text-[11px] text-green-300">♡ Nessuno ancora — saresti il primo</p>
              ) : (
                <div className="rounded bg-black/20 px-2.5 py-2 space-y-1">
                  <p className="text-[11px] font-semibold text-amber-400">❤️ {alreadyCount} già {alreadyCount === 1 ? 'interessato' : 'interessati'}</p>
                  {interested
                    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                    .map((i, idx) => (
                      <div key={i.user_id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{idx + 1}° {i.user.cognome ?? i.user.nome}</span>
                        <span className="text-[10px]">{formatRelativeTime(i.created_at!)}</span>
                      </div>
                    ))}
                  <p className="text-[11px] font-semibold text-lime-400">→ Saresti il {alreadyCount + 1}°</p>
                </div>
              )}

              <Button
                size="sm"
                className="w-full h-8 text-[12px] bg-green-700 hover:bg-green-600 text-white"
                onClick={() => onInterest(shift)}
              >
                ❤️ Interessati a {shift.user.cognome ?? shift.user.nome}
              </Button>
            </div>
          )
        })}
      </div>

      <Button
        variant="outline"
        className="w-full text-[12px]"
        onClick={onPublishAnyway}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Pubblicazione...' : 'Pubblica comunque la mia richiesta'}
      </Button>
    </div>
  )
}
