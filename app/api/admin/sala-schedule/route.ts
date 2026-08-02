import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'
import { deleteScheduleMonth } from '@/lib/queries/sala-schedule'

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Admin OR manager — mirrors the auth check in parse-pdf and migration 009 RLS
  if (!isAdmin(user.id)) {
    const { data: profile } = await supabase.from('users').select('is_manager').eq('id', user.id).single()
    if (!profile?.is_manager) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  const month = req.nextUrl.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
  }

  await deleteScheduleMonth(supabase, month)
  return NextResponse.json({ ok: true })
}
