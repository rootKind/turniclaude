'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { updateShiftRequested } from '@/lib/queries/shifts'
import { SHIFTS_QUERY_KEY } from '@/hooks/use-shifts'
import { toast } from 'sonner'
import type { Shift, ShiftType } from '@/types/database'

const SHIFT_TYPES: ShiftType[] = ['Mattina', 'Pomeriggio', 'Notte']

interface Props {
  shift: Shift
  open: boolean
  onClose: () => void
  isSecondary: boolean
}

export function EditShiftDialog({ shift, open, onClose, isSecondary }: Props) {
  const [selected, setSelected] = useState<ShiftType[]>(shift.requested_shifts as ShiftType[])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryClient = useQueryClient()

  function toggle(type: ShiftType) {
    if (type === shift.offered_shift) return
    setSelected(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : prev.length < 2 ? [...prev, type] : prev
    )
  }

  async function handleSave() {
    if (selected.length === 0) { toast.error('Seleziona almeno un turno'); return }
    setIsSubmitting(true)
    try {
      await updateShiftRequested(shift.id, selected)
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      toast.success('Turno aggiornato')
      onClose()
    } catch {
      toast.error('Errore aggiornamento')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Modifica turni richiesti</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Stai offrendo: <strong>{shift.offered_shift}</strong>
          </p>
          <div>
            <p className="text-sm font-medium mb-2">Turni che accetti (max 2)</p>
            <div className="flex gap-2">
              {SHIFT_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => toggle(type)}
                  disabled={type === shift.offered_shift}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                    selected.includes(type) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent',
                    type === shift.offered_shift && 'opacity-30 cursor-not-allowed'
                  )}
                >{type}</button>
              ))}
            </div>
          </div>
          <Button onClick={handleSave} disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
