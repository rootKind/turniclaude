import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalaSchedule } from '@/types/database'

export async function getSalaSchedule(
  supabase: SupabaseClient,
  month: string,
): Promise<SalaSchedule | null> {
  const { data, error } = await supabase
    .from('sala_schedule')
    .select('month, schedule, uploaded_at')
    .eq('month', month)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    month: data.month,
    schedule: data.schedule,
    uploaded_at: data.uploaded_at,
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
