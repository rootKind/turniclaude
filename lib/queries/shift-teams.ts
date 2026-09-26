import type { SupabaseClient } from '@supabase/supabase-js'
import type { ShiftAdjustment, ShiftCycleTemplate, ShiftMemberPattern, ShiftTeamTree } from '@/types/database'

/** Catalogo dei cicli pronti per assegnare pattern ai membri senza riscriverli. */
export async function fetchShiftCycleTemplates(supabase: SupabaseClient): Promise<ShiftCycleTemplate[]> {
  const { data, error } = await supabase
    .from('shift_cycle_templates')
    .select('id, shift_type_id, team_id, name, description, pattern, cycle_days, pattern_start, is_builtin')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as ShiftCycleTemplate[]
}export async function fetchShiftTeamTree(supabase: SupabaseClient): Promise<ShiftTeamTree> {
  const [typesRes, teamsRes, membersRes, adjustmentsRes, patternsRes] = await Promise.all([
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
      .select('id, team_id, full_name, user_id, pattern, sort_order, is_active, is_lead')
      .order('sort_order', { ascending: true }),
    supabase
      .from('shift_adjustments')
      .select('id, effective_date, delta_days, scope, team_id, note, created_by, created_at')
      .order('effective_date', { ascending: true }),
    // Storico dei cicli (migration 037): senza, un cambio di asset di una data
    // riporterebbe indietro anche i mesi in cui valeva il ciclo precedente.
    supabase
      .from('shift_member_patterns')
      .select('id, member_id, from_date, pattern, note')
      .order('from_date', { ascending: true }),
  ])

  for (const r of [typesRes, teamsRes, membersRes, adjustmentsRes, patternsRes]) {
    if (r.error) throw r.error
  }

  const cicliPerMembro = new Map<string, ShiftMemberPattern[]>()
  for (const p of (patternsRes.data ?? []) as ShiftMemberPattern[]) {
    if (!p?.member_id) continue
    const lista = cicliPerMembro.get(p.member_id) ?? []
    lista.push({ ...p, from_date: String(p.from_date).slice(0, 10), pattern: (p.pattern ?? []).map(String) })
    cicliPerMembro.set(p.member_id, lista)
  }

  const types = (typesRes.data ?? []).map(t => ({
    ...t,
    teams: (teamsRes.data ?? []).filter(team => team.shift_type_id === t.id)
      .map(team => ({
        ...team,
        members: (membersRes.data ?? []).filter(member => member.team_id === team.id)
          .map(member => ({
            ...member,
            user_id: member.user_id as string | null,
            pattern: (member.pattern ?? []).map(String),
            patterns: cicliPerMembro.get(member.id) ?? [],
          })),
      })),
  }))

  return {
    types,
    adjustments: (adjustmentsRes.data ?? []) as ShiftAdjustment[],
  }
}