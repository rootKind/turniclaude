'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarPlus, Heart, Users, ArrowUpDown } from 'lucide-react'
import type { StatsUser } from '@/app/api/admin/stats/route'

type SortKey = 'name' | 'access' | 'new_shift' | 'interest' | 'total'
type SortDir = 'asc' | 'desc'

export function StatsPage() {
  const router = useRouter()
  const [stats, setStats] = useState<StatsUser[]>([])
  const [totals, setTotals] = useState({ access: 0, new_shift: 0, interest: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filter, setFilter] = useState<'all' | 'access' | 'new_shift' | 'interest'>('all')

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(({ stats, totals }) => { setStats(stats ?? []); setTotals(totals ?? {}) })
      .catch(() => setError(true))
      .finally(() => setIsLoading(false))
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = [...stats].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') {
      const nameA = `${a.cognome ?? ''} ${a.nome ?? ''}`.trim()
      const nameB = `${b.cognome ?? ''} ${b.nome ?? ''}`.trim()
      cmp = nameA.localeCompare(nameB, 'it')
    } else {
      cmp = a[sortKey] - b[sortKey]
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/admin')} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Statistiche</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Accessi" value={totals.access} icon={<Users size={16} />} active={filter === 'access'} onClick={() => { setFilter(f => f === 'access' ? 'all' : 'access'); setSortKey('name') }} />
        <SummaryCard label="Turni" value={totals.new_shift} icon={<CalendarPlus size={16} />} active={filter === 'new_shift'} onClick={() => { setFilter(f => f === 'new_shift' ? 'all' : 'new_shift'); setSortKey('name') }} />
        <SummaryCard label="Interessi" value={totals.interest} icon={<Heart size={16} />} active={filter === 'interest'} onClick={() => { setFilter(f => f === 'interest' ? 'all' : 'interest'); setSortKey('name') }} />
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Caricamento...</p>
      ) : error ? (
        <p className="text-sm text-destructive text-center py-8">Errore nel caricamento delle statistiche.</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nessun dato disponibile.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <SortTh label="Utente" sortKey="name" current={sortKey} dir={sortDir} onSort={toggleSort} />
                {(filter === 'all' || filter === 'access') && <SortTh label="Accessi" sortKey="access" current={sortKey} dir={sortDir} onSort={toggleSort} numeric />}
                {(filter === 'all' || filter === 'new_shift') && <SortTh label="Turni" sortKey="new_shift" current={sortKey} dir={sortDir} onSort={toggleSort} numeric />}
                {(filter === 'all' || filter === 'interest') && <SortTh label="Interessi" sortKey="interest" current={sortKey} dir={sortDir} onSort={toggleSort} numeric />}
                {filter === 'all' && <SortTh label="Tot" sortKey="total" current={sortKey} dir={sortDir} onSort={toggleSort} numeric />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map(u => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 font-medium">{`${u.cognome ?? ''} ${u.nome ?? ''}`.trim()}</td>
                  {(filter === 'all' || filter === 'access') && <td className="px-3 py-2.5 text-center tabular-nums">{u.access}</td>}
                  {(filter === 'all' || filter === 'new_shift') && <td className="px-3 py-2.5 text-center tabular-nums">{u.new_shift}</td>}
                  {(filter === 'all' || filter === 'interest') && <td className="px-3 py-2.5 text-center tabular-nums">{u.interest}</td>}
                  {filter === 'all' && <td className="px-3 py-2.5 text-center tabular-nums font-semibold">{u.total}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, icon, active, onClick }: { label: string; value: number; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-xl border px-3 py-3 text-left space-y-1 transition-colors w-full ${active ? 'border-primary bg-primary/5' : 'bg-muted/40 hover:bg-accent/60'}`}>
      <div className={`${active ? 'text-primary' : 'text-muted-foreground'}`}>{icon}</div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </button>
  )
}

function SortTh({ label, sortKey, current, dir, onSort, numeric }: { label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onSort: (k: SortKey) => void; numeric?: boolean }) {
  const active = current === sortKey
  return (
    <th className={`px-3 py-2 font-semibold text-xs text-muted-foreground`}>
      <button onClick={() => onSort(sortKey)} className={`flex items-center gap-1 hover:text-foreground transition-colors ${numeric ? 'mx-auto' : ''}`}>
        {label}
        <ArrowUpDown size={11} className={active ? 'text-primary' : 'opacity-40'} />
      </button>
    </th>
  )
}
