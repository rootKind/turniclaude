import { NotificationList } from '@/components/notifications/notification-list'
export default function NotifichePage() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <h1 className="text-lg font-bold mb-4">Notifiche</h1>
      <NotificationList />
    </main>
  )
}
