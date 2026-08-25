'use client'
// /tuoturno — la mia piantina personale («Il tuo turno»).
// Stato attuale: pagina SEGNATAPOSTO con contenuto interattivo da definire.
// Obiettivo previsto: mostrare in vista mensile i turni assegnati all'utente corrente.
import { useCurrentUser } from '@/hooks/use-current-user'

export default function TuoTurnoPage() {
  const { profile } = useCurrentUser()
  const name = profile ? `${profile.nome ?? ''} ${profile.cognome ?? ''}`.trim() : ''

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <h1 className="text-lg font-bold mb-1">Il tuo turno</h1>
      {name && <p className="text-sm text-muted-foreground mb-6">{name}</p>}

      <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
        <p className="text-4xl mb-3">🗓️</p>
        <p className="font-medium text-foreground mb-1">La tua piantina è in arrivo</p>
        <p className="text-sm">
          Qui vedrai i giorni e i turni a cui sei assegnato nel periodo corrente.
          Contenuto da definire.
        </p>
      </div>
    </main>
  )
}