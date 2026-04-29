import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { findVacationChains } from '@/lib/queries/vacations'
import { getVacationPeriodForYear } from '@/lib/vacations'
import type { VacationPeriod, VacationRequestWithInterests, VacationRequestInterest } from '@/types/database'

export async function POST(req: Request) {
  const supabase = await createServerClient()
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

  // Admin client per leggere tutte le richieste senza RLS
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch tutte le richieste della categoria + anno con la stessa struttura di getVacationRequestsWithInterests
  const { data: raw } = await admin
    .from('vacation_requests')
    .select(`
      *,
      user:users!vacation_requests_user_id_fkey(id, nome, cognome, is_secondary),
      vacation_request_interests(
        request_id, user_id, created_at,
        user:users!vacation_request_interests_user_id_fkey(
          id, nome, cognome, is_secondary,
          vacation_assignments(base_period)
        )
      )
    `)
    .eq('year', year)
    .order('created_at', { ascending: true })

  const allRequests: VacationRequestWithInterests[] = ((raw ?? []) as any[])
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

  // Invia push notifiche agli utenti coinvolti
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  const newReq = allRequests.find(r => r.user_id === newRequestUserId)
  const actorName = newReq ? [newReq.user.nome, newReq.user.cognome].filter(Boolean).join(' ') : 'Qualcuno'

  await Promise.allSettled([...toNotify].map(async (userId) => {
    const { data: owner } = await admin
      .from('users')
      .select('id, notify_on_new_vacation, notification_enabled')
      .eq('id', userId)
      .single()
    if (!owner || owner.notification_enabled === false || owner.notify_on_new_vacation === false) return

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('subscription, endpoint')
      .eq('user_id', userId)
    if (!subs?.length) return

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

    const payload = JSON.stringify({
      title: 'Nuova catena ferie disponibile',
      body: `${actorName} ha inserito una richiesta che completa una catena con la tua (${year})`,
      type: 'new_vacation',
      requestIds: chainRequestIds,
    })

    const stale: string[] = []
    await Promise.allSettled(
      subs.map(async ({ subscription, endpoint }) => {
        try {
          await webpush.sendNotification(subscription as webpush.PushSubscription, payload)
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode
          if (code === 410 || code === 404) stale.push(endpoint as string)
        }
      })
    )
    if (stale.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', stale).eq('user_id', userId)
    }
  }))

  return NextResponse.json({ notified: toNotify.size })
}
