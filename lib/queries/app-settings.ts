import type { SupabaseClient } from '@supabase/supabase-js'
import type { ColorOverrides } from '@/lib/color-overrides'

export interface AppSettings {
  min_year_turniferie: number
  min_year_vacanze: number
  color_overrides: ColorOverrides
}

const DEFAULTS: AppSettings = {
  min_year_turniferie: 2026,
  min_year_vacanze: 2026,
  color_overrides: {},
}

export async function getAppSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase
    .from('app_settings')
    .select('min_year_turniferie, min_year_vacanze, color_overrides')
    .single()
  return data ?? DEFAULTS
}

export async function updateAppSettings(supabase: SupabaseClient, patch: Partial<AppSettings>) {
  await supabase.from('app_settings').update(patch).eq('id', true)
}
