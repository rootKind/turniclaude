import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { QueryProvider } from '@/components/providers/query-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { ThemeColor } from '@/components/providers/theme-color'
import { ThemeInspector } from '@/components/admin/theme-inspector'
import { PlatformProvider } from '@/components/providers/platform-provider'
import { detectPlatformFromUA } from '@/lib/platform'
import { LIGHT_BACKGROUND, DARK_BACKGROUND } from '@/lib/color-defaults'
import { PwaGuard } from '@/components/providers/pwa-guard'
import { BootSplash } from '@/components/providers/boot-splash'
import { AuthCacheGuard } from '@/components/providers/auth-cache-guard'
import { SwRegistrar } from '@/components/providers/sw-registrar'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

// `variable` espone la famiglia di Geist come `--font-geist`: è il valore di BASE
// del token `--font-ui` (livello 2 del design system, in globals.css), cioè il font
// del desktop. Il className continua a fare il lavoro di sempre sul body, quindi
// aggiungere la variabile non cambia un pixel: serve alle skin di piattaforma per
// poter dire «su iOS/Android no, usa il font di sistema».
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

// Come app/manifest.ts: build-time branch check (Vercel). master = PWA live;
// qualsiasi altro branch (e il dev locale, dove la env non esiste) = «DEV».
const IS_PROD = process.env.VERCEL_GIT_COMMIT_REF === 'master'

export const metadata: Metadata = {
  title: IS_PROD ? 'Turni Sala C.C.C.' : 'Turni DEV',
  description: 'Gestione scambi turni',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: IS_PROD ? 'Turni' : 'Turni DEV' },
  icons: {
    icon: [
      { url: IS_PROD ? '/icons/icon-192.png' : '/icons/icon-192-dev.png', sizes: '192x192' },
      { url: IS_PROD ? '/icons/icon-512.png' : '/icons/icon-512-dev.png', sizes: '512x512' },
    ],
    apple: [{ url: IS_PROD ? '/icons/apple-icon.png' : '/icons/apple-icon-dev.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: LIGHT_BACKGROUND },
    { media: '(prefers-color-scheme: dark)',  color: DARK_BACKGROUND },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /**
   * PIATTAFORMA (20/09/2026). La decide il SERVER leggendo lo User-Agent della
   * richiesta (`lib/platform.ts` è pura, quindi si prova senza browser): così
   * l'attributo `data-platform` è già nell'HTML iniziale e i token di
   * `app/globals.css` applicano la skin giusta PRIMA del primo paint. Niente
   * script inline — che Next riscriverebbe a ogni navigazione — e niente flash.
   *
   * L'override di QA (`?platform=ios`, o localStorage `turni-platform-override`)
   * lo riscrive dal client con `PlatformProvider`: serve a guardare la skin
   * Android dal telefono e viceversa, non è la strada dei test (le spec girano
   * con l'emulazione vera dei due motori).
   *
   * Conseguenza dichiarata: leggere gli header rende dinamiche anche le pagine
   * che prima erano statiche (`/login`, `/installa`). Le rotte autenticate
   * erano già dinamiche (cookie di sessione + Supabase).
   */
  const platform = detectPlatformFromUA((await headers()).get('user-agent'))

  return (
    <html lang="it" className={geist.variable} data-platform={platform} suppressHydrationWarning>
      <body className={geist.className}>
        <BootSplash />
        <ThemeProvider>
          <PlatformProvider platform={platform}>
            <AuthCacheGuard />
            <SwRegistrar />
            <ThemeColor />
            <QueryProvider>
              <PwaGuard>
                {children}
              </PwaGuard>
              {/* Sonda colori dell'admin (richiesta 17/09/2026): vive qui — dentro
                  il QueryProvider (chiede chi sono con `useCurrentUser`) e fuori
                  dal PwaGuard — perché deve poter guardare QUALUNQUE pagina
                  dell'app. Non rende e non ascolta niente finché non è accesa, e
                  solo per l'admin. */}
              <ThemeInspector />
              <Toaster richColors position="top-center" />
            </QueryProvider>
            <Analytics />
            <SpeedInsights />
          </PlatformProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
