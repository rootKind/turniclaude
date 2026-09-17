'use client'
/**
 * SELETTORE DI COLORI NOSTRO (richiesta 17/09/2026).
 *
 * Prima il pannello «Personalizza le card» di /tuoturno usava
 * `<input type="color">`: apre il selettore del SISTEMA — finestra di Windows,
 * cerchio di Android, sheet di iOS — quindi diverso su ogni dispositivo, senza
 * tinte pronte e senza nessuna scorciatoia. Qui il selettore è nostro e uguale
 * ovunque: quadrato saturazione/luminosità, barra della tonalità, campo
 * esadecimale e una griglia di tinte rapide.
 *
 * Non usa nessuna libreria: due `div` con i gradienti e i puntatori (mouse e
 * touch, `touch-none` per non far scorrere la pagina mentre si trascina).
 * La matematica sta in lib/color.ts — funzioni pure, provate senza browser.
 *
 * Accessibilità: il quadrato e la barra rispondono anche alle FRECCE (senza
 * puntatore restavano irraggiungibili), e ogni comando ha il suo `aria-label`
 * che parte dall'etichetta passata dal chiamante («Pomeriggio: sfondo»).
 */
import { useRef, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { contrastRatio, hexToHsv, hsvToHex, lowContrast, normalizeHex, readableTextOn } from '@/lib/color'

interface Props {
  /** Colore corrente (`#rrggbb`). */
  value: string
  onChange: (hex: string) => void
  /** Etichetta accessibile, es. «Pomeriggio (P): sfondo». */
  label: string
  /** Tinte rapide: cambiano UN colore, non sono palette pronte. */
  swatches?: string[]
  /** Azione «testo leggibile» (ha senso solo sul colore del testo). */
  onAutoText?: boolean
  /** «Ripristina il colore predefinito»: presente solo se il colore è personalizzato. */
  onClear?: () => void
  /** Colore con cui questo deve convivere (sfondo ↔ testo): serve per l'avviso di contrasto. */
  contrastWith?: string
  /** Chiude il selettore (senza cambiare nulla). */
  onClose?: () => void
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function ColorPicker({ value, onChange, label, swatches = [], onAutoText, onClear, contrastWith, onClose }: Props) {
  const canonico = hexToHsv(normalizeHex(value) ?? '#ffffff') ?? { h: 0, s: 0, v: 0 }
  /**
   * Tutto ciò che si vede deriva dal `value` (il colore è del chiamante, non
   * nostro): niente stato copiato e niente `useEffect` che lo riallinea — il
   * lint del progetto lo vieta, e un colore cambiato da fuori (una palette
   * pronta, «testo leggibile», un ripristino) si vede subito.
   *
   * Restano due soli stati locali, e sono quelli che il colore NON può portarsi
   * dietro da solo:
   *  · la TONALITÀ di un grigio: da `#808080` non si sa quale tinta avesse, e
   *    senza ricordarla la barra tornerebbe al rosso mentre si trascina a
   *    saturazione zero (si usa solo finché la saturazione è zero);
   *  · il testo scritto a mano nel campo esadecimale, mentre lo si digita.
   */
  const [hueGrigio, setHueGrigio] = useState(canonico.h)
  const [draft, setDraft] = useState<string | null>(null)
  const hsv = { h: canonico.s === 0 ? hueGrigio : canonico.h, s: canonico.s, v: canonico.v }
  const svRef = useRef<HTMLDivElement | null>(null)
  const hueRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)

  const current = hsvToHex(hsv.h, hsv.s, hsv.v)

  const commit = (next: { h: number; s: number; v: number }) => {
    setHueGrigio(next.h)
    setDraft(null)
    onChange(hsvToHex(next.h, next.s, next.v))
  }

  const daPunto = (clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    commit({ ...hsv, s: clamp01((clientX - r.left) / r.width), v: 1 - clamp01((clientY - r.top) / r.height) })
  }
  const daTinta = (clientX: number) => {
    const el = hueRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    commit({ ...hsv, h: clamp01((clientX - r.left) / r.width) * 359 })
  }

  /** Testo scritto a mano: si applica con Invio o uscendo dal campo; se non è un colore, si torna all'ultimo buono. */
  const commettiDraft = () => {
    const n = normalizeHex(draft ?? '')
    setDraft(null)
    if (!n) return
    const h = hexToHsv(n)
    if (h) setHueGrigio(h.h)
    onChange(n)
  }

  return (
    <div
      data-testid="color-picker"
      data-hex={current}
      className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-2"
    >
      <div className="flex items-center gap-2">
        <span className="h-6 w-6 shrink-0 rounded-full border border-border" style={{ background: current }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{label}</span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{current.toUpperCase()}</span>
      </div>

      {/* Quadrato saturazione (orizzontale) / luminosità (verticale) */}
      <div
        ref={svRef}
        role="slider"
        tabIndex={0}
        aria-label={`${label}: saturazione e luminosità`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.v * 100)}
        className="relative h-28 w-full cursor-crosshair touch-none rounded-lg border border-border/60 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        style={{
          background:
            `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${Math.round(hsv.h)} 100% 50%))`,
        }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          daPunto(e.clientX, e.clientY)
        }}
        onPointerMove={e => {
          if (dragging.current) daPunto(e.clientX, e.clientY)
        }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
        onKeyDown={e => {
          const passo = e.shiftKey ? 0.1 : 0.02
          if (e.key === 'ArrowLeft') commit({ ...hsv, s: clamp01(hsv.s - passo) })
          else if (e.key === 'ArrowRight') commit({ ...hsv, s: clamp01(hsv.s + passo) })
          else if (e.key === 'ArrowUp') commit({ ...hsv, v: clamp01(hsv.v + passo) })
          else if (e.key === 'ArrowDown') commit({ ...hsv, v: clamp01(hsv.v - passo) })
          else return
          e.preventDefault()
        }}
      >
        <span
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/40"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }}
        />
      </div>

      {/* Barra della tonalità */}
      <div
        ref={hueRef}
        role="slider"
        tabIndex={0}
        aria-label={`${label}: tonalità`}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hsv.h)}
        className="relative h-4 w-full cursor-pointer touch-none rounded-full border border-border/60 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          daTinta(e.clientX)
        }}
        onPointerMove={e => {
          if (dragging.current) daTinta(e.clientX)
        }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
        onKeyDown={e => {
          const passo = e.shiftKey ? 15 : 3
          if (e.key === 'ArrowLeft') commit({ ...hsv, h: (hsv.h - passo + 360) % 360 })
          else if (e.key === 'ArrowRight') commit({ ...hsv, h: (hsv.h + passo) % 360 })
          else return
          e.preventDefault()
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/40"
          style={{ left: `${(hsv.h / 359) * 100}%`, background: hsvToHex(hsv.h, 1, 1) }}
        />
      </div>

      {swatches.length > 0 && (
        <div className="grid grid-cols-8 gap-1">
          {swatches.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => {
                const h = hexToHsv(c)
                if (h) setHueGrigio(h.h)
                setDraft(null)
                onChange(c)
              }}
              aria-label={`${label}: tinta rapida ${c}`}
              title={c}
              className={cn(
                'h-5 w-full rounded-md border transition-transform hover:scale-110',
                current.toLowerCase() === c.toLowerCase() ? 'border-foreground ring-1 ring-foreground' : 'border-black/20',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          value={(draft ?? current).replace(/^#/, '').toUpperCase()}
          onChange={e => setDraft(e.target.value)}
          onBlur={commettiDraft}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commettiDraft() }
          }}
          aria-label={`${label}: codice esadecimale`}
          spellCheck={false}
          autoComplete="off"
          className="h-8 w-28 font-mono text-xs uppercase"
        />
        {onAutoText && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-[11px]"
            onClick={() => onChange(readableTextOn(contrastWith ?? '#ffffff'))}
          >
            <Check size={12} /> Testo leggibile
          </Button>
        )}
        {onClear && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={onClear}>
            <RotateCcw size={12} /> Predefinito
          </Button>
        )}
        {onClose && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto h-8 text-[11px]" onClick={onClose}>
            Chiudi
          </Button>
        )}
      </div>

      {/* Avviso di leggibilità: sfondo e testo si vedono insieme, qui si dice se si leggono */}
      {contrastWith && lowContrast(contrastWith, current) && (
        <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          Contrasto basso ({contrastRatio(contrastWith, current).toFixed(1)}:1): il testo così si legge male.
        </p>
      )}
    </div>
  )
}
