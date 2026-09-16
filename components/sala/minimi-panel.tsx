'use client'
import { useMemo, useState } from 'react'
import type { DeskCard, SalaLayout, SalaShiftType } from '@/types/database'
import { SALA_SHIFTS, cardKeyOf, defaultSnapshot, nextEntry, snapshotForDay } from '@/lib/sala-minimi'

/**
 * PANNELLO ADMIN «Minimi per card» (richiesta 15/09/2026).
 *
 * Il minimo di persone previste su ogni card, per TURNO, con una DATA DI
 * EFFICACIA e il TURNO da cui comincia a valere (richiesta 16/09/2026): da quel
 * giorno a quel turno in poi la board segnala «scoperto» sulle card che restano
 * sotto il numero. Serve perché il minimo cambia nel tempo — l'8° è a 0 in tutto
 * marzo-aprile, il 9° a 0 nella prima metà di agosto, il 4° di notte scende a 1 —
 * e l'utente non vuole toccare la regola degli scoperti ogni volta. Il turno
 * serve per i cambi a giornata iniziata: «dal 20/9, turno P» lascia la mattina
 * del 20 com'era.
 *
 * I valori di partenza arrivano dalla PIANTINA (doppia → 2, singola → 1) e dalla
 * tabella della notte: aprendo il pannello la prima volta la fotografia è già
 * quella corretta, di solito basta salvare.
 *
 * Accanto a ogni casella c'è quante persone ci sono DAVVERO quel giorno in quel
 * turno (in rosso quando sono sotto): si vede subito dove si buca, senza dover
 * chiudere il pannello e girare i turni a mano.
 */

interface Props {
  cards: DeskCard[]
  layout: Pick<SalaLayout, 'minimums'>
  /** Giorno a schermo sulla board, «YYYY-MM-DD». */
  dayISO: string
  /** Giorno a schermo (1-31), per l'intestazione. */
  day: number
  /** Turno a schermo: è il turno rispetto al quale si dice «in vigore da …». */
  shift?: SalaShiftType
  /** Presenze reali chiave «cardKey|TURNO» → quante ce ne sono il giorno a schermo. */
  reali: Map<string, number>
  onSave: (values: Record<string, number>, from: string, fromShift: SalaShiftType) => Promise<void>
  onClose: () => void
}

const ORDINE_ALLINEA: Record<string, number> = { left: 0, center: 1, right: 2 }

/** Oggi in «YYYY-MM-DD» nel fuso locale (non UTC: la data di validità è quella
 *  che l'admin legge sull'orologio). */
function oggiISO(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function MinimiPanel({ cards, layout, dayISO, day, shift = 'M', reali, onSave, onClose }: Props) {
  const ordinati = useMemo(
    () => [...cards].sort((a, b) =>
      ((a.row ?? 1) * 10 + (ORDINE_ALLINEA[a.align ?? 'left'] ?? 0)) -
      ((b.row ?? 1) * 10 + (ORDINE_ALLINEA[b.align ?? 'left'] ?? 0))),
    [cards],
  )
  const corrente = useMemo(
    () => snapshotForDay(layout, ordinati, dayISO, shift),
    [layout, ordinati, dayISO, shift],
  )
  // La prima voce che deve ANCORA entrare in vigore (giorno/turno a schermo non
  // ancora coperto): serve a dire «qui il minimo parte dal …» invece di far
  // credere che non ce ne sia nessuno (richiesta 16/09/2026).
  const prossima = useMemo(() => nextEntry(layout.minimums, dayISO, shift), [layout.minimums, dayISO, shift])
  const [from, setFrom] = useState(() => oggiISO())
  // Turno da cui la voce comincia a valere (richiesta 16/09/2026): «M» = tutta la
  // giornata, gli altri lasciano i turni precedenti alla voce in vigore prima.
  const [fromShift, setFromShift] = useState<SalaShiftType>('M')
  const [values, setValues] = useState<Record<string, number>>(() => ({ ...corrente.values }))
  const [saving, setSaving] = useState(false)

  const setVal = (key: string, n: number) =>
    setValues(prev => ({ ...prev, [key]: Math.max(0, Math.min(9, Number.isFinite(n) ? n : 0)) }))

  const sporco = useMemo(
    () => SALA_SHIFTS.some(s => ordinati.some(c => values[`${cardKeyOf(c)}|${s}`] !== corrente.values[`${cardKeyOf(c)}|${s}`])),
    [values, corrente, ordinati],
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(values, from, fromShift)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg flex flex-col gap-3 p-5 max-h-[88vh]">
        <div>
          <h2 className="text-sm font-semibold">Minimi per card</h2>
          <p className="text-xs text-muted-foreground">
            Quante persone ogni card deve avere, per turno. Da questo giorno in poi la board
            segnala «scoperto» sulle card che restano sotto.
          </p>
          {corrente.from
            ? <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                In vigore da {corrente.from}{corrente.fromShift && corrente.fromShift !== 'M' ? `, turno ${corrente.fromShift}` : ''}.
              </p>
            : prossima
              ? <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                  Qui non c&apos;è ancora un minimo: la prima voce parte dal {prossima.from}
                  {prossima.fromShift && prossima.fromShift !== 'M' ? `, turno ${prossima.fromShift}` : ''}.
                </p>
              : <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                  Ancora nessun minimo configurato: la regola parte dalla data e dal turno che salvi.
                </p>}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium shrink-0" htmlFor="minimi-from">Valido dal</label>
          <input
            id="minimi-from"
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="px-2 py-1 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary"
          />
          <button
            onClick={() => setValues({ ...defaultSnapshot(ordinati) })}
            className="ml-auto px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
            title="Doppia → 2, singola → 1 in mattina e pomeriggio; tabella dedicata di notte"
          >
            Valori della piantina
          </button>
        </div>

        {/* Turno da cui la voce comincia a valere (richiesta 16/09/2026). */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium shrink-0" id="minimi-dal-turno">Dal turno</span>
          <div className="flex items-center gap-1" role="group" aria-labelledby="minimi-dal-turno">
            {SALA_SHIFTS.map(s => (
              <button
                key={s}
                onClick={() => setFromShift(s)}
                aria-pressed={fromShift === s}
                aria-label={`Turno ${s} di partenza`}
                title={s === 'M'
                  ? 'Da tutta la giornata: la mattina del giorno indicato usa già questi valori'
                  : `Solo dal turno ${s}: i turni precedenti restano quelli della voce in vigore prima`}
                className={`w-7 h-6 rounded-md text-xs font-semibold border transition-colors ${
                  fromShift === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground/80">
            {fromShift === 'M'
              ? 'vale da tutta la giornata'
              : `i turni prima di ${fromShift} di quel giorno restano com'erano`}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          <div className="grid grid-cols-[1fr_repeat(3,2.6rem)] gap-x-1 items-center text-[10px] font-semibold uppercase text-muted-foreground pb-1 sticky top-0 bg-card">
            <span>Card</span>
            <span className="text-center">M</span>
            <span className="text-center">P</span>
            <span className="text-center">N</span>
          </div>
          {ordinati.map(card => {
            const key = cardKeyOf(card)
            return (
              <div key={card.id} className="grid grid-cols-[1fr_repeat(3,2.6rem)] gap-x-1 items-center py-0.5 border-t border-border/40">
                <span className="text-xs truncate pr-1" title={`${card.title} · doppia: ${card.type === 'double' ? 'sì' : 'no'}`}>
                  {card.title}
                  {card.type === 'double' && <span className="text-muted-foreground/60"> · doppia</span>}
                </span>
                {SALA_SHIFTS.map((s: SalaShiftType) => {
                  const k = `${key}|${s}`
                  const v = values[k] ?? 0
                  const reale = reali.get(k) ?? 0
                  const sotto = reale < v
                  return (
                    <div key={s} className="flex flex-col items-center">
                      <input
                        type="number"
                        min={0}
                        max={9}
                        value={v}
                        onChange={e => setVal(k, Number(e.target.value))}
                        aria-label={`${card.title} turno ${s}`}
                        className={`w-full px-1 py-0.5 rounded-md border bg-background text-xs text-center outline-none focus:border-primary ${sotto ? 'border-destructive/50 text-destructive' : 'border-border'}`}
                      />
                      <span className={`text-[9px] leading-none ${sotto ? 'text-destructive' : 'text-muted-foreground/60'}`} title={`Persone reali il ${day}`}>
                        {reale}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-muted-foreground/70">
          Il numero sotto ogni casella sono le persone reali del {day} in quel turno (in rosso
          se sotto il minimo). M e P partono dalla piantina; la notte ha la sua tabella:
          RIC/DCIF/8/9/11/ASTER M3M40 a 0, il 4° a 1, DCCM e DCP a 1.
        </p>

        <div className="flex gap-2 justify-end items-center">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !from}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Salvo…' : sporco ? 'Salva' : 'Conferma'}
          </button>
        </div>
      </div>
    </div>
  )
}
