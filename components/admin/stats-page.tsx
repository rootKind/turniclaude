'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, Bell, CalendarPlus, Heart, UserCheck, Users } from 'lucide-react'
import type { AdminStats, StatsOverview, StatsShiftMode } from '@/app/api/admin/stats/route'
import { cn } from '@/lib/utils'
import { StatsActivityChart } from './stats-activity-chart'
import { StatsUserTable } from './stats-user-table'

const PERIODS = [
  { days: 30, label: '30g' },
  { days: 90, label: '90g' },
  { days: 365, label: '1 anno' },
  { days: 0, label: 'Tutto' },
]

export function StatsPage() {
  const router = useRouter()
  const [days, setDays] = useState(365)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-stats', days],
    queryFn: async () => {
      const r = await fetch(`/api/admin/stats?days=${days}`)
      if (!r.ok) throw new Error('Errore nel caricamento')
      return r.json() as Promise<AdminStats>
    },
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/admin')} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold flex-1">Statistiche</h1>
      </div>

      <div className="flex bg-muted/60 border border-border rounded-xl p-1 gap-1">
        {PERIODS.map(p => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className={cn(
              'flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors',
              days === p.days ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <StatsSkeleton />
      ) : isError ? (
        <div className="text-center py-10 space-y-3">
          <p className="text-sm text-destructive">Errore nel caricamento delle statistiche.</p>
          <button onClick={() => refetch()} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
            Riprova
          </button>
        </div>
      ) : data ? (
        <>
          <OverviewCards overview={data.overview} days={days} />

          {/* NOTIFICHE (richiesta 25/09/2026): quante attivazioni e da dove —
              la schermata invasiva ('prompt') o le impostazioni ('settings'). */}
          <PushStatsCard overview={data.overview} />

          <section className="rounded-xl border bg-card px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Attività nel tempo</h2>
            <StatsActivityChart data={data.activity} />
          </section>

          <section className="rounded-xl border bg-card px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Distribuzione N/M/P</h2>
            <ShiftModesBars modes={data.shiftModes} />
          </section>

          <section className="rounded-xl border bg-card px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Classifica utenti</h2>
            <StatsUserTable users={data.users} />
          </section>
        </>
      ) : null}
    </div>
  )
}

function OverviewCards({ overview, days }: { overview: StatsOverview; days: number }) {
  const periodLabel = days === 0 ? 'da sempre' : days === 365 ? 'ultimo anno' : `ultimi ${days} giorni`
  const cards = [
    { icon: <Users size={16} />, value: overview.users_total, label: 'Utenti' },
    { icon: <UserCheck size={16} />, value: overview.users_active, label: `Attivi ${periodLabel}` },
    { icon: <BarChart3 size={16} />, value: overview.access, label: 'Accessi' },
    { icon: <CalendarPlus size={16} />, value: overview.shifts_total, label: 'Turni pubblicati' },
    { icon: <Heart size={16} />, value: overview.interest, label: 'Interessi' },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map(c => (
        <div key={c.label} className="rounded-xl border bg-card px-3 py-3 space-y-1">
          <div className="text-muted-foreground">{c.icon}</div>
          <p className="text-xl font-bold tabular-nums">{c.value.toLocaleString('it-IT')}</p>
          <p className="text-[11px] text-muted-foreground leading-tight">{c.label}</p>
        </div>
      ))}
    </div>
  )
}

/** La barra della schermata invasiva: attivazioni totali e spaccata per sorgente. */
function PushStatsCard({ overview }: { overview: StatsOverview }) {
  const total = overview.push_enabled ?? 0
  const daSchermata = overview.push_enabled_prompt ?? 0
  const daImpostazioni = overview.push_enabled_settings ?? 0
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  return (
    <section className="rounded-xl border bg-card px-4 py-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
        <Bell size={12} aria-hidden="true" />
        Notifiche attivate
      </h2>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">
          Nessuna attivazione nel periodo selezionato.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-2xl font-bold tabular-nums">{total.toLocaleString('it-IT')}</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted" role="img" aria-label={`Attivazioni: ${daSchermata} dalla schermata, ${daImpostazioni} dalle impostazioni`}>
            <div
              className="h-full bg-foreground transition-all"
              style={{ width: `${pct(daSchermata)}%` }}
              title={`Dalla schermata: ${daSchermata}`}
            />
            <div
              className="h-full bg-muted-foreground/50 transition-all"
              style={{ width: `${pct(daImpostazioni)}%` }}
              title={`Dalle impostazioni: ${daImpostazioni}`}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>● {daSchermata.toLocaleString('it-IT')} dalla schermata ({pct(daSchermata)}%)</span>
            <span>{daImpostazioni.toLocaleString('it-IT')} dalle impostazioni ({pct(daImpostazioni)}%) ●</span>
          </div>
        </div>
      )}
    </section>
  )
}

function ShiftModesBars({ modes }: { modes: StatsShiftMode[] }) {
  const map: Record<'Mattina' | 'Pomeriggio' | 'Notte', number> = { Mattina: 0, Pomeriggio: 0, Notte: 0 }
  for (const m of modes) map[m.mode] = m.count
  const total = map.Mattina + map.Pomeriggio + map.Notte

  if (total === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Nessun turno nel periodo selezionato.</p>
  }

  const rows = [
    { label: 'Mattina', v: map.Mattina, bg: 'var(--pill-mattina-bg)', text: 'var(--pill-mattina-text)' },
    { label: 'Pomeriggio', v: map.Pomeriggio, bg: 'var(--pill-pomeriggio-bg)', text: 'var(--pill-pomeriggio-text)' },
    { label: 'Notte', v: map.Notte, bg: 'var(--pill-notte-bg)', text: 'var(--pill-notte-text)' },
  ]

  return (
    <div className="space-y-3">
      {rows.map(r => {
        const pct = Math.round((r.v / total) * 100)
        return (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-24 text-xs font-semibold flex-shrink-0">{r.label}</span>
            <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full flex items-center justify-end pr-2 text-[10px] font-bold tabular-nums transition-all"
                style={{ width: `${Math.max(pct > 0 ? 6 : 0, pct)}%`, background: r.bg, color: r.text }}
              >
                {pct > 0 ? `${pct}%` : ''}
              </div>
            </div>
            <span className="w-16 text-right text-xs tabular-nums text-muted-foreground flex-shrink-0">
              {r.v.toLocaleString('it-IT')} · {pct}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card h-24" />
        ))}
      </div>
      <div className="rounded-xl border bg-card h-48" />
      <div className="rounded-xl border bg-card h-44" />
      <div className="rounded-xl border bg-card h-56" />
    </div>
  )
}
