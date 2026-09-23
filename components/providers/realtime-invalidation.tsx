'use client'
// Wrapper client del layout (app)/layout.tsx è un server component, quindi
// non può chiamare hook: questo componente client monta UNA volta il canale
// realtime di invalidazione globale (vedi hooks/use-realtime-invalidation.ts).
//
// M12 (23/09/2026) — E ANNUNCIA QUELLO CHE ARRIVA. L'invalidazione è, per chi
// guarda, un cambio di dati che compare da solo: una card di sala cambia, un
// nominativo compare. Per chi ASCOLTA non succedeva niente: nessun testo cambiava,
// quindi nessun lettore di schermo parlava — e i turni di una persona potevano
// cambiare sotto le dita senza che lei lo sapesse. La regione qui sotto è il
// minimo che chiude quel buco: `role="status"`, una frase in italiano (non il
// nome della tabella) e la ripetizione possibile — il messaggio si SVUOTA dopo
// qualche secondo, altrimenti due aggiornamenti identici di fila non verrebbero
// riannunciati (una live region parla quando il TESTO cambia).
import { useCallback, useEffect, useState } from 'react'
import { useRealtimeInvalidation } from '@/hooks/use-realtime-invalidation'

/** I nomi delle tabelle che l'utente conosce. `users` non è «utenti»: è l'anagrafica. */
const COSA_E_CAMBIATO: Record<string, string> = {
  users: 'anagrafica',
  shift_types: 'turni',
  shift_teams: 'turni',
  shift_team_members: 'turni',
  shift_adjustments: 'turni',
}

export function RealtimeInvalidation() {
  const [messaggio, setMessaggio] = useState('')

  const suEvento = useCallback((tabella: string) => {
    const cosa = COSA_E_CAMBIATO[tabella] ?? tabella
    const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    setMessaggio(`Dati aggiornati: ${cosa}, alle ${ora}`)
  }, [])

  useRealtimeInvalidation(suEvento)

  // L'annuncio è effimero: si legge una volta e sparisce, così il prossimo
  // cambiamento è di nuovo un cambiamento del testo.
  useEffect(() => {
    if (!messaggio) return
    const t = setTimeout(() => setMessaggio(''), 6000)
    return () => clearTimeout(t)
  }, [messaggio])

  return (
    <p role="status" data-slot="realtime-annuncio" className="sr-only">
      {messaggio}
    </p>
  )
}
