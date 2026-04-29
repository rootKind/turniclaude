import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  UserProfile,
  VacationAssignment,
  VacationRequest,
  VacationRequestWithInterests,
  VacationRequestInterest,
  VacationPeriod,
  VacationYearOverride,
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

export async function getVacationYearOverrides(
  supabase: SupabaseClient,
  year: number,
): Promise<Map<string, VacationPeriod>> {
  const { data, error } = await supabase
    .from('vacation_year_overrides')
    .select('user_id, period')
    .eq('year', year)

  if (error) throw error
  const map = new Map<string, VacationPeriod>()
  for (const row of (data ?? []) as Pick<VacationYearOverride, 'user_id' | 'period'>[]) {
    map.set(row.user_id, row.period as VacationPeriod)
  }
  return map
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
      is_pending:     r.is_pending ?? false,
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

export function findCompatibleVacationRequests(
  requests: VacationRequestWithInterests[],
  offeredPeriod: VacationPeriod,
  targetPeriods: VacationPeriod[],
  excludeUserId: string,
): VacationRequestWithInterests[] {
  return requests.filter(r =>
    r.user_id !== excludeUserId &&
    targetPeriods.includes(r.offered_period) &&
    (r.target_periods as VacationPeriod[]).includes(offeredPeriod)
  )
}

/**
 * BFS per catene circolari di N persone (N >= 3 totale, cioè >= 2 nodi intermedi).
 * Restituisce array di path: ogni path è la sequenza di richieste intermedie [B, C, ...]
 * che, insieme all'utente corrente, formano un ciclo chiuso.
 *
 * Semantica catena A→B→C→A:
 *   A dà myOffered a B (B la vuole), B dà B.offered a C (C la vuole), C dà C.offered ad A (A la vuole)
 */
export function findVacationChains(
  requests: VacationRequestWithInterests[],
  myOffered: VacationPeriod,
  myTargets: VacationPeriod[],
  myUserId: string,
  maxIntermediateNodes = 4,
): VacationRequestWithInterests[][] {
  const chains: VacationRequestWithInterests[][] = []

  type State = { path: VacationRequestWithInterests[]; lastOffered: VacationPeriod }
  const queue: State[] = []

  for (const r of requests) {
    if (r.user_id === myUserId) continue
    if (!(r.target_periods as VacationPeriod[]).includes(myOffered)) continue
    queue.push({ path: [r], lastOffered: r.offered_period })
  }

  while (queue.length > 0) {
    const { path, lastOffered } = queue.shift()!

    // Ciclo chiuso: l'ultimo nodo offre qualcosa che A vuole → catena valida
    // Richiede almeno 2 nodi intermedi (catena ≥ 3 persone totali)
    if (path.length >= 2 && myTargets.includes(lastOffered)) {
      chains.push(path)
      if (chains.length >= 20) break
      continue
    }

    if (path.length >= maxIntermediateNodes) continue

    const usedIds = new Set([myUserId, ...path.map(r => r.user_id)])
    for (const r of requests) {
      if (usedIds.has(r.user_id)) continue
      if (!(r.target_periods as VacationPeriod[]).includes(lastOffered)) continue
      queue.push({ path: [...path, r], lastOffered: r.offered_period })
    }
  }

  return chains
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
