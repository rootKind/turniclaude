'use client'
/**
 * «PERSONALIZZA LE CARD» — la parte dei COLORI (richiesta 17/09/2026).
 *
 * Due livelli, nello stesso posto:
 *
 *  1. **Palette pronte** (lib/card-palettes.ts): si tocca un template — Pastello,
 *     Fluo, Carta, Notte, Contrasto, Tema — e TUTTE le tipologie prendono la loro
 *     tinta in un colpo (`cardPaletteStore.applyFor`). Prima si poteva solo comporre
 *     a mano, colore per colore, partendo dal tema.
 *
 * UNA CONFIGURAZIONE PER TEMA (richiesta 18/09/2026): quello che si sceglie qui
 * vale SOLO per il tema in cui si sta guardando il pannello (`modo`, da
 * next-themes). Passando all'altro tema i colori sono un'altra configurazione —
 * o quelli del tema, se non se n'è scelta una — perché una tinta leggibile sul
 * chiaro può sparire sullo scuro. È il motivo per cui il pannello dichiara in
 * alto di quale tema sta mostrando le palette.
 *  2. **Colore singolo**: ogni tipologia ha il suo sfondo e il suo testo, e si
 *     aprono nel selettore nostro (`components/ui/color-picker.tsx`) — non più il
 *     selettore del sistema di `<input type="color">`.
 *
 * Il selettore vive DENTRO la riga che si sta modificando (non è un pannello
 * flottante): dentro un dialog i livelli flottanti si pestano i piedi, e sotto il
 * pannello c'è già tutto lo spazio che serve.
 */
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { AlertTriangle, Check, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import {
  PALETTE_PRESETS,
  QUICK_SWATCHES,
  defaultPresetId,
  presetPalette,
  samePalette,
  themePalette,
  themePaletteFor,
  type ThemeMode,
} from '@/lib/card-palettes'
import { lowContrast, readableTextOn } from '@/lib/color'
import { CARD_KINDS, CARD_TINT_CLASS, type CardKind, type CardPalette } from '@/lib/person-cycle'

type Campo = 'bg' | 'text'

interface Props {
  /** Palette corrente dell'utente (dallo store, via useSyncExternalStore). */
  palette: CardPalette
  /** Sostituisce sfondo/testo di UNA tipologia (`null` = torna al tema). */
  setKind: (kind: CardKind, colors: { bg: string; text: string } | null) => void
  /** Applica una palette pronta a TUTTE le tipologie. */
  applyPreset: (colors: CardPalette) => void
  /** Riporta tutto al tema. */
  resetAll: () => void
}

/** Riquadro «anteprima card» di una riga (stessa classe delle card vere). */
function inlineColors(v: { bg: string; text: string } | undefined) {
  return v ? { '--c-bg': v.bg, '--c-text': v.text } as React.CSSProperties : undefined
}

export function CardColorPanel({ palette, setKind, applyPreset, resetAll }: Props) {
  const [editing, setEditing] = useState<{ kind: CardKind; campo: Campo } | null>(null)
  // I colori che le card stanno MOSTRANDO: se l'utente non ha personalizzato
  // niente sono quelli del tema in corso (chiaro → «Tema», scuro → «Notte»,
  // richiesta 17/09/2026), e il pannello deve dirlo — non marcare come «attiva»
  // una palette che sullo schermo non c'è.
  const { resolvedTheme } = useTheme()
  const modo: ThemeMode = resolvedTheme === 'dark' ? 'dark' : 'light'
  const inVigore = Object.keys(palette).length === 0 ? themePaletteFor(modo) : palette
  const predefinito = defaultPresetId(modo)

  const apri = (kind: CardKind, campo: Campo) =>
    setEditing(e => (e && e.kind === kind && e.campo === campo ? null : { kind, campo }))

  // NIENTE contenitore attorno (fragment): le quattro parti devono essere figlie
  // DIRETTE della colonna flex del dialog, perché è la lista delle tipologie a
  // prendersi lo spazio che avanza (`flex-1 min-h-0`). Con un wrapper in mezzo, il
  // wrapper si prendeva l'altezza e la lista restava schiacciata a 10 px.
  return (
    <>
      {/* ── Palette pronte ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 p-2">
        <p className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Palette pronte</span>
          <span className="text-[9px] font-normal normal-case tracking-normal text-muted-foreground/80">
            tema {modo === 'dark' ? 'scuro' : 'chiaro'} · predefinita {modo === 'dark' ? 'Notte' : 'Tema'}
          </span>
        </p>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {PALETTE_PRESETS.map(p => {
            const colors = presetPalette(p.id) ?? themePalette()
            const attiva = samePalette(inVigore, colors)
            const eIlDefault = p.id === predefinito
            const bassi = CARD_KINDS.filter(({ kind }) => lowContrast(colors[kind].bg, colors[kind].text)).length
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { applyPreset(colors); setEditing(null) }}
                aria-pressed={attiva}
                aria-label={`Palette ${p.label}: ${p.hint}`}
                title={`${p.label} — ${p.hint}`}
                className={cn(
                  'flex w-[62px] shrink-0 flex-col items-center gap-0.5 rounded-lg border p-1 transition-colors',
                  attiva ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted',
                )}
              >
                <span className="grid grid-cols-4 gap-px">
                  {CARD_KINDS.map(({ kind }) => (
                    <span
                      key={kind}
                      className="h-2 w-2 rounded-[2px] border border-black/10"
                      style={{ background: colors[kind].bg }}
                    />
                  ))}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] font-semibold leading-none">
                  {p.label}
                  {attiva && <Check size={9} />}
                </span>
                {eIlDefault && (
                  <span className="text-[8px] leading-none text-muted-foreground" title="Senza personalizzazione valgono i colori di questo tema">
                    predefinita
                  </span>
                )}
                {bassi > 0 && p.id !== 'tema' && (
                  <span className="flex items-center gap-0.5 text-[9px] leading-none text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={8} /> {bassi}
                  </span>
                )}
              </button>
            )
          })}
        </div>

      </div>

      {/* ── Una riga per tipologia: sfondo + testo + selettore ─────────────── */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Tipologia</span>
        <span>Riempimento</span>
        <span>Contorno</span>
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {CARD_KINDS.map(({ kind, label, hint }) => {
          const v = palette[kind]
          const debole = !!v && lowContrast(v.bg, v.text)
          const aperto = editing?.kind === kind
          return (
            <div key={kind} className="border-b border-border/40 last:border-0">
              <div className="flex items-center gap-2 py-1.5">
                <span
                  className={cn('cell-day inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold', CARD_TINT_CLASS[kind])}
                  style={inlineColors(v)}
                >
                  M7
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-tight">{label}</span>
                  <span className={cn('block truncate text-[10px] leading-tight', debole ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                    {debole ? 'contrasto basso: si legge male' : hint}
                  </span>
                </span>

                <Swatch
                  label={`${label}: colore sfondo`}
                  colore={v?.bg}
                  attivo={aperto && editing?.campo === 'bg'}
                  onClick={() => apri(kind, 'bg')}
                />
                <Swatch
                  label={`${label}: colore testo`}
                  colore={v?.text}
                  attivo={aperto && editing?.campo === 'text'}
                  onClick={() => apri(kind, 'text')}
                />

                {v ? (
                  <button
                    type="button"
                    onClick={() => { setKind(kind, null); setEditing(null) }}
                    aria-label={`Ripristina ${label}`}
                    title="Ripristina il colore predefinito"
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <RotateCcw size={13} />
                  </button>
                ) : (
                  <span className="w-[26px] shrink-0" aria-hidden />
                )}
              </div>

              {aperto && (
                <div className="pb-2">
                  <ColorPicker
                    value={(editing?.campo === 'text' ? v?.text : v?.bg) ?? '#ffffff'}
                    label={`${label}: ${editing?.campo === 'text' ? 'testo' : 'sfondo'}`}
                    swatches={QUICK_SWATCHES}
                    onAutoText={editing?.campo === 'text'}
                    contrastWith={editing?.campo === 'text' ? (v?.bg ?? '#ffffff') : v?.text}
                    onClear={v ? () => { setKind(kind, null); setEditing(null) } : undefined}
                    onClose={() => setEditing(null)}
                    onChange={hex => {
                      if (editing?.campo !== 'text') {
                        // Scegliendo il FONDO il testo si prende da solo un colore
                        // leggibile: è il novanta per cento dei casi, e comunque si
                        // può cambiare subito dopo.
                        setKind(kind, { bg: hex, text: v?.text && !lowContrast(hex, v.text) ? v.text : readableTextOn(hex) })
                      } else {
                        setKind(kind, { bg: v?.bg ?? '#ffffff', text: hex })
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Button variant="outline" onClick={resetAll} disabled={Object.keys(palette).length === 0}>
        Ripristina i colori di questo tema
      </Button>
    </>
  )
}

/** Pallino-riempimento di una riga: mostra il colore scelto (o il tema, col trattino). */
function Swatch({ label, colore, attivo, onClick }: {
  label: string
  colore: string | undefined
  attivo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={colore ? `${label}: ${colore.toUpperCase()}` : `${label}: colore del tema`}
      aria-pressed={attivo}
      className={cn(
        'relative h-7 w-7 shrink-0 rounded-full border transition-transform hover:scale-105',
        attivo ? 'border-primary ring-2 ring-primary/40' : 'border-border',
      )}
      style={colore ? { background: colore } : undefined}
    >
      {!colore && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded bg-muted-foreground/60" />
      )}
    </button>
  )
}
