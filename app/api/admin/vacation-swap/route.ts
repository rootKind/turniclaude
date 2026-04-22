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

  let body: { user_id?: unknown; new_base_period?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { user_id, new_base_period } = body
  if (!user_id || typeof user_id !== 'string') {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }
  if (![1,2,3,4,5,6].includes(new_base_period as number)) {
    return NextResponse.json({ error: 'Invalid new_base_period' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { error } = await admin
    .from('vacation_assignments')
    .update({ base_period: new_base_period as VacationPeriod })
    .eq('user_id', user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
