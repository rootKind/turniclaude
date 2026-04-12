import { Skeleton } from '@/components/ui/skeleton'

export default function NotificheLoading() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <Skeleton className="h-6 w-32 mb-4" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
