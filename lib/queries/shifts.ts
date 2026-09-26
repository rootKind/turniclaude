import { createClient } from '@/lib/supabase/client'
import type { Shift, ShiftType } from '@/types/database'

const SHIFTS_SELECT = `
  id,
  user_id,
  offered_shift,
  shift_date,
  requested_shifts,
  highlight,
  is_pending,
  created_at,
  user:users!shifts_user_id_fkey(id, nome, cognome, is_secondary, is_dco_plus),
  shift_interested_users(
    shift_id,
    user_id,
    created_at,
    user:users!shift_interested_users_user_id_fkey(id, nome, cognome, is_secondary, is_dco_plus)
  )
`

interface ShiftViewer {
  isSecondary: boolean
  isDcoPlus: boolean
}

/**
 * Regole di visibilità dei cambi turno (funzionalità DCO+):
 * - DCO+ (isDcoPlus): vede TUTTO (DCO + Noni)
 * - Noni (isSecondary): vede Noni + richieste dei DCO+
 * - DCO normale: vede solo DCO (i DCO+ restano formalmente DCO)
 *
 * Il filtro preserva l'ordinamento server (shift_date, created_at).
 */
export function isShiftVisibleTo(shift: Shift, viewer: ShiftViewer): boolean {
  if (viewer.isDcoPlus) return true
  const shiftIsNoni = shift.user.is_secondary === true
  if (viewer.isSecondary) return shiftIsNoni || shift.user.is_dco_plus === true
  return !shiftIsNoni
}

export async function fetchShifts(viewer: ShiftViewer): Promise<Shift[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFTS_SELECT)
    .order('shift_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as unknown as Shift[]).filter(s => isShiftVisibleTo(s, viewer))
}

export async function createShift(payload: {
  offered_shift: string
  shift_date: string
  requested_shifts: string[]
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase.from('shifts').insert({ ...payload, user_id: user.id }).select('id').single()
  if (error) throw error
  return (data as { id: number }).id
}

export async function updateShiftRequested(shiftId: number, requestedShifts: string[]) {
  const supabase = createClient()
  const { error } = await supabase
    .from('shifts')
    .update({ requested_shifts: requestedShifts })
    .eq('id', shiftId)
  if (error) throw error
}

export async function deleteShift(shiftId: number) {
  const supabase = createClient()
  const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
  if (error) throw error
}

/**
 * Inverted semantics: pass the CURRENT state. `isInterested === true` means the
 * user is currently interested → delete the row (toggling off); `false` means
 * they are not interested yet → insert (toggling on). Do not "fix" without
 * updating every caller, which intentionally passes the current state.
 */
export async function toggleInterest(shiftId: number, userId: string, isInterested: boolean) {
  const supabase = createClient()
  if (isInterested) {
    const { error } = await supabase
      .from('shift_interested_users')
      .delete()
      .eq('shift_id', shiftId)
      .eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('shift_interested_users')
      .insert({ shift_id: shiftId, user_id: userId })
    if (error) throw error
  }
}

export function findCompatibleShifts(
  shifts: Shift[],
  date: string,
  offeredShift: ShiftType,
  requestedShifts: ShiftType[],
  excludeUserId: string
): Shift[] {
  return shifts.filter(s =>
    s.shift_date === date &&
    s.user_id !== excludeUserId &&
    s.requested_shifts.includes(offeredShift) &&
    requestedShifts.includes(s.offered_shift)
  )
}
