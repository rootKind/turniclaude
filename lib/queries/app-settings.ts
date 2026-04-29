import type { SupabaseClient } from '@supabase/supabase-js'
import type { ColorOverrides } from '@/lib/color-overrides'

export interface AppSettings {
  min_year_turniferie: number
  min_year_vacanze: number
  color_overrides: ColorOverrides
  shift_swap_limit_enabled: boolean
  max_shift_swap_days: number
  hide_shifts_beyond_limit: boolean
}

const DEFAULTS: AppSettings = {
  min_year_turniferie: 2026,
  min_year_vacanze: 2026,
  color_overrides: {},
  shift_swap_limit_enabled: false,
  max_shift_swap_days: 90,
  hide_shifts_beyond_limit: false,
}

export async function getAppSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase
    .from('app_settings')
    .select('min_year_turniferie, min_year_vacanze, color_overrides, shift_swap_limit_enabled, max_shift_swap_days, hide_shifts_beyond_limit')
    .single()
  return data ?? DEFAULTS
}

export async function updateAppSettings(supabase: SupabaseClient, patch: Partial<AppSettings>) {
  await supabase.from('app_settings').update(patch).eq('id', true)
}
