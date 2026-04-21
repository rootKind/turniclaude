import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  UserProfile,
  VacationAssignment,
  VacationRequest,
  VacationRequestWithInterests,
  VacationRequestInterest,
  VacationPeriod,
} from '@/types/database'
import { getVacationPeriodForYear } from '@/lib/vacations'

export interface VacationAssignmentWithUser extends VacationAssignment {
  user: Pick<UserProfile, 'id' | 'nome' | 'cognome' | 'is_secondary'>
}

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

export async function getAllVacationAssignmentsWithUsers(
  supabase: SupabaseClient,
): Promise<VacationAssignmentWithUser[]> {
  const { data, error } = await supabase
    .from('vacation_assignments')
    .select('*, user:users!vacation_assignments_user_id_fkey(id, nome, cognome, is_secondary)')
    .order('created_at')

  if (error) throw error
  return (data ?? []) as VacationAssignmentWithUser[]
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

/**
 * Fetch tutte le richieste ferie di una categoria (DCO o Noni)
 * per l'anno corrente, con utente richiedente e lista interessati
 * (incluso il loro vacation_assignment per calcolare il periodo dell'anno).
 */
export async function getVacationRequestsWithInterests(
  supabase: SupabaseClient,
  isSecondary: boolean,
  year: number = new Date().getFullYear(),
): Promise<VacationRequestWithInterests[]> {
  const { data, error } = await supabase
    .from('vacation_requests')
    .select(`
      *,
      user:users!vacation_requests_user_id_fkey(id, nome, cognome, is_secondary),
      vacation_request_interests(
        request_id,
        user_id,
        created_at,
        user:users!vacation_request_interests_user_id_fkey(
          id, nome, cognome, is_secondary,
          vacation_assignments(base_period)
        )
      )
    `)
    .eq('year', year)
    .order('created_at', { ascending: true })

  if (error) throw error

  // Filtra per categoria del richiedente e calcola period_this_year per ogni interessato
  return ((data ?? []) as any[])
    .filter((r: any) => r.user?.is_secondary === isSecondary)
    .map((r: any): VacationRequestWithInterests => ({
      id:             r.id,
      user_id:        r.user_id,
      offered_period: r.offered_period,
      target_periods: r.target_periods,
      year:           r.year,
      created_at:     r.created_at,
      user:           r.user,
      vacation_request_interests: (r.vacation_request_interests ?? []).map((i: any): VacationRequestInterest => ({
        request_id:      i.request_id,
        user_id:         i.user_id,
        created_at:      i.created_at,
        user:            i.user,
        period_this_year: i.user?.vacation_assignments?.[0]?.base_period != null
          ? getVacationPeriodForYear(i.user.vacation_assignments[0].base_period as VacationPeriod, year)
          : (1 as VacationPeriod),
      })),
    }))
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

export async function toggleVacationInterest(
  supabase: SupabaseClient,
  requestId: number,
  userId: string,
  isInterested: boolean,
): Promise<void> {
  if (isInterested) {
    const { error } = await supabase
      .from('vacation_request_interests')
      .delete()
      .eq('request_id', requestId)
      .eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('vacation_request_interests')
      .insert({ request_id: requestId, user_id: userId })
    if (error) throw error
  }
}
