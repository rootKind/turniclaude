// lib/color-defaults.ts
// Single source of truth for the browser chrome (meta theme-color) colors.
// Derived from the --background defaults in globals.css so they can never drift.
//
// NOTA: la funzionalità admin di modifica colori (override in
// app_settings.color_overrides) è stata rimossa — qui restano solo le costanti
// usate dal meta theme-color (app/layout.tsx viewport + ThemeColor).
//
// IMPORTANTE (splash PWA al primo avvio): il colore dello splash è reso ADATTIVO
// al tema dal <meta name="theme-color"> con media queries (app/layout.tsx viewport +
// ThemeColor): chiaro = LIGHT_BACKGROUND, scuro = DARK_BACKGROUND.
//
// Strategia icone/splash (validata 03/08/2026 su Android chiaro+scuro e iOS):
// - Android (icon-192.png / icon-512.png, manifest): TRASPARENTI, logo che fluttua
//   sullo splash nero — senza `purpose: maskable` (rimosso) Android non applica la
//   tile adattiva. NON cuocere sfondi dentro queste: combacia solo con UN tema.
//   Il logo copre ~92% della larghezza del canvas (ingrandito 03/08/2026).
// - iOS: il launch screen nativo NON mostra MAI l'icona (solo colore solido). Il logo
//   a caricamento arriva dallo splash IN-APP `components/providers/boot-splash.tsx`
//   (mostrato SOLO su iOS via @supports -webkit-touch-callout; overlay full-screen
//   con sfondo var(--background) + icon-512.png centrata, width min(64vw, 280px)).
//   `apple-icon.png` (icona home iOS) ha sfondo BIANCO #ffffff cotto, logo scuro
//   centrato (stesso logo ingrandito).
// `manifest.json` background_color/theme_color = #0a0a0a resta come FALLBACK
// (browser legacy che ignorano il meta). Se si cambia uno dei colori qui, aggiornare
// la viewport in layout.tsx; per il manifest/icone serve il bump di CACHE_NAME in
// public/sw.js (cache-first).

export const LIGHT_BACKGROUND = '#f0f7fc'

// #0a0a0a = sRGB esatto di oklch(0.145 0 0) (base dark di globals.css) — il "true black"
// che la PWA mostra. NON usare #1a1a1a qui: coincide con --shift-others-bg e il meta
// theme-color (chrome browser: status bar + area navbar di sistema) non combacia con lo sfondo.
export const DARK_BACKGROUND = '#0a0a0a'
