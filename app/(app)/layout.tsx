import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { isAdmin } from '@/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = isAdmin(user.id)

  // Count unread feedback for admin badge (only fetched server-side for admin)
  let feedbackUnread = 0
  if (admin) {
    const { count } = await supabase
      .from('feedback')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
    feedbackUnread = count ?? 0
  }

  return (
    <div className="min-h-screen pb-16">
      {children}
      <NotificationBell />
      <BottomNav feedbackUnread={feedbackUnread} isAdmin={admin} />
    </div>
  )
}
