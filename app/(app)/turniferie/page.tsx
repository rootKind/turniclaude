'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isAdmin } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getAllVacationAssignmentsWithUsers, getVacationYearOverrides, type VacationAssignmentWithUser } from '@/lib/queries/vacations'
import { VACATION_PERIOD_LABELS, getEffectivePeriodForYear } from '@/lib/vacations'
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

  const [yearOverrides, setYearOverrides] = useState<Map<string, VacationPeriod>>(new Map())

  const [swapOpen, setSwapOpen] = useState(false)
  const [swapMode, setSwapMode] = useState<'move' | 'switch'>('move')
  const [swapUserId, setSwapUserId] = useState('')
  const [swapTargetPeriod, setSwapTargetPeriod] = useState<VacationPeriod>(1)
  const [switchUser1Id, setSwitchUser1Id] = useState('')
  const [switchUser2Id, setSwitchUser2Id] = useState('')
  const [swapLoading, setSwapLoading] = useState(false)

  useEffect(() => {
    localStorage.setItem('turni-last-page', '/turniferie')
    const supabase = createClient()
    getAppSettings(supabase).then(s => setMinYear(s.min_year_turniferie)).catch(() => {})
    const channel = supabase
      .channel('app-settings-turniferie')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings' }, (payload) => {
        const s = payload.new as { min_year_turniferie: number }
        setMinYear(s.min_year_turniferie)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    setSelectedYear(y => Math.max(y, minYear))
  }, [minYear])

  useEffect(() => {
    if (!adminUser) return
    function onSwap() {
      setSwapMode('move')
      setSwapUserId('')
      setSwapTargetPeriod(1)
      setSwitchUser1Id('')
      setSwitchUser2Id('')
      setSwapOpen(true)
    }
    document.addEventListener('ferie-admin-swap', onSwap)
    return () => document.removeEventListener('ferie-admin-swap', onSwap)
  }, [adminUser])

  useEffect(() => {
    function check() {
      setAlwaysExpanded(window.innerHeight >= 600)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const CACHE_KEY = 'cache:vacation-assignments'
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) setAssignments(JSON.parse(raw))
    } catch {}
    const supabase = createClient()
    getAllVacationAssignmentsWithUsers(supabase)
      .then(data => {
        setAssignments(data)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch {}
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const CACHE_KEY = `cache:vacation-overrides-${selectedYear}`
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) setYearOverrides(new Map(JSON.parse(raw)))
    } catch {}
    const supabase = createClient()
    getVacationYearOverrides(supabase, selectedYear)
      .then(map => {
        setYearOverrides(map)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify([...map])) } catch {}
      })
      .catch(() => {})
  }, [selectedYear])

  const myAssignment = assignments.find(a => a.user_id === loggedInUserId)
  const myPeriodThisYear: VacationPeriod | null = myAssignment
    ? getEffectivePeriodForYear(myAssignment.base_period as VacationPeriod, selectedYear, yearOverrides, loggedInUserId)
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
      .filter(a => getEffectivePeriodForYear(a.base_period as VacationPeriod, selectedYear, yearOverrides, a.user_id) === period)
      .sort((a, b) => (a.user?.cognome ?? '').localeCompare(b.user?.cognome ?? '', 'it'))
    return { period, meta: VACATION_PERIOD_LABELS[period], users }
  })

  async function applySwap() {
    if (!swapUserId) return
    setSwapLoading(true)
    try {
      const res = await fetch('/api/admin/vacation-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: swapUserId, period: swapTargetPeriod, year: selectedYear }),
      })
      if (!res.ok) throw new Error(await res.text())
      const supabase = createClient()
      const [data, overrides] = await Promise.all([
        getAllVacationAssignmentsWithUsers(supabase),
        getVacationYearOverrides(supabase, selectedYear),
      ])
      setAssignments(data)
      setYearOverrides(overrides)
      setSwapOpen(false)
    } finally {
      setSwapLoading(false)
    }
  }

  async function applySwitch() {
    if (!switchUser1Id || !switchUser2Id || switchUser1Id === switchUser2Id) return
    const a1 = filtered.find(a => a.user_id === switchUser1Id)
    const a2 = filtered.find(a => a.user_id === switchUser2Id)
    if (!a1 || !a2) return
    const p1 = getEffectivePeriodForYear(a1.base_period as VacationPeriod, selectedYear, yearOverrides, switchUser1Id)
    const p2 = getEffectivePeriodForYear(a2.base_period as VacationPeriod, selectedYear, yearOverrides, switchUser2Id)
    setSwapLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/admin/vacation-swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: switchUser1Id, period: p2, year: selectedYear }),
        }),
        fetch('/api/admin/vacation-swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: switchUser2Id, period: p1, year: selectedYear }),
        }),
      ])
      if (!r1.ok) throw new Error(await r1.text())
      if (!r2.ok) throw new Error(await r2.text())
      const supabase = createClient()
      const [data, overrides] = await Promise.all([
        getAllVacationAssignmentsWithUsers(supabase),
        getVacationYearOverrides(supabase, selectedYear),
      ])
      setAssignments(data)
      setYearOverrides(overrides)
      setSwapOpen(false)
    } finally {
      setSwapLoading(false)
    }
  }

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
      <div className="flex items-center gap-2 mb-3 bg-card border border-sky-200 dark:border-border rounded-xl pl-3 pr-3 py-2 mr-14">
        <h1 className="text-lg font-bold flex-1">Turni Ferie</h1>
        {adminUser && (
          <button
            onClick={() => setViewSecondary(v => !v)}
            className="text-xs font-medium px-2 py-0.5 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
          >
            {viewSecondary ? 'Noni' : 'DCO'}
          </button>
        )}
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

      <div className="grid grid-cols-2 gap-2" style={{ gridTemplateRows: 'repeat(3, auto)' }}>
        {grouped.map(({ period, meta, users }, index) => {
          const isMyPeriod = period === myPeriodThisYear
          const isOpen = alwaysExpanded || expandedPeriods.has(period)

          return (
            <motion.div
              key={period}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: index * 0.04, ease: 'easeOut' }}
              className={`rounded-xl border overflow-hidden transition-colors flex flex-col ${isMyPeriod ? 'my-period-border' : ''}`}
            >
              <button
                onClick={() => togglePeriod(period)}
                disabled={alwaysExpanded}
                className={`w-full flex items-center justify-between px-3 py-2 text-left disabled:cursor-default ${isMyPeriod ? 'my-period-header' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isMyPeriod && (
                    <span className="w-1.5 h-1.5 rounded-full my-period-dot flex-shrink-0" />
                  )}
                  <span className={`font-semibold text-xs ${isMyPeriod ? 'text-my-period' : ''}`}>
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
                <div
                  className={`border-t border-black/10 dark:border-white/10 ${isMyPeriod ? 'my-period-content' : ''}`}
                >
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
            </motion.div>
          )
        })}
      </div>
      {swapOpen && adminUser && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pb-20 px-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">Gestisci periodi</span>
              <button onClick={() => setSwapOpen(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-4 pt-3 pb-4 flex flex-col gap-4">
              {/* Mode toggle */}
              <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                <button
                  onClick={() => setSwapMode('move')}
                  className={`flex-1 py-1.5 font-medium transition-colors ${swapMode === 'move' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  Sposta
                </button>
                <button
                  onClick={() => setSwapMode('switch')}
                  className={`flex-1 py-1.5 font-medium transition-colors ${swapMode === 'switch' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  Scambia
                </button>
              </div>

              {swapMode === 'move' ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Dipendente</label>
                    <select
                      value={swapUserId}
                      onChange={e => setSwapUserId(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seleziona…</option>
                      {filtered
                        .sort((a, b) => (a.user?.cognome ?? '').localeCompare(b.user?.cognome ?? '', 'it'))
                        .map(a => (
                          <option key={a.user_id} value={a.user_id}>
                            {a.user?.cognome} {a.user?.nome}
                            {' — P'}
                            {getEffectivePeriodForYear(a.base_period as VacationPeriod, selectedYear, yearOverrides, a.user_id)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Periodo destinazione ({selectedYear})</label>
                    <select
                      value={swapTargetPeriod}
                      onChange={e => setSwapTargetPeriod(parseInt(e.target.value) as VacationPeriod)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      {([1,2,3,4,5,6] as VacationPeriod[]).map(p => (
                        <option key={p} value={p}>P{p} — {VACATION_PERIOD_LABELS[p].label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setSwapOpen(false)}
                      className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={applySwap}
                      disabled={!swapUserId || swapLoading}
                      className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
                    >
                      {swapLoading ? 'Salvo…' : 'Applica'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Dipendente A</label>
                    <select
                      value={switchUser1Id}
                      onChange={e => setSwitchUser1Id(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seleziona…</option>
                      {filtered
                        .sort((a, b) => (a.user?.cognome ?? '').localeCompare(b.user?.cognome ?? '', 'it'))
                        .map(a => (
                          <option key={a.user_id} value={a.user_id}>
                            {a.user?.cognome} {a.user?.nome}
                            {' — P'}
                            {getEffectivePeriodForYear(a.base_period as VacationPeriod, selectedYear, yearOverrides, a.user_id)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Dipendente B</label>
                    <select
                      value={switchUser2Id}
                      onChange={e => setSwitchUser2Id(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seleziona…</option>
                      {filtered
                        .sort((a, b) => (a.user?.cognome ?? '').localeCompare(b.user?.cognome ?? '', 'it'))
                        .filter(a => a.user_id !== switchUser1Id)
                        .map(a => (
                          <option key={a.user_id} value={a.user_id}>
                            {a.user?.cognome} {a.user?.nome}
                            {' — P'}
                            {getEffectivePeriodForYear(a.base_period as VacationPeriod, selectedYear, yearOverrides, a.user_id)}
                          </option>
                        ))}
                    </select>
                  </div>
                  {switchUser1Id && switchUser2Id && (() => {
                    const a1 = filtered.find(a => a.user_id === switchUser1Id)
                    const a2 = filtered.find(a => a.user_id === switchUser2Id)
                    const p1 = a1 ? getEffectivePeriodForYear(a1.base_period as VacationPeriod, selectedYear, yearOverrides, switchUser1Id) : null
                    const p2 = a2 ? getEffectivePeriodForYear(a2.base_period as VacationPeriod, selectedYear, yearOverrides, switchUser2Id) : null
                    return (
                      <div className="text-xs text-muted-foreground text-center bg-muted/50 rounded-lg px-3 py-2">
                        P{p1} ↔ P{p2}
                      </div>
                    )
                  })()}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setSwapOpen(false)}
                      className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={applySwitch}
                      disabled={!switchUser1Id || !switchUser2Id || swapLoading}
                      className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
                    >
                      {swapLoading ? 'Salvo…' : 'Scambia'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
