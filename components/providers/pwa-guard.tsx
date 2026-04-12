'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function PwaGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const isPWA =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (!isPWA && pathname !== '/installa') {
      router.replace('/installa')
      return
    }
    if (isPWA && pathname === '/installa') {
      router.replace('/login')
      return
    }
    setReady(true)
  }, []) // runs once on mount — isPWA is stable for the lifetime of the session

  if (!ready) return <div className="min-h-screen bg-background" />
  return <>{children}</>
}
