'use client'
import { NotificationList } from '@/components/notifications/notification-list'
import { Testata } from '@/components/nav/testata'

export default function NotifichePage() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      {/* M8b: la testata di pagina — titolo grande su iOS/Android, `h1` di sempre
          sul desktop (le classi qui sotto sono quelle del desktop). */}
      <Testata titolo="Notifiche" className="text-lg font-bold mb-4" />
      <NotificationList />
    </main>
  )
}
