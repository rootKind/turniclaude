import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalaMonthData, SalaSchedule } from '@/types/database'
import { buildScheduleFromMonthData, isSalaMonthData } from '@/lib/sala-month'

export interface UploadHistoryEntry {
  id: string
  month: string
  filename: string
  uploaded_at: string
}

export async function getSalaSchedule(
  supabase: SupabaseClient,
  month: string,
): Promise<SalaSchedule | null> {
  const { data, error } = await supabase
    .from('sala_schedule')
    .select('month, schedule, colored_persons, uploaded_at')
    .eq('month', month)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const raw = data.schedule as Record<number, never> | SalaMonthData
  // Formato compatto v2: la vista per giorno si ricostruisce al volo.
  if (isSalaMonthData(raw)) {
    return {
      month: data.month,
      schedule: buildScheduleFromMonthData(raw),
      data: raw,
      uploaded_at: data.uploaded_at,
      ...(data.colored_persons ? { coloredPersons: data.colored_persons } : {}),
    }
  }

  return {
    month: data.month,
    schedule: raw as unknown as SalaSchedule['schedule'],
    uploaded_at: data.uploaded_at,
    ...(data.colored_persons ? { coloredPersons: data.colored_persons } : {}),
  }
}

export async function listScheduleMonths(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('sala_schedule')
    .select('month')
    .order('month', { ascending: false })

  if (error) throw error
  return (data ?? []).map(r => r.month)
}

export async function upsertSalaSchedule(
  supabase: SupabaseClient,
  payload: SalaSchedule,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('sala_schedule')
    .upsert({
      month: payload.month,
      // Si salva la forma compatta quando c'è (parser v2): conserva TUTTI i
      // codici, assenze e celle gialle incluse, in ~1/6 dello spazio.
      schedule: payload.data ?? payload.schedule,
      uploaded_at: new Date().toISOString(),
      uploaded_by: userId,
    })

  if (error) throw error
}

export async function updatePersonColor(
  supabase: SupabaseClient,
  month: string,
  day: number,
  name: string,
  color: string | null,
): Promise<void> {
  // Atomic RPC (migration 013) — the old read-modify-write here could lose
  // concurrent updates to the same month's colors.
  const { error } = await supabase.rpc('set_person_color', {
    p_month: month,
    p_day: day,
    p_name: name,
    p_color: color,
  })

  if (error) throw error
}

export async function saveUploadHistory(
  supabase: SupabaseClient,
  month: string,
  filename: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('sala_upload_history')
    .insert({ month, filename, uploaded_by: userId })

  if (error) throw error
}

export async function getUploadHistory(supabase: SupabaseClient): Promise<UploadHistoryEntry[]> {
  const { data, error } = await supabase
    .from('sala_upload_history')
    .select('id, month, filename, uploaded_at')
    .order('uploaded_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as UploadHistoryEntry[]
}

export async function deleteScheduleMonth(supabase: SupabaseClient, month: string): Promise<void> {
  const { error } = await supabase
    .from('sala_schedule')
    .delete()
    .eq('month', month)

  if (error) throw error
}
