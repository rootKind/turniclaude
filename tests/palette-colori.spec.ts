import { test, expect } from '@playwright/test'
import {
  MIN_CONTRAST,
  TEXT_ON_DARK,
  TEXT_ON_LIGHT,
  contrastRatio,
  hexToHsv,
  hsvToHex,
  lowContrast,
  normalizeHex,
  readableTextOn,
} from '../lib/color'
import {
  PALETTE_PRESETS,
  QUICK_SWATCHES,
  defaultPresetId,
  presetPalette,
  samePalette,
  themePalette,
  themePaletteFor,
} from '../lib/card-palettes'
import { CARD_KINDS } from '../lib/person-cycle'

/**
 * I COLORI DELLE CARD, provati sulla LOGICA (richiesta 17/09/2026).
 *
 * Perché qui e non solo nell'app: la matematica dei colori e le palette pronte
 * non hanno bisogno di browser né di dev server, quindi si provano in
 * millisecondi e non si saltano MAI. Quel che resta da vedere nel browser
 * (il pannello che applica davvero i colori) sta in `colori-card.spec.ts`.
 */

test.describe('lib/color: esadecimale, HSV e il giro completo', () => {
  test('normalizeHex accetta 3 cifre, 6 cifre, con o senza #', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('a1b2c3')).toBe('#a1b2c3')
    expect(normalizeHex('  #A1B2C3  ')).toBe('#a1b2c3')
  })

  test('normalizeHex rifiuta quello che non è un colore', () => {
    for (const brutto of ['', '#', '#12', '#12345', '#1234567', 'rosso', '#gggggg', 'rgb(0,0,0)']) {
      expect(normalizeHex(brutto), brutto).toBeNull()
    }
  })

  test('hex → HSV → hex torna al punto di partenza', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff7f', '#123456', '#dbeafe', '#a1b2c3']) {
      const hsv = hexToHsv(hex)!
      expect(hsvToHex(hsv.h, hsv.s, hsv.v), hex).toBe(hex)
    }
  })

  test('i bordi: nero, bianco, grigio e i colori puri', () => {
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
    expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 })
    // Il grigio NON ha tonalità: è il motivo per cui il selettore se la ricorda a parte.
    expect(hexToHsv('#808080')?.s).toBe(0)
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000')
    expect(hsvToHex(120, 1, 1)).toBe('#00ff00')
    expect(hsvToHex(240, 1, 1)).toBe('#0000ff')
  })

  test('la tonalità gira: 360 è 0, e i valori fuori scala rientrano', () => {
    expect(hsvToHex(360, 1, 1)).toBe(hsvToHex(0, 1, 1))
    expect(hsvToHex(-120, 1, 1)).toBe(hsvToHex(240, 1, 1))
    expect(hsvToHex(0, 5, 5)).toBe('#ff0000')
  })
})

test.describe('lib/color: leggibilità del testo', () => {
  test('il contrasto è quello di WCAG: bianco/nero fa 21, un colore con sé stesso 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5)
    // Simmetrico: l'ordine non conta.
    expect(contrastRatio('#123456', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#123456'), 10)
  })

  test('readableTextOn sceglie il testo che si legge, non un colore fisso', () => {
    expect(readableTextOn('#ffffff')).toBe(TEXT_ON_LIGHT)
    expect(readableTextOn('#fef3c7')).toBe(TEXT_ON_LIGHT)
    expect(readableTextOn('#000000')).toBe(TEXT_ON_DARK)
    expect(readableTextOn('#12283f')).toBe(TEXT_ON_DARK)
    // E in ogni caso il testo scelto è leggibile: se non lo fosse, la scelta è sbagliata.
    for (const bg of ['#ffffff', '#000000', '#a855f7', '#7cff3f', '#3a2c12', '#808080']) {
      expect(lowContrast(bg, readableTextOn(bg)), bg).toBe(false)
    }
  })

  test('lowContrast avvisa quando sfondo e testo si somigliano', () => {
    expect(lowContrast('#ffffff', '#f5f5f5')).toBe(true)
    expect(lowContrast('#000000', '#111111')).toBe(true)
    expect(lowContrast('#000000', '#ffffff')).toBe(false)
  })
})

test.describe('lib/card-palettes: le palette pronte', () => {
  test('ogni palette copre TUTTE le tipologie, con colori validi', () => {
    for (const preset of PALETTE_PRESETS) {
      for (const { kind } of CARD_KINDS) {
        const v = preset.colors[kind]
        expect(v, `${preset.id}/${kind}`).toBeTruthy()
        expect(normalizeHex(v.bg), `${preset.id}/${kind} sfondo`).toBe(v.bg)
        expect(normalizeHex(v.text), `${preset.id}/${kind} testo`).toBe(v.text)
      }
      expect(Object.keys(preset.colors)).toHaveLength(CARD_KINDS.length)
    }
  })

  test('sono leggibili: contrasto WCAG AA (tranne il tema, che è dell’app)', () => {
    for (const preset of PALETTE_PRESETS) {
      // `tema` riproduce i colori con cui l'app nasce (mattina e notte stanno a
      // 2.9-3.9): non è una scelta dell'utente e non la ritocchiamo qui.
      const soglia = preset.id === 'tema' ? 2.9 : MIN_CONTRAST
      for (const { kind } of CARD_KINDS) {
        const v = preset.colors[kind]
        expect(
          contrastRatio(v.bg, v.text),
          `${preset.id}/${kind}: ${v.text} su ${v.bg} si legge male`,
        ).toBeGreaterThanOrEqual(soglia)
      }
    }
  })

  test('le tinte rapide sono colori validi e senza doppioni', () => {
    expect(QUICK_SWATCHES.length).toBeGreaterThan(20)
    for (const c of QUICK_SWATCHES) expect(normalizeHex(c), c).toBe(c)
    expect(new Set(QUICK_SWATCHES).size).toBe(QUICK_SWATCHES.length)
  })

  test('presetPalette è una COPIA: chi la modifica non tocca la palette pronta', () => {
    const a = presetPalette('pastello')!
    const b = presetPalette('pastello')!
    a.mattina.bg = '#123456'
    expect(b.mattina.bg).not.toBe('#123456')
    expect(presetPalette('pastello')!.mattina.bg, 'il preset è ancora quello di partenza').toBe('#e3ecff')
    expect(presetPalette('inesistente')).toBeNull()
  })

  test('samePalette riconosce la palette applicata (ed è insensibile alle minuscole)', () => {
    const tema = themePalette()
    expect(samePalette(tema, presetPalette('tema')!)).toBe(true)
    expect(samePalette(tema, presetPalette('fluo')!)).toBe(false)
    expect(samePalette({}, presetPalette('tema')!)).toBe(false)
    expect(samePalette(tema, { ...presetPalette('tema')!, mattina: { bg: '#DBEAFE', text: '#5C729A' } })).toBe(true)
  })

  test('la palette del tema è quella delle card senza personalizzazione', () => {
    // I valori sono quelli di globals.css (--cell-*-bg/text del tema chiaro):
    // cambiano solo se cambia il tema, ed è giusto accorgersene.
    const tema = themePalette()
    expect(tema.pomeriggio).toEqual({ bg: '#fef3c7', text: '#a14a06' })
    expect(tema.absence).toEqual({ bg: '#fbd9d6', text: '#8c2a24' })
    expect(tema.mattina).toEqual({ bg: '#dbeafe', text: '#5c729a' })
  })
})

/**
 * IL DEFAULT SEGUE IL TEMA (richiesta 17/09/2026): con l'app in chiaro le card
 * sono quelle del tema chiaro, con l'app in scuro quelle del tema scuro — e
 * «Notte» NON è una tinta a piacere, sono i colori di globals.css del tema scuro.
 */
test.describe('default per tema: Tema in chiaro, Notte in scuro', () => {
  test('themePaletteFor sceglie la palette del tema in corso', () => {
    expect(themePaletteFor('light')).toEqual(presetPalette('tema'))
    expect(themePaletteFor('dark')).toEqual(presetPalette('notte'))
    expect(themePaletteFor('light')).not.toEqual(themePaletteFor('dark'))
  })

  test('defaultPresetId dice quale palette è già in vigore', () => {
    expect(defaultPresetId('light')).toBe('tema')
    expect(defaultPresetId('dark')).toBe('notte')
  })

  test('«Notte» sono i colori del tema SCURO di globals.css', () => {
    // Se il tema scuro cambia, questi valori cambiano con lui: è il punto.
    const notte = presetPalette('notte')!
    expect(notte.mattina).toEqual({ bg: '#1e3a5f', text: '#9db8dd' })
    expect(notte.pomeriggio).toEqual({ bg: '#3b2300', text: '#d9a86c' })
    expect(notte.notte).toEqual({ bg: '#2d1b69', text: '#c3b4ef' })
    expect(notte.rest).toEqual({ bg: '#24282e', text: '#aeb5bd' })
    expect(notte.availability).toEqual({ bg: '#12303c', text: '#a8d8ea' })
    expect(notte.absence).toEqual({ bg: '#3d1c1a', text: '#fbd9d6' })
    expect(notte.duty).toEqual({ bg: '#16301f', text: '#9fd9b4' })
  })

  test('cambiando tema cambia il default, non quello che l’utente ha scelto', () => {
    // La palette dell'utente è una sola e non dipende dal tema: è il pannello a
    // decidere quale mostrare come «in vigore» quando è vuota.
    const scelta = presetPalette('fluo')!
    expect(samePalette(scelta, themePaletteFor('light'))).toBe(false)
    expect(samePalette(scelta, themePaletteFor('dark'))).toBe(false)
  })
})
