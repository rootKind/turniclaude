import { Skeleton } from '@/components/ui/skeleton'

export default function TurniSalaLoading() {
  return (
    <main className="max-w-2xl mx-auto px-3 pt-5 pb-4">
      <div className="flex items-center gap-2 mb-4 bg-card border border-border rounded-xl px-3 py-2">
        <Skeleton className="h-6 w-36" />
        <div className="flex items-center gap-1 ml-auto">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-7 w-7 rounded-lg" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
