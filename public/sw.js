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

// Cosa mette in cache, e cosa NON mette.
//
// Cache-first sugli ASSET STATICI (icone, manifest, chunk di /_next/static). Le
// PAGINE no, e non è una dimenticanza: un HTML stantio in un'app di turni è
// peggio di un errore di rete — mostra turni di ieri come se fossero di oggi. Il
// comportamento giusto in assenza di rete è che l'app lo DICA, ed è quello che fa
// `components/providers/offline-bar.tsx`, che chiede a questo file lo stato della
// cache con un messaggio (vedi in fondo). Per lo stesso motivo il testo del
// banner non promette «l'app funziona offline».
//
// v6 (M11, 23/09/2026): messaggio STATO_CACHE (l'avviso di rete mostra quante
// risorse ci sono), maskable 192 aggiunta al precache (è la taglia che Android
// sceglie a bassa densità) e bump per far rileggere il manifest, che ora porta
// `shortcuts`, `screenshots` e gli id/scope espliciti.
// v5: /manifest.json (file statico) → /manifest.webmanifest (route dinamica,
// nome PWA «Turni DEV» vs produzione) + icone *_dev.png.
const CACHE_NAME = 'turni-static-v6'
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-192.png', '/icons/badge-96.png', '/icons/apple-icon.png', '/manifest.webmanifest'])
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

/**
 * M11 — LO STATO DELLA CACHE, SU RICHIESTA (23/09/2026).
 *
 * La pagina non può leggere `caches` del service worker da sé: chiede e aspetta.
 * La risposta va a TUTTE le finestre aperte (il SW non sa chi ha chiesto, e
 * `clients.matchAll` è lo stesso giro che fa già per le notifiche): chi ascolta
 * filtra per tipo, ed è più semplice che aprire un canale per tab.
 *
 * Il conteggio è quello che l'utente vede nel banner offline («N risorse in cache
 * locale»): se un giorno la cache diventasse vuota — un cleanup, un browser che
 * svuota per spazio — il banner lo dice invece di mostrare un numero inventato.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'STATO_CACHE') return

  const rispondi = (payload) =>
    self.clients
      .matchAll({ includeUncontrolled: true, type: 'window' })
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'STATO_CACHE', ...payload })))
      .catch(() => {})

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.keys())
      .then((keys) => rispondi({ nome: CACHE_NAME, voci: keys.length }))
      .catch(() => rispondi({ nome: CACHE_NAME, voci: 0, errore: true }))
  )
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
