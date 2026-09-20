'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Plus, Save, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { fetchShiftCycleTemplates, fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConferma } from '@/hooks/use-conferma'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MemberBindingRow } from '@/components/admin/team-member-binding'
import { fetchAllUsersMinimal } from '@/lib/queries/users'
import type { ShiftCycleTemplate, ShiftTeamTree, UserProfile } from '@/types/database'

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
  const [templates, setTemplates] = useState<ShiftCycleTemplate[]>([])
  const [users, setUsers] = useState<Array<Pick<UserProfile, 'id' | 'nome' | 'cognome'>>>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('types')
  const [membersTypeId, setMembersTypeId] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [t, tpl, us] = await Promise.all([
        fetchShiftTeamTree(createClient()),
        fetchShiftCycleTemplates(createClient()),
        fetchAllUsersMinimal(),
      ])
      setTree(t)
      setTemplates(tpl)
      setUsers(us)
    } catch (err) {
      toast.error('Errore caricamento: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // user_id già legati a un membro (per disabilitarli nelle select del legame)
  const boundUserIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of tree?.types ?? [])
      for (const team of t.teams)
        for (const m of team.members)
          if (m.user_id) ids.add(m.user_id)
    return ids
  }, [tree])

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
              <MembersTab tree={tree} templates={templates} users={users} boundUserIds={boundUserIds} run={run} typeId={membersTypeId} onTypeChange={setMembersTypeId} />
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
  // Le eliminazioni di questa scheda passano da un ALLARME, non da
  // `window.confirm` (M3, 20/09/2026): la finestra del browser non è né HIG né
  // Material, blocca la pagina e in PWA su iOS sembra un avviso di sistema.
  const { chiedi, alert } = useConferma()

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
                  chiedi({
                    title: `Eliminare la tipologia "${t.name}"?`,
                    description: 'Spariscono anche le sue squadre e i suoi membri. Non si può recuperare.',
                    confirmLabel: 'Elimina',
                    run: () =>
                      run(async () => {
                        const r = await fetch(`/api/admin/shift-teams?kind=type&id=${t.id}`, { method: 'DELETE' })
                        if (!r.ok) throw new Error('Errore')
                      }, 'Tipologia eliminata'),
                  })
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

      {alert}
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
  const { chiedi, alert } = useConferma()

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
          chiedi({
            title: `Eliminare la squadra "${team.name}"?`,
            description: 'I suoi membri restano in anagrafica, ma la squadra non gira più.',
            confirmLabel: 'Elimina',
            run: () =>
              run(async () => {
                const r = await fetch(`/api/admin/shift-teams?kind=team&id=${team.id}`, { method: 'DELETE' })
                if (!r.ok) throw new Error('Errore')
              }, 'Squadra eliminata'),
          })
        }}
        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
      >
        <Trash2 size={14} />
      </button>

      {alert}
    </div>
  )
}

// ─── Membri ──────────────────────────────────────────────────────────────────

/** Anteprima compatta dei token di un ciclo: riposo/disponibilità in grigio, lavoro in tinta. */
function PatternPreview({ pattern, max = 14 }: { pattern: string[]; max?: number }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {pattern.slice(0, max).map((tok, i) => (
        <span
          key={i}
          className={`px-1 py-0.5 rounded text-[9px] font-mono leading-none ${
            /^(RM|RC|RI)$/.test(tok)
              ? 'bg-muted text-muted-foreground'
              : tok === 'D'
                ? 'bg-muted/50 text-muted-foreground/60'
                : 'bg-primary/10 text-primary'
          }`}
        >
          {tok}
        </span>
      ))}
      {pattern.length > max && <span className="text-[9px] text-muted-foreground self-center">+{pattern.length - max}</span>}
    </div>
  )
}

/**
 * Catalogo dei cicli pronti: scegli un template e il pattern si compila da solo.
 * Prima i template della squadra selezionata, poi quelli generici della
 * tipologia, infine quelli delle altre squadre (clic per applicare comunque).
 * «Salva» memorizza il pattern corrente nel catalogo per riutilizzarlo.
 */
function CyclePicker({ templates, typeId, teamId, cycle, pattern, onApply }: {
  templates: ShiftCycleTemplate[]
  typeId: string
  teamId: string
  cycle: number
  pattern: string[]            // pattern corrente dell'editor
  onApply: (tokens: string[]) => void
}) {
  const [savingName, setSavingName] = useState('')
  const [saving, setSaving] = useState(false)

  const forTeam = useMemo(
    () => templates.filter(t => t.shift_type_id === typeId && t.team_id === teamId),
    [templates, typeId, teamId],
  )
  const forType = useMemo(
    () => templates.filter(t => t.shift_type_id === typeId && !t.team_id),
    [templates, typeId],
  )
  const others = useMemo(
    () => templates.filter(t => t.shift_type_id === typeId && t.team_id && t.team_id !== teamId),
    [templates, typeId, teamId],
  )

  const save = async () => {
    const name = savingName.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/shift-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'template', shift_type_id: typeId, team_id: teamId, name, pattern }),
      })
      const b = await res.json()
      if (!res.ok) throw new Error(b.error || 'Errore')
      toast.success(`Ciclo "${name}" salvato nel catalogo`)
      setSavingName('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const Group = ({ label, items }: { label: string; items: ShiftCycleTemplate[] }) =>
    items.length ? (
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="grid gap-1">
          {items.map(t => {
            const active = t.pattern.join('|') === pattern.join('|')
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onApply(t.pattern)}
                className={`text-left rounded-lg border px-2 py-1.5 transition-colors ${
                  active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate flex-1">{t.name}</span>
                  {t.pattern.length !== cycle && (
                    <span className="text-[9px] text-destructive shrink-0">{t.pattern.length} token ≠ ciclo {cycle}</span>
                  )}
                </div>
                <PatternPreview pattern={t.pattern} max={14} />
              </button>
            )
          })}
        </div>
      </div>
    ) : null

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-2">
      <p className="text-xs font-medium">Cicli pronti</p>
      {forTeam.length === 0 && forType.length === 0 && others.length === 0 && (
        <p className="text-xs text-muted-foreground">Nessun ciclo memorizzato per questa tipologia.</p>
      )}
      <Group label="Di questa squadra" items={forTeam} />
      <Group label="Validi per tutta la tipologia" items={forType} />
      <Group label="Altre squadre della tipologia" items={others} />
      {pattern.length > 0 && (
        <div className="flex gap-1 items-center pt-1">
          <Input
            value={savingName}
            onChange={e => setSavingName(e.target.value)}
            placeholder="Salva questo ciclo come…"
            className="h-7 text-xs flex-1"
          />
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!savingName.trim() || saving} onClick={save}>
            <Save size={12} /> Salva
          </Button>
        </div>
      )}
    </div>
  )
}

function MembersTab({ tree, templates, users, boundUserIds, run, typeId, onTypeChange }: {
  tree: ShiftTeamTree
  templates: ShiftCycleTemplate[]
  users: Array<Pick<UserProfile, 'id' | 'nome' | 'cognome'>>
  boundUserIds: Set<string>
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
              templates={templates}
              typeId={activeTypeId}
              teamId={team.id}
              users={users}
              boundUserIds={boundUserIds}
              run={run}
            />
          ))}
          {team.members.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nessun membro in questa squadra.</p>
          )}
          {adding ? (
            <MemberAdd
              templates={templates}
              typeId={activeTypeId}
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

function MemberRow({ member, cycle, templates, typeId, teamId, users, boundUserIds, run }: {
  member: Team['members'][number]
  cycle: number
  templates: ShiftCycleTemplate[]
  typeId: string
  teamId: string
  users: Array<Pick<UserProfile, 'id' | 'nome' | 'cognome'>>
  boundUserIds: Set<string>
  run: (fn: () => Promise<void>, ok: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(member.full_name)
  const [pattern, setPattern] = useState(member.pattern.join(' '))
  const { chiedi, alert } = useConferma()
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
            chiedi({
              title: `Eliminare "${member.full_name}" dalla squadra?`,
              description: 'L’utente resta in anagrafica: sparisce solo da questa squadra.',
              confirmLabel: 'Elimina',
              run: () =>
                run(async () => {
                  const r = await fetch(`/api/admin/shift-teams?kind=member&id=${member.id}`, { method: 'DELETE' })
                  if (!r.ok) throw new Error('Errore')
                }, 'Membro eliminato'),
            })
          }}
          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {editing && (
        <div className="space-y-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
          <MemberBindingRow member={member} users={users} boundUserIds={boundUserIds} run={run} />
          <CyclePicker
            templates={templates}
            typeId={typeId}
            teamId={teamId}
            cycle={cycle}
            pattern={pattern.trim() ? pattern.trim().split(/\s+/) : []}
            onApply={tokens => setPattern(tokens.join(' '))}
          />
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

      {alert}
    </div>
  )
}

function MemberAdd({ templates, typeId, teamId, cycle, onDone, run }: {
  templates: ShiftCycleTemplate[]
  typeId: string
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
      <CyclePicker
        templates={templates}
        typeId={typeId}
        teamId={teamId}
        cycle={cycle}
        pattern={pattern.trim() ? pattern.trim().split(/\s+/) : []}
        onApply={tokens => setPattern(tokens.join(' '))}
      />
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