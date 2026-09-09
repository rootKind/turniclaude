import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'

import { getSalaLayout } from '@/lib/queries/sala-layout'
import { getSalaSchedule, listScheduleMonths } from '@/lib/queries/sala-schedule'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { generateTheoreticalMonth, theoreticalMonthList } from '@/lib/turni-teorici'
import { SalaPageClient } from './sala-page-client'

export default async function TurniSalaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = user ? isAdmin(user.id) : false

  const now = new Date()
  const todayMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [layout, scheduleMonths, userProfile, shiftTree] = await Promise.all([
    getSalaLayout(supabase),
    listScheduleMonths(supabase),
    user
      ? supabase.from('users').select('cognome, nome, is_manager').eq('id', user.id).maybeSingle().then(r => r.data)
      : Promise.resolve(null),
    fetchShiftTeamTree(supabase),
  ])

  const manager = userProfile?.is_manager ?? false

  // Mesi non caricati a mano, riempiti coi turni teorici (rotazione attuale).
  const theoreticalMonths = theoreticalMonthList(scheduleMonths)

  const initialMonth = scheduleMonths.includes(todayMonth) ? todayMonth : (scheduleMonths[0] ?? todayMonth)
  const initialIsTheoretical = !scheduleMonths.includes(initialMonth)
  const initialSchedule = initialIsTheoretical
    ? generateTheoreticalMonth(initialMonth, shiftTree, shiftTree.adjustments)
    : scheduleMonths.length > 0
      ? await getSalaSchedule(supabase, initialMonth)
      : null

  return (
    <SalaPageClient
      layout={layout}
      isAdmin={admin}
      isManager={manager}
      userId={user?.id ?? ''}
      userCognome={userProfile?.cognome ?? undefined}
      userNome={userProfile?.nome ?? undefined}
      initialSchedule={initialSchedule}
      initialMonth={initialMonth}
      scheduleMonths={scheduleMonths}
      theoreticalMonths={theoreticalMonths}
    />
  )
}