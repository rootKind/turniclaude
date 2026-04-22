'use client'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn, formatDisplayName, formatRelativeTime } from '@/lib/utils'
import {
  createVacationRequest,
  getVacationRequests,
  findCompatibleVacationRequests,
  toggleVacationInterest,
} from '@/lib/queries/vacations'
import { VACATION_REQUESTS_QUERY_KEY, useVacationRequests } from '@/hooks/use-vacation-requests'
import { VACATION_PERIOD_LABELS, getVacationPeriodForYear } from '@/lib/vacations'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { VacationPeriod, VacationRequestWithInterests } from '@/types/database'
import { useCurrentUser } from '@/hooks/use-current-user'

const ALL_PERIODS: VacationPeriod[] = [1, 2, 3, 4, 5, 6]
const MIN_YEAR = 2026
const MAX_YEAR = 2099

interface Props {
  open: boolean
  onClose: () => void
  isSecondary: boolean
  userId: string
  basePeriod: VacationPeriod | null
  defaultYear: number
}

export function VacationRequestDialog({ open, onClose, isSecondary, userId, basePeriod, defaultYear }: Props) {
  const [year, setYear] = useState(defaultYear)
  const [selected, setSelected] = useState<VacationPeriod[]>([])
  const [qualsiasi, setQualsiasi] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [compatibleMatches, setCompatibleMatches] = useState<VacationRequestWithInterests[]>([])
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()
  const { data: allRequests = [] } = useVacationRequests(isSecondary, year)

  const myPeriodThisYear = basePeriod != null ? getVacationPeriodForYear(basePeriod, year) : null
  const selectablePeriods = ALL_PERIODS.filter(p => p !== myPeriodThisYear)

  useEffect(() => {
    if (open) { setYear(defaultYear); setSelected([]); setQualsiasi(false); setCompatibleMatches([]) }
  }, [open, defaultYear])

  useEffect(() => {
    setSelected([])
    setQualsiasi(false)
    setCompatibleMatches([])
  }, [year])

  function togglePeriod(p: VacationPeriod) {
    if (qualsiasi) { setQualsiasi(false); setSelected([p]); return }
    const isSelected = selected.includes(p)
    if (isSelected) { setSelected(prev => prev.filter(x => x !== p)); return }
    const next = [...selected, p]
    if (next.length === selectablePeriods.length) { setSelected([]); setQualsiasi(true) }
    else { setSelected(next) }
  }

  function toggleQualsiasi() {
    if (qualsiasi) { setQualsiasi(false) } else { setSelected([]); setQualsiasi(true) }
  }

  function handleClose() {
    onClose()
    setSelected([])
    setQualsiasi(false)
    setCompatibleMatches([])
  }

  async function doPublish() {
    if (!myPeriodThisYear) return
    const targetPeriods: VacationPeriod[] = qualsiasi ? selectablePeriods : selected
    setCompatibleMatches([])
    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const existing = await getVacationRequests(supabase, userId, year)
      if (existing.length > 0) {
        toast.error(`Hai già una richiesta per il ${year}`)
        return
      }
      await createVacationRequest(supabase, {
        userId,
        offeredPeriod: myPeriodThisYear,
        targetPeriods,
        year,
      })
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      const actorName = [profile?.nome, profile?.cognome].filter(Boolean).join(' ')
      fetch('/api/push/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_vacation',
          isSecondary,
          offeredPeriod: myPeriodThisYear,
          targetPeriods,
          actorName,
          year,
        }),
      }).catch(() => {})
      toast.success('Richiesta inviata')
      handleClose()
    } catch {
      toast.error('Errore durante l\'invio')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit() {
    if (!myPeriodThisYear) return
    const targetPeriods: VacationPeriod[] = qualsiasi ? selectablePeriods : selected
    if (targetPeriods.length === 0) { toast.error('Seleziona almeno un periodo'); return }

    const matches = findCompatibleVacationRequests(allRequests, myPeriodThisYear, targetPeriods, userId)
    if (matches.length > 0) {
      setCompatibleMatches(matches)
      return
    }
    await doPublish()
  }

  async function handleInterestInMatch(request: VacationRequestWithInterests) {
    const alreadyInterested = request.vacation_request_interests.some(i => i.user_id === userId)
    if (alreadyInterested) {
      toast.success('Sei già interessato a questa richiesta')
      handleClose()
      return
    }
    try {
      const supabase = createClient()
      await toggleVacationInterest(supabase, request.id, userId, false)
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      const actorName = [profile?.nome, profile?.cognome].filter(Boolean).join(' ')
      fetch('/api/push/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'vacation_interest', requestId: request.id, actorName, year }),
      }).catch(() => {})
      toast.success('Interesse registrato')
      handleClose()
    } catch {
      toast.error('Errore')
      handleClose()
    }
  }

  if (!basePeriod) return null

  const offeredLabel = myPeriodThisYear ? VACATION_PERIOD_LABELS[myPeriodThisYear].label : '—'
  const canSubmit = qualsiasi || selected.length > 0

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-sm rounded-2xl p-5">
        {compatibleMatches.length > 0 ? (
          <VacationCompatibilityPanel
            matches={compatibleMatches}
            onInterest={handleInterestInMatch}
            onPublishAnyway={doPublish}
            isSubmitting={isSubmitting}
            currentUserId={userId}
          />
        ) : (
          <>
            {/* Header */}
            <div className="mb-4">
              <h2 className="text-base font-bold mb-1">Nuova richiesta ferie</h2>
              <p className="text-[12px] text-muted-foreground">
                Scegli i periodi che accetteresti in cambio
              </p>
            </div>

            {/* Anno */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setYear(y => Math.max(MIN_YEAR, y - 1))}
                disabled={year <= MIN_YEAR}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold">{year}</span>
              <button
                onClick={() => setYear(y => Math.min(MAX_YEAR, y + 1))}
                disabled={year >= MAX_YEAR}
                className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Periodo offerto */}
            <div className="mb-5 px-3 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
              <p className="text-[11px] text-sky-600 dark:text-sky-400 font-medium uppercase tracking-wide mb-0.5">
                Offri
              </p>
              <p className="text-[14px] font-semibold text-sky-800 dark:text-sky-200">
                {offeredLabel}
              </p>
            </div>

            {/* Periodi target */}
            <div className="mb-5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">
                Accetti in cambio
              </p>
              <div className="flex flex-col gap-2">
                {selectablePeriods.map(p => {
                  const isActive = selected.includes(p)
                  return (
                    <button
                      key={p}
                      onClick={() => togglePeriod(p)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-xl border text-[13px] font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-foreground hover:bg-muted/60',
                        qualsiasi && 'opacity-40 pointer-events-none',
                      )}
                    >
                      <span className="text-[10px] font-bold mr-2 opacity-60">{p}</span>
                      {VACATION_PERIOD_LABELS[p].label}
                    </button>
                  )
                })}

                <button
                  onClick={toggleQualsiasi}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl border text-[13px] font-medium transition-colors mt-1',
                    qualsiasi
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-dashed border-muted-foreground/40 text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  Qualsiasi periodo
                </button>
              </div>

              {!qualsiasi && selected.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2 text-right">
                  {selected.length} selezionati
                  {selected.length === selectablePeriods.length - 1 && (
                    <span className="ml-1 text-primary">— un altro → qualsiasi</span>
                  )}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleClose} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? 'Invio…' : 'Invia richiesta'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function VacationCompatibilityPanel({
  matches,
  onInterest,
  onPublishAnyway,
  isSubmitting,
  currentUserId,
}: {
  matches: VacationRequestWithInterests[]
  onInterest: (request: VacationRequestWithInterests) => void
  onPublishAnyway: () => void
  isSubmitting: boolean
  currentUserId: string
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-600/40 bg-green-950/20 dark:bg-green-950/30 p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-green-400">
          ⚡ {matches.length === 1 ? 'Richiesta compatibile trovata' : `${matches.length} richieste compatibili trovate`}
        </p>

        {matches.map(request => {
          const interested = request.vacation_request_interests ?? []
          const alreadyInterested = interested.some(i => i.user_id === currentUserId)
          const alreadyCount = interested.length
          const offeredLabel = VACATION_PERIOD_LABELS[request.offered_period].label
          const targetLabels = (request.target_periods as VacationPeriod[]).map(p => VACATION_PERIOD_LABELS[p].label)

          return (
            <div key={request.id} className="rounded-lg bg-black/20 dark:bg-black/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">{formatDisplayName(request.user)}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-900/50 text-green-400">MATCH ✓</span>
              </div>

              <div className="text-[12px] space-y-0.5">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Offre:</span> {offeredLabel}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Vuole:</span> {targetLabels.join(' o ')}
                </p>
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
                onClick={() => onInterest(request)}
                disabled={alreadyInterested}
              >
                {alreadyInterested ? '✓ Già interessato' : `❤️ Interessati a ${request.user.cognome ?? request.user.nome}`}
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
        {isSubmitting ? 'Invio…' : 'Pubblica comunque la mia richiesta'}
      </Button>
    </div>
  )
}
