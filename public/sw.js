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

// crypto.randomUUID is unavailable on older browsers — fallback generator
function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Minimal offline support: cache-first for static assets (icons/manifest), so the
// app shell renders when offline. Dynamic API calls still require network.
// v5: /manifest.json (file statico) → /manifest.webmanifest (route dinamica,
// nome PWA «Turni DEV» vs produzione) + icone *_dev.png.
const CACHE_NAME = 'turni-static-v5'
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['/icons/icon-192.png', '/icons/icon-512.png', '/icons/badge-96.png', '/icons/apple-icon.png', '/manifest.webmanifest'])
    ).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  // In DEV (localhost) il service worker NON intercetta nulla: i chunk CSS/JS
  // arrivano sempre freschi dal dev server (evita la cache-first che serviva
  // codice vecchio rendendo il debug ingannevole). In produzione (hostname !=
  // localhost) il comportamento cache-first resta invariato.
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') return
  // Never intercept the SW script itself (would block updates) nor API calls.
  if (url.pathname === '/sw.js') return
  // Only cache static assets — never pages/API (stale HTML/JSON is worse than offline)
  if (
    /^\/icons\//.test(url.pathname) ||
    url.pathname === '/manifest.webmanifest' ||
    /^\/_next\/static\//.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached
        return fetch(event.request).then(res => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {})
          }
          return res
        }).catch(() => caches.match(event.request))
      })
    )
  }
})

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

  const { title = 'Turni', body = '', shiftId, requestId, requestIds, url, type = 'system' } = payload

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window' })
      const entry = {
        id: uuid(),
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

      let navPath
      if (shiftId) {
        navPath = `/dashboard?shift=${shiftId}`
      } else if (Array.isArray(requestIds) && requestIds.length > 0) {
        navPath = `/vacanze?requests=${requestIds.join(',')}`
      } else if (requestId) {
        navPath = `/vacanze?request=${requestId}`
      } else {
        navPath = url ?? '/dashboard'
      }

      const navUrl = new URL(navPath, self.location.origin).href
      const iconUrl = self.location.origin + '/icons/icon-192.png'
      const badgeUrl = self.location.origin + '/icons/badge-96.png'

      return self.registration.showNotification(title, {
        body,
        icon: iconUrl,
        badge: badgeUrl,
        data: { url: navUrl },
      })
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? (self.location.origin + '/dashboard')
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
