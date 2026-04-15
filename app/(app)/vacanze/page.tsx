'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isAdmin } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getMyVacationAssignment } from '@/lib/queries/vacations'
import { VACATION_PERIOD_LABELS } from '@/lib/vacations'
import { VacationRequestList } from '@/components/vacanze/vacation-request-list'
import { VacationRequestDialog } from '@/components/vacanze/vacation-request-dialog'
import type { VacationPeriod } from '@/types/database'

function VacanzeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { profile } = useCurrentUser()
  const [viewSecondary, setViewSecondary] = useState(false)
  const [myPeriodThisYear, setMyPeriodThisYear] = useState<VacationPeriod | null>(null)
  const [periodLabel, setPeriodLabel] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const adminUser = profile ? isAdmin(profile.id) : false
  const loggedInUserId = profile?.id ?? ''
  const effectiveIsSecondary = adminUser ? viewSecondary : (profile?.is_secondary ?? false)
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    if (!loggedInUserId) return
    const supabase = createClient()
    getMyVacationAssignment(supabase, loggedInUserId, currentYear)
      .then(assignment => {
        if (!assignment) { setMyPeriodThisYear(null); setPeriodLabel(null); return }
        setMyPeriodThisYear(assignment.period_this_year)
        setPeriodLabel(VACATION_PERIOD_LABELS[assignment.period_this_year].label)
      })
      .catch(() => {})
  }, [loggedInUserId, currentYear])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDialogOpen(true)
      router.replace('/vacanze')
    }
  }, [searchParams, router])

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold">Ferie Sala C.C.C.</h1>
        {profile && (
          <div className="flex items-center gap-2">
            {adminUser ? (
              <button
                onClick={() => setViewSecondary(v => !v)}
                className="text-xs font-medium px-2 py-0.5 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
              >
                {viewSecondary ? 'Noni' : 'DCO'}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {profile.is_secondary ? 'Noni' : 'DCO'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Periodo ferie anno corrente */}
      {periodLabel && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
          <p className="text-[11px] text-sky-600 dark:text-sky-400 font-medium uppercase tracking-wide mb-0.5">
            Il tuo periodo {currentYear}
          </p>
          <p className="text-[14px] font-semibold text-sky-800 dark:text-sky-200">
            {periodLabel}
          </p>
        </div>
      )}

      <VacationRequestList
        isSecondary={effectiveIsSecondary}
        effectiveUserId={loggedInUserId}
        loggedInUserId={loggedInUserId}
        myPeriodThisYear={myPeriodThisYear}
      />

      <VacationRequestDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        isSecondary={effectiveIsSecondary}
        userId={loggedInUserId}
        myPeriodThisYear={myPeriodThisYear}
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
