'use client'
import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, Trash2, Plus, Check, X, Eye, Megaphone } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ChangelogEntry } from '@/lib/changelog'

interface Props {
  open: boolean
  onClose: () => void
}

type ReadUser = {
  id: string
  nome: string | null
  cognome: string | null
  is_secondary: boolean
  is_manager: boolean
  lastSeenVersion: number
  readAt: string | null
}

export function ChangelogManagerDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<'entries' | 'reads'>('entries')
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [reads, setReads] = useState<{ users: ReadUser[]; latestVersion: number }>({ users: [], latestVersion: 0 })
  const [editing, setEditing] = useState<ChangelogEntry | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    const [eRes, rRes] = await Promise.all([
      fetch('/api/admin/changelog'),
      fetch('/api/admin/changelog/reads'),
    ])
    const eData = await eRes.json().catch(() => ({ entries: [] }))
    const rData = await rRes.json().catch(() => ({ users: [], latestVersion: 0 }))
    setEntries(eData.entries ?? [])
    setReads(rData)
  }, [])

  useEffect(() => {
    if (!open) return
    setTab('entries')
    setEditing(null)
    reload().catch(() => {})
  }, [open, reload])

  async function handleSave() {
    if (!editing) return
    if (editing.version < 1 || !editing.changes.some(c => c.trim())) {
      toast.error('Serve una version ≥ 1 e almeno una modifica')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/changelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      })
      if (!res.ok) throw new Error()
      toast.success(editing.version && entries.some(e => e.version === editing.version)
        ? 'Entry aggiornata'
        : 'Entry creata')
      setEditing(null)
      await reload()
    } catch {
      toast.error('Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  async function handleForceNew() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/changelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceNew: true }),
      })
      if (!res.ok) throw new Error()
      const { entry } = await res.json()
      toast.success(`Nuova versione ${entry.version} creata — tutti gli utenti la vedranno`)
      setEditing(entry)
      setTab('entries')
      await reload()
    } catch {
      toast.error('Errore creazione versione')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(version: number) {
    if (!window.confirm(`Eliminare la versione ${version}?`)) return
    try {
      const res = await fetch(`/api/admin/changelog?version=${version}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Entry eliminata')
      setEditing(null)
      await reload()
    } catch {
      toast.error('Errore eliminazione')
    }
  }

  const unseenCount = reads.latestVersion > 0
    ? reads.users.filter(u => u.lastSeenVersion < reads.latestVersion).length
    : 0

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gestione Changelog</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex rounded-full border p-1 gap-1">
          {(['entries', 'reads'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'entries' ? `Entry (${entries.length})` : `Letture (${unseenCount} mancanti)`}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          {tab === 'entries' ? (
            <>
              {/* Editor entry */}
              {editing ? (
                <div className="rounded-xl border bg-muted/30 p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      className="w-20"
                      value={editing.version}
                      onChange={e => setEditing({ ...editing, version: parseInt(e.target.value) || 0 })}
                      aria-label="Versione"
                    />
                    <Input
                      className="flex-1"
                      placeholder="Data (es. 25/08/2026)"
                      value={editing.date}
                      onChange={e => setEditing({ ...editing, date: e.target.value })}
                    />
                  </div>
                  <Input
                    placeholder="Titolo"
                    value={editing.title}
                    onChange={e => setEditing({ ...editing, title: e.target.value })}
                  />
                  <Textarea
                    rows={4}
                    placeholder={'Modifiche (una per riga)\nEs.\nSala: nuovo highlight delle postazioni'}
                    value={editing.changes.join('\n')}
                    onChange={e => setEditing({ ...editing, changes: e.target.value.split('\n') })}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Check className="h-4 w-4 mr-1" /> Salva
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                      <X className="h-4 w-4 mr-1" /> Annulla
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setEditing({
                  version: (entries[0]?.version ?? 0) + 1,
                  date: new Date().toLocaleDateString('it-IT'),
                  title: 'Aggiornamento',
                  changes: [''],
                })}>
                  <Plus className="h-4 w-4 mr-1" /> Nuova entry
                </Button>
              )}

              {/* Lista entry */}
              {entries.map(e => (
                <div key={e.version} className="rounded-xl border bg-card p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      v{e.version} · {e.title} <span className="text-muted-foreground font-normal">· {e.date}</span>
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditing(e)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent text-muted-foreground transition-colors"
                        aria-label={`Modifica v${e.version}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(e.version)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-destructive transition-colors"
                        aria-label={`Elimina v${e.version}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <ul className="space-y-0.5">
                    {e.changes.map((c, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="text-primary shrink-0">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <Button variant="outline" className="w-full border-dashed" onClick={handleForceNew} disabled={saving}>
                <Megaphone className="h-4 w-4 mr-1" /> Forza nuova versione (la vedranno tutti)
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Utenti che non hanno ancora visto l&apos;ultima versione (v{reads.latestVersion}): {unseenCount}
              </p>
              <div className="rounded-xl border bg-card divide-y">
                {reads.users.map(u => {
                  const seen = u.lastSeenVersion >= reads.latestVersion
                  return (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2.5 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.cognome} {u.nome}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {u.is_manager ? 'Manager' : u.is_secondary ? 'Noni' : 'DCO'}
                          {' · ultima vista: '}{u.lastSeenVersion > 0 ? `v${u.lastSeenVersion}` : 'mai'}
                          {u.readAt ? ` (${new Date(u.readAt).toLocaleString('it-IT')})` : ''}
                        </p>
                      </div>
                      <span className={cn(
                        'flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                        seen ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
                      )}>
                        {seen ? 'Visto' : 'Da vedere'}
                      </span>
                    </div>
                  )
                })}
                {reads.users.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    <Eye className="h-4 w-4 inline mr-1" /> Nessun dato
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <Button variant="outline" className="w-full" onClick={onClose}>Chiudi</Button>
      </DialogContent>
    </Dialog>
  )
}
