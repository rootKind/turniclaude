'use client'
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { ShiftTeamTree } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
}

type Team = ShiftTeamTree['types'][number]['teams'][number]

/**
 * Nome visualizzato della squadra: i cognomi dei capisquadra (membri con is_lead),
 * es. «D'ELIA-PASSANNANTI», «ALBANO». Restano allineati da soli quando il roster cambia.
 * Le squadre senza caposquadra usano il loro nome, senza il prefisso «Squadra».
 */
function teamLabel(team: Team): string {
  const leads = team.members.filter(m => m.is_lead).map(m => m.full_name)
  if (leads.length) return leads.join('-')
  return team.name.replace(/^Squadra\s+/i, '').replace(/^./, c => c.toUpperCase())
}

async function api(method: string, body?: unknown) {
  const res = await fetch('/api/admin/shift-teams', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error((b as { error?: string }).error || 'Errore')
  }
}

export function SquadreDialog({ open, onClose }: Props) {
  const [tree, setTree] = useState<ShiftTeamTree | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('types')
  const [membersTypeId, setMembersTypeId] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setTree(await fetchShiftTeamTree(createClient()))
    } catch (err) {
      toast.error('Errore caricamento: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const run = useCallback(async (fn: () => Promise<void>, okMsg: string) => {
    try {
      await fn()
      toast.success(okMsg)
      await refresh()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }, [refresh])

  if (!tree) {
    return (
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>Squadre e turni</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{loading ? 'Caricamento…' : 'Nessun dato'}</p>
        </DialogContent>
      </Dialog>
    )
  }

  // La matita nella scheda Tipologie porta alla gestione dei suoi membri
  const openMembers = (typeId: string) => {
    setMembersTypeId(typeId)
    setTab('members')
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader><DialogTitle>Squadre e turni teorici</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="types">Tipologie</TabsTrigger>
            <TabsTrigger value="teams">Squadre</TabsTrigger>
            <TabsTrigger value="members">Membri</TabsTrigger>
          </TabsList>
          <div className="flex-1 min-h-0 overflow-y-auto mt-3">
            <TabsContent value="types"><TypesTab tree={tree} run={run} onEditMembers={openMembers} /></TabsContent>
            <TabsContent value="teams"><TeamsTab tree={tree} run={run} /></TabsContent>
            <TabsContent value="members">
              <MembersTab tree={tree} run={run} typeId={membersTypeId} onTypeChange={setMembersTypeId} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tipologie ───────────────────────────────────────────────────────────────

function TypesTab({ tree, run, onEditMembers }: {
  tree: ShiftTeamTree
  run: (fn: () => Promise<void>, ok: string) => Promise<void>
  onEditMembers: (typeId: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [cycle, setCycle] = useState('28')

  return (
    <div className="space-y-2">
      {tree.types.map(t => (
        <div key={t.id} className="rounded-xl border bg-card px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  ciclo {t.cycle_days} giorni · start {t.pattern_start} · {t.teams.reduce((s, x) => s + x.members.length, 0)} membri
                </p>
              </div>
              <Switch
                checked={t.is_active}
                onCheckedChange={v => run(
                  () => api('PUT', { kind: 'type', id: t.id, is_active: v }),
                  v ? 'Tipologia attivata' : 'Tipologia disattivata',
                )}
              />
              <button
                onClick={() => onEditMembers(t.id)}
                title="Gestisci i membri"
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => {
                  if (confirm(`Eliminare la tipologia "${t.name}" e tutte le sue squadre?`))
                    run(async () => {
                      const r = await fetch(`/api/admin/shift-teams?kind=type&id=${t.id}`, { method: 'DELETE' })
                      if (!r.ok) throw new Error('Errore')
                    }, 'Tipologia eliminata')
                }}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </button>
          </div>
        </div>
      ))}

      {adding ? (
        <div className="rounded-xl border bg-card px-3 py-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome tipologia</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="es. Squadra in terza" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ciclo (giorni)</Label>
            <Input type="number" min={1} value={cycle} onChange={e => setCycle(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Annulla</Button>
            <Button
              size="sm"
              onClick={() => run(async () => {
                await api('POST', { kind: 'type', name, cycle_days: parseInt(cycle) || 28 })
                setName(''); setCycle('28'); setAdding(false)
              }, 'Tipologia creata')}
            >
              Crea
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus size={14} /> Nuova tipologia
        </Button>
      )}
    </div>
  )
}

// ─── Squadre ─────────────────────────────────────────────────────────────────

function TeamsTab({ tree, run }: { tree: ShiftTeamTree; run: (fn: () => Promise<void>, ok: string) => Promise<void> }) {
  const [typeId, setTypeId] = useState(tree.types[0]?.id ?? '')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phase, setPhase] = useState('0')

  const type = tree.types.find(t => t.id === typeId)

  return (
    <div className="space-y-3">
      <Select value={typeId} onValueChange={v => setTypeId(v ?? '')} items={tree.types.map(t => ({ value: t.id, label: t.name }))}>
        <SelectTrigger><SelectValue placeholder="Scegli tipologia" /></SelectTrigger>
        <SelectContent>
          {tree.types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {type?.teams.map(team => (
        <div key={team.id} className="rounded-xl border bg-card px-3 py-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{teamLabel(team)}</p>
            <p className="text-xs text-muted-foreground">
              fase +{team.phase_offset_days}gg · {team.members.length} membri
            </p>
          </div>
          <TeamPhaseEditor team={team} run={run} />
        </div>
      ))}

      {adding ? (
        <div className="rounded-xl border bg-card px-3 py-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome squadra</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="es. Squadra E" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sfasamento (giorni)</Label>
            <Input type="number" value={phase} onChange={e => setPhase(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Annulla</Button>
            <Button size="sm" onClick={() => run(async () => {
              await api('POST', { kind: 'team', shift_type_id: typeId, name, phase_offset_days: parseInt(phase) || 0 })
              setName(''); setPhase('0'); setAdding(false)
            }, 'Squadra creata')}>Crea</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setAdding(true)} disabled={!typeId}>
          <Plus size={14} /> Nuova squadra
        </Button>
      )}
    </div>
  )
}

function TeamPhaseEditor({ team, run }: { team: Team; run: (fn: () => Promise<void>, ok: string) => Promise<void> }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => run(() => api('PUT', { kind: 'team', id: team.id, phase_offset_days: team.phase_offset_days - 1 }), 'Fase aggiornata')}
        className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground"
      >
        <ChevronDown size={14} />
      </button>
      <span className="text-xs tabular-nums w-8 text-center">+{team.phase_offset_days}</span>
      <button
        onClick={() => run(() => api('PUT', { kind: 'team', id: team.id, phase_offset_days: team.phase_offset_days + 1 }), 'Fase aggiornata')}
        className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground"
      >
        <ChevronUp size={14} />
      </button>
      <button
        onClick={() => {
          if (confirm(`Eliminare la squadra "${team.name}"?`))
            run(async () => {
              const r = await fetch(`/api/admin/shift-teams?kind=team&id=${team.id}`, { method: 'DELETE' })
              if (!r.ok) throw new Error('Errore')
            }, 'Squadra eliminata')
        }}
        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ─── Membri ──────────────────────────────────────────────────────────────────

function MembersTab({ tree, run, typeId, onTypeChange }: {
  tree: ShiftTeamTree
  run: (fn: () => Promise<void>, ok: string) => Promise<void>
  typeId: string
  onTypeChange: (typeId: string) => void
}) {
  const [teamId, setTeamId] = useState('')
  const [adding, setAdding] = useState(false)

  const type = tree.types.find(t => t.id === typeId) ?? tree.types[0]
  const activeTypeId = type?.id ?? ''
  const team = type?.teams.find(t => t.id === teamId)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={activeTypeId}
          onValueChange={id => { onTypeChange(id ?? ''); setTeamId('') }}
          items={tree.types.map(t => ({ value: t.id, label: t.name }))}
        >
          <SelectTrigger><SelectValue placeholder="Tipologia" /></SelectTrigger>
          <SelectContent>
            {tree.types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={teamId}
          onValueChange={v => setTeamId(v ?? '')}
          items={(type?.teams ?? []).map(t => ({ value: t.id, label: teamLabel(t) }))}
        >
          <SelectTrigger><SelectValue placeholder="Squadra" /></SelectTrigger>
          <SelectContent>
            {type?.teams.map(t => <SelectItem key={t.id} value={t.id}>{teamLabel(t)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {team && (
        <>
          {team.members.map(m => (
            <MemberRow
              key={m.id}
              member={m}
              cycle={type?.cycle_days ?? 0}
              run={run}
            />
          ))}
          {team.members.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nessun membro in questa squadra.</p>
          )}
          {adding ? (
            <MemberAdd
              teamId={team.id}
              cycle={type?.cycle_days ?? 0}
              onDone={() => setAdding(false)}
              run={run}
            />
          ) : (
            <Button size="sm" variant="outline" className="w-full" onClick={() => setAdding(true)}>
              <Plus size={14} /> Nuovo membro
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function MemberRow({ member, cycle, run }: {
  member: Team['members'][number]
  cycle: number
  run: (fn: () => Promise<void>, ok: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(member.full_name)
  const [pattern, setPattern] = useState(member.pattern.join(' '))
  const tokenCount = pattern.trim() ? pattern.trim().split(/\s+/).length : 0

  return (
    <div className="rounded-xl border bg-card px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{member.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {tokenCount}/{cycle} token · {member.is_active ? 'attivo' : 'inattivo'}
            {member.is_lead && ' · caposquadra'}
          </p>
        </div>
        <button
          onClick={() => run(
            () => api('PUT', { kind: 'member', id: member.id, is_lead: !member.is_lead }),
            member.is_lead ? 'Caposquadra rimosso' : 'Caposquadra impostato',
          )}
          title={member.is_lead ? 'Rimuovi caposquadra' : 'Imposta come caposquadra'}
          className={`p-1.5 rounded-lg hover:bg-muted ${member.is_lead ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <Star size={14} fill={member.is_lead ? 'currentColor' : 'none'} />
        </button>
        <Switch
          checked={member.is_active}
          onCheckedChange={v => run(() => api('PUT', { kind: 'member', id: member.id, is_active: v }), v ? 'Membro attivato' : 'Membro disattivato')}
        />
        <button onClick={() => setEditing(v => !v)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil size={14} /></button>
        <button
          onClick={() => {
            if (confirm(`Eliminare "${member.full_name}"?`))
              run(async () => {
                const r = await fetch(`/api/admin/shift-teams?kind=member&id=${member.id}`, { method: 'DELETE' })
                if (!r.ok) throw new Error('Errore')
              }, 'Membro eliminato')
          }}
          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {editing && (
        <div className="space-y-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
          <Textarea
            rows={2}
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            placeholder="Token separati da spazi (es. M9 N7S RC RI …)"
          />
          <div className="flex items-center justify-between">
            <span className={`text-[11px] ${tokenCount === cycle ? 'text-muted-foreground' : 'text-destructive'}`}>
              {tokenCount}/{cycle} token
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setName(member.full_name); setPattern(member.pattern.join(' ')); setEditing(false) }}>
                <X size={12} /> Annulla
              </Button>
              <Button
                size="sm"
                disabled={tokenCount !== cycle}
                onClick={() => run(async () => {
                  await api('PUT', { kind: 'member', id: member.id, full_name: name, pattern: pattern.trim().split(/\s+/) })
                  setEditing(false)
                }, 'Membro aggiornato')}
              >
                Salva
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberAdd({ teamId, cycle, onDone, run }: {
  teamId: string
  cycle: number
  onDone: () => void
  run: (fn: () => Promise<void>, ok: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [pattern, setPattern] = useState('')
  const tokenCount = pattern.trim() ? pattern.trim().split(/\s+/).length : 0

  return (
    <div className="rounded-xl border bg-card px-3 py-3 space-y-2">
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
      <Textarea
        rows={2}
        value={pattern}
        onChange={e => setPattern(e.target.value)}
        placeholder={`Pattern di ${cycle} token separati da spazi`}
      />
      <div className="flex items-center justify-between">
        <span className={`text-[11px] ${tokenCount === cycle ? 'text-muted-foreground' : 'text-destructive'}`}>
          {tokenCount}/{cycle} token
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onDone}>Annulla</Button>
          <Button
            size="sm"
            disabled={!name.trim() || tokenCount !== cycle}
            onClick={() => run(async () => {
              await api('POST', { kind: 'member', team_id: teamId, full_name: name.trim(), pattern: pattern.trim().split(/\s+/) })
              onDone()
            }, 'Membro creato')}
          >
            Crea
          </Button>
        </div>
      </div>
    </div>
  )
}