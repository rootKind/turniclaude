import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = [
  '/login',
  '/reset-password',
  '/verify-password-otp',
  '/update-password',
  '/confirm-email',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Derive the Supabase project ref from the URL env var to find the auth cookie.
  // @supabase/ssr stores the session in sb-{ref}-auth-token (possibly chunked as .0, .1 …)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0]
  const cookieBase = `sb-${projectRef}-auth-token`

  const hasAuth =
    request.cookies.has(cookieBase) ||
    request.cookies.has(`${cookieBase}.0`)

  if (pathname.startsWith('/api/') && !hasAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (!hasAuth && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (hasAuth && isPublic) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)'],
}
