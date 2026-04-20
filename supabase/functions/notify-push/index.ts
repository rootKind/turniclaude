// SETUP REQUIRED (Supabase Dashboard):
// 1. Database → Webhooks → Create webhook on table "shift_interested_users" (INSERT event)
//    URL: {SUPABASE_URL}/functions/v1/notify-push
//    Headers: Authorization: Bearer {SUPABASE_ANON_KEY}
// 2. Database → Webhooks → Create webhook on table "shifts" (INSERT event)
//    URL: {SUPABASE_URL}/functions/v1/notify-push
//    Headers: Authorization: Bearer {SUPABASE_ANON_KEY}
// 3. Database → Webhooks → Create webhook on table "vacation_request_interests" (INSERT event)
//    URL: {SUPABASE_URL}/functions/v1/notify-push
//    Headers: Authorization: Bearer {SUPABASE_ANON_KEY}
// 4. Database → Webhooks → Create webhook on table "vacation_requests" (INSERT event)
//    URL: {SUPABASE_URL}/functions/v1/notify-push
//    Headers: Authorization: Bearer {SUPABASE_ANON_KEY}
// 5. Edge Functions → notify-push → Secrets:
//    NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: Record<string, unknown>
  old_record: Record<string, unknown> | null
}

interface PushSubscriptionRecord {
  id: string
  endpoint: string
  subscription: {
    endpoint: string
    keys: {
      p256dh: string
      auth: string
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth check — Supabase webhooks send: Authorization: Bearer {anon_key}
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!token || token !== anonKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 401,
    })
  }

  // Configure VAPID
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  const vapidPublicKey = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    console.error('Missing VAPID configuration')
    return new Response(JSON.stringify({ error: 'Missing VAPID configuration' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  // Supabase client with service role for server-side DB access
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let payload: WebhookPayload
  try {
    payload = await req.json() as WebhookPayload
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  if (payload.type !== 'INSERT') {
    // We only care about INSERT events
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  try {
    if (payload.table === 'shift_interested_users') {
      await handleInterestInsert(supabase, payload.record)
    } else if (payload.table === 'shifts') {
      await handleShiftInsert(supabase, payload.record)
    } else if (payload.table === 'vacation_request_interests') {
      await handleVacationInterestInsert(supabase, payload.record)
    } else if (payload.table === 'vacation_requests') {
      await handleVacationRequestInsert(supabase, payload.record)
    } else {
      return new Response(JSON.stringify({ skipped: true, reason: 'unknown table' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }
  } catch (err) {
    console.error('Error handling webhook:', err)
    return new Response(JSON.stringify({ error: (err as Error).message ?? 'Internal error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})

// ---------------------------------------------------------------------------
// Handler: someone marked interest in a shift → notify the shift owner
// ---------------------------------------------------------------------------
async function handleInterestInsert(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown>
) {
  const shiftId = record['shift_id'] as number
  const interestedUserId = record['user_id'] as string

  // 1. Find shift owner
  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .select('user_id')
    .eq('id', shiftId)
    .single()

  if (shiftErr || !shift) {
    console.error('Shift not found', shiftId, shiftErr)
    return
  }

  const ownerId = shift.user_id as string

  // 2. Check owner's notification preferences
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('nome, cognome, notification_enabled, notify_on_interest')
    .eq('id', ownerId)
    .single()

  if (ownerErr || !owner) {
    console.error('Owner not found', ownerId, ownerErr)
    return
  }

  if (!owner.notification_enabled || !owner.notify_on_interest) {
    console.log('Owner has notifications disabled', ownerId)
    return
  }

  // 3. Get the interested user's name
  const { data: interestedUser, error: iuErr } = await supabase
    .from('users')
    .select('nome, cognome')
    .eq('id', interestedUserId)
    .single()

  if (iuErr || !interestedUser) {
    console.error('Interested user not found', interestedUserId, iuErr)
    return
  }

  // 4. Get owner's push subscriptions
  const { data: subs, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, subscription')
    .eq('user_id', ownerId)

  if (subsErr) {
    console.error('Error fetching push subscriptions', subsErr)
    return
  }

  if (!subs?.length) return

  const notifPayload = JSON.stringify({
    title: 'Qualcuno è interessato al tuo turno',
    body: `${interestedUser.nome} ${interestedUser.cognome} è interessato al tuo turno`,
    shiftId,
  })

  await sendToSubscriptions(supabase, subs as PushSubscriptionRecord[], notifPayload, ownerId)
}

// ---------------------------------------------------------------------------
// Handler: a new shift was posted → notify all users in the same category
// ---------------------------------------------------------------------------
async function handleShiftInsert(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown>
) {
  const shiftId = record['id'] as number
  const posterUserId = record['user_id'] as string

  // 1. Get poster's profile (need is_secondary to filter by category)
  const { data: poster, error: posterErr } = await supabase
    .from('users')
    .select('nome, cognome, is_secondary')
    .eq('id', posterUserId)
    .single()

  if (posterErr || !poster) {
    console.error('Poster not found', posterUserId, posterErr)
    return
  }

  const posterIsSecondary = poster.is_secondary as boolean

  // 2. Find all users in same category with new-shift notifications enabled
  const { data: recipients, error: recipErr } = await supabase
    .from('users')
    .select('id')
    .eq('is_secondary', posterIsSecondary)
    .eq('notification_enabled', true)
    .eq('notify_on_new_shift', true)
    .neq('id', posterUserId)

  if (recipErr) {
    console.error('Error fetching recipients', recipErr)
    return
  }

  if (!recipients?.length) return

  const notifPayload = JSON.stringify({
    title: 'Nuovo cambio turno disponibile',
    body: `${poster.nome} ${poster.cognome} ha pubblicato un nuovo cambio turno`,
    shiftId,
  })

  // 3. For each recipient, fetch their push subscriptions and notify
  await Promise.allSettled(
    recipients.map(async (recipient: { id: string }) => {
      const { data: subs, error: subsErr } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, subscription')
        .eq('user_id', recipient.id)

      if (subsErr || !subs?.length) return

      await sendToSubscriptions(
        supabase,
        subs as PushSubscriptionRecord[],
        notifPayload,
        recipient.id
      )
    })
  )
}

// ---------------------------------------------------------------------------
// Handler: someone marked interest in a vacation swap → notify the request owner
// ---------------------------------------------------------------------------
async function handleVacationInterestInsert(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown>
) {
  const requestId    = record['request_id'] as number
  const interestedId = record['user_id'] as string

  // 1. Find vacation request owner and offered/target periods
  const { data: req, error: reqErr } = await supabase
    .from('vacation_requests')
    .select('user_id, offered_period, target_periods')
    .eq('id', requestId)
    .single()

  if (reqErr || !req) { console.error('Vacation request not found', requestId, reqErr); return }

  const ownerId = req.user_id as string

  // 2. Check owner's notification preferences
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('notification_enabled, notify_on_vacation_interest')
    .eq('id', ownerId)
    .single()

  if (ownerErr || !owner) { console.error('Owner not found', ownerId, ownerErr); return }
  if (!owner.notification_enabled || !owner.notify_on_vacation_interest) return

  // 3. Get interested user's name
  const { data: intUser, error: iuErr } = await supabase
    .from('users')
    .select('nome, cognome')
    .eq('id', interestedId)
    .single()

  if (iuErr || !intUser) { console.error('Interested user not found', interestedId, iuErr); return }

  // 4. Get owner's push subscriptions
  const { data: subs, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, subscription')
    .eq('user_id', ownerId)

  if (subsErr || !subs?.length) return

  const periodLabels: Record<number, string> = {
    1: '16–30 Giu', 2: '01–15 Lug', 3: '16–31 Lug',
    4: '01–15 Ago', 5: '16–31 Ago', 6: '01–15 Set',
  }
  const offered = periodLabels[req.offered_period as number] ?? `Periodo ${req.offered_period}`
  const targets = (req.target_periods as number[]).map(p => periodLabels[p] ?? `P${p}`).join(', ')

  const notifPayload = JSON.stringify({
    title: 'Qualcuno è interessato al tuo cambio ferie',
    body: `${intUser.nome} ${intUser.cognome} vuole scambiare ${offered} con ${targets}`,
    type: 'vacation_interest',
    requestId,
  })

  await sendToSubscriptions(supabase, subs as PushSubscriptionRecord[], notifPayload, ownerId)
}

// ---------------------------------------------------------------------------
// Handler: a new vacation swap was posted → notify all users in same category
// ---------------------------------------------------------------------------
async function handleVacationRequestInsert(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown>
) {
  const requestId  = record['id'] as number
  const posterUserId = record['user_id'] as string
  const offeredPeriod = record['offered_period'] as number
  const targetPeriods = record['target_periods'] as number[]

  // 1. Get poster's profile
  const { data: poster, error: posterErr } = await supabase
    .from('users')
    .select('nome, cognome, is_secondary')
    .eq('id', posterUserId)
    .single()

  if (posterErr || !poster) { console.error('Poster not found', posterUserId, posterErr); return }

  // 2. Find all users in same category with new-vacation notifications enabled
  const { data: recipients, error: recipErr } = await supabase
    .from('users')
    .select('id')
    .eq('is_secondary', poster.is_secondary)
    .eq('notification_enabled', true)
    .eq('notify_on_new_vacation', true)
    .neq('id', posterUserId)

  if (recipErr) { console.error('Error fetching recipients', recipErr); return }
  if (!recipients?.length) return

  const periodLabels: Record<number, string> = {
    1: '16–30 Giu', 2: '01–15 Lug', 3: '16–31 Lug',
    4: '01–15 Ago', 5: '16–31 Ago', 6: '01–15 Set',
  }
  const offered = periodLabels[offeredPeriod] ?? `Periodo ${offeredPeriod}`
  const targets = (targetPeriods ?? []).map(p => periodLabels[p] ?? `P${p}`).join(', ')

  const notifPayload = JSON.stringify({
    title: 'Nuovo cambio ferie disponibile',
    body: `${poster.nome} ${poster.cognome} offre ${offered} in cambio di ${targets}`,
    type: 'new_vacation',
    requestId,
  })

  await Promise.allSettled(
    recipients.map(async (recipient: { id: string }) => {
      const { data: subs, error: subsErr } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, subscription')
        .eq('user_id', recipient.id)

      if (subsErr || !subs?.length) return
      await sendToSubscriptions(supabase, subs as PushSubscriptionRecord[], notifPayload, recipient.id)
    })
  )
}

// ---------------------------------------------------------------------------
// Helper: send web-push to a list of subscriptions, clean up stale ones
// ---------------------------------------------------------------------------
async function sendToSubscriptions(
  supabase: ReturnType<typeof createClient>,
  subs: PushSubscriptionRecord[],
  payload: string,
  userId: string
) {
  const staleEndpoints: string[] = []

  await Promise.allSettled(
    subs.map(async ({ subscription, endpoint }) => {
      try {
        await webpush.sendNotification(
          subscription as webpush.PushSubscription,
          payload
        )
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 410 || statusCode === 404) {
          staleEndpoints.push(endpoint)
        } else {
          console.error('Push send error', endpoint, err)
        }
      }
    })
  )

  // Remove stale subscriptions
  if (staleEndpoints.length > 0) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', staleEndpoints)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting stale subscriptions', error)
    }
  }
}
