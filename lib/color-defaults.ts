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
// Le icone PWA (icon-192/512, apple-icon) sono volutamente TRASPARENTI: il logo
// "fluttua" sullo splash in entrambi i temi (Android e iOS). NON cuocere sfondi
// dentro le icone: su Android l'icona sta comunque in un riquadro, quindi un'unica
// icona non può combaciare con splash chiari E scuri — la trasparenza è l'unica
// scelta che funziona su tutti e 4 gli scenari. `manifest.json` background_color/
// theme_color = #0a0a0a resta come FALLBACK (browser legacy che ignorano il meta).
// Se si cambia uno dei colori qui, aggiornare la viewport in layout.tsx; per il
// manifest/icone serve il bump di CACHE_NAME in public/sw.js (cache-first).

export const LIGHT_BACKGROUND = '#f0f7fc'

// #0a0a0a = sRGB esatto di oklch(0.145 0 0) (base dark di globals.css) — il "true black"
// che la PWA mostra. NON usare #1a1a1a qui: coincide con --shift-others-bg e il meta
// theme-color (chrome browser: status bar + area navbar di sistema) non combacia con lo sfondo.
export const DARK_BACKGROUND = '#0a0a0a'
