'use client'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { User } from 'lucide-react'
import { useVacationRequests } from '@/hooks/use-vacation-requests'
import { VacationRequestItem } from './vacation-request-item'
import { FilterChip } from '@/components/ui/filter-chip'
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
  // Group by Europe/Rome day, not UTC (Italian evenings would land on the next day)
  return new Intl.DateTimeFormat('sv', { timeZone: 'Europe/Rome' }).format(new Date(createdAt))
}

export function VacationRequestList({ isSecondary, effectiveUserId, loggedInUserId, myPeriodThisYear, year, highlightRequestIds = [] }: Props) {
  const { data: requests = [], isLoading } = useVacationRequests(isSecondary, year)
  const { profile } = useCurrentUser()
  const isManagerView = profile ? isManager(profile) : false
  const [compatibleOnly, setCompatibleOnly] = useState(false)

  const duplicateCognomi = useDuplicateCognomi(isSecondary)

  const filtered = useMemo(() => {
    if (isManagerView && compatibleOnly) return requests.filter(r => r.vacation_request_interests.length > 0)
    return requests
  }, [requests, isManagerView, compatibleOnly])

  // Conteggi per i contatori sulle chip dei filtri
  const chipCounts = useMemo(() => ({
    total: requests.length,
    compatible: requests.filter(r => r.vacation_request_interests.length > 0).length,
  }), [requests])

  const dateIndexes = useMemo(() => {
    const count = new Map<string, number>()
    return filtered.map(r => {
      const k = dayKey(r.created_at)
      const idx = count.get(k) ?? 0
      count.set(k, idx + 1)
      return idx
    })
  }, [filtered])

  if (isLoading) return <VacationListSkeleton />

  return (
    <motion.div
      key={year}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {!requests.length ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nessuna richiesta di cambio ferie.
        </div>
      ) : (
        <>
          {isManagerView && (
            <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
              {/* Chip `FilterChip` (M4): geometria nei token, non markup copiato. */}
              <FilterChip
                onClick={() => setCompatibleOnly(false)}
                selected={!compatibleOnly}
                count={chipCounts.total}
              >
                Tutti
              </FilterChip>
              <FilterChip
                onClick={() => setCompatibleOnly(true)}
                selected={compatibleOnly}
                dashed={!compatibleOnly}
                icon={<User className="w-3 h-3" />}
                count={chipCounts.compatible}
              >
                Solo compatibili
              </FilterChip>
            </div>
          )}
          <div className="flex flex-col gap-0">
            {filtered.map((request, index) => {
              const prev = filtered[index - 1]
              const next = filtered[index + 1]
              const isSameDateAsPrevious = !!prev && dayKey(prev.created_at) === dayKey(request.created_at)
              const isSameDateAsNext = !!next && dayKey(next.created_at) === dayKey(request.created_at)
              return (
                <motion.div
                  key={request.id}
                  className={index === 0 ? 'mt-0' : isSameDateAsPrevious ? 'mt-0' : 'mt-3'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(index * 0.04, 0.3), ease: 'easeOut' }}
                >
                  <VacationRequestItem
                    request={request}
                    currentUserId={effectiveUserId}
                    loggedInUserId={loggedInUserId}
                    isSecondary={isSecondary}
                    myPeriodThisYear={myPeriodThisYear}
                    isSameDateAsPrevious={isSameDateAsPrevious}
                    isSameDateAsNext={isSameDateAsNext}
                    dateIndex={dateIndexes[index]}
                    year={year}
                    isHighlighted={highlightRequestIds.includes(request.id)}
                    duplicateCognomi={duplicateCognomi}
                    isManagerView={isManagerView}
                  />
                </motion.div>
              )
            })}
          </div>
        </>
      )}
    </motion.div>
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
