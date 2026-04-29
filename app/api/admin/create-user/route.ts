import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { ADMIN_ID } from '@/types/database'

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, password, nome, cognome, is_secondary, is_manager } = body as Record<string, unknown>
  if (typeof email !== 'string' || typeof password !== 'string' || typeof nome !== 'string' || typeof cognome !== 'string') {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  const managerFlag = is_manager === true
  const { error: profileError } = await adminSupabase.from('users').insert({
    id: authData.user.id,
    nome,
    cognome,
    is_secondary: managerFlag ? false : is_secondary === true,
    is_manager: managerFlag,
  })
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  return NextResponse.json({ ok: true, userId: authData.user.id })
}
