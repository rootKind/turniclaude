'use client'
import { NotificationList } from '@/components/notifications/notification-list'
import { Testata } from '@/components/nav/testata'
import { TornaSu } from '@/components/ui/torna-su'

export default function NotifichePage() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      {/* M8b: la testata di pagina — titolo grande su iOS/Android, `h1` di sempre
          sul desktop (le classi qui sotto sono quelle del desktop). */}
      <Testata titolo="Notifiche" className="text-lg font-bold mb-4" />
      <NotificationList />
      {/* M12: sta nella PAGINA e non dentro l'elenco — l'altezza da percorrere è
          della pagina, e metterlo dentro avrebbe legato il comando al fatto che
          ci siano notifiche. */}
      <TornaSu />
    </main>
  )
}
