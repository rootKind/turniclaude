'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  onClose: () => void
}

export function NotificationDialog({ open, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit() {
    if (!title || !message) return
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { data: users } = await supabase.from('users').select('id')
      if (users?.length) {
        await Promise.allSettled(
          users.map(u =>
            fetch('/api/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: u.id, title, body: message }),
            })
          )
        )
      }
      toast.success('Notifica inviata')
      setTitle('')
      setMessage('')
      onClose()
    } catch {
      toast.error('Errore invio notifica')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Invia notifica</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notif-title">Titolo</Label>
            <Input id="notif-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo notifica" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notif-msg">Messaggio</Label>
            <Textarea id="notif-msg" value={message} onChange={e => setMessage(e.target.value)} placeholder="Testo del messaggio" rows={3} />
          </div>
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
