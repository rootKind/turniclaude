import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'
import { parsePdfSchedule } from '@/lib/pdf-parser'
import { upsertSalaSchedule, saveUploadHistory } from '@/lib/queries/sala-schedule'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (!isAdmin(user.id)) {
    const { data: profile } = await supabase.from('users').select('is_manager').eq('id', user.id).single()
    if (!profile?.is_manager) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  const formData = await req.formData()
  const file = formData.get('pdf') as File | null
  const month = formData.get('month') as string | null

  if (!file || !month) {
    return NextResponse.json({ error: 'Missing pdf or month' }, { status: 400 })
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const result = await parsePdfSchedule(buffer, month)
  await upsertSalaSchedule(supabase, result, user.id)
  await saveUploadHistory(supabase, month, file.name, user.id)

  const coloredCount = result.coloredPersons
    ? Object.values(result.coloredPersons).reduce((acc, d) => acc + Object.keys(d).length, 0)
    : 0
  return NextResponse.json({ ok: true, month, persons: Object.keys(result.schedule).length, coloredPersons: result.coloredPersons ?? null, coloredCount })
}
