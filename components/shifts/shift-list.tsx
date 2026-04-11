'use client'
import { useState } from 'react'
import { useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { ShiftItem } from './shift-item'
import { EditShiftDialog } from './edit-shift-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { Shift } from '@/types/database'

export function ShiftList() {
  const { profile } = useCurrentUser()
  const isSecondary = profile?.is_secondary ?? false
  const { data: shifts = [], isLoading } = useShifts(isSecondary)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)

  if (isLoading) return <ShiftListSkeleton />
  if (!shifts.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      Nessun turno disponibile. Premi + per aggiungerne uno.
    </div>
  )

  return (
    <>
      <div className="flex flex-col gap-3">
        {shifts.map((shift, index) => {
          const prev = shifts[index - 1]
          const isSameDateAsPrevious = !!prev && prev.shift_date === shift.shift_date
          return (
            <ShiftItem
              key={shift.id}
              shift={shift}
              currentUserId={profile?.id ?? ''}
              isSecondary={isSecondary}
              isSameDateAsPrevious={isSameDateAsPrevious}
              onEdit={setEditingShift}
            />
          )
        })}
      </div>
      {editingShift && (
        <EditShiftDialog
          shift={editingShift}
          open={!!editingShift}
          onClose={() => setEditingShift(null)}
          isSecondary={isSecondary}
        />
      )}
    </>
  )
}

function ShiftListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
      ))}
    </div>
  )
}
