import { Skeleton } from '@/components/ui/skeleton'

export default function TurniFerieLoading() {
  return (
    <main className="mx-auto px-3 pt-5 max-w-2xl flex flex-col" style={{ height: 'calc(100dvh - 4rem)' }}>
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
