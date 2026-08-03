import type { SupabaseClient } from '@supabase/supabase-js'

export interface AppSettings {
  min_year_turniferie: number
  min_year_vacanze: number
  shift_swap_limit_enabled: boolean
  max_shift_swap_days: number
  hide_shifts_beyond_limit: boolean
}

const DEFAULTS: AppSettings = {
  min_year_turniferie: 2026,
  min_year_vacanze: 2026,
  shift_swap_limit_enabled: false,
  max_shift_swap_days: 90,
  hide_shifts_beyond_limit: false,
}

export async function getAppSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase
    .from('app_settings')
    .select('min_year_turniferie, min_year_vacanze, shift_swap_limit_enabled, max_shift_swap_days, hide_shifts_beyond_limit')
    .single()
  return data ?? DEFAULTS
}

export async function updateAppSettings(supabase: SupabaseClient, patch: Partial<AppSettings>) {
  await supabase.from('app_settings').update(patch).eq('id', true)
}
