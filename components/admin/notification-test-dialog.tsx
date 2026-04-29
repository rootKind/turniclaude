'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { saveNotificationEntry } from '@/lib/notification-storage'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface UserOption { id: string; nome: string | null; cognome: string | null }

type NotifType = 'system' | 'interest' | 'new_shift' | 'vacation_interest' | 'new_vacation'

const TEMPLATES: Record<NotifType, { title: string; body: string }> = {
  system:             { title: 'Cambio in attesa di conferma', body: 'Il cambio Mattina del 15/05 con Rossi Mario non può essere ancora accettato perché ci sono scorte disponibili' },
  interest:           { title: 'Nuovo interesse al tuo turno', body: 'Rossi Mario è interessato al tuo Mattina del 15/05 (cerca Pomeriggio)' },
  new_shift:          { title: 'Nuovo turno disponibile', body: 'Rossi Mario cede Mattina il 15/05, cerca Pomeriggio' },
  vacation_interest:  { title: 'Qualcuno è interessato al tuo cambio ferie', body: 'Rossi Mario è interessato al tuo 16–30 Giu 2026' },
  new_vacation:       { title: 'Nuovo cambio ferie disponibile', body: 'Rossi Mario offre 16–30 Giu in cambio di 01–15 Lug (2026)' },
}

const TYPE_LABELS: Record<NotifType, string> = {
  system:            'Sistema (megafono)',
  interest:          'Interesse turno',
  new_shift:         'Nuovo turno',
  vacation_interest: 'Interesse ferie',
  new_vacation:      'Nuovo cambio ferie',
}

interface Props {
  open: boolean
  onClose: () => void
}

export function NotificationTestDialog({ open, onClose }: Props) {
  const [users, setUsers] = useState<UserOption[]>([])
  const [targetUserId, setTargetUserId] = useState('')
  const [notifType, setNotifType] = useState<NotifType>('system')
  const [title, setTitle] = useState(TEMPLATES.system.title)
  const [message, setMessage] = useState(TEMPLATES.system.body)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(({ users }: { users: UserOption[] }) => setUsers(users ?? []))
      .catch(() => {})
  }, [open])

  function handleTypeChange(t: NotifType) {
    setNotifType(t)
    setTitle(TEMPLATES[t].title)
    setMessage(TEMPLATES[t].body)
  }

  async function handleSend() {
    if (!targetUserId || !title || !message) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, title, message, type: notifType }),
      })
      if (!res.ok) throw new Error()
      saveNotificationEntry({
        id: crypto.randomUUID(),
        title,
        body: message,
        timestamp: Date.now(),
        read: false,
        type: notifType,
      })
      toast.success('Notifica inviata')
    } catch {
      toast.error('Errore invio')
    } finally {
      setLoading(false)
    }
  }

  function displayName(u: UserOption) {
    return [u.cognome, u.nome].filter(Boolean).join(' ') || u.id
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Test notifiche</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Destinatario</Label>
            <Select value={targetUserId} onValueChange={setTargetUserId}>
              <SelectTrigger><SelectValue placeholder="Seleziona dipendente…" /></SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{displayName(u)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo notifica</Label>
            <Select value={notifType} onValueChange={v => handleTypeChange(v as NotifType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as NotifType[]).map(t => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Titolo</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Messaggio</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} className="resize-none" />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Invia push al dipendente selezionato + salva nel campanello locale.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annulla</Button>
            <Button
              className="flex-1"
              onClick={handleSend}
              disabled={loading || !targetUserId || !title || !message}
            >
              {loading ? 'Invio...' : 'Invia'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
