import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ADMIN_ID } from '@/types/database'

async function getAdminClient() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) return null
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST — add interest on behalf of user
export async function POST(req: Request) {
  const admin = await getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { shift_id?: unknown; user_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { shift_id, user_id } = body
  if (!shift_id || !user_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { error } = await admin.from('shift_interested_users').insert({ shift_id: Number(shift_id), user_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove interest on behalf of user
export async function DELETE(req: Request) {
  const admin = await getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { shift_id?: unknown; user_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { shift_id, user_id } = body
  if (!shift_id || !user_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { error } = await admin
    .from('shift_interested_users')
    .delete()
    .eq('shift_id', Number(shift_id))
    .eq('user_id', user_id as string)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
