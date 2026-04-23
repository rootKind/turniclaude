'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type UserOption = { id: string; nome: string | null; cognome: string | null; is_secondary: boolean }

interface Props {
  open: boolean
  onClose: () => void
}

export function ImpersonateDialog({ open, onClose }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState<UserOption[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(({ users }: { users: UserOption[] }) => setUsers(users ?? []))
      .catch(() => setUsers([]))
  }, [open])

  const filtered = users.filter(u => {
    const name = `${u.cognome ?? ''} ${u.nome ?? ''}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  function handleSelect(userId: string) {
    onClose()
    router.push(`/dashboard?as=${userId}`)
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Visualizza come utente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Cerca per nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {filtered.map(u => (
              <button
                key={u.id}
                onClick={() => handleSelect(u.id)}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left text-sm w-full"
              >
                <span className="font-medium">{u.cognome} {u.nome}</span>
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                  u.is_secondary ? 'badge-noni' : 'badge-dco'
                )}>
                  {u.is_secondary ? 'Noni' : 'DCO'}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nessun utente trovato</p>
            )}
          </div>
          <Button variant="outline" className="w-full" onClick={onClose}>Annulla</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
