import type { SupabaseClient } from '@supabase/supabase-js'

export interface AppSettings {
  min_year_turniferie: number
  min_year_vacanze: number
}

const DEFAULTS: AppSettings = { min_year_turniferie: 2026, min_year_vacanze: 2026 }

export async function getAppSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase
    .from('app_settings')
    .select('min_year_turniferie, min_year_vacanze')
    .single()
  return data ?? DEFAULTS
}

export async function updateAppSettings(supabase: SupabaseClient, patch: Partial<AppSettings>) {
  await supabase.from('app_settings').update(patch).eq('id', true)
}
