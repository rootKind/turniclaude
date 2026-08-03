// lib/color-defaults.ts
// Single source of truth for the browser chrome (meta theme-color) colors.
// Derived from the --background defaults in globals.css so they can never drift.
//
// NOTA: la funzionalità admin di modifica colori (override in
// app_settings.color_overrides) è stata rimossa — qui restano solo le costanti
// usate dal meta theme-color (app/layout.tsx viewport + ThemeColor).

export const LIGHT_BACKGROUND = '#f0f7fc'

// #0a0a0a = sRGB esatto di oklch(0.145 0 0) (base dark di globals.css) — il "true black"
// che la PWA mostra. NON usare #1a1a1a qui: coincide con --shift-others-bg e il meta
// theme-color (chrome browser: status bar + area navbar di sistema) non combacia con lo sfondo.
export const DARK_BACKGROUND = '#0a0a0a'
