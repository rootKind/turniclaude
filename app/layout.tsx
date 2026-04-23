import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { cookies } from 'next/headers'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { QueryProvider } from '@/components/providers/query-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { ThemeColor } from '@/components/providers/theme-color'
import { ColorThemeProvider } from '@/components/providers/color-theme-provider'
import { ColorInspector } from '@/components/admin/color-inspector'
import { PwaGuard } from '@/components/providers/pwa-guard'
import { SwRegistrar } from '@/components/providers/sw-registrar'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Turni Sala C.C.C.',
  description: 'Gestione scambi turni',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Turni' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192' },
      { url: '/icons/icon-512.png', sizes: '512x512' },
    ],
    apple: '/icons/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#000000' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const ssrStyles = cookieStore.get('co')?.value ?? ''

  return (
    <html lang="it" suppressHydrationWarning>
      {ssrStyles && (
        <head>
          <style dangerouslySetInnerHTML={{ __html: ssrStyles }} />
        </head>
      )}
      <body className={geist.className}>
        <ThemeProvider>
          <SwRegistrar />
          <ThemeColor />
          <ColorThemeProvider />
          <QueryProvider>
            <PwaGuard>
              {children}
            </PwaGuard>
            <Toaster richColors position="top-center" />
          </QueryProvider>
          <ColorInspector />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
