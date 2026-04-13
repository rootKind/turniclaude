'use client'
import { useState, useEffect } from 'react'
import { Bell, Users, MessageSquare, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { NotificationDialog } from './notification-dialog'
import { FeedbackList } from './feedback-list'
import { UserManagementDialog } from './user-management-dialog'

export function AdminPanel() {
  const [notifOpen, setNotifOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackUnread, setFeedbackUnread] = useState(0)
  const [userCount, setUserCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('feedback')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
      .then(({ count }) => setFeedbackUnread(count ?? 0))
    // Use admin API to get user count — browser client RLS only returns own row
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(({ users }: { users: { id: string }[] }) => setUserCount(users?.length ?? 0))
      .catch(() => setUserCount(0))
  }, [])

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <h1 className="text-lg font-bold">Pannello Admin</h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Utenti registrati" value={userCount} />
        <StatCard label="Feedback non letti" value={feedbackUnread} highlight={feedbackUnread > 0} />
      </div>

      {/* Action tiles */}
      <div className="space-y-2">
        <ActionTile
          icon={<Bell size={18} />}
          title="Notifiche"
          description="Invia una notifica push a tutti gli utenti"
          onClick={() => setNotifOpen(true)}
        />
        <ActionTile
          icon={<Users size={18} />}
          title="Gestione utenti"
          description="Crea, modifica o elimina account"
          onClick={() => setUsersOpen(true)}
        />
        <ActionTile
          icon={<MessageSquare size={18} />}
          title="Feedback"
          description="Leggi le segnalazioni degli utenti"
          badge={feedbackUnread}
          onClick={() => { setFeedbackOpen(true); setFeedbackUnread(0) }}
        />
      </div>

      <NotificationDialog open={notifOpen} onClose={() => setNotifOpen(false)} />
      <UserManagementDialog open={usersOpen} onClose={() => setUsersOpen(false)} />
      <FeedbackList open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}

function StatCard({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 space-y-1',
      highlight ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40'
    )}>
      <p className={cn('text-2xl font-bold', highlight && 'text-destructive')}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function ActionTile({ icon, title, description, badge, onClick }: {
  icon: React.ReactNode
  title: string
  description: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border bg-card hover:bg-accent transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="flex-shrink-0 min-w-[20px] h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
    </button>
  )
}
