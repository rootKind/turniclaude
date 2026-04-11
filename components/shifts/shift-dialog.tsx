'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { createShift } from '@/lib/queries/shifts'
import { SHIFTS_QUERY_KEY } from '@/hooks/use-shifts'
import { useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { toast } from 'sonner'
import { it } from 'date-fns/locale'
import { format } from 'date-fns'
import type { ShiftType } from '@/types/database'

const SHIFT_TYPES: ShiftType[] = ['Mattina', 'Pomeriggio', 'Notte']

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
      onClose()
      setSelectedDate(undefined); setOfferedShift(null); setRequestedShifts([])
    } catch {
      toast.error('Errore pubblicazione')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Nuovo scambio turno</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Seleziona data</p>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={it}
              disabled={(date) => {
                const str = format(date, 'yyyy-MM-dd')
                return date < new Date() || occupiedDates.has(str)
              }}
              className="rounded-lg border"
            />
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Turno che offri</p>
            <div className="flex gap-2">
              {SHIFT_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => { setOfferedShift(type); setRequestedShifts(prev => prev.filter(t => t !== type)) }}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                    offeredShift === type ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
                  )}
                >{type}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Turni che accetti (max 2)</p>
            <p className="text-xs text-muted-foreground mb-2">Seleziona quali turni vorresti in cambio</p>
            <div className="flex gap-2">
              {SHIFT_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => toggleRequested(type)}
                  disabled={type === offeredShift}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                    requestedShifts.includes(type) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent',
                    type === offeredShift && 'opacity-30 cursor-not-allowed'
                  )}
                >{type}</button>
              ))}
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Pubblicazione...' : 'Pubblica'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
