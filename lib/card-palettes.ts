// PALETTE PRONTE per le card di /tuoturno (richiesta 17/09/2026).
//
// Il pannello «Personalizza le card» lasciava scegliere solo colore per colore,
// partendo dal tema: chi voleva un aspetto diverso doveva comporre a mano sette
// sfondi e sette testi. Qui ci sono i «template»: palette complete e coerenti
// (pastello, fluo, carta, notte, contrasto) più quella del TEMA, che è esattamente
// quello che l'app mostra senza personalizzazione. Applicarne una riempie tutti i
// colori, e da lì ogni singola tipologia resta modificabile (è lo stesso store:
// `cardPaletteStore`, in lib/person-cycle.ts).
//
// Solo dati e funzioni pure: le prova tests/palette-colori.spec.ts.
import type { CardKind, CardPalette } from '@/lib/person-cycle'
import { contrastRatio, MIN_CONTRAST } from '@/lib/color'

/** Una palette COMPLETA: un colore { sfondo, testo } per ogni tipologia di card. */
export type FullPalette = Record<CardKind, { bg: string; text: string }>

export interface PalettePreset {
  id: string
  label: string
  hint: string
  colors: FullPalette
}

/**
 * Le palette pronte. L'ordine è quello in cui compaiono nel pannello: prima il
 * tema (il punto di partenza), poi le tinte decise.
 *
 * Sulla leggibilità: tutte queste palette rispettano il contrasto WCAG AA (4.5:1)
 * fra sfondo e testo — la prova lo verifica — tranne `tema` e `notte`, che
 * riproducono i colori con cui l'app nasce nei due temi (se lì il contrasto
 * fosse più basso non starebbe a noi ritoccare l'aspetto di default dietro le
 * spalle dell'utente).
 *
 * «TEMA» E «NOTTE» SONO I DUE TEMI DELL'APP (richiesta 17/09/2026): `tema` sono
 * i colori del tema CHIARO e `notte` quelli del tema SCURO, presi dalle stesse
 * variabili di globals.css (--cell-*-bg/text). Per questo il pannello considera
 * già attivo `tema` con l'app in chiaro e `notte` con l'app in scuro: senza
 * personalizzazione le card SONO così, e mostrarne un'altra come «attiva»
 * sarebbe una bugia. Se il tema cambia, cambia il default — vedi
 * `themePaletteFor`.
 */
export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'tema',
    label: 'Tema',
    hint: 'Il tema chiaro dell’app',
    colors: {
      mattina:      { bg: '#dbeafe', text: '#5c729a' },
      pomeriggio:   { bg: '#fef3c7', text: '#a14a06' },
      notte:        { bg: '#ede9fe', text: '#8f7dd0' },
      rest:         { bg: '#e4e6e9', text: '#4a5057' },
      availability: { bg: '#d6ecf5', text: '#1d5568' },
      absence:      { bg: '#fbd9d6', text: '#8c2a24' },
      duty:         { bg: '#d6f0dd', text: '#1f5a34' },
    },
  },
  {
    id: 'pastello',
    label: 'Pastello',
    hint: 'Tinte chiare e testi scuri',
    colors: {
      mattina:      { bg: '#e3ecff', text: '#2f4f7f' },
      pomeriggio:   { bg: '#ffe9cd', text: '#7a4a12' },
      notte:        { bg: '#ece5ff', text: '#4b3a91' },
      rest:         { bg: '#edeff2', text: '#495158' },
      availability: { bg: '#ddf3f6', text: '#12525a' },
      absence:      { bg: '#ffdfe0', text: '#8f2323' },
      duty:         { bg: '#e2f6e7', text: '#1e6238' },
    },
  },
  {
    id: 'fluo',
    label: 'Fluo',
    hint: 'Neon, massima visibilità',
    colors: {
      mattina:      { bg: '#22d3ff', text: '#08222b' },
      pomeriggio:   { bg: '#ffd400', text: '#3b2c00' },
      notte:        { bg: '#a855f7', text: '#1b0730' },
      rest:         { bg: '#d4ff00', text: '#22300a' },
      availability: { bg: '#00e6a0', text: '#04281c' },
      // Il rosa acceso col testo bianco si fermava a 3.59: con un testo scurissimo
      // resta fluo e supera la soglia di leggibilità (5.29).
      absence:      { bg: '#ff2d6f', text: '#2b0009' },
      duty:         { bg: '#7cff3f', text: '#12300a' },
    },
  },
  {
    id: 'carta',
    label: 'Carta',
    hint: 'Tenui, su carta color panna',
    colors: {
      mattina:      { bg: '#eef1f5', text: '#3c4655' },
      pomeriggio:   { bg: '#f5efe2', text: '#4a3f2f' },
      notte:        { bg: '#f0edf5', text: '#463b58' },
      rest:         { bg: '#f2f2f0', text: '#4a4a45' },
      availability: { bg: '#e9f1f2', text: '#2f4f52' },
      absence:      { bg: '#f7ecec', text: '#6b2f2f' },
      duty:         { bg: '#edf3ee', text: '#33513f' },
    },
  },
  {
    id: 'notte',
    label: 'Notte',
    hint: 'Il tema scuro dell’app',
    // NON è una tinta «a piacere»: sono i colori del tema scuro di globals.css,
    // carattere per carattere. La prova `palette-colori.spec.ts` li confronta con
    // quelli scritti qui, così se il tema scuro cambia ce ne accorgiamo.
    colors: {
      mattina:      { bg: '#1e3a5f', text: '#9db8dd' },
      pomeriggio:   { bg: '#3b2300', text: '#d9a86c' },
      notte:        { bg: '#2d1b69', text: '#c3b4ef' },
      rest:         { bg: '#24282e', text: '#aeb5bd' },
      availability: { bg: '#12303c', text: '#a8d8ea' },
      absence:      { bg: '#3d1c1a', text: '#fbd9d6' },
      duty:         { bg: '#16301f', text: '#9fd9b4' },
    },
  },
  {
    id: 'contrasto',
    label: 'Contrasto',
    hint: 'Bianco e nero, niente sfumature',
    colors: {
      mattina:      { bg: '#000000', text: '#ffffff' },
      pomeriggio:   { bg: '#000000', text: '#ffffff' },
      notte:        { bg: '#000000', text: '#ffffff' },
      rest:         { bg: '#000000', text: '#ffffff' },
      availability: { bg: '#000000', text: '#ffffff' },
      absence:      { bg: '#ffffff', text: '#000000' },
      duty:         { bg: '#000000', text: '#ffffff' },
    },
  },
]

/** La palette pronta con questo id (copia: modificarla non tocca il preset). */
export function presetPalette(id: string): FullPalette | null {
  const preset = PALETTE_PRESETS.find(p => p.id === id)
  if (!preset) return null
  const out = {} as FullPalette
  for (const kind of Object.keys(preset.colors) as CardKind[]) out[kind] = { ...preset.colors[kind] }
  return out
}

/** true se la palette dell'utente è esattamente quella del preset (per il «attivo» nel pannello). */
export function samePalette(a: CardPalette, b: CardPalette): boolean {
  const kinds = new Set<CardKind>([...(Object.keys(a) as CardKind[]), ...(Object.keys(b) as CardKind[])])
  for (const k of kinds) {
    const x = a[k]
    const y = b[k]
    if (!x || !y) return false
    if (x.bg.toLowerCase() !== y.bg.toLowerCase() || x.text.toLowerCase() !== y.text.toLowerCase()) return false
  }
  return true
}

/** La palette del tema CHIARO (id 'tema'): comoda per «torna al tema». */
export function themePalette(): FullPalette {
  return presetPalette('tema') ?? (PALETTE_PRESETS[0].colors as FullPalette)
}

/** I due temi dell'app, come li vede next-themes. */
export type ThemeMode = 'light' | 'dark'

/**
 * I colori che le card MOSTRANO senza personalizzazione: tema chiaro → `tema`,
 * tema scuro → `notte` (richiesta 17/09/2026). Lo usa il pannello per dire quale
 * palette è già in vigore: applicarne una serve solo a volerne un'altra.
 */
export function themePaletteFor(mode: ThemeMode): FullPalette {
  return presetPalette(mode === 'dark' ? 'notte' : 'tema') ?? themePalette()
}

/** L'id del preset che è il default di quel tema (per il distintivo nel pannello). */
export function defaultPresetId(mode: ThemeMode): string {
  return mode === 'dark' ? 'notte' : 'tema'
}

/** Quanti colori di un preset sono sotto la soglia di contrasto (il pannello lo dice). */
export function lowContrastKinds(preset: PalettePreset): CardKind[] {
  return (Object.keys(preset.colors) as CardKind[]).filter(
    k => contrastRatio(preset.colors[k].bg, preset.colors[k].text) < MIN_CONTRAST,
  )
}

/**
 * Tinte rapide del selettore: righe di pastelli, di fluo, poi i fondi scuri e la
 * scala di grigi. Sono «scorciatoie», non preset: cambiano UN colore solo.
 */
export const QUICK_SWATCHES: string[] = [
  // pastelli
  '#dbeafe', '#bfdbfe', '#fef3c7', '#fde68a', '#ede9fe', '#ddd6fe', '#d6f0dd', '#bbf7d0',
  '#fbd9d6', '#fecaca', '#d6ecf5', '#bae6fd', '#e4e6e9', '#f5f5f4', '#fce7f3', '#fbcfe8',
  // fluo
  '#22d3ff', '#00e6a0', '#d4ff00', '#7cff3f', '#ffd400', '#ff8a00', '#ff2d6f', '#a855f7',
  // fondi scuri
  '#0f172a', '#12283f', '#12301f', '#3a2c12', '#241a3a', '#3d1616', '#23262b', '#000000',
  // testi
  '#111111', '#ffffff', '#1d5568', '#8c2a24', '#a14a06', '#4a5057', '#2f4f7f', '#4b3a91',
]
