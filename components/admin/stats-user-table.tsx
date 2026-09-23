'use client'
import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowUpDown, Search } from 'lucide-react'
import type { StatsUser } from '@/app/api/admin/stats/route'
import { ViaUscita } from '@/components/ui/via-uscita'
import { cn } from '@/lib/utils'

type SortKey = 'name' | 'access' | 'shifts' | 'interest' | 'last_access'
type Filter = 'all' | 'dco' | 'noni'

const COLS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Utente' },
  { key: 'access', label: 'Acc', numeric: true },
  { key: 'shifts', label: 'Turni', numeric: true },
  { key: 'interest', label: 'Int', numeric: true },
  { key: 'last_access', label: 'Ultimo accesso', numeric: true },
]

function userName(u: StatsUser) {
  return `${u.cognome ?? ''} ${u.nome ?? ''}`.trim()
}

function formatLast(iso: string | null) {
  if (!iso) return '—'
  const d = parseISO(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return format(d, sameYear ? 'dd/MM' : 'dd/MM/yyyy')
}

function CategoryTag({ u }: { u: StatsUser }) {
  const label = u.is_manager ? 'MGR' : u.is_dco_plus ? 'DCO+' : u.is_secondary ? 'NONO' : 'DCO'
  return (
    <span className="ml-1.5 inline-block text-[9px] font-bold px-1 py-px rounded border border-current text-muted-foreground align-middle">
      {label}
    </span>
  )
}

function NmpBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-20 text-[11px] flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-16 text-right text-[11px] tabular-nums text-muted-foreground flex-shrink-0">
        {count} · {pct}%
      </span>
    </div>
  )
}

export function StatsUserTable({ users }: { users: StatsUser[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = users.filter(u => {
      if (filter === 'dco' && (u.is_secondary || u.is_manager)) return false
      if (filter === 'noni' && !u.is_secondary) return false
      if (q && !userName(u).toLowerCase().includes(q)) return false
      return true
    })
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = userName(a).localeCompare(userName(b), 'it')
      else if (sortKey === 'last_access') cmp = (a.last_access ?? '').localeCompare(b.last_access ?? '')
      else {
        const ka = sortKey as 'access' | 'shifts' | 'interest'
        cmp = a[ka] - b[ka]
      }
      return cmp * sortDir
    })
    return list
  }, [users, search, filter, sortKey, sortDir])

  function onSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setSortDir(key === 'name' ? 1 : -1)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca nome..."
            className="w-full bg-muted border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {(['all', 'dco', 'noni'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                filter === f
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted text-muted-foreground border-border hover:text-foreground'
              )}
            >
              {f === 'all' ? 'Tutti' : f === 'dco' ? 'DCO' : 'Noni'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        /* M12: qui lo stato vuoto può avere DUE cause — la ricerca o il filtro
           DCO/Noni — e azzerarne una sola lascerebbe la tabella vuota con la
           sensazione che il comando non abbia funzionato. Le due si azzerano
           insieme, ed è quello che la riga dice. */
        <div className="flex flex-col items-center gap-1.5 py-6">
          <p className="text-sm text-muted-foreground text-center">Nessun utente trovato.</p>
          <ViaUscita
            onClick={() => {
              setSearch('')
              setFilter('all')
            }}
          >
            Azzera ricerca e filtro
          </ViaUscita>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {COLS.map(col => {
                  const active = sortKey === col.key
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        'px-2 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap select-none',
                        col.numeric && 'text-right'
                      )}
                    >
                      <button
                        onClick={() => onSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-0.5 hover:text-foreground transition-colors',
                          col.numeric && 'flex-row-reverse'
                        )}
                      >
                        {col.label}
                        <ArrowUpDown size={10} className={cn(active && 'text-foreground')} />
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const open = expanded === u.id
                const totalNmp = u.mattina + u.pomeriggio + u.notte
                return (
                  <FragmentRow
                    key={u.id}
                    u={u}
                    open={open}
                    onToggle={() => setExpanded(open ? null : u.id)}
                    totalNmp={totalNmp}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FragmentRow({ u, open, onToggle, totalNmp }: {
  u: StatsUser
  open: boolean
  onToggle: () => void
  totalNmp: number
}) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-muted/30 transition-colors border-b border-border last:border-b-0">
        <td className="px-2 py-2.5 font-medium whitespace-nowrap">
          {userName(u)}
          <CategoryTag u={u} />
        </td>
        <td className="px-2 py-2.5 text-right tabular-nums">{u.access.toLocaleString('it-IT')}</td>
        <td className="px-2 py-2.5 text-right tabular-nums">{u.shifts.toLocaleString('it-IT')}</td>
        <td className="px-2 py-2.5 text-right tabular-nums">{u.interest.toLocaleString('it-IT')}</td>
        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
          {formatLast(u.last_access)}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/40 border-b border-border last:border-b-0">
          <td colSpan={5} className="px-3 py-3">
            <p className="text-[11px] text-muted-foreground mb-2">Turni per fascia</p>
            <NmpBar label="Mattina" count={u.mattina} total={totalNmp} color="var(--pill-mattina-bg)" />
            <NmpBar label="Pomeriggio" count={u.pomeriggio} total={totalNmp} color="var(--pill-pomeriggio-bg)" />
            <NmpBar label="Notte" count={u.notte} total={totalNmp} color="var(--pill-notte-bg)" />
          </td>
        </tr>
      )}
    </>
  )
}
