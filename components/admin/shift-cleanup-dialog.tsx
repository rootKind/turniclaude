'use client'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Eraser, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { listScheduleMonths } from '@/lib/queries/sala-schedule'
import type { ShiftCleanupCandidate } from '@/lib/queries/shift-cleanup'
import { cn, SHIFT_PILL_CLASSES } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_IT[m - 1]} ${y}`
}

function formatDayMonth(dateStr: string): string {
  const [, mm, dd] = dateStr.split('-')
  return `${dd}/${mm}`
}

interface Props {
  open: boolean
  onClose: () => void
  /** Se presente, la pulizia è limitata a questo mese (es. subito dopo un upload). */
  month?: string
  /** Candidati già calcolati dal server (upload PDF): evita una seconda fetch. */
  initialCandidates?: ShiftCleanupCandidate[]
  /** Chiamato dopo l'eliminazione riuscita, con il numero di cambi eliminati. */
  onDeleted?: (count: number) => void
}

/**
 * Mostra le richieste di cambio turno che il calendario reale già mostra
 * esaudite e, dopo una conferma esplicita, le elimina.
 */
export function ShiftCleanupDialog({ open, onClose, month, initialCandidates, onDeleted }: Props) {
  const pickerEnabled = !month
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState(month ?? '')
  const [candidates, setCandidates] = useState<ShiftCleanupCandidate[]>(initialCandidates ?? [])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = useCallback(async (m: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/shift-cleanup?month=${m}`)
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error || 'Errore anteprima')
      }
      const body = (await res.json()) as { candidates?: ShiftCleanupCandidate[] }
      setCandidates(body.candidates ?? [])
    } catch (err) {
      setError((err as Error).message)
      setCandidates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setArmed(false)
    setError(null)

    if (initialCandidates) {
      setSelectedMonth(month ?? '')
      setCandidates(initialCandidates)
      return
    }

    let cancelled = false
    setCandidates([])
    setLoading(true)
    ;(async () => {
      let m = month ?? ''
      if (!m) {
        try {
          const list = await listScheduleMonths(createClient())
          if (cancelled) return
          setMonths(list)
          m = list[0] ?? ''
        } catch { /* nessun mese disponibile */ }
      }
      if (cancelled) return
      setSelectedMonth(m)
      if (m) {
        await preview(m)
      } else {
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, month, initialCandidates, preview])

  const selectMonth = (m: string) => {
    setSelectedMonth(m)
    setArmed(false)
    preview(m)
  }

  const handleDelete = async () => {
    if (!armed) { setArmed(true); return }
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/shift-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: candidates.map(c => c.id) }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error || 'Errore eliminazione')
      }
      const body = (await res.json()) as { deleted?: number }
      const n = body.deleted ?? candidates.length
      toast.success(n === 1 ? '1 cambio eliminato' : `${n} cambi eliminati`)
      onDeleted?.(n)
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeleting(false)
      setArmed(false)
    }
  }

  const count = candidates.length

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eraser size={16} /> Pulizia cambi turno
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          <p className="text-xs text-muted-foreground">
            Queste richieste risultano già soddisfatte dal turno caricato: la persona
            ha già il turno che aveva chiesto, quindi la richiesta è inutile e può
            essere eliminata.
          </p>

          {pickerEnabled && months.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Mese</span>
              <Select
                value={selectedMonth}
                onValueChange={v => { if (v) selectMonth(v) }}
                items={months.map(m => ({ value: m, label: formatMonthLabel(m) }))}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Scegli mese" />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {loading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> Controllo in corso…
            </p>
          ) : error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : count === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun cambio da eliminare.</p>
          ) : (
            <>
              <p className="text-sm font-semibold">
                {count === 1 ? '1 cambio da eliminare' : `${count} cambi da eliminare`}
              </p>
              <ul className="flex flex-col gap-1.5">
                {candidates.map(c => (
                  <li key={c.id} className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-sm font-medium truncate">
                      {[c.cognome, c.nome].filter(Boolean).join(' ') || 'Utente sconosciuto'}
                      <span className="text-muted-foreground font-normal"> · {formatDayMonth(c.shift_date)}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                      <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold', SHIFT_PILL_CLASSES[c.offered_shift])}>
                        {c.offered_shift.charAt(0)}
                      </span>
                      <ArrowRight size={11} />
                      {c.requested_shifts.map(r => (
                        <span key={r} className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold', SHIFT_PILL_CLASSES[r])}>
                          {r.charAt(0)}
                        </span>
                      ))}
                      {/* Il motivo: il cambio è già nel calendario, oppure quel
                          giorno la persona è fuori sala (assenza/attività senza
                          sezione) e non ha nessun turno da cedere. */}
                      <span className="ml-1">
                        {c.reason === 'fuori-sala'
                          ? `fuori sala quel giorno: ${c.day_label ?? 'assenza'} (${c.day_code ?? ''})`
                          : `già in ${c.actual_shift} nel calendario`}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>

              {armed && (
                <p className="text-xs text-destructive font-medium flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  Sei sicuro? {count === 1 ? 'La richiesta verrà eliminata' : 'Le richieste verranno eliminate'} definitivamente.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" disabled={deleting} onClick={onClose}>
            Chiudi
          </Button>
          {count > 0 && !loading && (
            <Button variant="destructive" className="flex-1" disabled={deleting} onClick={handleDelete}>
              {deleting
                ? 'Eliminazione…'
                : armed
                  ? `Sei sicuro? Conferma (${count})`
                  : count === 1 ? 'Elimina 1 cambio' : `Elimina ${count} cambi`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
