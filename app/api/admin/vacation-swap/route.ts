import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ADMIN_ID } from '@/types/database'
import type { VacationPeriod } from '@/types/database'

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { user_id?: unknown; period?: unknown; year?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { user_id, period, year } = body
  if (!user_id || typeof user_id !== 'string') {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }
  if (![1,2,3,4,5,6].includes(period as number)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }
  if (typeof year !== 'number' || year < 2026) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error } = await admin
    .from('vacation_year_overrides')
    .upsert({ user_id, year, period: period as VacationPeriod }, { onConflict: 'user_id,year' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
