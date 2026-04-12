'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CreateUserDialog } from './create-user-dialog'
import { EditUserDialog } from './edit-user-dialog'

interface Props {
  open: boolean
  onClose: () => void
}

export function UserManagementDialog({ open, onClose }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Gestione utenti</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Button className="w-full" variant="outline" onClick={() => setCreateOpen(true)}>
              Crea nuovo utente
            </Button>
            <Button className="w-full" variant="outline" onClick={() => setEditOpen(true)}>
              Modifica utente esistente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditUserDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  )
}
