import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/bottom-nav'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { isAdmin } from '@/types/database'
import { PageTransitionWrapper } from '@/components/providers/page-transition'
import { ChangelogDialog } from '@/components/providers/changelog-dialog'
import { PushPermissionPrompt } from '@/components/providers/push-permission-prompt'
import { RealtimeInvalidation } from '@/components/providers/realtime-invalidation'

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

  // Il fondo lo detta il token `--nav-height`, non un `4rem` scritto a mano: la
  // barra iOS è alta 49pt e quella Android 80dp, quindi il contenuto deve chiedere
  // alla piattaforma quanto spazio lasciare. Sul desktop il token vale 64px, cioè
  // esattamente il 4rem di prima: lì non si sposta un pixel.
  return (
    <div className="min-h-screen safe-area-pt pb-[calc(var(--nav-height)_+_var(--safe-bottom))]">
      {/* Un solo canale realtime per l'app: invalida le query anagrafiche
          (utenti, albero squadre, mesi tuoturno) sui cambi delle tabelle. */}
      <RealtimeInvalidation />
      <PageTransitionWrapper>{children}</PageTransitionWrapper>
      <NotificationBell />
      <ChangelogDialog />
      {/* Promemoria permessi notifica (richiesta 16/09/2026): fuori dal server
          component (ha bisogno di Notification API) ma nel layout, così vale per
          tutte le pagine autenticate. */}
      <PushPermissionPrompt />
      <BottomNav feedbackUnread={feedbackUnread} isAdmin={admin} isManager={manager} />
    </div>
  )
}
