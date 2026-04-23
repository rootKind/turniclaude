import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ADMIN_ID } from '@/types/database'
import { buildStyleString, type ColorOverrides } from '@/lib/color-overrides'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { overrides: ColorOverrides }
  const { overrides } = body

  const { error } = await supabase.from('app_settings').update({ color_overrides: overrides }).eq('id', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cookieStore = await cookies()
  cookieStore.set('co', buildStyleString(overrides), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false,
  })

  return NextResponse.json({ ok: true })
}
