import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserShiftOnDate, ownShiftMatchesOffer } from '@/lib/shift-compat'
import type { ShiftType } from '@/types/database'

const SHIFT_TYPES: ShiftType[] = ['Mattina', 'Pomeriggio', 'Notte']

/**
 * Verifica di fattibilità lato CLIENT prima di pubblicare un cambio turno: dice
 * all'utente se il turno che sta OFFRENDO è quello che quel giorno ha davvero
 * (reale dal PDF, altrimenti teorico) — non si cede un turno che non si ha. Se
 * no, il dialog mostra un popup di conferma. Fuori dalla verifica restano i casi
 * in cui il dato non c'è o non è attribuibile (`certain`: omonimi che l'albero
 * non lega): l'ignoranza non è una colpa (vedi `ownShiftMatchesOffer`).
 *
 * GET /api/shift-compat?date=2026-09-25&offered=Notte
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const date = url.searchParams.get('date') ?? ''
  const offered = url.searchParams.get('offered') ?? ''

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !SHIFT_TYPES.includes(offered as ShiftType)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const mine = await getUserShiftOnDate(supabase, user.id, date)
  return NextResponse.json({
    myShift: mine.shift,
    source: mine.source,
    token: mine.token,
    /** Il turno trovato è attribuibile senza dubbi a chi chiede? */
    certain: mine.certain,
    /** Posso offrire `offered` quel giorno? (l'unica cosa che il dialog guarda) */
    ok: ownShiftMatchesOffer(mine, offered as ShiftType),
  })
}
