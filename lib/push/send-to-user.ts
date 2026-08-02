import webpush from 'web-push'
import { createAdminSupabase } from '@/lib/supabase/admin'

function initWebpush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
}

/**
 * Invia una notifica push a tutte le subscription dell'utente (service role:
 * RLS su push_subscriptions è own-row-only, quindi serve il service role).
 * Pulisce gli endpoint stale (410/404). Ritorna il numero di notifiche inviate.
 */
export async function pushToUser(userId: string, payload: object): Promise<number> {
  initWebpush()
  const adminSupabase = createAdminSupabase()

  const { data: subs } = await adminSupabase
    .from('push_subscriptions')
    .select('subscription, endpoint')
    .eq('user_id', userId)

  if (!subs?.length) return 0

  const stale: string[] = []
  let sent = 0
  await Promise.allSettled(
    subs.map(async ({ subscription, endpoint }) => {
      try {
        await webpush.sendNotification(subscription as webpush.PushSubscription, JSON.stringify(payload))
        sent++
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode
        if (code === 410 || code === 404) stale.push(endpoint as string)
      }
    })
  )

  if (stale.length) {
    await adminSupabase.from('push_subscriptions').delete().in('endpoint', stale).eq('user_id', userId)
  }

  return sent
}
