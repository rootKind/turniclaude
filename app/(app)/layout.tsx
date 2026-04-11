import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Count unread feedback for admin badge (only fetched server-side for admin)
  let feedbackUnread = 0
  if (user.id === 'fdd6c008-7a22-42d5-a75b-c44d9edfef12') {
    const { count } = await supabase
      .from('feedback')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
    feedbackUnread = count ?? 0
  }

  return (
    <div className="min-h-screen pb-16">
      {children}
      <BottomNav feedbackUnread={feedbackUnread} />
    </div>
  )
}
