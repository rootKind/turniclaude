'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { saveNotificationEntry } from '@/lib/notification-storage'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Invio broadcast a TUTTI gli utenti (bottone «Invia Notifiche» del pannello).
 * Usa l'endpoint del pannello debug (POST /api/admin/notifications, audience
 * 'all') che restituisce il conteggio dei dispositivi effettivamente raggiunti.
 * Per invii mirati, variabili e report per destinatario: «Debug notifiche».
 */
export function NotificationDialog({ open, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [userCount, setUserCount] = useState(0)

  useEffect(() => {
    if (!open) return
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(({ users }: { users: unknown[] }) => setUserCount(users?.length ?? 0))
      .catch(() => setUserCount(0))
  }, [open])

  async function handleSubmit() {
    if (!title || !message) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body: message, audience: 'all' }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Errore invio notifica')
      saveNotificationEntry({
        id: crypto.randomUUID(),
        title,
        body: message,
        timestamp: Date.now(),
        read: true,
        type: 'system',
      })
      toast.success(
        payload.skipped > 0
          ? `Inviata a ${payload.delivered} dispositivi (${payload.skipped} utenti senza dispositivo)`
          : `Inviata a ${payload.delivered} dispositivi`,
      )
      setTitle('')
      setMessage('')
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Invia notifica a tutti</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notif-title">Titolo</Label>
            <Input id="notif-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo notifica" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notif-msg">Messaggio</Label>
            <Textarea id="notif-msg" value={message} onChange={e => setMessage(e.target.value)} placeholder="Testo del messaggio" rows={3} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Messaggio uguale per tutti{userCount > 0 ? ` (${userCount} utenti)` : ''}. Variabili, gruppi o
            selezione di singoli: usa «Debug notifiche» nel pannello.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annulla</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isLoading || !title || !message}>
              {isLoading ? 'Invio...' : 'Invia'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
