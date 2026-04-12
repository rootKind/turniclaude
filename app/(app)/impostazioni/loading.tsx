import { Skeleton } from '@/components/ui/skeleton'

export default function ImpostazioniLoading() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <Skeleton className="h-6 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    </main>
  )
}
