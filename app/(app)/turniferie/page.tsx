'use client'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isAdmin } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getAllVacationAssignmentsWithUsers, type VacationAssignmentWithUser } from '@/lib/queries/vacations'
import { VACATION_PERIOD_LABELS, getVacationPeriodForYear } from '@/lib/vacations'
import { getAppSettings } from '@/lib/queries/app-settings'
import type { VacationPeriod } from '@/types/database'

const MAX_YEAR = 2099
const ALL_PERIODS: VacationPeriod[] = [1, 2, 3, 4, 5, 6]

function displayName(a: VacationAssignmentWithUser, cognomes: string[]) {
  const cognome = a.user?.cognome ?? ''
  const nome = a.user?.nome ?? ''
  const isDup = cognomes.filter(c => c === cognome).length > 1
  return isDup ? `${cognome} ${nome.charAt(0)}.` : cognome
}

export default function TurniFeriePage() {
  const { profile } = useCurrentUser()
  const [viewSecondary, setViewSecondary] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [minYear, setMinYear] = useState(2026)
  const [assignments, setAssignments] = useState<VacationAssignmentWithUser[]>([])
  const [expandedPeriods, setExpandedPeriods] = useState<Set<VacationPeriod>>(new Set([1, 2, 3, 4, 5, 6]))
  // true when viewport is tall enough to show all 6 cards fully expanded
  const [alwaysExpanded, setAlwaysExpanded] = useState(true)

  const adminUser = profile ? isAdmin(profile.id) : false
  const loggedInUserId = profile?.id ?? ''
  const effectiveIsSecondary = adminUser ? viewSecondary : (profile?.is_secondary ?? false)

  useEffect(() => {
    localStorage.setItem('turni-last-page', '/turniferie')
    const supabase = createClient()
    getAppSettings(supabase).then(s => setMinYear(s.min_year_turniferie)).catch(() => {})
  }, [])

  useEffect(() => {
    function check() {
      setAlwaysExpanded(window.innerHeight >= 600)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
      setSelectedYear(y => Math.min(MAX_YEAR, Math.max(minYear,y + (dx > 0 ? -1 : 1))))
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  const filtered = assignments.filter(a => a.user?.is_secondary === effectiveIsSecondary)
  const allCognomes = filtered.map(a => a.user?.cognome ?? '')

  const grouped = ALL_PERIODS.map(period => {
    const users = filtered
      .filter(a => getVacationPeriodForYear(a.base_period as VacationPeriod, selectedYear) === period)
      .sort((a, b) => (a.user?.cognome ?? '').localeCompare(b.user?.cognome ?? '', 'it'))
    return { period, meta: VACATION_PERIOD_LABELS[period], users }
  })

  function togglePeriod(period: VacationPeriod) {
    if (alwaysExpanded) return
    setExpandedPeriods(prev => {
      const next = new Set(prev)
      if (next.has(period)) next.delete(period)
      else next.add(period)
      return next
    })
  }

  return (
    <main
      className="mx-auto px-3 pt-5 max-w-2xl flex flex-col"
      style={{ height: 'calc(100dvh - 4rem)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold">Turni Ferie</h1>
        {adminUser && (
          <button
            onClick={() => setViewSecondary(v => !v)}
            className="text-xs font-medium px-2 py-0.5 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
          >
            {viewSecondary ? 'Noni' : 'DCO'}
          </button>
        )}
      </div>

      <div className="flex items-center mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedYear(y => Math.max(minYear, y - 1))}
            disabled={selectedYear <= minYear}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold tabular-nums w-14 text-center">{selectedYear}</span>
          <button
            onClick={() => setSelectedYear(y => Math.min(MAX_YEAR, y + 1))}
            disabled={selectedYear >= MAX_YEAR}
            className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 flex-1 min-h-0" style={{ gridTemplateRows: 'repeat(3, 1fr)' }}>
        {grouped.map(({ period, meta, users }) => {
          const isMyPeriod = period === myPeriodThisYear
          const isOpen = alwaysExpanded || expandedPeriods.has(period)

          return (
            <div
              key={period}
              className={`rounded-xl border overflow-hidden transition-colors flex flex-col min-h-0 ${
                isMyPeriod
                  ? 'border-sky-400 dark:border-sky-600 bg-sky-50 dark:bg-sky-950/30'
                  : 'border-[#bdd0e0] dark:border-[#2e2e2e] bg-[#dde8f0] dark:bg-[#1a1a1a]'
              }`}
            >
              <button
                onClick={() => togglePeriod(period)}
                disabled={alwaysExpanded}
                className="w-full flex items-center justify-between px-3 py-2 text-left disabled:cursor-default"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isMyPeriod && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                  )}
                  <span className={`font-semibold text-xs ${isMyPeriod ? 'text-sky-800 dark:text-sky-200' : ''}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{users.length}</span>
                  {!alwaysExpanded && (
                    <ChevronRight
                      size={12}
                      className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border flex-1 overflow-auto min-h-0">
                  {users.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Nessuno</p>
                  ) : (
                    <div className="grid grid-cols-2 px-2 py-1.5 gap-y-0.5">
                      {users.map(a => {
                        const isMe = a.user_id === loggedInUserId
                        return (
                          <div
                            key={a.user_id}
                            className={`flex items-center gap-1 py-0.5 text-xs rounded px-1 ${
                              isMe
                                ? 'font-semibold text-sky-800 dark:text-sky-200'
                                : 'text-foreground'
                            }`}
                          >
                            {isMe && <span className="text-sky-500 text-[9px] leading-none">★</span>}
                            <span>{displayName(a, allCognomes)}</span>
                          </div>
                        )
                      })}
                    </div>
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
