'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NotificationDialog } from './notification-dialog'
import { FeedbackList } from './feedback-list'
import { UserManagementDialog } from './user-management-dialog'

export function AdminPanel() {
  const [notifOpen, setNotifOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">Pannello Amministratore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={() => setNotifOpen(true)}>
            Invia notifica
          </Button>
          <Button className="w-full" variant="outline" onClick={() => setUsersOpen(true)}>
            Gestione utenti
          </Button>
          <FeedbackList />
        </CardContent>
      </Card>

      <NotificationDialog open={notifOpen} onClose={() => setNotifOpen(false)} />
      <UserManagementDialog open={usersOpen} onClose={() => setUsersOpen(false)} />
    </div>
  )
}
