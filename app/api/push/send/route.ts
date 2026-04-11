import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { ADMIN_ID } from '@/types/database'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { userId, title, body: msgBody, shiftId } = body as Record<string, unknown>
  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }
  if (typeof title !== 'string' || typeof msgBody !== 'string') {
    return NextResponse.json({ error: 'Missing title or body' }, { status: 400 })
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, subscription, endpoint')
    .eq('user_id', userId)

  if (!subs?.length) return NextResponse.json({ sent: 0 })

  const payload = JSON.stringify({ title, body: msgBody, shiftId: shiftId ?? null })
  const staleEndpoints: string[] = []
  let sent = 0

  await Promise.allSettled(
    subs.map(async ({ subscription, endpoint }) => {
      try {
        await webpush.sendNotification(subscription as webpush.PushSubscription, payload)
        sent++
      } catch (err: unknown) {
        // 410 Gone = subscription expired, prune it
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 410 || statusCode === 404) {
          staleEndpoints.push(endpoint as string)
        }
      }
    })
  )

  // Remove stale subscriptions
  if (staleEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints)
      .eq('user_id', userId)
  }

  return NextResponse.json({ sent })
}
