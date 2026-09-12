import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserShiftOnDate, userCoversRequest } from '@/lib/shift-compat'
import type { ShiftType } from '@/types/database'

/**
 * Verifica di fattibilità lato CLIENT (richiesta 12/09/2026): prima di pubblicare
 * un cambio turno, dice all'utente se il SUO turno nel giorno offerto (reale dal
 * PDF, altrimenti teorico) copre uno dei turni cercati — se no, il cambio non può
 * essere preso da nessuno con la sua situazione e lo avvisiamo con un popup.
 * GET /api/shift-compat?date=2026-09-31&requested=P,M
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const date = url.searchParams.get('date') ?? ''
  const requested = (url.searchParams.get('requested') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter((s): s is ShiftType => ['Mattina', 'Pomeriggio', 'Notte'].includes(s))

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || requested.length === 0) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const mine = await getUserShiftOnDate(supabase, user.id, date)
  return NextResponse.json({
    myShift: mine.shift,
    source: mine.source,
    token: mine.token,
    compatible: userCoversRequest(mine.shift, requested),
  })
}
