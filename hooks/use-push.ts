'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

/**
 * DA DOVE arriva l'attivazione (richiesta 25/09/2026): la schermata invasiva
 * del promemoria ('prompt') o la pagina impostazioni ('settings'). Finisce in
 * app_events come event_type 'push_enabled' e si legge nelle statistiche admin.
 */
export type PushSource = 'prompt' | 'settings'

/** Evento di attivazione: best effort, non deve mai bloccare il flusso. */
async function tracciaAttivazione(source: PushSource) {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'push_enabled', metadata: { source } }),
    })
  } catch { /* statistica persa: pazienza, non è critica */ }
}

export function usePush() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)

  const checkSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    setIsSubscribed(!!sub)
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    if (typeof Notification === 'undefined') return

    setPermission(Notification.permission)
    checkSubscription()

    // Risincronizza quando l'utente torna nell'app dopo aver cambiato le impostazioni OS
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        setPermission(Notification.permission)
        checkSubscription()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Listen for permission changes dynamically
    let cancelled = false
    let status: PermissionStatus | null = null
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' }).then(s => {
        if (cancelled) return
        status = s
        s.onchange = () => {
          setPermission(s.state as NotificationPermission)
          if (s.state === 'granted') checkSubscription()
        }
      }).catch(() => {})
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (status) status.onchange = null
    }
  }, [checkSubscription])

  /** true se la subscription è stata salvata (serve alla statistica). */
  async function subscribe(): Promise<boolean> {
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) throw new Error('VAPID key non configurata')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          endpoint: sub.endpoint,
          browser: navigator.userAgent,
          platform: 'web',
        }),
      })
      if (!res.ok) throw new Error(`Subscribe API failed: ${res.status}`)
      setIsSubscribed(true)
      toast.success('Notifiche attivate')
      return true
    } catch (err) {
      console.error('[push] subscribe error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Errore notifiche: ${msg}`)
      return false
    }
  }

  async function requestAndSubscribe(source: PushSource = 'settings') {
    if (typeof Notification === 'undefined') {
      toast.error('Le notifiche non sono supportate su questo dispositivo')
      return
    }
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') {
        const ok = await subscribe()
        await checkSubscription()
        // Statistica SOLO se la subscription è vera: permesso senza endpoint
        // non porterebbe nessuna notifica, contarla inganna.
        if (ok) void tracciaAttivazione(source)
      } else if (result === 'denied') {
        toast.error('Permesso negato — abilitalo nelle impostazioni del dispositivo')
      }
    } catch {
      toast.error('Impossibile richiedere il permesso notifiche')
    }
  }

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return
    await navigator.serviceWorker.register('/sw.js')
  }, [])

  return { permission, isSubscribed, requestAndSubscribe, registerServiceWorker }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
