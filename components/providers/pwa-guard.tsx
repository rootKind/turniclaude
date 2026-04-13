'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function PwaGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  const AUTH_BYPASS = ['/installa', '/login', '/reset-password', '/update-password', '/auth/confirm', '/confirm-email']

  useEffect(() => {
    const isPWA =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (!isPWA && !AUTH_BYPASS.includes(pathname)) {
      const hasAuthParams =
        window.location.hash.includes('access_token') ||
        window.location.hash.includes('type=recovery') ||
        window.location.search.includes('token_hash') ||
        window.location.search.includes('code=')

      if (!hasAuthParams) {
        router.replace('/installa')
        return
      }
    }
    if (isPWA && pathname === '/installa') {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [pathname]) // pathname as dep fixes the black screen bug when redirect happens

  if (!ready) return <div className="min-h-screen bg-background" />
  return <>{children}</>
}
