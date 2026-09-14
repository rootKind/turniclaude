import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotifOverrides } from '@/lib/notification-templates'

export interface AppSettings {
  min_year_turniferie: number
  min_year_vacanze: number
  shift_swap_limit_enabled: boolean
  max_shift_swap_days: number
  hide_shifts_beyond_limit: boolean
  /** Override dei testi push (chiave template → {title, body}); null = default. */
  notif_template_overrides: NotifOverrides | null
}

const DEFAULTS: AppSettings = {
  min_year_turniferie: 2026,
  min_year_vacanze: 2026,
  shift_swap_limit_enabled: false,
  max_shift_swap_days: 90,
  hide_shifts_beyond_limit: false,
  notif_template_overrides: null,
}

export async function getAppSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase
    .from('app_settings')
    .select('min_year_turniferie, min_year_vacanze, shift_swap_limit_enabled, max_shift_swap_days, hide_shifts_beyond_limit, notif_template_overrides')
    .single()
  return data ?? DEFAULTS
}

/** Solo gli override dei testi push (serve ai route server-side). */
export async function fetchNotifOverrides(
  supabase: SupabaseClient,
): Promise<NotifOverrides> {
  const { data } = await supabase
    .from('app_settings')
    .select('notif_template_overrides')
    .single()
  return (data?.notif_template_overrides as NotifOverrides | null) ?? {}
}

export async function updateAppSettings(supabase: SupabaseClient, patch: Partial<AppSettings>) {
  await supabase.from('app_settings').update(patch).eq('id', true)
}
