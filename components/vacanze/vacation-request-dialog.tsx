'use client'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createVacationRequest } from '@/lib/queries/vacations'
import { VACATION_REQUESTS_QUERY_KEY } from '@/hooks/use-vacation-requests'
import { VACATION_PERIOD_LABELS, ROTATION_SEQ } from '@/lib/vacations'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { VacationPeriod } from '@/types/database'

const ALL_PERIODS: VacationPeriod[] = [1, 2, 3, 4, 5, 6]

interface Props {
  open: boolean
  onClose: () => void
  isSecondary: boolean
  userId: string
  myPeriodThisYear: VacationPeriod | null   // periodo da non mostrare tra i target
}

export function VacationRequestDialog({ open, onClose, isSecondary, userId, myPeriodThisYear }: Props) {
  // I 5 periodi selezionabili (escludi quello già assegnato)
  const selectablePeriods = ALL_PERIODS.filter(p => p !== myPeriodThisYear)

  const [selected, setSelected] = useState<VacationPeriod[]>([])
  const [qualsiasi, setQualsiasi] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryClient = useQueryClient()

  // Reset all'apertura
  useEffect(() => {
    if (open) { setSelected([]); setQualsiasi(false) }
  }, [open])

  function togglePeriod(p: VacationPeriod) {
    if (qualsiasi) {
      // Qualsiasi era attivo: deselezionalo e seleziona solo questo
      setQualsiasi(false)
      setSelected([p])
      return
    }

    const isSelected = selected.includes(p)
    if (isSelected) {
      setSelected(prev => prev.filter(x => x !== p))
      return
    }

    const next = [...selected, p]
    // Se raggiungiamo tutti e 5 i periodi selezionabili → qualsiasi
    if (next.length === selectablePeriods.length) {
      setSelected([])
      setQualsiasi(true)
    } else {
      setSelected(next)
    }
  }

  function toggleQualsiasi() {
    if (qualsiasi) {
      setQualsiasi(false)
    } else {
      setSelected([])
      setQualsiasi(true)
    }
  }

  async function handleSubmit() {
    if (!myPeriodThisYear) return
    const targetPeriods: VacationPeriod[] = qualsiasi ? selectablePeriods : selected
    if (targetPeriods.length === 0) { toast.error('Seleziona almeno un periodo'); return }

    setIsSubmitting(true)
    try {
      const supabase = createClient()
      await createVacationRequest(supabase, {
        userId,
        offeredPeriod: myPeriodThisYear,
        targetPeriods,
        year: new Date().getFullYear(),
      })
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary) })
      toast.success('Richiesta inviata')
      onClose()
    } catch {
      toast.error('Errore durante l\'invio')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!myPeriodThisYear) return null

  const offeredLabel = VACATION_PERIOD_LABELS[myPeriodThisYear].label
  const canSubmit = qualsiasi || selected.length > 0

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm rounded-2xl p-5">
        {/* Header */}
        <div className="mb-5">
          <h2 className="text-base font-bold mb-1">Nuova richiesta ferie</h2>
          <p className="text-[12px] text-muted-foreground">
            Scegli i periodi che accetteresti in cambio
          </p>
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

            {/* Qualsiasi */}
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

          {/* Hint contatore */}
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
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSubmitting}>
            Annulla
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? 'Invio…' : 'Invia richiesta'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
