import type { SupabaseClient } from '@supabase/supabase-js'
import type { ShiftAdjustment, ShiftTeamTree } from '@/types/database'

export async function fetchShiftTeamTree(supabase: SupabaseClient): Promise<ShiftTeamTree> {
  const [typesRes, teamsRes, membersRes, adjustmentsRes] = await Promise.all([
    supabase
      .from('shift_types')
      .select('id, name, cycle_days, pattern_start, is_active, sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('shift_teams')
      .select('id, shift_type_id, name, phase_offset_days, sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('shift_team_members')
      .select('id, team_id, full_name, user_id, pattern, sort_order, is_active')
      .order('sort_order', { ascending: true }),
    supabase
      .from('shift_adjustments')
      .select('id, effective_date, delta_days, scope, team_id, note, created_by, created_at')
      .order('effective_date', { ascending: true }),
  ])

  for (const r of [typesRes, teamsRes, membersRes, adjustmentsRes]) {
    if (r.error) throw r.error
  }

  const types = (typesRes.data ?? []).map(t => ({
    ...t,
    teams: (teamsRes.data ?? [])
      .filter(team => team.shift_type_id === t.id)
      .map(team => ({
        ...team,
        members: (membersRes.data ?? [])
          .filter(member => member.team_id === team.id)
          .map(member => ({ ...member, user_id: member.user_id as string | null })),
      })),
  }))

  return {
    types,
    adjustments: (adjustmentsRes.data ?? []) as ShiftAdjustment[],
  }
}