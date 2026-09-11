import { createClient } from '@/lib/supabase/server'
import { listScheduleMonths } from '@/lib/queries/sala-schedule'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { TuoTurnoClient } from './tuoturno-client'

/**
 * /tuoturno — «Il tuo turno»: calendario mensile personale con il turno reale
 * (dal PDF caricato) sopra e il teorico (dalla rotazione delle squadre) sotto.
 * Consente di vedere i turni di qualsiasi altro dipendente e di scorrere i mesi.
 */
export default async function TuoTurnoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, usersRes, uploadedMonths, tree] = await Promise.all([
    user
      ? supabase.from('users').select('id, nome, cognome').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('users').select('id, nome, cognome').order('cognome'),
    listScheduleMonths(supabase),
    fetchShiftTeamTree(supabase),
  ])

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return (
    <TuoTurnoClient
      currentUserId={user?.id ?? ''}
      profile={profileRes.data}
      users={usersRes.data ?? []}
      uploadedMonths={uploadedMonths}
      tree={tree}
      initialMonth={currentMonth}
    />
  )
}