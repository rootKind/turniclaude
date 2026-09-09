import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'

export const runtime = 'nodejs'

async function requireAdminManager(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (isAdmin(user.id)) return null
  const { data: profile } = await supabase.from('users').select('is_manager').eq('id', user.id).single()
  if (profile?.is_manager) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}

/**
 * Comando "shift turni": sposta di ±1 giorno tutti i turni teorici a partire
 * dalla data di efficacia (utile per correzioni systemwide, es. anni bisestili).
 * L'operazione è cumulativa: ogni aggiustamento vale per tutte le date >=
 * effective_date. Annullare = eliminare l'aggiustamento (DELETE).
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdminManager()
  if (denied) return denied
  const supabase = await createClient()

  const body = (await req.json()) as {
    delta_days?: number
    effective_date?: string
    note?: string | null
  }

  const delta = body.delta_days
  const date = body.effective_date

  if (delta !== 1 && delta !== -1) {
    return NextResponse.json({ error: 'delta_days deve essere 1 o -1' }, { status: 400 })
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'effective_date richiesta (YYYY-MM-DD)' }, { status: 400 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('shift_adjustments').insert({
    effective_date: date,
    delta_days: delta,
    scope: 'global',
    note: body.note ?? null,
    created_by: user?.id ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdminManager()
  if (denied) return denied
  const supabase = await createClient()

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id richiesto' }, { status: 400 })

  const { error } = await supabase.from('shift_adjustments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}