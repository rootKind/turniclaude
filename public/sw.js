// public/sw.js
// Handles Web Push notifications and saves them to open tabs via postMessage.
// Falls back to IndexedDB when no clients are available (iOS background).

const DB_NAME = 'turni-notifications'
const STORE_NAME = 'pending'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function saveToIDB(entry) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(entry)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  }))
}

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

      // Always persist to IndexedDB — drainIDB() on mount is the guaranteed recovery path
      // (handles the race where the tab exists but the message listener isn't registered yet)
      await saveToIDB(entry).catch(() => {})
      // Also broadcast to any open tabs for immediate in-app update (they dedup by id)
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
