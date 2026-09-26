// COLORI: conversioni e leggibilità (richiesta 17/09/2026).
//
// Perché esiste: il pannello «Personalizza le card» di /tuoturno usava
// `<input type="color">`, cioè il selettore del SISTEMA (finestra di Windows,
// sheet di iOS, cerchio di Android): diverso su ogni dispositivo, senza palette
// pronte e senza sapere niente dei nostri colori. Da qui in poi il selettore è
// nostro (components/ui/color-picker.tsx) e questo file è la sua matematica.
//
// Solo funzioni PURE — nessun DOM, nessuna dipendenza: le prova
// tests/palette-colori.spec.ts senza browser (secondi, mai saltata).

/** `#abc` / `abc` / `#AABBCC` → `#aabbcc`. `null` se non è un colore a 3 o 6 cifre. */
export function normalizeHex(input: string): string | null {
  const s = (input ?? '').trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return '#' + s.split('').map(c => (c + c).toLowerCase()).join('')
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s.toLowerCase()
  return null
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = normalizeHex(hex)
  if (!h) return null
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  }
}

/** Componenti 0-255 → `#rrggbb` (i valori fuori scala vengono riportati dentro). */
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Tonalità 0-360, saturazione e valore 0-1: è lo spazio del selettore (quadrato S/V + barra tinta). */
export function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

/** L'inverso di `hexToHsv`. Il grigio (s=0) resta grigio qualunque sia la tinta. */
export function hsvToHex(h: number, s: number, v: number): string {
  const hh = ((h % 360) + 360) % 360
  const ss = clamp(s, 0, 1)
  const vv = clamp(v, 0, 1)
  const c = vv * ss
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = vv - c
  const seg = Math.floor(hh / 60) % 6
  const [r, g, b] = seg === 0 ? [c, x, 0]
    : seg === 1 ? [x, c, 0]
    : seg === 2 ? [0, c, x]
    : seg === 3 ? [0, x, c]
    : seg === 4 ? [x, 0, c]
    : [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Luminanza relativa WCAG 2.1 (0 = nero, 1 = bianco). */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

/** Rapporto di contrasto WCAG fra due colori (1 = identici, 21 = bianco/nero). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** I due soli colori di testo che usiamo: sono più leggibili di qualunque tinta. */
export const TEXT_ON_LIGHT = '#111111'
export const TEXT_ON_DARK = '#ffffff'

/** Il testo leggibile su uno sfondo: fra i due candidati sceglie quello col contrasto maggiore. */
export function readableTextOn(bg: string): string {
  return contrastRatio(bg, TEXT_ON_LIGHT) >= contrastRatio(bg, TEXT_ON_DARK) ? TEXT_ON_LIGHT : TEXT_ON_DARK
}

/** Sotto questa soglia (WCAG AA per testo normale) il testo si legge male. */
export const MIN_CONTRAST = 4.5

/** true se il testo su quello sfondo è sotto la soglia di leggibilità. */
export function lowContrast(bg: string, text: string): boolean {
  return contrastRatio(bg, text) < MIN_CONTRAST
}
