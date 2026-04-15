import type { SupabaseClient } from '@supabase/supabase-js'
import type { VacationAssignment, VacationRequest, VacationPeriod } from '@/types/database'
import { getVacationPeriodForYear } from '@/lib/vacations'

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getMyVacationAssignment(
  supabase: SupabaseClient,
  userId: string,
  year: number = new Date().getFullYear(),
): Promise<(VacationAssignment & { period_this_year: VacationPeriod }) | null> {
  const { data, error } = await supabase
    .from('vacation_assignments')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    ...(data as VacationAssignment),
    period_this_year: getVacationPeriodForYear(data.base_period as VacationPeriod, year),
  }
}

export async function getAllVacationAssignments(
  supabase: SupabaseClient,
): Promise<VacationAssignment[]> {
  const { data, error } = await supabase
    .from('vacation_assignments')
    .select('*')
    .order('created_at')

  if (error) throw error
  return (data ?? []) as VacationAssignment[]
}

export async function getVacationRequests(
  supabase: SupabaseClient,
  userId: string,
  year: number,
): Promise<VacationRequest[]> {
  const { data, error } = await supabase
    .from('vacation_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('created_at')

  if (error) throw error
  return (data ?? []) as VacationRequest[]
}

// ── Write ────────────────────────────────────────────────────────────────────

export interface CreateVacationRequestInput {
  userId: string
  offeredPeriod: VacationPeriod
  targetPeriods: VacationPeriod[]
  year: number
}

export async function createVacationRequest(
  supabase: SupabaseClient,
  input: CreateVacationRequestInput,
): Promise<VacationRequest> {
  const { data, error } = await supabase
    .from('vacation_requests')
    .insert({
      user_id:        input.userId,
      offered_period: input.offeredPeriod,
      target_periods: input.targetPeriods,
      year:           input.year,
    })
    .select()
    .single()

  if (error) throw error
  return data as VacationRequest
}
