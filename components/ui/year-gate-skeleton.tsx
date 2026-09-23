import { Skeleton } from '@/components/ui/skeleton'
import { LoadingShape } from '@/components/ui/loading-shape'

interface YearGateSkeletonProps {
  /** Layout della pagina: /turniferie (header card + grid 2 colonne) o /vacanze (titolo + lista). */
  variant: 'turniferie' | 'vacanze'
}

/**
 * Skeleton mostrato da /turniferie e /vacanze mentre l'anno minimo
 * (min_year_turniferie / min_year_vacanze) non è ancora caricato da app_settings.
 * Unica fonte di verità: usato sia dal gate inline nelle pagine sia dai
 * rispettivi loading.tsx, così i due non possono divergere.
 */
export function YearGateSkeleton({ variant }: YearGateSkeletonProps) {
  if (variant === 'turniferie') {
    return (
      <main className="mx-auto px-3 pt-5 max-w-2xl flex flex-col" style={{ height: 'calc(100dvh - var(--nav-space))' }}>
        {/* Il segno di attesa (M9): la pagina sta ASPETTANDO il gate dell'anno,
            e un `role="status"` lo dice a chi non vede lo scheletro. */}
        <LoadingShape etichetta="Caricamento dei turni…" className="mb-2 self-center" />
        <div className="flex items-center gap-2 mb-3 bg-card border border-border rounded-xl px-3 py-2 mr-14">
          <Skeleton className="h-6 w-28 flex-1" />
          <Skeleton className="h-7 w-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </main>
    )
  }
  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <LoadingShape etichetta="Caricamento…" className="mb-3" />
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-16 w-full rounded-xl mb-4" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
