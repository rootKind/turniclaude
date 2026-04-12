'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { createShift } from '@/lib/queries/shifts'
import { SHIFTS_QUERY_KEY, useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { toast } from 'sonner'
import { it } from 'date-fns/locale'
import { format, startOfDay } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import type { ShiftType } from '@/types/database'

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
}

export function ShiftDialog({ open, onClose, isSecondary }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>()
  const [offeredShift, setOfferedShift] = useState<ShiftType | null>(null)
  const [requestedShifts, setRequestedShifts] = useState<ShiftType[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()
  const { data: shifts = [] } = useShifts(isSecondary)

  const occupiedDates = new Set(
    shifts.filter(s => s.user_id === profile?.id).map(s => s.shift_date)
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
  }

  async function handleSubmit() {
    if (!selectedDate || !offeredShift || requestedShifts.length === 0) {
      toast.error('Compila tutti i campi')
      return
    }
    setIsSubmitting(true)
    try {
      await createShift({
        offered_shift: offeredShift,
        shift_date: format(selectedDate, 'yyyy-MM-dd'),
        requested_shifts: requestedShifts,
      })
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      toast.success('Turno pubblicato')
      handleClose()
    } catch {
      toast.error('Errore pubblicazione')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = !!selectedDate && !!offeredShift && requestedShifts.length > 0

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-sm w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base">Nuovo scambio turno</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[80vh] px-5 pb-5 pt-4 space-y-5">
          {/* Date picker */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Data</p>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={it}
              disabled={(date) => {
                const str = format(date, 'yyyy-MM-dd')
                return date < startOfDay(new Date()) || occupiedDates.has(str)
              }}
              className="rounded-xl border w-full"
            />
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
