'use client'
import { useIsFetching } from '@tanstack/react-query'

export function GlobalLoadingBar() {
  const count = useIsFetching()
  if (count === 0) return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[200] h-[2px] overflow-hidden bg-transparent pointer-events-none">
      <div className="h-full w-full bg-primary loading-bar-shimmer" />
    </div>
  )
}
