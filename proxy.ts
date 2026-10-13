import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware-client'
import { sessionUser } from '@/lib/supabase/local-session'

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/turnisala',
  '/turniferie',
  '/vacanze',
  '/tuoturno',
  '/impostazioni',
  '/notifiche',
  '/admin',
]

export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const isProtected = PROTECTED_PREFIXES.some(p => path === p || path.startsWith(p + '/'))

  // Le rotte pubbliche escono PRIMA di toccare Supabase Auth: niente round-trip
  // di rete e nessun rinnovo cookie sulla landing, sul manifest e sulle icone.
  // Il rinnovo della sessione avviene alla prima rotta protetta, che da lì è
  // sempre a un tocco di distanza.
  if (!isProtected) return NextResponse.next()

  /* I PREFETCH NON SI POSSONO SALTARE — non è pigrizia, è una porta chiusa.

     L'idea: i prefetch sono ~2 richieste su 3 in una sessione tipo (l'app prepara
     in anticipo le pagine vicine), non sono navigazioni, quindi il controllo di
     sessione si potrebbe rimandare a quella vera. Il browser manda l'header
     `Next-Router-Prefetch: 1`... che però il middleware NON vede: Next cancella i
     suoi header interni prima di consegnare la richiesta. Provato il 13/10/2026
     sul server di produzione — il middleware riceve solo accept, host, user-agent
     e x-forwarded-*; `Next-Router-Prefetch` e `RSC` non arrivano, mentre un header
     inventato (`X-Test`) sì. L'unica variante possibile sarebbe saltare il
     controllo su TUTTE le richieste RSC, comprese le navigazioni fatte cliccando,
     e toglierebbe il rimbalzo su /login a chi ha la sessione scaduta: peggio, per
     un risparmio che da oggi non c'è più da fare (sotto). */

  const response = NextResponse.next({ request })
  const supabase = createMiddlewareClient(request, response)

  /* CHI SEI, SENZA CHIEDERE A SUPABASE — vedi lib/supabase/local-session.ts.

     `sessionUser` è la stessa porta che usano le route /api: prima qui c'era
     `getUser()`, cioè una chiamata di rete a Supabase Auth su OGNI richiesta
     protetta (39 in una sessione tipo), con Vercel fermo ad aspettare la
     risposta prima di consegnare la pagina. Ora la firma del token si controlla
     in locale e il middleware non parla con nessuno. */
  const user = await sessionUser(supabase)

  if (!user) {
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
    // ATTENZIONE al nome del manifest: app/manifest.ts è servito su
    // /manifest.webmanifest, non su /manifest.json. Se il route cambia nome
    // (o se ne aggiunge uno) va aggiunto QUI, altrimenti l'esclusione non
    // aggancia e il manifest paga middleware e sessione a ogni fetch.
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|icons|installa|login|reset-password|verify-otp|update-password|confirm-email|auth/confirm).*)',
  ],
}
