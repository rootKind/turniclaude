import webpush from 'web-push'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function initWebpush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
}

export async function pushToUser(userId: string, payload: object): Promise<void> {
  initWebpush()
  const adminSupabase = getAdminSupabase()

  const { data: subs } = await adminSupabase
    .from('push_subscriptions')
    .select('subscription, endpoint')
    .eq('user_id', userId)

  if (!subs?.length) return

  const stale: string[] = []
  await Promise.allSettled(
    subs.map(async ({ subscription, endpoint }) => {
      try {
        await webpush.sendNotification(subscription as webpush.PushSubscription, JSON.stringify(payload))
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode
        if (code === 410 || code === 404) stale.push(endpoint as string)
      }
    })
  )

  if (stale.length) {
    await adminSupabase.from('push_subscriptions').delete().in('endpoint', stale).eq('user_id', userId)
  }
}
