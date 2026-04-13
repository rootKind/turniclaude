import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ADMIN_ID } from '@/types/database'

export type StatsUser = {
  id: string
  nome: string | null
  cognome: string | null
  is_secondary: boolean
  access: number
  new_shift: number
  interest: number
  total: number
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get all users
  const { data: users, error: usersError } = await adminSupabase
    .from('users')
    .select('id, nome, cognome, is_secondary')
    .order('cognome')
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })

  // Get all events (service role bypasses RLS).
  // Explicit high limit to avoid Supabase's default 1000-row truncation.
  // For this team size (tens of users) this is safe for years of data.
  const { data: events, error: eventsError } = await adminSupabase
    .from('app_events')
    .select('user_id, event_type')
    .limit(100000)
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 })

  // Aggregate counts per user
  const countMap = new Map<string, { access: number; new_shift: number; interest: number }>()
  for (const e of events ?? []) {
    if (!e.user_id) continue
    if (!countMap.has(e.user_id)) countMap.set(e.user_id, { access: 0, new_shift: 0, interest: 0 })
    const c = countMap.get(e.user_id)!
    if (e.event_type === 'access') c.access++
    else if (e.event_type === 'new_shift') c.new_shift++
    else if (e.event_type === 'interest') c.interest++
  }

  const stats: StatsUser[] = (users ?? []).map(u => {
    const c = countMap.get(u.id) ?? { access: 0, new_shift: 0, interest: 0 }
    return { ...u, ...c, total: c.access + c.new_shift + c.interest }
  })

  const totals = {
    access: stats.reduce((s, u) => s + u.access, 0),
    new_shift: stats.reduce((s, u) => s + u.new_shift, 0),
    interest: stats.reduce((s, u) => s + u.interest, 0),
  }

  return NextResponse.json({ stats, totals })
}
