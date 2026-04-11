import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { subscription, endpoint, browser, platform } = body

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    subscription,
    endpoint,
    browser: browser ?? null,
    platform: platform ?? 'web',
    last_update: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
