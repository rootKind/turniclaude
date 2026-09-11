import { Skeleton } from '@/components/ui/skeleton'

/** Skeleton di /tuoturno: intestazione, mese, griglia 7×5 e legenda. */
export default function TuoTurnoLoading() {
  return (
    <main className="max-w-lg mx-auto px-3 pt-6 pb-4">
      <div className="mb-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-5 w-40 mt-2" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="flex flex-col items-center gap-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
    </main>
  )
}
