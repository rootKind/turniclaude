'use client'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, History, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { tokenForMember } from '@/lib/turni-teorici'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ShiftAdjustment, ShiftTeamTree } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ShiftDialog({ open, onClose }: Props) {
  const [tree, setTree] = useState<ShiftTeamTree | null>(null)
  const [delta, setDelta] = useState<1 | -1>(1)
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setTree(await fetchShiftTeamTree(createClient()))
    } catch (err) {
      toast.error('Errore caricamento: ' + (err as Error).message)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setDate(todayISO())
      refresh()
    }
  }, [open, refresh])

  const apply = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta_days: delta, effective_date: date, note: note.trim() || null }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as { error?: string }).error || 'Errore')
      }
      toast.success(`Turni spostati di ${delta > 0 ? '+' : ''}${delta} giorno dal ${date}`)
      setNote('')
      await refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (adj: ShiftAdjustment) => {
    try {
      const res = await fetch(`/api/admin/shift?id=${adj.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Errore')
      toast.success('Aggiustamento rimosso (annullato)')
      await refresh()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const adjustments = tree?.adjustments ?? []
  const totalOffset = adjustments.filter(a => a.effective_date <= date).reduce((s, a) => s + a.delta_days, 0)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight size={16} /> Shift turni teorici
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <p className="text-xs text-muted-foreground">
            Sposta di ±1 giorno tutti i turni teorici a partire dalla data scelta
            (utile per correzioni systemwide, es. anni bisestili). L&apos;operazione
            è cumulativa e reversibile dallo storico.
          </p>

          {/* comando */}
          <div className="space-y-3 rounded-xl border bg-card px-3 py-3">
            <div className="flex gap-2">
              <button
                onClick={() => setDelta(-1)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${delta === -1 ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
              >
                −1 giorno (indietro)
              </button>
              <button
                onClick={() => setDelta(1)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${delta === 1 ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
              >
                +1 giorno (avanti)
              </button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data di efficacia (dal giorno in poi)</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nota (facoltativa)</Label>
              <Textarea rows={1} value={note} onChange={e => setNote(e.target.value)} placeholder="es. correzione anno bisestile" />
            </div>
            <Button className="w-full" disabled={saving || !date} onClick={apply}>
              {saving ? 'Applicazione…' : `Applica shift ${delta > 0 ? '+' : ''}${delta} giorno`}
            </Button>
          </div>

          {/* anteprima */}
          {tree && (
            <Preview tree={tree} delta={delta} date={date} />
          )}

          {/* storico */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <History size={12} /> Storico aggiustamenti
            </p>
            {adjustments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessun aggiustamento applicato.</p>
            ) : (
              adjustments.map(a => (
                <div key={a.id} className="rounded-lg border bg-card px-3 py-2 flex items-center gap-3">
                  <span className={`text-xs font-bold tabular-nums ${a.delta_days > 0 ? 'text-primary' : 'text-destructive'}`}>
                    {a.delta_days > 0 ? '+' : ''}{a.delta_days}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">dal {a.effective_date}</p>
                    {a.note && <p className="text-[11px] text-muted-foreground truncate">{a.note}</p>}
                  </div>
                  <button
                    onClick={() => remove(a)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Annulla questo aggiustamento"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
            {adjustments.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Offset cumulativo fino al {date}: <b className="tabular-nums">{totalOffset > 0 ? '+' : ''}{totalOffset}</b> giorni.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Preview({ tree, delta, date }: { tree: ShiftTeamTree; delta: 1 | -1; date: string }) {
  const hypothetical: ShiftAdjustment = {
    id: '__preview__',
    effective_date: date,
    delta_days: delta,
    scope: 'global',
    team_id: null,
    note: null,
    created_by: null,
    created_at: '',
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Anteprima dal {date}</p>
      {tree.types.filter(t => t.is_active).map(t => {
        const team = t.teams.find(x => x.members.some(m => m.is_active))
        const member = team?.members.find(m => m.is_active)
        if (!team || !member) return null
        const before = tokenForMember(t, member, team.id, tree.adjustments, date)
        const after = tokenForMember(t, member, team.id, [...tree.adjustments, hypothetical], date)
        return (
          <div key={t.id} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
            <span className="font-medium">{t.name}</span>
            <span className="tabular-nums">
              <span className="text-muted-foreground">{before || '—'}</span>
              <span className="mx-1.5 text-muted-foreground">→</span>
              <span className="font-semibold">{after || '—'}</span>
            </span>
          </div>
        )
      })}
      <p className="text-[11px] text-muted-foreground">
        Esempio: token del {date} per il primo membro attivo di ogni tipologia.
      </p>
    </div>
  )
}