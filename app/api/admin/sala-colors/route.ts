import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'
import { updatePersonColor } from '@/lib/queries/sala-schedule'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  if (!isAdmin(user.id)) {
    const { data: profile } = await supabase.from('users').select('is_manager').eq('id', user.id).single()
    if (!profile?.is_manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const { month, day, name, color } = body

  if (!month || typeof day !== 'number' || !name) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (color !== null && (typeof color !== 'string' || color.length > 20)) {
    return NextResponse.json({ error: 'Invalid color' }, { status: 400 })
  }

  await updatePersonColor(supabase, month, day, name, color)
  return NextResponse.json({ ok: true })
}
