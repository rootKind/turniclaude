import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalaSchedule } from '@/types/database'

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

  return {
    month: data.month,
    schedule: data.schedule,
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
      schedule: payload.schedule,
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
  const { data } = await supabase
    .from('sala_schedule')
    .select('colored_persons')
    .eq('month', month)
    .maybeSingle()

  const existing: Record<number, Record<string, string>> = data?.colored_persons ?? {}
  const dayColors = { ...(existing[day] ?? {}) }

  if (color === null) {
    delete dayColors[name]
  } else {
    dayColors[name] = color
  }

  const updated = { ...existing }
  if (Object.keys(dayColors).length === 0) {
    delete updated[day]
  } else {
    updated[day] = dayColors
  }

  const { error } = await supabase
    .from('sala_schedule')
    .update({ colored_persons: updated })
    .eq('month', month)

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
