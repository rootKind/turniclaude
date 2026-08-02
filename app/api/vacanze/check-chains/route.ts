import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { pushToUser } from '@/lib/push/send-to-user'
import {
  findVacationChains,
  VACATION_REQUESTS_WITH_INTERESTS_SELECT,
  mapVacationRequestsWithInterests,
} from '@/lib/queries/vacations'
import type { VacationPeriod, VacationRequestWithInterests } from '@/types/database'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { newRequestUserId, isSecondary, year } = body as {
    newRequestUserId: string
    isSecondary: boolean
    year: number
  }

  if (typeof year !== 'number' || !Number.isInteger(year)) {
    return NextResponse.json({ error: 'year is required' }, { status: 400 })
  }
  if (typeof newRequestUserId !== 'string' || !newRequestUserId) {
    return NextResponse.json({ error: 'newRequestUserId is required' }, { status: 400 })
  }

  // Service role per leggere tutte le richieste senza RLS
  const admin = createAdminSupabase()

  // Fetch tutte le richieste della categoria + anno con la stessa struttura di getVacationRequestsWithInterests
  const { data: raw } = await admin
    .from('vacation_requests')
    .select(VACATION_REQUESTS_WITH_INTERESTS_SELECT)
    .eq('year', year)
    .order('created_at', { ascending: true })

  // Honor admin overrides when computing each user's period this year
  const { data: overrideRows } = await admin
    .from('vacation_year_overrides')
    .select('user_id, period')
    .eq('year', year)
  const overrides = new Map<string, VacationPeriod>()
  for (const row of (overrideRows ?? []) as Array<{ user_id: string; period: VacationPeriod }>) {
    overrides.set(row.user_id, row.period)
  }

  const allRequests: VacationRequestWithInterests[] = mapVacationRequestsWithInterests(
    raw as unknown[],
    isSecondary,
    year,
    overrides,
  )

  // Per ogni utente con richiesta esistente (escluso chi ha appena inserito),
  // controlla se la nuova richiesta completa una catena
  const toNotify = new Set<string>()

  for (const existingReq of allRequests) {
    if (existingReq.user_id === newRequestUserId) continue

    const chains = findVacationChains(
      allRequests,
      existingReq.offered_period,
      existingReq.target_periods as VacationPeriod[],
      existingReq.user_id,
    )

    const hasChainWithNewRequest = chains.some(chain =>
      chain.some(node => node.user_id === newRequestUserId)
    )

    if (hasChainWithNewRequest) toNotify.add(existingReq.user_id)
  }

  if (toNotify.size === 0) return NextResponse.json({ notified: 0 })

  const newReq = allRequests.find(r => r.user_id === newRequestUserId)
  const actorName = newReq ? [newReq.user.nome, newReq.user.cognome].filter(Boolean).join(' ') : 'Qualcuno'

  await Promise.allSettled([...toNotify].map(async (userId) => {
    const { data: owner } = await admin
      .from('users')
      .select('id, notify_on_new_vacation, notification_enabled')
      .eq('id', userId)
      .single()
    if (!owner || owner.notification_enabled === false || owner.notify_on_new_vacation === false) return

    const userReq = allRequests.find(r => r.user_id === userId)
    const chainRequestIds: number[] = userReq ? (() => {
      const chains = findVacationChains(
        allRequests,
        userReq.offered_period,
        userReq.target_periods as VacationPeriod[],
        userId,
      )
      const chainWithNew = chains.find(chain => chain.some(r => r.user_id === newRequestUserId))
      return chainWithNew
        ? [userReq.id, ...chainWithNew.map(r => r.id)]
        : [userReq.id]
    })() : []

    await pushToUser(userId, {
      title: 'Nuova catena ferie disponibile',
      body: `${actorName} ha inserito una richiesta che completa una catena con la tua (${year})`,
      type: 'new_vacation',
      requestIds: chainRequestIds,
    })
  }))

  return NextResponse.json({ notified: toNotify.size })
}
