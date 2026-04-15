'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const DEV_BYPASS_TOKEN = 'rootkind-dev-2026'
const DEV_BYPASS_KEY = '__dev_bypass__'

export function PwaGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  const AUTH_BYPASS = ['/installa', '/login', '/reset-password', '/update-password', '/auth/confirm', '/confirm-email', '/verify-otp']

  useEffect(() => {
    // Dev backdoor: ?dev=rootkind-dev-2026 → bypass PWA check for this session
    const params = new URLSearchParams(window.location.search)
    if (params.get('dev') === DEV_BYPASS_TOKEN) {
      sessionStorage.setItem(DEV_BYPASS_KEY, '1')
      // Strip the param from URL without reload
      params.delete('dev')
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '')
      window.history.replaceState(null, '', newUrl)
    }
    const isDevBypass = sessionStorage.getItem(DEV_BYPASS_KEY) === '1'

    const isPWA =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (!isDevBypass && !isPWA && !AUTH_BYPASS.includes(pathname)) {
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
    if (!isDevBypass && isPWA && pathname === '/installa') {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [pathname]) // pathname as dep fixes the black screen bug when redirect happens

  if (!ready) return <div className="min-h-screen bg-background" />
  return <>{children}</>
}
