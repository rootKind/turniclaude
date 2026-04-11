import { createClient } from '@/lib/supabase/client'
import type { Shift } from '@/types/database'

const SHIFTS_SELECT = `
  id,
  user_id,
  offered_shift,
  shift_date,
  requested_shifts,
  highlight,
  created_at,
  user!shifts_user_id_fkey(id, nome, cognome, is_secondary),
  shift_interested_users(
    shift_id,
    user_id,
    created_at,
    user!shift_interested_users_user_id_fkey(id, nome, cognome, is_secondary)
  )
`

export async function fetchShifts(isSecondary: boolean): Promise<Shift[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFTS_SELECT)
    .order('shift_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  // Filter by category: only show shifts from same category
  return (data as unknown as Shift[]).filter(s => s.user.is_secondary === isSecondary)
}

export async function createShift(payload: {
  offered_shift: string
  shift_date: string
  requested_shifts: string[]
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase.from('shifts').insert({ ...payload, user_id: user.id })
  if (error) throw error
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

export async function toggleHighlight(shiftId: number, current: boolean) {
  const supabase = createClient()
  const { error } = await supabase
    .from('shifts')
    .update({ highlight: !current })
    .eq('id', shiftId)
  if (error) throw error
}
