'use client'
/**
 * Pannello di controllo avanzato notifiche (richiesta 14/09/2026).
 * Sostituisce il vecchio «Test notifiche»: l'admin
 *  1. vede TUTTI i messaggi push dell'app (registry + override in app_settings)
 *  2. ne modifica titolo/testo, anche con variabili {nome}, {cognome}, {turno}…
 *  3. testa l'invio globale, per gruppo (DCO/Noni) o a utenti selezionati,
 *     con report per destinatario (testo effettivo, dispositivi raggiunti)
 *  4. gestisce le subscription push (debug dispositivi per utente).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RotateCcw, Send, Trash2, Braces, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { saveNotificationEntry } from '@/lib/notification-storage'
import {
  NOTIF_VARS,
  countModifiedTemplates,
  extractTemplateVars,
  renderNotifTemplate,
  varsForTemplate,
  type NotifOverrides,
  type NotifTemplateDef,
} from '@/lib/notification-templates'
import { Button } from '@/components/ui/button'
import { ViaUscita } from '@/components/ui/via-uscita'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useConferma } from '@/hooks/use-conferma'

interface UserRow {
  id: string
  nome: string | null
  cognome: string | null
  is_secondary: boolean
  is_dco_plus: boolean
  devices: number
}

interface GetPayload {
  templates: NotifTemplateDef[]
  defaults: NotifTemplateDef[]
  overrides: NotifOverrides
  users: UserRow[]
}

type Audience = 'all' | 'secondary' | 'primary' | 'custom'

interface Props {
  open: boolean
  onClose: () => void
}

const STATUS_STYLE: Record<string, string> = {
  delivered: 'text-green-600 dark:text-green-400',
  partial: 'text-amber-600 dark:text-amber-400',
  skipped: 'text-muted-foreground',
  failed: 'text-destructive',
}
const STATUS_LABEL: Record<string, string> = {
  delivered: 'consegnata',
  partial: 'parziale',
  skipped: 'nessun dispositivo',
  failed: 'errore',
}

function userName(u: { cognome: string | null; nome: string | null }): string {
  return [u.cognome, u.nome].filter(Boolean).join(' ') || '(senza nome)'
}

export function NotificationDebugDialog({ open, onClose }: Props) {
  const [data, setData] = useState<GetPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('messages')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/notifications')
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Errore')
      setData(await res.json())
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  // editing corrente (fuori da data: si salva solo con «Salva»)
  const [editing, setEditing] = useState<NotifTemplateDef | null>(null)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Debug notifiche</DialogTitle>
        </DialogHeader>
        {loading && !data ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Caricamento…</p>
        ) : !data ? (
          /* M12: «Nessun dato» senza un modo di riprovare è un vicolo cieco — e
             qui la richiesta può essere caduta per un'attimo di rete (il
             fallimento lo dice già il toast, ma il toast sparisce). */
          <div className="flex flex-col items-center gap-1.5 py-6">
            <p className="text-sm text-muted-foreground text-center">Nessun dato</p>
            <ViaUscita onClick={() => void refresh()}>Ricarica</ViaUscita>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="messages">Messaggi</TabsTrigger>
              <TabsTrigger value="send">Invio di prova</TabsTrigger>
              <TabsTrigger value="devices">Dispositivi</TabsTrigger>
            </TabsList>
            <div className="flex-1 min-h-0 overflow-y-auto mt-3">
              <TabsContent value="messages" className="m-0">
                <MessagesTab
                  data={data}
                  refresh={refresh}
                  editing={editing}
                  setEditing={setEditing}
                />
              </TabsContent>
              <TabsContent value="send" className="m-0">
                <SendTab data={data} />
              </TabsContent>
              <TabsContent value="devices" className="m-0">
                <DevicesTab data={data} refresh={refresh} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── 1. Messaggi: elenco + editor con variabili ──────────────────────────────

function MessagesTab({ data, refresh, editing, setEditing }: {
  data: GetPayload
  refresh: () => Promise<void>
  editing: NotifTemplateDef | null
  setEditing: (t: NotifTemplateDef | null) => void
}) {
  /**
   * LE TRE DOMANDE DEL PANNELLO (M3 del design system, 20/09/2026).
   *
   * Questo file usava `confirm()` — la finestra del BROWSER — per tre azioni che
   * non si annullano: ripristinare TUTTI i testi di fabbrica, inviare push vere a
   * tutti gli utenti, cancellare le iscrizioni di un dispositivo. In una PWA
   * installata su iOS quella finestra non appartiene all'app (compare come avviso
   * di sistema, in inglese, con l'origine del sito nel titolo) e su Android non è
   * né un dialog M3 né un allarme HIG: è il caso più visibile dell'issue n. 6 del
   * report. Ora è lo stesso allarme delle altre conferme distruttive.
   */
  const { chiedi, alert } = useConferma()
  const overrides = data.overrides ?? {}
  // Una chiave di `overrides` = UN messaggio (title+body dentro), quindi il
  // conteggio si fa sui template che differiscono dal default — non sul numero
  // di chiavi (né, peggio, sulla sua metà).
  const modifiedCount = countModifiedTemplates(data.templates, data.defaults)

  if (editing) return <TemplateEditor data={data} refresh={refresh} template={editing} onBack={() => setEditing(null)} />

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {/* una stringa sola: così il testo reso è esattamente questo (lo spazio
              fra il numero e «messaggi» compreso) */}
          {`${data.templates.length} messaggi push dell'app${modifiedCount > 0 ? ` · ${modifiedCount} ${modifiedCount === 1 ? 'modificato' : 'modificati'}` : ''}`}
        </p>
        {modifiedCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() =>
              chiedi({
                title: 'Ripristinare i testi predefiniti?',
                description: `${modifiedCount === 1 ? 'Un messaggio modificato torna' : `${modifiedCount} messaggi modificati tornano`} al testo di fabbrica, e il ripristino vale per TUTTI i messaggi, non solo quelli aperti.`,
                confirmLabel: 'Ripristina',
                run: async () => {
                  const res = await fetch('/api/admin/notifications', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ overrides: null }),
                  })
                  if (res.ok) { toast.success('Testi predefiniti ripristinati'); await refresh() }
                  else toast.error('Errore')
                },
              })
            }
          >
            <RotateCcw size={12} /> Ripristina tutti
          </Button>
        )}
      </div>
      {data.templates.map(t => {
        const isOverridden = !!overrides[t.key]
        const def = data.defaults.find(d => d.key === t.key)
        const changed = isOverridden && def && (def.title !== t.title || def.body !== t.body)
        return (
          <button
            key={t.key}
            onClick={() => setEditing(t)}
            className="w-full text-left rounded-xl border bg-card px-3 py-2.5 hover:bg-accent/50 transition-colors space-y-1"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold flex-1 min-w-0 truncate">{t.label}</span>
              {changed && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  modificato
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              <span className="font-medium text-foreground">{t.title}</span> — {t.body}
            </p>
            <p className="text-[10px] text-muted-foreground/70">{t.source}</p>
          </button>
        )
      })}
      {alert}
    </div>
  )
}

function TemplateEditor({ data, refresh, template, onBack }: {
  data: GetPayload
  refresh: () => Promise<void>
  template: NotifTemplateDef
  onBack: () => void
}) {
  const def = data.defaults.find(d => d.key === template.key)
  const [title, setTitle] = useState(template.title)
  const [body, setBody] = useState(template.body)
  const [saving, setSaving] = useState(false)
  const vars = varsForTemplate(template)
  const usedVars = [...new Set([...extractTemplateVars(title), ...extractTemplateVars(body)])]

  // anteprima con i valori d'esempio delle variabili
  const sampleVars = useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of NOTIF_VARS) m[v.name] = v.sample
    return m
  }, [])
  const preview = { title: renderNotifTemplate(title, sampleVars), body: renderNotifTemplate(body, sampleVars) }

  const isModified = !!def && (def.title !== title || def.body !== body)

  const insertVar = (name: string, field: 'title' | 'body') => {
    const token = `{${name}}`
    if (field === 'title') setTitle(t => `${t}${t ? ' ' : ''}${token}`)
    else setBody(b => `${b}${b.endsWith(' ') || !b ? '' : ' '}${token}`)
  }

  const save = async () => {
    setSaving(true)
    try {
      // merge con gli override esistenti: solo il campo toccato cambia
      const next: NotifOverrides = { ...(data.overrides ?? {}) }
      const prev = next[template.key]
      next[template.key] = {
        title: def && prev?.title === undefined && title === def.title ? def.title : title,
        body: def && prev?.body === undefined && body === def.body ? def.body : body,
      }
      if (def && next[template.key].title === def.title && next[template.key].body === def.body) {
        delete next[template.key] // tornato ai default: niente override
      }
      const res = await fetch('/api/admin/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: next }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Errore')
      toast.success('Testo salvato: verrà usato dall\'app da ora')
      await refresh()
      onBack()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const resetOne = async () => {
    const next: NotifOverrides = { ...(data.overrides ?? {}) }
    delete next[template.key]
    const res = await fetch('/api/admin/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: next }),
    })
    if (res.ok) { toast.success('Testo predefinito ripristinato'); await refresh(); onBack() }
    else toast.error('Errore')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onBack}>← Indietro</Button>
        <p className="text-sm font-semibold flex-1 min-w-0 truncate">{template.label}</p>
        {def && (template.title !== def.title || template.body !== def.body) && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={resetOne}>
            <RotateCcw size={12} /> Default
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{template.source} · {template.context}</p>

      <div className="space-y-1">
        <Label className="text-xs">Titolo</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Messaggio</Label>
        <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} className="resize-none" />
      </div>

      {/* Variabili: presenti nel testo + suggerite per questo messaggio */}
      <div className="rounded-lg border bg-muted/20 p-2 space-y-1.5">
        <p className="text-[11px] font-medium flex items-center gap-1">
          <Braces size={11} /> Variabili — il valore reale arriva dal contesto dell&apos;invio
        </p>
        <div className="flex flex-wrap gap-1">
          {vars.map(v => (
            <button
              key={v.name}
              title={`${v.description} — es. ${v.sample}`}
              onClick={() => insertVar(v.name, 'body')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                usedVars.includes(v.name)
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-card hover:bg-accent text-muted-foreground'
              }`}
            >
              {`{${v.name}}`}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Clic su una variabile per inserirla nel messaggio. Titolo e messaggio seguono lo stesso schema.
        </p>
      </div>

      {/* Anteprima con i valori d'esempio */}
      <div className="rounded-lg border bg-card p-2.5 space-y-1">
        <p className="text-[11px] font-medium flex items-center gap-1 text-muted-foreground">
          <Eye size={11} /> Anteprima (valori d&apos;esempio)
        </p>
        <p className="text-sm font-semibold">{preview.title}</p>
        <p className="text-xs text-muted-foreground">{preview.body}</p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onBack}>Annulla</Button>
        <Button size="sm" onClick={save} disabled={saving || !title.trim() || !body.trim() || !isModified}>
          {saving ? 'Salvataggio…' : 'Salva testo'}
        </Button>
      </div>
    </div>
  )
}

// ─── 2. Invio di prova: globale, gruppo o selezione, con report ─────────────

function SendTab({ data }: { data: GetPayload }) {
  const [audience, setAudience] = useState<Audience>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('Messaggio di prova')
  const [body, setBody] = useState('Ciao {nome} {cognome}, questo è un test dal pannello debug.')
  const [varTurno, setVarTurno] = useState('')
  const [varData, setVarData] = useState('')
  const [varActor, setVarActor] = useState('')
  const [sending, setSending] = useState(false)
  const [report, setReport] = useState<{ delivered: number; skipped: number; failed: number; outcomes: Array<{ userId: string; label: string; status: string; sent: number; title: string; body: string; error?: string }> } | null>(null)
  const { chiedi, alert } = useConferma()

  const users = data.users
  const selectedUsers = users.filter(u => selected.has(u.id))

  // anteprima sul primo destinatario (o generica)
  const firstUser = audience === 'custom' ? selectedUsers[0] : users[0]
  const preview = useMemo(() => {
    const vars: Record<string, string> = {
      nome: firstUser?.nome ?? 'Mario',
      cognome: firstUser?.cognome ?? 'Rossi',
    }
    if (varActor) vars.nome_attore = varActor.split(' ')[1] ?? ''
    if (varActor) vars.cognome_attore = varActor.split(' ')[0] ?? ''
    if (varTurno) vars.turno = varTurno
    if (varData) vars.data = varData
    return { title: renderNotifTemplate(title, vars), body: renderNotifTemplate(body, vars) }
  }, [firstUser, title, body, varActor, varTurno, varData])

  const unresolved = [...new Set([...extractTemplateVars(title), ...extractTemplateVars(body)])]
    .filter(v => !['nome', 'cognome', 'nome_attore', 'cognome_attore', 'turno', 'data'].includes(v))

  const toggleUser = (id: string) => {
    setSelected(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  /** Chi riceverà davvero la push: è la prima cosa che l'allarme deve dire. */
  const destinatari =
    audience === 'all' ? 'TUTTI gli utenti'
    : audience === 'custom' ? `${selected.size} utenti`
    : audience === 'secondary' ? 'tutti i Noni'
    : 'tutti i DCO'

  /**
   * Inviare è irreversibile quanto distruggere: la push parte davvero, sui
   * telefoni veri. Per questo la domanda c'è (come prima), ma ora è un allarme
   * dell'app e dice a QUANTI va — il conteggio lo sa solo qui, non nel testo del
   * pulsante.
   */
  const inviaOra = async () => {
    setSending(true)
    setReport(null)
    try {
      const varContext: Record<string, string> = {}
      if (varActor) { varContext.nome_attore = varActor.split(' ')[1] ?? ''; varContext.cognome_attore = varActor.split(' ')[0] ?? '' }
      if (varTurno) varContext.turno = varTurno
      if (varData) varContext.data = varData
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, audience, targetIds: audience === 'custom' ? [...selected] : null, varContext }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Errore')
      setReport(payload)
      // rispecchia anche nel campanello locale (come il vecchio test)
      saveNotificationEntry({
        id: crypto.randomUUID(),
        title: preview.title,
        body: preview.body,
        timestamp: Date.now(),
        read: false,
        type: 'system',
      })
      toast.success(`${payload.delivered} notifiche consegnate${payload.skipped ? `, ${payload.skipped} senza dispositivo` : ''}${payload.failed ? `, ${payload.failed} errori` : ''}`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  /** La domanda: la stessa azione, ma risposta prima di partire. */
  const send = () =>
    chiedi({
      title: 'Inviare la notifica?',
      description: `A ${destinatari}. Partono push vere sui dispositivi e l'invio non si annulla.`,
      confirmLabel: 'Invia',
      destructive: false,
      run: inviaOra,
    })

  return (
    <div className="space-y-3">
      {/* Destinatari */}
      <div className="space-y-2">
        <Label className="text-xs">Destinatari</Label>
        <div className="grid grid-cols-4 gap-1">
          {([
            ['all', `Tutti (${users.length})`],
            ['primary', `DCO (${users.filter(u => !u.is_secondary).length})`],
            ['secondary', `Noni (${users.filter(u => u.is_secondary).length})`],
            ['custom', 'Seleziona…'],
          ] as Array<[Audience, string]>).map(([a, label]) => (
            <button
              key={a}
              onClick={() => setAudience(a)}
              className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                audience === a ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:bg-accent text-muted-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {audience === 'custom' && (
          <div className="rounded-lg border max-h-44 overflow-y-auto divide-y">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => toggleUser(u.id)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-accent/50 text-left"
              >
                <input type="checkbox" checked={selected.has(u.id)} readOnly className="pointer-events-none" />
                <span className="text-xs flex-1 min-w-0 truncate">{userName(u)}</span>
                <span className="text-[10px] text-muted-foreground">{u.is_secondary ? 'Noni' : u.is_dco_plus ? 'DCO+' : 'DCO'} · {u.devices} disp.</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messaggio */}
      <div className="space-y-1">
        <Label className="text-xs">Titolo</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Messaggio (usa {'{nome}'}, {'{cognome}'}, {'{turno}'}, {'{data}'}…)</Label>
        <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} className="resize-none" />
      </div>

      {/* Contesto variabile facoltativo */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">{'{turno}'}</Label>
          <Input value={varTurno} onChange={e => setVarTurno(e.target.value)} placeholder="es. Mattina" className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">{'{data}'}</Label>
          <Input value={varData} onChange={e => setVarData(e.target.value)} placeholder="es. 15/05" className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Attore (Cognome Nome)</Label>
          <Input value={varActor} onChange={e => setVarActor(e.target.value)} placeholder="es. Bianchi Laura" className="h-8 text-xs" />
        </div>
      </div>
      {unresolved.length > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Variabili senza contesto (restano letterali): {unresolved.map(v => `{${v}}`).join(' ')}
        </p>
      )}

      {/* Anteprima */}
      <div className="rounded-lg border bg-card p-2.5 space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
          <Eye size={11} /> Anteprima per {firstUser ? userName(firstUser) : '—'}
        </p>
        <p className="text-sm font-semibold">{preview.title}</p>
        <p className="text-xs text-muted-foreground">{preview.body}</p>
      </div>

      <Button className="w-full" onClick={send} disabled={sending || !title.trim() || !body.trim() || (audience === 'custom' && selected.size === 0)}>
        <Send size={14} /> {sending ? 'Invio…' : 'Invia di prova'}
      </Button>

      {/* Report */}
      {report && (
        <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1.5">
          <p className="text-xs font-semibold">
            Report: {report.delivered} notifiche consegnate · {report.skipped} senza dispositivo · {report.failed} errori
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {report.outcomes.map(o => (
              <div key={o.userId} className="text-[11px] flex items-start gap-1.5">
                <span className={`font-medium shrink-0 ${STATUS_STYLE[o.status] ?? ''}`}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
                <span className="font-medium shrink-0">{o.label}</span>
                <span className="text-muted-foreground min-w-0 truncate">«{o.title} — {o.body}»{o.error ? ` (${o.error})` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {alert}
    </div>
  )
}

// ─── 3. Dispositivi: subscription push per utente ────────────────────────────

function DevicesTab({ data, refresh }: { data: GetPayload; refresh: () => Promise<void> }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const list = data.users
    .filter(u => userName(u).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.devices - a.devices || userName(a).localeCompare(userName(b)))

  const { chiedi, alert } = useConferma()

  const wipe = (u: UserRow) =>
    chiedi({
      title: `Rimuovere le iscrizioni di ${userName(u)}?`,
      description: `${u.devices} iscrizioni push. Dopo, dal dispositivo non riceverà più niente finché non riattiva le notifiche.`,
      confirmLabel: 'Rimuovi',
      run: () => eseguiWipe(u),
    })

  const eseguiWipe = async (u: UserRow) => {
    setBusy(u.id)
    try {
      const res = await fetch(`/api/admin/notifications?userId=${u.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Errore')
      toast.success('Iscrizioni rimosse')
      await refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const totalDevices = data.users.reduce((n, u) => n + u.devices, 0)
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{totalDevices} dispositivi iscritti fra {data.users.length} utenti</p>
      {/* M12: è una ricerca, e lo dice: tasto «cerca» sulla tastiera, memoria del
          browser spenta (qui si cercano cognomi, non indirizzi). */}
      <Input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Cerca utente…"
        className="h-8 text-xs"
        aria-label="Cerca utente"
      />
      <div className="rounded-lg border divide-y max-h-80 overflow-y-auto">
        {list.map(u => (
          <div key={u.id} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="text-xs flex-1 min-w-0 truncate">{userName(u)}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {u.devices > 0 ? `${u.devices} dispositiv${u.devices === 1 ? 'o' : 'i'}` : 'nessuno'}
            </span>
            {u.devices > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-1.5 text-[10px]"
                disabled={busy === u.id}
                onClick={() => wipe(u)}
                title="Rimuovi tutte le iscrizioni push (debug)"
              >
                <Trash2 size={11} />
              </Button>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Un utente con 0 dispositivi non riceverà nessuna push: usa «Rimuovi» se le sue iscrizioni risultano stale
        (es. browser reinstallato) e fallo ri-iscrivere.
      </p>
      {alert}
    </div>
  )
}
