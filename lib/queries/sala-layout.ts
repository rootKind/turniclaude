import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalaLayout } from '@/types/database'

export async function getSalaLayout(supabase: SupabaseClient): Promise<SalaLayout> {
  const { data, error } = await supabase
    .from('sala_layout')
    .select('layout')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error

  const raw = data?.layout as any
  if (!raw) return { cards: [] }
  // old format: array of cards
  if (Array.isArray(raw)) return { cards: raw as SalaLayout['cards'] }
  return raw as SalaLayout
}

export async function upsertSalaLayout(
  supabase: SupabaseClient,
  layout: SalaLayout,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('sala_layout')
    .upsert({ id: 1, layout, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', 1)

  if (error) throw error
}
