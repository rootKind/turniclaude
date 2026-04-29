'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isAdmin, isManager } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getMyVacationAssignment } from '@/lib/queries/vacations'
import { VACATION_PERIOD_LABELS } from '@/lib/vacations'
import { getAppSettings } from '@/lib/queries/app-settings'
import { VacationRequestList } from '@/components/vacanze/vacation-request-list'
import { VacationRequestDialog } from '@/components/vacanze/vacation-request-dialog'
import type { VacationPeriod } from '@/types/database'

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
  const [minYear, setMinYear] = useState<number | null>(null)
  const [highlightRequestIds, setHighlightRequestIds] = useState<number[]>(() => {
    const multi = searchParams.get('requests')
    const single = searchParams.get('request')
    if (multi) return multi.split(',').map(Number).filter(Boolean)
    if (single) return [Number(single)]
    return []
  })
  const adminUser = profile ? isAdmin(profile.id) : false
  const managerUser = profile ? isManager(profile) : false
  const canToggleCategory = adminUser || managerUser
  const loggedInUserId = profile?.id ?? ''
  const effectiveIsSecondary = canToggleCategory ? viewSecondary : (profile?.is_secondary ?? false)

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

  useEffect(() => {
    if (!highlightRequestIds.length) return
    const t = setTimeout(() => {
      setHighlightRequestIds([])
      const params = new URLSearchParams(searchParams.toString())
      params.delete('request')
      params.delete('requests')
      router.replace(params.size > 0 ? `/vacanze?${params.toString()}` : '/vacanze')
    }, 4000)
    return () => clearTimeout(t)
  }, [highlightRequestIds, router, searchParams])

  useEffect(() => {
    const supabase = createClient()
    getAppSettings(supabase).then(s => setMinYear(s.min_year_vacanze)).catch(() => {})
    const channel = supabase
      .channel('app-settings-vacanze')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, (payload) => {
        const s = payload.new as { min_year_vacanze: number }
        setMinYear(s.min_year_vacanze)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (minYear === null) return
    setSelectedYear(y => Math.max(y, minYear))
  }, [minYear])

  function changeYear(delta: number) {
    if (minYear === null) return
    setSelectedYear(y => Math.min(MAX_YEAR, Math.max(minYear, y + delta)))
  }

  useEffect(() => {
    let startX = 0
    let startY = 0
    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }
    function onTouchEnd(e: TouchEvent) {
      if (minYear === null) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) <= 50 || Math.abs(dy) > Math.abs(dx)) return
      setSelectedYear(y => Math.min(MAX_YEAR, Math.max(minYear, y + (dx > 0 ? -1 : 1))))
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [minYear])

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center gap-2 mb-3 pr-12">
        <h1 className="text-lg font-bold">Ferie Sala C.C.C.</h1>
        {profile && canToggleCategory && (
          <button
            onClick={() => setViewSecondary(v => !v)}
            className="text-xs font-medium px-2 py-0.5 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
          >
            {viewSecondary ? 'Noni' : 'DCO'}
          </button>
        )}
      </div>

      {/* Periodo ferie con navigazione anno */}
      <div className="mb-4 px-3 py-2.5 rounded-xl offered-box border flex items-center gap-2">
        <button
          onClick={() => changeYear(-1)}
          disabled={minYear === null || selectedYear <= minYear}
          className="p-1 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors flex-shrink-0"
        >
          <ChevronLeft size={16} className="text-offered-label" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-offered-label font-medium uppercase tracking-wide mb-0.5">
            Il tuo periodo {selectedYear}
          </p>
          <p className="text-[14px] font-semibold text-offered-value">
            {periodLabel ?? '—'}
          </p>
        </div>
        <button
          onClick={() => changeYear(1)}
          disabled={selectedYear >= MAX_YEAR}
          className="p-1 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors flex-shrink-0"
        >
          <ChevronRight size={16} className="text-offered-label" />
        </button>
      </div>

      <VacationRequestList
        isSecondary={effectiveIsSecondary}
        effectiveUserId={loggedInUserId}
        loggedInUserId={loggedInUserId}
        myPeriodThisYear={myPeriodThisYear}
        year={selectedYear}
        highlightRequestIds={highlightRequestIds}
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
