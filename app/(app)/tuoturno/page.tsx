import { createClient } from '@/lib/supabase/server'
import { listScheduleMonths } from '@/lib/queries/sala-schedule'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { buildDuplicateCognomi } from '@/lib/utils'
import { buildBareOwners } from '@/lib/shift-teams-matching'
import { buildPersonTheoretical, type PersonTheoretical } from '@/lib/person-cycle'
import type { SalaMonthData } from '@/types/database'
import { TuoTurnoClient } from './tuoturno-client'

/**
 * /tuoturno — «Il tuo turno»: calendario mensile personale con il turno reale
 * (dal PDF caricato) sopra e il teorico sotto. Il teorico ha tre sorgenti in
 * ordine di priorità (vedi lib/person-cycle.ts):
 *  1. riga base del PDF del mese (esatta per definizione);
 *  2. predizione dalla STORIA dei PDF (ciclo rigido o rotazione a blocchi);
 *  3. rotazione delle squadre del DB (solo ultimo fallback: il seed tronca i
 *     cicli > 28gg e non coincide con i PDF reali).
 * Qui si precomputa il predittore (2) per ogni utente a partire dai mesi PDF
 * già caricati: resta piccolo e viaggia serializzato al client.
 */
export default async function TuoTurnoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, usersRes, uploadedMonths, tree, schedulesRes] = await Promise.all([
    user
      ? supabase.from('users').select('id, nome, cognome').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('users').select('id, nome, cognome, is_secondary, is_manager, show_in_compare').order('cognome'),
    listScheduleMonths(supabase),
    fetchShiftTeamTree(supabase),
    supabase.from('sala_schedule').select('month, schedule'),
  ])

  const users = usersRes.data ?? []
  const duplicateCognomi = buildDuplicateCognomi(users)
  // Omonimi con membro LEGATO via user_id (caso NEVANO P./G.): la riga PDF con
  // il solo cognome appartiene al legato (Pietro), gli altri solo con l'iniziale.
  const bareOwners = buildBareOwners(tree, duplicateCognomi)

  // Mesi PDF in forma compatta v2: servono le righe «teorico» del parser.
  const pdfMonths = new Map<string, SalaMonthData>()
  for (const row of schedulesRes.data ?? []) {
    const raw = row.schedule as unknown
    if (raw && typeof raw === 'object' && (raw as { v?: unknown }).v === 2) {
      pdfMonths.set(row.month, raw as SalaMonthData)
    }
  }

  // Predittore del teorico per ogni utente (dalla storia dei PDF).
  const personTheoretical: Record<string, PersonTheoretical> = {}
  if (pdfMonths.size > 0) {
    for (const u of users) {
      const src = buildPersonTheoretical(pdfMonths, u, duplicateCognomi)
      if (src) personTheoretical[u.id] = src
    }
  }

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return (
    <TuoTurnoClient
      currentUserId={user?.id ?? ''}
      profile={profileRes.data}
      users={users}
      uploadedMonths={uploadedMonths}
      tree={tree}
      personTheoretical={personTheoretical}
      initialMonth={currentMonth}
      bareOwners={[...bareOwners.entries()]}
    />
  )
}