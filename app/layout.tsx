import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { QueryProvider } from '@/components/providers/query-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { ThemeColor } from '@/components/providers/theme-color'
import { OfflineBar } from '@/components/providers/offline-bar'
import { TextScale } from '@/components/providers/text-scale'
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

/**
 * M11 — IL CHROME DI SISTEMA (23/09/2026), e le due regole che lo governano.
 *
 * **1. Il colore lo detta lo sfondo della pagina, non questo file.** Il meta
 * `theme-color` qui sotto è il valore di partenza (chiaro/scuro secondo la
 * preferenza di sistema al momento del render), ma chi vince è
 * `components/providers/theme-color.tsx`: legge `--background` calcolato e
 * riscrive il meta a ogni cambio di tema. Da M11 vale anche per **iOS**, perché
 * **Safari 26 non legge più il meta `theme-color`**: da lì in avanti la fascia
 * della barra di stato prende il colore di ciò che la pagina disegna SOTTO di
 * essa. È una notizia buona per questa app — lo sfondo è già `var(--background)`
 * su tutta la pagina, e il vetro della testata (M8b/M10) ci scorre sotto — ma è
 * la ragione per cui il colore del chrome non può più essere «deciso» da una
 * meta tag: va lasciato trasparente e lo decide la pagina.
 *
 * **2. `statusBarStyle: 'default'` è una scelta, non un default.** Su iOS la
 * barra di stato a tutto schermo (`black-translucent`) è stata RITIRATA nella
 * 26.1: le app che ci contavano si sono ritrovate il chrome spostato di colpo.
 * Con `'default'` la barra ha un fondo proprio e il contenuto parte sotto di lei,
 * il che combacia con lo sfondo di questa app: `#0a0a0a` (lib/color-defaults.ts)
 * — cioè la scelta sicura **e** quella che vogliamo, non un ripiego. Chi un
 * giorno volesse il pieno schermo dovrà riprovare la 26.1 su un iPhone vero: è
 * scritto nella tabella delle trappole di knowledge.md.
 */
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
            {/* M12: la preferenza di dimensione del testo scelta dall'utente (in
                Impostazioni). Non rende niente: scrive la percentuale su `html`,
                così vale anche per gli overlay e per il primo paint successivo. */}
            <TextScale />
            {/* M11: l'avviso di rete sta QUI, fuori dal PwaGuard e fuori dal
                QueryProvider — quando la rete manca, la prima pagina che deve
                poterlo dire è quella che si apre per prima (`/login`), che il
                guard protegge. Rende `null` finché c'è connessione. */}
            <OfflineBar />
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
              {/* La POSIZIONE la decide la piattaforma (M3): snackbar in basso su
                  Android, banner in alto altrove — vedi `components/ui/sonner.tsx`. */}
              <Toaster richColors />
            </QueryProvider>
            <Analytics />
            <SpeedInsights />
          </PlatformProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
