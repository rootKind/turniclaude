'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isAdmin } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getMyVacationAssignment } from '@/lib/queries/vacations'
import { VACATION_PERIOD_LABELS } from '@/lib/vacations'
import { VacationRequestList } from '@/components/vacanze/vacation-request-list'
import { VacationRequestDialog } from '@/components/vacanze/vacation-request-dialog'
import type { VacationPeriod } from '@/types/database'

const MIN_YEAR = 2026
const MAX_YEAR = 2099

function VacanzeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { profile } = useCurrentUser()
  const [viewSecondary, setViewSecondary] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [myPeriodThisYear, setMyPeriodThisYear] = useState<VacationPeriod | null>(null)
  const [basePeriod, setBasePeriod] = useState<VacationPeriod | null>(null)
  const [periodLabel, setPeriodLabel] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const adminUser = profile ? isAdmin(profile.id) : false
  const loggedInUserId = profile?.id ?? ''
  const effectiveIsSecondary = adminUser ? viewSecondary : (profile?.is_secondary ?? false)

  useEffect(() => {
    if (!loggedInUserId) return
    const supabase = createClient()
    getMyVacationAssignment(supabase, loggedInUserId, selectedYear)
      .then(assignment => {
        if (!assignment) { setMyPeriodThisYear(null); setPeriodLabel(null); setBasePeriod(null); return }
        setBasePeriod(assignment.base_period as VacationPeriod)
        setMyPeriodThisYear(assignment.period_this_year)
        setPeriodLabel(VACATION_PERIOD_LABELS[assignment.period_this_year].label)
      })
      .catch(() => {})
  }, [loggedInUserId, selectedYear])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDialogOpen(true)
      router.replace('/vacanze')
    }
  }, [searchParams, router])

  function changeYear(delta: number) {
    setSelectedYear(y => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y + delta)))
  }

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

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold">Ferie Sala C.C.C.</h1>
        {profile && adminUser && (
          <button
            onClick={() => setViewSecondary(v => !v)}
            className="text-xs font-medium px-2 py-0.5 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
          >
            {viewSecondary ? 'Noni' : 'DCO'}
          </button>
        )}
      </div>

      {/* Periodo ferie con navigazione anno */}
      <div className="mb-4 px-3 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 flex items-center gap-2">
        <button
          onClick={() => changeYear(-1)}
          disabled={selectedYear <= MIN_YEAR}
          className="p-1 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/40 disabled:opacity-30 transition-colors flex-shrink-0"
        >
          <ChevronLeft size={16} className="text-sky-600 dark:text-sky-400" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-sky-600 dark:text-sky-400 font-medium uppercase tracking-wide mb-0.5">
            Il tuo periodo {selectedYear}
          </p>
          <p className="text-[14px] font-semibold text-sky-800 dark:text-sky-200">
            {periodLabel ?? '—'}
          </p>
        </div>
        <button
          onClick={() => changeYear(1)}
          disabled={selectedYear >= MAX_YEAR}
          className="p-1 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/40 disabled:opacity-30 transition-colors flex-shrink-0"
        >
          <ChevronRight size={16} className="text-sky-600 dark:text-sky-400" />
        </button>
      </div>

      <VacationRequestList
        isSecondary={effectiveIsSecondary}
        effectiveUserId={loggedInUserId}
        loggedInUserId={loggedInUserId}
        myPeriodThisYear={myPeriodThisYear}
        year={selectedYear}
      />

      <VacationRequestDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        isSecondary={effectiveIsSecondary}
        userId={loggedInUserId}
        basePeriod={basePeriod}
        defaultYear={selectedYear}
      />
    </main>
  )
}

export default function VacanzePage() {
  return (
    <Suspense>
      <VacanzeContent />
    </Suspense>
  )
}
