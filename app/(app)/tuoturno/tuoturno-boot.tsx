'use client'
// L'IMPASTO DI /TUOTURNO, LATO CLIENT (13/10/2026).
//
// Questa pagina era un server component async che preparava, a OGNI render
// (compresi i prefetch della barra di navigazione), anagrafica, albero squadre e
// predittore del teorico — e l'HTML che ne usciva era comunque il placeholder del
// `PwaGuard`: l'app la disegna il client. Ora la pagina è statica e questo
// componente prende gli stessi dati dalla cache del client (`use-sala-data`).
//
// Le due cose che la cache NON ha — la storia dei mesi PDF e il predittore che ne
// deriva — sono una query a sé: si aspetta LEI prima di disegnare, perché senza
// l'elenco dei mesi la griglia direbbe «turni teorici» su un mese che un PDF ce
// l'ha. Utenti e albero squadre invece possono arrivare dopo: la griglia li usa
// per nomi e omonimi, e TuoTurnoClient ricade sul profilo se la lista è vuota.
import { useCurrentUser } from '@/hooks/use-current-user'
import { useTuoturnoData } from '@/hooks/use-sala-data'
import { TuoTurnoClient } from './tuoturno-client'
import TuoTurnoLoading from './loading'

/** Il mese di oggi, come lo calcolava la pagina server. */
function currentMonthISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function TuoturnoBoot() {
  const { profile } = useCurrentUser()
  const { users, tree, monthsLoaded, uploadedMonths, personTheoretical, bareOwners } = useTuoturnoData()

  // Skeleton dello STESSO file che Next usa per la rotta (`loading.tsx`): quando
  // si aspetta la storia dei mesi si vede esattamente ciò che si vedrebbe durante
  // una navigazione, non un rettangolo generico. `aria-busy` per chi legge con
  // uno screen reader: la pagina sta caricando, non è vuota.
  if (!profile || !monthsLoaded) {
    return (
      <div aria-busy="true">
        <TuoTurnoLoading />
      </div>
    )
  }

  return (
    <TuoTurnoClient
      currentUserId={profile.id}
      profile={profile}
      users={users}
      uploadedMonths={uploadedMonths ?? []}
      tree={tree}
      personTheoretical={personTheoretical ?? {}}
      initialMonth={currentMonthISO()}
      bareOwners={bareOwners ?? []}
    />
  )
}
