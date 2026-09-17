import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { QueryProvider } from '@/components/providers/query-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { ThemeColor } from '@/components/providers/theme-color'
import { ThemeInspector } from '@/components/admin/theme-inspector'
import { LIGHT_BACKGROUND, DARK_BACKGROUND } from '@/lib/color-defaults'
import { PwaGuard } from '@/components/providers/pwa-guard'
import { BootSplash } from '@/components/providers/boot-splash'
import { AuthCacheGuard } from '@/components/providers/auth-cache-guard'
import { SwRegistrar } from '@/components/providers/sw-registrar'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={geist.className}>
        <BootSplash />
        <ThemeProvider>
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
        </ThemeProvider>
      </body>
    </html>
  )
}
