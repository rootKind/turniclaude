import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'
import { getSalaLayout } from '@/lib/queries/sala-layout'
import { getSalaSchedule, listScheduleMonths } from '@/lib/queries/sala-schedule'
import { SalaPageClient } from './sala-page-client'

export default async function TurniSalaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = user ? isAdmin(user.id) : false

  const now = new Date()
  const todayMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [layout, scheduleMonths, userProfile] = await Promise.all([
    getSalaLayout(supabase),
    listScheduleMonths(supabase),
    user
      ? supabase.from('users').select('cognome').eq('id', user.id).maybeSingle().then(r => r.data)
      : Promise.resolve(null),
  ])

  const initialMonth = scheduleMonths[0] ?? todayMonth
  const initialSchedule = scheduleMonths.length > 0
    ? await getSalaSchedule(supabase, initialMonth)
    : null

  return (
    <SalaPageClient
      layout={layout}
      isAdmin={admin}
      userId={user?.id ?? ''}
      userCognome={userProfile?.cognome ?? undefined}
      initialSchedule={initialSchedule}
      initialMonth={initialMonth}
      scheduleMonths={scheduleMonths}
    />
  )
}
