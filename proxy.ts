import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware-client'

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/turnisala',
  '/turniferie',
  '/vacanze',
  '/impostazioni',
  '/notifiche',
  '/admin',
]

export default async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })
  const supabase = createMiddlewareClient(request, response)

  // Refreshes the session (and cookies) on every matched request.
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isProtected = PROTECTED_PREFIXES.some(p => path === p || path.startsWith(p + '/'))

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Run on all routes except API handlers, static assets, and public auth pages.
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|installa|login|reset-password|verify-otp|update-password|confirm-email|auth/confirm).*)',
  ],
}
