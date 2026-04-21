'use client'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isAdmin } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getAllVacationAssignmentsWithUsers, type VacationAssignmentWithUser } from '@/lib/queries/vacations'
import { VACATION_PERIOD_LABELS, getVacationPeriodForYear } from '@/lib/vacations'
import type { VacationPeriod } from '@/types/database'

const MIN_YEAR = 2026
const MAX_YEAR = 2031
const ALL_PERIODS: VacationPeriod[] = [1, 2, 3, 4, 5, 6]

export default function TurniFeriePage() {
  const { profile } = useCurrentUser()
  const [viewSecondary, setViewSecondary] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [assignments, setAssignments] = useState<VacationAssignmentWithUser[]>([])
  const [expandedPeriods, setExpandedPeriods] = useState<Set<VacationPeriod>>(new Set())

  const adminUser = profile ? isAdmin(profile.id) : false
  const loggedInUserId = profile?.id ?? ''
  const effectiveIsSecondary = adminUser ? viewSecondary : (profile?.is_secondary ?? false)

  useEffect(() => {
    const supabase = createClient()
    getAllVacationAssignmentsWithUsers(supabase)
      .then(data => setAssignments(data))
      .catch(() => {})
  }, [])

  const myAssignment = assignments.find(a => a.user_id === loggedInUserId)
  const myPeriodThisYear: VacationPeriod | null = myAssignment
    ? getVacationPeriodForYear(myAssignment.base_period as VacationPeriod, selectedYear)
    : null

  useEffect(() => {
    if (myPeriodThisYear) setExpandedPeriods(new Set([myPeriodThisYear]))
  }, [myPeriodThisYear])

  useEffect(() => {
    let startX = 0
    let startY = 0
    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }
    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) <= 50 || Math.abs(dy) > Math.abs(dx)) return
      setSelectedYear(y => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y + (dx > 0 ? -1 : 1))))
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  const filtered = assignments.filter(a => a.user?.is_secondary === effectiveIsSecondary)

  const grouped = ALL_PERIODS.map(period => {
    const users = filtered
      .filter(a => getVacationPeriodForYear(a.base_period as VacationPeriod, selectedYear) === period)
      .sort((a, b) => (a.user?.cognome ?? '').localeCompare(b.user?.cognome ?? '', 'it'))
    return { period, meta: VACATION_PERIOD_LABELS[period], users }
  })

  function togglePeriod(period: VacationPeriod) {
    setExpandedPeriods(prev => {
      const next = new Set(prev)
      if (next.has(period)) next.delete(period)
      else next.add(period)
      return next
    })
  }

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedYear(y => Math.max(MIN_YEAR, y - 1))}
            disabled={selectedYear <= MIN_YEAR}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-lg font-bold tabular-nums w-14 text-center">{selectedYear}</h1>
          <button
            onClick={() => setSelectedYear(y => Math.min(MAX_YEAR, y + 1))}
            disabled={selectedYear >= MAX_YEAR}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {adminUser && (
          <button
            onClick={() => setViewSecondary(v => !v)}
            className="text-xs font-medium px-2 py-0.5 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
          >
            {viewSecondary ? 'Noni' : 'DCO'}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {grouped.map(({ period, meta, users }) => {
          const isMyPeriod = period === myPeriodThisYear
          const isOpen = expandedPeriods.has(period)

          return (
            <div
              key={period}
              className={`rounded-xl border overflow-hidden transition-colors ${
                isMyPeriod
                  ? 'border-sky-400 dark:border-sky-600 bg-sky-50 dark:bg-sky-950/30'
                  : 'border-border bg-card'
              }`}
            >
              <button
                onClick={() => togglePeriod(period)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isMyPeriod && (
                    <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
                  )}
                  <span className={`font-semibold text-sm ${isMyPeriod ? 'text-sky-800 dark:text-sky-200' : ''}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{users.length}</span>
                  <ChevronRight
                    size={14}
                    className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border">
                  {users.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Nessuno</p>
                  ) : (
                    users.map(a => {
                      const isMe = a.user_id === loggedInUserId
                      return (
                        <div
                          key={a.user_id}
                          className={`px-4 py-2 flex items-center gap-2 text-sm ${
                            isMe
                              ? 'font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200'
                              : 'text-foreground'
                          }`}
                        >
                          {isMe && <span className="text-sky-500 text-xs">★</span>}
                          {!isMe && <span className="w-3" />}
                          <span>{a.user?.cognome} {a.user?.nome}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
