'use client'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { cn, todayRome, formatDisplayName, formatRelativeTime, SHIFT_PILL_CLASSES } from '@/lib/utils'
import { useDuplicateCognomi } from '@/hooks/use-users'
import { createShift, findCompatibleShifts, toggleInterest } from '@/lib/queries/shifts'
import { getSalaSchedule, listScheduleMonths } from '@/lib/queries/sala-schedule'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { buildBareOwners } from '@/lib/shift-teams-matching'
import { decodeSalaMonth, findMonthPerson, personDayShift, shiftCodePill, isSalaMonthData } from '@/lib/sala-month'
import { theoreticalTokenFor } from '@/lib/person-shift'
import { createClient } from '@/lib/supabase/client'
import { SHIFTS_QUERY_KEY, useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useAppSettings } from '@/hooks/use-app-settings'
import { toast } from 'sonner'
import { it } from 'date-fns/locale'
import { format, addDays, parseISO } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import type { Shift, ShiftType } from '@/types/database'

const SHIFT_TYPES: ShiftType[] = ['Mattina', 'Pomeriggio', 'Notte']

const SHIFT_STYLES: Record<ShiftType, { base: string; active: string }> = {
  Mattina:    { base: 'dialog-pill-m', active: 'dialog-pill-m dp-active' },
  Pomeriggio: { base: 'dialog-pill-p', active: 'dialog-pill-p dp-active' },
  Notte:      { base: 'dialog-pill-n', active: 'dialog-pill-n dp-active' },
}

interface Props {
  open: boolean
  onClose: () => void
  isSecondary: boolean
  isDcoPlus?: boolean   // viewer DCO+ (match compatibili anche con i Noni)
  impersonatingUserId?: string
}

const isIOS =
  typeof window !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent)

export function ShiftDialog({ open, onClose, isSecondary, isDcoPlus = false, impersonatingUserId }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>()
  const [offeredShift, setOfferedShift] = useState<ShiftType | null>(null)
  const [requestedShifts, setRequestedShifts] = useState<ShiftType[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [compatibleMatches, setCompatibleMatches] = useState<Shift[]>([])
  // Avviso di fattibilità (richiesta 12/09/2026): prima di pubblicare si chiede
  // all'API se il MIO turno del giorno offerto (reale→teorico) copre uno dei
  // turni cercati. Se no, popup di conferma: la richiesta resta possibile (il
  // motore di match guarda le richieste degli ALTRI) ma senza il turno giusto
  // è destinata a restare senza match.
  const [compatCheck, setCompatCheck] = useState<{ myShift: ShiftType | null; source: 'real' | 'theoretical' | 'none' } | null>(null)
  const [compatLoading, setCompatLoading] = useState(false)
  // Sigla del turno reale sopra ogni cifra del datepicker (richiesta 13/09/2026):
  // chiave ISO «YYYY-MM-DD» → pillola M/P/N. Per i mesi PDF la riga REALE della
  // persona; per i mesi senza PDF il TEORICO dalla rotazione delle squadre.
  const [dayShiftCodes, setDayShiftCodes] = useState<Map<string, ReturnType<typeof shiftCodePill>>>(new Map())
  const [codesLoaded, setCodesLoaded] = useState(false)
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()
  const { data: shifts = [] } = useShifts(isSecondary, isDcoPlus)
  const duplicateCognomi = useDuplicateCognomi(isSecondary, isDcoPlus)
  const appSettings = useAppSettings()

  const effectiveUserId = impersonatingUserId ?? profile?.id ?? ''

  useEffect(() => {
    if (open) {
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
    } else {
      setCodesLoaded(false)
    }
  }, [open, isSecondary, isDcoPlus, queryClient])

  // ── Turni del giorno per il datepicker ────────────────────────────────────
  // Una sola fetch all'apertura: mesi PDF disponibili + albero squadre. Per ogni
  // mese caricato si legge la riga reale della persona; per gli altri (fino a +3
  // mesi, come la navigazione del datepicker) si usa il teorico delle squadre.
  useEffect(() => {
    if (!open || !effectiveUserId || codesLoaded) return
    let cancelled = false
    const today = parseISO(todayRome())
    const candidates: string[] = []
    for (let i = 0; i <= 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      candidates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    ;(async () => {
      try {
        const db = createClient()
        const [monthsRes, treeRes] = await Promise.all([
          listScheduleMonths(db),
          fetchShiftTeamTree(db),
        ])
        if (cancelled) return
        const pdfMonths = new Set(monthsRes ?? [])
        const map = new Map<string, ReturnType<typeof shiftCodePill>>()
        // Omonimi con LEGATO (caso NEVANO): la riga PDF bare è del legato.
        const bareOwners = treeRes ? buildBareOwners(treeRes, duplicateCognomi) : undefined
        // 1. Mesi PDF: la riga REALE della persona (la verità, come in /tuoturno).
        const current = candidates.find(m => pdfMonths.has(m)) ?? null
        if (current) {
          const schedule = await getSalaSchedule(db, current)
          if (cancelled) return
          if (schedule && isSalaMonthData(schedule.data)) {
            const people = decodeSalaMonth(schedule.data)
            const person = findMonthPerson(people, profile, duplicateCognomi, bareOwners)
            if (person) {
              for (let d = 1; d <= person.days.length; d++) {
                const info = personDayShift(person, d)
                const pill = info ? shiftCodePill(info.short) : null
                if (pill) map.set(`${current}-${String(d).padStart(2, '0')}`, pill)
              }
            }
          }
        }
        // 2. Mesi senza PDF: teorico dalla rotazione delle squadre del DB.
        if (treeRes) {
          for (const m of candidates) {
            if (pdfMonths.has(m)) continue
            const [y, mm] = m.split('-').map(Number)
            const dim = new Date(y, mm, 0).getDate()
            for (let d = 1; d <= dim; d++) {
              const iso = `${m}-${String(d).padStart(2, '0')}`
              const pill = shiftCodePill(theoreticalTokenFor(treeRes, profile, iso, duplicateCognomi, bareOwners))
              if (pill) map.set(iso, pill)
            }
          }
        }
        if (!cancelled) { setDayShiftCodes(map); setCodesLoaded(true) }
      } catch {
        /* dati non disponibili: il datepicker resta senza sigle */
        if (!cancelled) setCodesLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [open, effectiveUserId, codesLoaded, profile, duplicateCognomi])

  const dayInfoFor = (date: Date) => dayShiftCodes.get(format(date, 'yyyy-MM-dd')) ?? null

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
    setCompatCheck(null)
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
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
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
    // Verifica di fattibilità: il mio turno quel giorno (reale, altrimenti teorico)
    // è fra i turni che cerco? Se no → popup di conferma prima di pubblicare.
    if (!impersonatingUserId) {
      setCompatLoading(true)
      try {
        const res = await fetch(`/api/shift-compat?date=${dateStr}&requested=${requestedShifts.join(',')}`)
        if (res.ok) {
          const json = await res.json() as { myShift: ShiftType | null; source: 'real' | 'theoretical' | 'none'; compatible: boolean }
          if (!json.compatible) {
            setCompatCheck({ myShift: json.myShift, source: json.source })
            return
          }
        }
      } catch {
        /* verifica non disponibile: si pubblica senza popup, come prima */
      } finally {
        setCompatLoading(false)
      }
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
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
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
      <DialogContent
        className={cn(
          'max-w-sm w-full p-0 flex flex-col shift-dialog',
          isIOS && 'ios-dialog-fix'
        )}
        style={{ maxHeight: isIOS ? '85dvh' : '85svh' }}
      >
        <div className="scroll-area overflow-y-auto flex-1 min-h-0 px-5 pb-5 pt-5 space-y-5">
          {compatCheck ? (
            /* Popup «non è fattibile col tuo turno»: conferma o annulla */
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 space-y-2">
                <p className="text-[13px] font-bold">Richiesta non coperta dal tuo turno</p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  Il {format(selectedDate!, 'd MMMM', { locale: it })} hai{' '}
                  <span className="font-semibold text-foreground">
                    {compatCheck.myShift
                      ? compatCheck.myShift.toLowerCase()
                      : compatCheck.source === 'theoretical' ? 'riposo (teorico)' : 'nessun turno'}
                  </span>
                  {' '}(dal {compatCheck.source === 'real' ? 'turno reale' : 'turno teorico'}), ma offri{' '}
                  <span className="font-semibold text-foreground">{offeredShift?.toLowerCase()}</span> cercando{' '}
                  <span className="font-semibold text-foreground">{requestedShifts.join(' o ').toLowerCase()}</span>.
                  Chi ha quel giorno uno dei turni cercati potrebbe accettare, ma tu non potresti
                  mai ricambiare: la richiesta resterà senza match.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setCompatCheck(null); setOfferedShift(null); setRequestedShifts([]) }}
              >
                Ho capito, correggo
              </Button>
              <Button
                variant="outline"
                className="w-full text-[12px]"
                onClick={() => { setCompatCheck(null); doPublish() }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Pubblicazione...' : 'Pubblica comunque la mia richiesta'}
              </Button>
            </div>
          ) : compatibleMatches.length > 0 ? (
            <CompatibilityPanel
              matches={compatibleMatches}
              onInterest={handleInterest}
              onPublishAnyway={doPublish}
              isSubmitting={isSubmitting}
              duplicateCognomi={duplicateCognomi}
            />
          ) : (
            <>
              {/* Date picker */}
              <div>
                <div className="relative rounded-xl flex-shrink-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    locale={it}
                    dayInfo={dayInfoFor}
                    disabled={(date) => {
                      const str = format(date, 'yyyy-MM-dd')
                      if (str <= todayRome() || occupiedDates.has(str)) return true
                      if (appSettings?.shift_swap_limit_enabled && appSettings.max_shift_swap_days > 0) {
                        const maxDate = format(addDays(parseISO(todayRome()), appSettings.max_shift_swap_days), 'yyyy-MM-dd')
                        if (str > maxDate) return true
                      }
                      return false
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

              <Button onClick={handleSubmit} disabled={isSubmitting || compatLoading || !canSubmit} className="w-full">
                {isSubmitting || compatLoading ? 'Verifica...' : 'Pubblica'}
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
  duplicateCognomi,
}: {
  matches: Shift[]
  onInterest: (shift: Shift) => void
  onPublishAnyway: () => void
  isSubmitting: boolean
  duplicateCognomi?: Set<string>
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border panel-match p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-match">
          ⚡ {matches.length === 1 ? 'Match compatibile trovato' : `${matches.length} match compatibili trovati`}
        </p>

        {matches.map(shift => {
          const interested = shift.shift_interested_users ?? []
          const alreadyCount = interested.length
          return (
            <div key={shift.id} className="rounded-lg bg-black/20 dark:bg-black/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">{formatDisplayName(shift.user, duplicateCognomi)}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded badge-match">MATCH ✓</span>
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
                <p className="text-[11px] text-match-none">♡ Nessuno ancora — saresti il primo</p>
              ) : (
                <div className="rounded bg-black/20 px-2.5 py-2 space-y-1">
                  <p className="text-[11px] font-semibold text-match-count">❤️ {alreadyCount} già {alreadyCount === 1 ? 'interessato' : 'interessati'}</p>
                  {interested
                    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                    .map((i, idx) => (
                      <div key={i.user_id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{idx + 1}° {formatDisplayName(i.user, duplicateCognomi)}</span>
                        <span className="text-[10px]">{formatRelativeTime(i.created_at!)}</span>
                      </div>
                    ))}
                  <p className="text-[11px] font-semibold text-match-pos">→ Saresti il {alreadyCount + 1}°</p>
                </div>
              )}

              <Button
                size="sm"
                className="w-full h-8 text-[12px] btn-match-action"
                onClick={() => onInterest(shift)}
              >
                ❤️ Interessati a {formatDisplayName(shift.user, duplicateCognomi)}
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
