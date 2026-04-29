'use client'
import { useMemo } from 'react'
import { useVacationRequests } from '@/hooks/use-vacation-requests'
import { VacationRequestItem } from './vacation-request-item'
import { Skeleton } from '@/components/ui/skeleton'
import { useDuplicateCognomi } from '@/hooks/use-users'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isManager } from '@/types/database'
import type { VacationPeriod } from '@/types/database'

interface Props {
  isSecondary: boolean
  effectiveUserId: string
  loggedInUserId: string
  myPeriodThisYear: VacationPeriod | null
  year: number
  highlightRequestIds?: number[]
}

function dayKey(createdAt: string) {
  return new Date(createdAt).toISOString().slice(0, 10)
}

export function VacationRequestList({ isSecondary, effectiveUserId, loggedInUserId, myPeriodThisYear, year, highlightRequestIds = [] }: Props) {
  const { data: requests = [], isLoading } = useVacationRequests(isSecondary, year)
  const { profile } = useCurrentUser()
  const isManagerView = profile ? isManager(profile) : false

  const duplicateCognomi = useDuplicateCognomi(isSecondary)

  const dateIndexes = useMemo(() => {
    const count = new Map<string, number>()
    return requests.map(r => {
      const k = dayKey(r.created_at)
      const idx = count.get(k) ?? 0
      count.set(k, idx + 1)
      return idx
    })
  }, [requests])

  if (isLoading) return <VacationListSkeleton />
  if (!requests.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      Nessuna richiesta di cambio ferie.
    </div>
  )

  return (
    <div className="flex flex-col gap-0">
      {requests.map((request, index) => {
        const prev = requests[index - 1]
        const isSameDateAsPrevious = !!prev && dayKey(prev.created_at) === dayKey(request.created_at)
        return (
          <VacationRequestItem
            key={request.id}
            request={request}
            currentUserId={effectiveUserId}
            loggedInUserId={loggedInUserId}
            isSecondary={isSecondary}
            myPeriodThisYear={myPeriodThisYear}
            isSameDateAsPrevious={isSameDateAsPrevious}
            dateIndex={dateIndexes[index]}
            year={year}
            isHighlighted={highlightRequestIds.includes(request.id)}
            duplicateCognomi={duplicateCognomi}
            isManagerView={isManagerView}
          />
        )
      })}
    </div>
  )
}

function VacationListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
      ))}
    </div>
  )
}
