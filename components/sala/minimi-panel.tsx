'use client'
import { useMemo, useState } from 'react'
import type { DeskCard, SalaLayout, SalaMinimoPeriod, SalaShiftType } from '@/types/database'
import {
  SALA_SHIFTS,
  cardKeyOf,
  coveringPeriod,
  defaultSnapshot,
  nextEntry,
  periodsForCell,
  snapshotForDay,
  withMinimoPeriod,
  withoutMinimoPeriod,
} from '@/lib/sala-minimi'

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
 *
 * DAL 16/09/2026 (sera) ogni casella (sezione × turno) può avere i suoi PERIODI:
 * «la 8° di pomeriggio, dal 15/10 turno P al 30/10 turno N, prevede 0 persone».
 * Un periodo vince sul valore generale, la fine è INCLUSA, e fuori dai periodi
 * di una casella vale il default della piantina — così si dichiara che in quel
 * periodo la sezione è scoperta DA PROGRAMMA senza toccare la regola generale.
 * Più periodi convivono: rileggendo marzo si vede il valore di allora.
 * Si aprono dal titolo della sezione: M/P/N con i loro periodi e «+ periodo».
 */

interface Props {
  cards: DeskCard[]
  layout: Pick<SalaLayout, 'minimums' | 'minimumPeriods'>
  /** Giorno a schermo sulla board, «YYYY-MM-DD». */
  dayISO: string
  /** Giorno a schermo (1-31), per l'intestazione. */
  day: number
  /** Turno a schermo: è il turno rispetto al quale si dice «in vigore da …». */
  shift?: SalaShiftType
  /** Presenze reali chiave «cardKey|TURNO» → quante ce ne sono il giorno a schermo. */
  reali: Map<string, number>
  onSave: (
    values: Record<string, number>,
    from: string,
    fromShift: SalaShiftType,
    periods: SalaMinimoPeriod[],
  ) => Promise<void>
  onClose: () => void
}

const ORDINE_ALLINEA: Record<string, number> = { left: 0, center: 1, right: 2 }

/** Oggi in «YYYY-MM-DD» nel fuso locale (non UTC: la data di validità è quella
 *  che l'admin legge sull'orologio). */
function oggiISO(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

/** «2026-10-15» → «15/10/2026» (le date del pannello si leggono all'italiana). */
function dataBreve(iso: string): string {
  const [y, m, d] = (iso ?? '').split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** «dal 15/10/2026 (M) al 30/10/2026 (N)», o «dal … in corso» senza fine. */
function descriviPeriodo(p: SalaMinimoPeriod): string {
  const da = `${dataBreve(p.from)}${p.fromShift && p.fromShift !== 'M' ? ` t.${p.fromShift}` : ''}`
  if (!p.to) return `dal ${da}, in corso`
  const a = `${dataBreve(p.to)}${p.toShift && p.toShift !== 'N' ? ` t.${p.toShift}` : ''}`
  return `dal ${da} al ${a}`
}

/** Fila di pastiglie M/P/N per scegliere un turno (inizio o fine periodo). */
function PillsTurno({
  value,
  onChange,
  label,
}: {
  value: SalaShiftType
  onChange: (s: SalaShiftType) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      {SALA_SHIFTS.map(s => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          aria-pressed={value === s}
          aria-label={`${label}: ${s}`}
          className={`w-5 h-5 rounded text-[10px] font-semibold border transition-colors ${
            value === s
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  )
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
  const iniziali = useMemo(() => layout.minimumPeriods ?? [], [layout.minimumPeriods])
  const [periods, setPeriods] = useState<SalaMinimoPeriod[]>(() => [...iniziali])
  const [aperta, setAperta] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Bozza del periodo in corso di inserimento: una per volta, legata a UNA casella.
  interface Bozza {
    cardKey: string
    cardTitle: string
    shift: SalaShiftType
    value: number
    from: string
    fromShift: SalaShiftType
    /** Fine facoltativa: vuota = periodo ancora aperto. */
    to: string
    toShift: SalaShiftType
  }
  const [bozza, setBozza] = useState<Bozza | null>(null)

  const setVal = (key: string, n: number) =>
    setValues(prev => ({ ...prev, [key]: Math.max(0, Math.min(9, Number.isFinite(n) ? n : 0)) }))

  const periodiCambiati = useMemo(
    () => JSON.stringify(periods) !== JSON.stringify(iniziali),
    [periods, iniziali],
  )
  const sporco = useMemo(
    () => periodiCambiati || SALA_SHIFTS.some(s => ordinati.some(c => values[`${cardKeyOf(c)}|${s}`] !== corrente.values[`${cardKeyOf(c)}|${s}`])),
    [values, corrente, ordinati, periodiCambiati],
  )

  const apriBozza = (card: DeskCard, s: SalaShiftType) => {
    const key = `${cardKeyOf(card)}|${s}`
    setBozza({
      cardKey: cardKeyOf(card),
      cardTitle: card.title,
      shift: s,
      value: values[key] ?? 0,
      from: oggiISO(),
      fromShift: 'M',
      to: '',
      toShift: 'N',
    })
  }

  const confermaBozza = () => {
    if (!bozza || !bozza.from) return
    if (bozza.to && bozza.to < bozza.from) return
    setPeriods(prev => withMinimoPeriod(prev, {
      card: bozza.cardKey,
      shift: bozza.shift,
      from: bozza.from,
      fromShift: bozza.fromShift,
      ...(bozza.to ? { to: bozza.to, toShift: bozza.toShift } : {}),
      value: Math.max(0, Math.min(9, bozza.value)),
      updated_at: new Date().toISOString(),
    }))
    setBozza(null)
  }

  const eliminaPeriodo = (p: SalaMinimoPeriod) =>
    setPeriods(prev => withoutMinimoPeriod(prev, p.card, p.shift, p.from, p.fromShift))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(values, from, fromShift, periods)
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
          {/* SCOPRIBILITÀ dei PERIODI (25/09/2026): la funzione esisteva dal 16/09 ma
              era invisibile — l'admin chiedeva «minimi per intervallo di tempo» senza
              trovarla. Si apre dal NOME della sezione: vale tra mesi qualsiasi. */}
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Per un INTERVALLO preciso (es. «dal 15/10 al 30/10 questa sezione ha una persona
            in meno»), clicca il nome della sezione qui sotto e usa «+ periodo»: funziona
            anche attraversando due mesi.
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
            const aperti = periodsForCell(periods, key, 'M').length
              + periodsForCell(periods, key, 'P').length
              + periodsForCell(periods, key, 'N').length
            const espansa = aperta === key
            return (
              <div key={card.id} className="border-t border-border/40">
                <div className="grid grid-cols-[1fr_repeat(3,2.6rem)] gap-x-1 items-center py-0.5">
                  <button
                    type="button"
                    onClick={() => { setAperta(espansa ? null : key); setBozza(null) }}
                    aria-expanded={espansa}
                    aria-label={`Periodi ${card.title}`}
                    title={`${card.title} · doppia: ${card.type === 'double' ? 'sì' : 'no'} — apri i periodi delle singole caselle`}
                    className="text-xs truncate pr-1 text-left hover:text-primary transition-colors"
                  >
                    <span className="text-muted-foreground/70">{espansa ? '▾' : '▸'}</span>{' '}
                    {card.title}
                    {card.type === 'double' && <span className="text-muted-foreground/60"> · doppia</span>}
                    {aperti > 0 && <span className="text-primary">{` · ${aperti} ${aperti === 1 ? 'periodo' : 'periodi'}`}</span>}
                  </button>
                  {SALA_SHIFTS.map((s: SalaShiftType) => {
                    const k = `${key}|${s}`
                    const v = values[k] ?? 0
                    const reale = reali.get(k) ?? 0
                    const sotto = reale < v
                    const inVigore = coveringPeriod(periods, key, s, dayISO)
                    return (
                      <div key={s} className="flex flex-col items-center">
                        <input
                          type="number"
                          min={0}
                          max={9}
                          value={v}
                          onChange={e => setVal(k, Number(e.target.value))}
                          aria-label={`${card.title} turno ${s}`}
                          title={inVigore
                            ? `Il ${day} vale il periodo: ${inVigore.value} persone (${descriviPeriodo(inVigore)})`
                            : undefined}
                          className={`w-full px-1 py-0.5 rounded-md border bg-background text-xs text-center outline-none focus:border-primary ${
                            inVigore ? 'border-primary' : sotto ? 'border-destructive/50 text-destructive' : 'border-border'
                          } ${sotto && !inVigore ? 'text-destructive' : ''}`}
                        />
                        <span className={`text-[9px] leading-none ${sotto ? 'text-destructive' : 'text-muted-foreground/60'}`} title={`Persone reali il ${day}`}>
                          {reale}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* PERIODI delle tre caselle della sezione (richiesta 16/09/2026, sera). */}
                {espansa && (
                  <div className="pb-1.5 pt-0.5 flex flex-col gap-1">
                    {SALA_SHIFTS.map(s => {
                      const lista = periodsForCell(periods, key, s)
                      const bozzaQui = bozza && bozza.cardKey === key && bozza.shift === s
                      return (
                        <div key={s} className="rounded-lg border border-border/60 bg-muted/20 px-1.5 py-1 flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold w-3">{s}</span>
                            <div className="flex-1 min-w-0 flex flex-col">
                              {lista.length === 0
                                ? <span className="text-[10px] text-muted-foreground/70">Nessun periodo: vale il valore generale</span>
                                : lista.map(p => (
                                    <span key={`${p.from}-${p.fromShift ?? 'M'}`} className="flex items-center gap-1 text-[10px]">
                                      <span className="font-semibold tabular-nums">{p.value}</span>
                                      <span className="text-muted-foreground truncate">
                                        {p.value === 1 ? 'persona' : 'persone'} {descriviPeriodo(p)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => eliminaPeriodo(p)}
                                        aria-label={`Elimina periodo ${card.title} turno ${s} dal ${p.from}`}
                                        title="Elimina questo periodo"
                                        className="ml-auto shrink-0 w-4 h-4 rounded text-muted-foreground hover:text-destructive hover:bg-muted leading-none"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => (bozzaQui ? setBozza(null) : apriBozza(card, s))}
                              aria-label={`Aggiungi periodo ${card.title} turno ${s}`}
                              className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              {bozzaQui ? 'Annulla' : '+ periodo'}
                            </button>
                          </div>

                          {bozzaQui && bozza && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <input
                                  type="number"
                                  min={0}
                                  max={9}
                                  value={bozza.value}
                                  onChange={e => setBozza({ ...bozza, value: Number(e.target.value) })}
                                  aria-label={`Valore periodo ${card.title} turno ${s}`}
                                  className="w-10 px-1 py-0.5 rounded border border-border bg-background text-xs text-center outline-none focus:border-primary"
                                />
                                persone
                              </label>
                              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                dal
                                <input
                                  type="date"
                                  value={bozza.from}
                                  onChange={e => setBozza({ ...bozza, from: e.target.value })}
                                  aria-label={`Inizio periodo ${card.title} turno ${s}`}
                                  className="px-1 py-0.5 rounded border border-border bg-background text-[11px] outline-none focus:border-primary"
                                />
                                <PillsTurno
                                  value={bozza.fromShift}
                                  onChange={fs => setBozza({ ...bozza, fromShift: fs })}
                                  label={`Turno inizio periodo ${card.title} turno ${s}`}
                                />
                              </label>
                              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                al
                                <input
                                  type="date"
                                  value={bozza.to}
                                  onChange={e => setBozza({ ...bozza, to: e.target.value })}
                                  aria-label={`Fine periodo ${card.title} turno ${s}`}
                                  className="px-1 py-0.5 rounded border border-border bg-background text-[11px] outline-none focus:border-primary"
                                />
                                <PillsTurno
                                  value={bozza.toShift}
                                  onChange={ts => setBozza({ ...bozza, toShift: ts })}
                                  label={`Turno fine periodo ${card.title} turno ${s}`}
                                />
                              </label>
                              <span className="text-[10px] text-muted-foreground/70">(vuoto = in corso)</span>
                              <button
                                type="button"
                                onClick={confermaBozza}
                                disabled={!bozza.from || (!!bozza.to && bozza.to < bozza.from)}
                                aria-label={`Conferma periodo ${card.title} turno ${s}`}
                                className="ml-auto px-2 py-0.5 rounded text-[10px] font-semibold bg-primary text-primary-foreground disabled:opacity-40"
                              >
                                Aggiungi
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <p className="text-[10px] text-muted-foreground/70">
                      Dentro un periodo vale il numero del periodo (fine INCLUSA); fuori, il valore
                      generale di sopra. Un periodo a 0 dichiara la sezione scoperta da programma.
                    </p>
                  </div>
                )}
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
