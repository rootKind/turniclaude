// public/sw.js
// Handles Web Push notifications and saves them to open tabs via postMessage

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { payload = { title: 'Turni', body: event.data.text() } }

  const { title = 'Turni', body = '', shiftId, url = '/dashboard', type = 'system' } = payload

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window' })
      const entry = {
        id: crypto.randomUUID(),
        title,
        body,
        timestamp: Date.now(),
        shiftId: shiftId ?? null,
        read: false,
        type,
      }
      // Broadcast to open tabs so they can persist to localStorage
      clients.forEach(client => client.postMessage({ type: 'PUSH_RECEIVED', entry }))

      return self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        data: { url: shiftId ? `/dashboard?shift=${shiftId}` : url },
      })
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
