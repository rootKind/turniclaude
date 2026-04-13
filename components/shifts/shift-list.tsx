'use client'
import { useState, useMemo } from 'react'
import { useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { ShiftItem } from './shift-item'
import { EditShiftDialog } from './edit-shift-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Shift } from '@/types/database'

const MONTH_LABELS: Record<string, string> = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mag', '06': 'Giu', '07': 'Lug', '08': 'Ago',
  '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic',
}

interface ShiftListProps {
  isSecondary?: boolean
  effectiveUserId?: string
  loggedInUserId?: string
}

export function ShiftList({ isSecondary: isSecondaryProp, effectiveUserId: effectiveUserIdProp, loggedInUserId: loggedInUserIdProp }: ShiftListProps = {}) {
  const { profile } = useCurrentUser()
  const isSecondary = isSecondaryProp !== undefined ? isSecondaryProp : (profile?.is_secondary ?? false)
  const effectiveUserId = effectiveUserIdProp ?? profile?.id ?? ''
  const loggedInUserId = loggedInUserIdProp ?? profile?.id ?? ''
  const { data: shifts = [], isLoading } = useShifts(isSecondary)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  const months = useMemo(() => {
    const seen = new Set<string>()
    return shifts
      .map(s => s.shift_date.slice(0, 7))
      .filter(m => { if (seen.has(m)) return false; seen.add(m); return true })
  }, [shifts])

  const filtered = useMemo(() =>
    selectedMonth ? shifts.filter(s => s.shift_date.startsWith(selectedMonth)) : shifts,
    [shifts, selectedMonth]
  )

  if (isLoading) return <ShiftListSkeleton />
  if (!shifts.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      Nessun turno disponibile. Premi + per aggiungerne uno.
    </div>
  )

  return (
    <>
      {/* Month filter */}
      {months.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
          <MonthChip label="Tutti" active={!selectedMonth} onClick={() => setSelectedMonth(null)} />
          {months.map(m => {
            const [year, month] = m.split('-')
            const label = `${MONTH_LABELS[month]} ${year}`
            return (
              <MonthChip key={m} label={label} active={selectedMonth === m} onClick={() => setSelectedMonth(m)} />
            )
          })}
        </div>
      )}

      <div className="flex flex-col gap-0">
        {filtered.map((shift, index) => {
          const prev = filtered[index - 1]
          const isSameDateAsPrevious = !!prev && prev.shift_date === shift.shift_date
          return (
            <ShiftItem
              key={shift.id}
              shift={shift}
              currentUserId={effectiveUserId}
              loggedInUserId={loggedInUserId}
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
          useAdminRoute={loggedInUserId !== editingShift.user_id && loggedInUserId !== ''}
        />
      )}
    </>
  )
}

function MonthChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      {label}
    </button>
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
