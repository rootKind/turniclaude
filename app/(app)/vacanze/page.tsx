'use client'
import { useEffect, useState, Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isAdmin, isManager } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getMyVacationAssignment } from '@/lib/queries/vacations'
import { VACATION_PERIOD_LABELS } from '@/lib/vacations'
import { useAppSettings } from '@/hooks/use-app-settings'
import { VacationRequestList } from '@/components/vacanze/vacation-request-list'
import { cn } from '@/lib/utils'
import { VacationRequestDialog } from '@/components/vacanze/vacation-request-dialog'
import { YearGateSkeleton } from '@/components/ui/year-gate-skeleton'
import { PageHeader } from '@/components/nav/page-header'
import type { VacationPeriod } from '@/types/database'

const MAX_YEAR = 2099

function VacanzeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const { profile } = useCurrentUser()
  const [viewSecondary, setViewSecondary] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [myPeriodThisYear, setMyPeriodThisYear] = useState<VacationPeriod | null>(null)
  const [basePeriod, setBasePeriod] = useState<VacationPeriod | null>(null)
  const [periodLabel, setPeriodLabel] = useState<string | null>(null)
  const [periodLabelYear, setPeriodLabelYear] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // Cache-first (20/09/2026): niente più skeleton full-page mentre aspetta
  // app_settings — l'hook parte da cache/DEFAULTS e il realtime aggancia i
  // cambi. Il gate resta solo per il caso «anno selezionato < min reale».
  const settings = useAppSettings()
  const fetchedMinYear = settings.min_year_vacanze
  const minYear: number | null = fetchedMinYear ?? null
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

  // Anno effettivamente mostrato: clamp immediato al min_year (niente flash del periodo dell'anno precedente)
  const displayYear = minYear !== null ? Math.max(selectedYear, minYear) : selectedYear

  useEffect(() => {
    if (!loggedInUserId || minYear === null) return
    let cancelled = false
    const supabase = createClient()
    getMyVacationAssignment(supabase, loggedInUserId, displayYear)
      .then(assignment => {
        if (cancelled) return
        if (!assignment) { setMyPeriodThisYear(null); setPeriodLabel(null); setBasePeriod(null); setPeriodLabelYear(displayYear); return }
        setBasePeriod(assignment.base_period as VacationPeriod)
        setMyPeriodThisYear(assignment.period_this_year)
        setPeriodLabel(VACATION_PERIOD_LABELS[assignment.period_this_year].label)
        setPeriodLabelYear(displayYear)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [loggedInUserId, minYear, displayYear])

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
    // min_year arriva da useAppSettings (cache-first): qui resta solo il
    // realtime per riallineare l'anno se l'admin cambia le impostazioni.
    const channel = supabase
      .channel('app-settings-vacanze')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['app-settings'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // GATE solo quando serve davvero: anno selezionato PRIMA del minimo reale
  // (es. utente su 2025 e min 2026). Mai su «impostazioni in arrivo»: in quel
  // caso si parte dai default e l'anno si aggancia appena la query risolve —
  // prima qui si mostrava lo skeleton full-page a OGNI apertura fredda.
  // (useAppSettings ora restituisce SEMPRE un oggetto, mai undefined.)
  if (selectedYear < minYear) return <YearGateSkeleton variant="vacanze" />

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <PageHeader group="cambi" className="mb-2" filters={(
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className={cn(
            'inline-flex h-9 max-w-full items-center gap-0.5 rounded-full border px-1',
            periodLabelYear === displayYear && myPeriodThisYear != null ? `p${myPeriodThisYear}-pill` : 'offered-box text-offered-label',
          )}>
            <button
              onClick={() => changeYear(-1)}
              disabled={displayYear <= minYear}
              aria-label="Anno precedente"
              className="flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="max-w-[12rem] truncate px-1 text-[10px] font-semibold">
              {periodLabelYear === displayYear ? (periodLabel ?? 'Periodo non noto') : 'Periodo…'} · {displayYear}
            </span>
            <button
              onClick={() => changeYear(1)}
              disabled={displayYear >= MAX_YEAR}
              aria-label="Anno successivo"
              className="flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          {profile && canToggleCategory && (
            <button
              onClick={() => setViewSecondary(v => !v)}
              className="text-xs font-medium px-3 py-2 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
              aria-label="Cambia gruppo turni"
            >
              {viewSecondary ? 'DCO' : 'Noni'}
            </button>
          )}
        </div>
      )} />

      <VacationRequestList
        isSecondary={effectiveIsSecondary}
        effectiveUserId={loggedInUserId}
        loggedInUserId={loggedInUserId}
        myPeriodThisYear={periodLabelYear === displayYear ? myPeriodThisYear : null}
        year={displayYear}
        highlightRequestIds={highlightRequestIds}
      />

      <VacationRequestDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        isSecondary={effectiveIsSecondary}
        userId={loggedInUserId}
        basePeriod={basePeriod}
        defaultYear={displayYear}
        minYear={minYear ?? new Date().getFullYear()}
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
