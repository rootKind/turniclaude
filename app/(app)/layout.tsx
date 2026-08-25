import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { isAdmin } from '@/types/database'
import { PageTransitionWrapper } from '@/components/providers/page-transition'
import { ChangelogDialog } from '@/components/providers/changelog-dialog'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = isAdmin(user.id)

  const { data: profile } = await supabase
    .from('users')
    .select('is_manager')
    .eq('id', user.id)
    .single()
  const manager = profile?.is_manager ?? false

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
    <div className="min-h-screen safe-area-pt pb-[calc(4rem_+_env(safe-area-inset-bottom,0px))]">
      <PageTransitionWrapper>{children}</PageTransitionWrapper>
      <NotificationBell />
      <ChangelogDialog />
      <BottomNav feedbackUnread={feedbackUnread} isAdmin={admin} isManager={manager} />
    </div>
  )
}
