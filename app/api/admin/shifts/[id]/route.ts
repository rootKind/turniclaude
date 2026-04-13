import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ADMIN_ID } from '@/types/database'

async function getAdminOrFail() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) return null
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminOrFail()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId) || numId <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { requested_shifts } = await req.json()
  if (!requested_shifts) return NextResponse.json({ error: 'Missing requested_shifts' }, { status: 400 })

  const { error } = await admin.from('shifts').update({ requested_shifts }).eq('id', numId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminOrFail()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId) || numId <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { error } = await admin.from('shifts').delete().eq('id', numId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
