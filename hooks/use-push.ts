'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export function usePush() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPermission(Notification.permission)
    checkSubscription()
  }, [])

  async function checkSubscription() {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    setIsSubscribed(!!sub)
  }

  async function subscribe() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
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
      if (!res.ok) throw new Error('Subscribe API failed')
      setIsSubscribed(true)
      toast.success('Notifiche attivate')
    } catch {
      toast.error('Errore attivazione notifiche')
    }
  }

  async function requestAndSubscribe() {
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') await subscribe()
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return
    await navigator.serviceWorker.register('/sw.js')
  }

  return { permission, isSubscribed, requestAndSubscribe, registerServiceWorker }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
