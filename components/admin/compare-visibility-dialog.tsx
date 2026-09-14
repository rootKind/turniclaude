'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { buildCompareGroups } from '@/lib/compare-groups'
import type { ShiftTeamTree } from '@/types/database'
import { cn } from '@/lib/utils'

/**
 * Editor di massa della visibilità nel Confronto (13/09/2026): una checklist di
 * tutti gli utenti con lo switch «Visibile nel Confronta» per ciascuno, così
 * l'admin cura l'elenco del selettore di confronto di /tuoturno in una sola
 * schermata invece di aprire gli utenti uno a uno. La struttura rispecchia il
 * selettore: gruppi Noni/DCO con una sezione per squadra dei turni teorici.
 * Ogni modifica viene salvata SUBITO (PATCH /api/admin/users, colonna
 * users.show_in_compare della migration 026); il contatore in testa riflette
 * gli inclusi.
 */

interface Row {
  id: string
  nome: string | null
  cognome: string | null
  is_secondary: boolean | null
  is_manager: boolean | null
  show_in_compare: boolean | null
}

export function CompareVisibilityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  // coda dei cambiamenti non ancora persistiti: il salvataggio è immediato ma
  // raggruppato (debounce 600ms) per chi attiva/disattiva in rapida successione
  const pending = useRef<Map<string, boolean>>(new Map())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = async () => {
    if (!pending.current.size) return
    const updates = [...pending.current.entries()].map(([userId, showInCompare]) => ({ userId, showInCompare }))
    pending.current.clear()
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const b = await res.json()
      if (!res.ok) throw new Error(b.error || 'Errore')
    } catch (err) {
      toast.error('Salvataggio fallito: ' + (err as Error).message)
      await load() // risincronizza col DB dopo un errore
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      const b = await res.json()
      if (!res.ok) throw new Error(b.error || 'Errore')
      setRows((b.users ?? []) as Row[])
    } catch (err) {
      toast.error('Caricamento fallito: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) { setQuery(''); load() }
    else {
      // chiudendo il dialog, persisti subito ciò che è in coda
      if (timer.current) clearTimeout(timer.current)
      void flush()
    }
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [open])

  const toggle = (row: Row) => {
    const next = !(row.show_in_compare !== false)
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, show_in_compare: next } : r)))
    pending.current.set(row.id, next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }

  const [tree, setTree] = useState<ShiftTeamTree | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      load()
      fetchShiftTeamTree(createClient()).then(setTree).catch(() => setTree(null))
    }
  }, [open])

  const q = query.trim().toLowerCase()
  // stesso raggruppamento del selettore di /tuoturno (Noni/DCO + sezione per squadra)
  // includeHidden: TUTTI gli utenti restano in lista anche a switch spento
  // (senza, l'utente appena disattivato SPARIVA e non si poteva più riaccendere).
  const groups = useMemo(
    () => buildCompareGroups(rows, tree, { includeHidden: true }),
    [rows, tree],
  )
  const visibleGroups = useMemo(() => {
    if (!q) return groups
    return groups
      .map(g => ({
        ...g,
        sections: g.sections
          .map(s => ({ ...s, users: s.users.filter(u => `${u.cognome ?? ''} ${u.nome ?? ''}`.toLowerCase().includes(q)) }))
          .filter(s => s.users.length > 0),
      }))
      .filter(g => g.sections.length > 0)
  }, [groups, q])
  const shownCount = rows.filter(r => r.show_in_compare !== false).length
  const rowById = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])

  const Section = ({ label, items }: { label: string; items: Array<{ id: string }> }) =>
    items.length ? (
      <div className="mb-2">
        {label && (
          <p className="px-1 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/90">
            {label} · {items.length}
          </p>
        )}
        <div className="grid gap-0.5">
          {items.map(item => {
            const r = rowById.get(item.id)
            if (!r) return null
            const on = r.show_in_compare !== false
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r)}
                className="w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors hover:bg-muted"
              >
                <span className="flex-1 min-w-0 truncate">
                  {[r.cognome, r.nome].filter(Boolean).join(' ')}
                  {r.is_manager && <span className="ml-1.5 text-[10px] text-muted-foreground">· manager</span>}
                </span>
                <span className="shrink-0">
                  <Switch size="sm" checked={on} onCheckedChange={() => toggle(r)} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    ) : null

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Visibile nel Confronta</DialogTitle>
        </DialogHeader>
        <p className="text-xs leading-snug text-muted-foreground">
          Scegli chi compare nel selettore «Confronta» di «Il tuo turno». Le modifiche
          vengono salvate subito.
        </p>

        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Users size={13} className="text-muted-foreground" />
            Visibili
          </span>
          <span className="text-sm font-bold tabular-nums">
            {shownCount}/{rows.length}
          </span>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca cognome o nome…"
            className="pl-8"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <p className="text-sm text-muted-foreground px-1 py-2">Caricamento…</p>
          ) : visibleGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1 py-2">Nessun dipendente trovato.</p>
          ) : (
            visibleGroups.map(g => (
              <div key={g.key} className="mb-2">
                <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label} · {g.sections.reduce((n, s) => n + s.users.length, 0)}
                </p>
                {g.sections.map(s => (
                  <Section key={s.key || g.key} label={s.label} items={s.users} />
                ))}
              </div>
            ))
          )}
        </div>

        <Button variant="outline" onClick={onClose}>Chiudi</Button>
      </DialogContent>
    </Dialog>
  )
}
