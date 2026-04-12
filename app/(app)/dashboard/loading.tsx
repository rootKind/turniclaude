import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-10" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
        ))}
      </div>
    </main>
  )
}
