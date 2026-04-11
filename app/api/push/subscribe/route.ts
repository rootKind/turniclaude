import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { subscription, endpoint, browser, platform } = body as Record<string, unknown>

  if (typeof endpoint !== 'string' || !endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
  }
  if (!subscription || typeof subscription !== 'object') {
    return NextResponse.json({ error: 'Missing subscription' }, { status: 400 })
  }
  // Ensure endpoint in body matches subscription.endpoint
  const subEndpoint = (subscription as Record<string, unknown>).endpoint
  if (subEndpoint && subEndpoint !== endpoint) {
    return NextResponse.json({ error: 'Endpoint mismatch' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    subscription,
    endpoint,
    browser: typeof browser === 'string' ? browser : null,
    platform: typeof platform === 'string' ? platform : 'web',
    last_update: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
