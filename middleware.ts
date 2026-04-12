import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware-client'

const PUBLIC_ROUTES = [
  '/login',
  '/reset-password',
  '/verify-password-otp',
  '/update-password',
  '/confirm-email',
]

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })
  const supabase = createMiddlewareClient(request, response)
  // supabase-js narrows auth type for publishable keys; cast to access getUser
  const auth = supabase.auth as unknown as { getUser(): Promise<{ data: { user: { id: string } | null } }> }
  const { data: { user } } = await auth.getUser()

  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/') && !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isPublic) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)'],
}
