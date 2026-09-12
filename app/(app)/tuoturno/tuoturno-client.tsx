'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSalaSchedule } from '@/lib/queries/sala-schedule'
import { buildDuplicateCognomi, cn } from '@/lib/utils'
import {
  findMemberForUser,
  isWorkToken,
  realShiftFor,
  realTheoreticalMismatch,
  theoreticalTokenFor,
  tokenLabel,
} from '@/lib/person-shift'
import {
  decodeSalaMonth,
  findMonthPerson,
  personDayShift,
  salaCodeInfo,
  type PersonDayShift,
  type SalaCodeKind,
} from '@/lib/sala-month'
import type { DaySchedule, SalaSchedule, ShiftTeamTree } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]
const WEEKDAYS = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM']

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Offset della prima cella con settimana che inizia di lunedì. */
function firstWeekdayOffset(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return (new Date(y, m - 1, 1).getDay() + 6) % 7
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_IT[m - 1]} ${y}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Fallback per i mesi salvati nel vecchio formato (senza codici completi e
 * senza celle gialle): si ricava il turno dalle sezioni del giorno.
 */
function legacyRealShift(
  day: DaySchedule | undefined,
  user: UserOption | null,
  duplicateCognomi: Set<string>,
): PersonDayShift | null {
  const info = realShiftFor(day, user, duplicateCognomi)
  if (!info) return null
  if (info.token) return { kind: 'work', label: 'Turno', short: info.token, pending: false }
  if (info.presentNoSection) return { kind: 'duty', label: 'Presente senza sezione', short: '•', pending: false }
  return null
}

/**
 * Tinta della card (variante E): il colore segue il tipo di turno, così il mese
 * si legge come una fascia di turni a colpo d'occhio.
 */
function cellTintClass(kind: SalaCodeKind, token: string): string {
  switch (kind) {
    case 'work':
      if (token[0] === 'M') return 'cell-tint-m'
      if (token[0] === 'P') return 'cell-tint-p'
      if (token[0] === 'N') return 'cell-tint-n'
      return 'cell-tint-duty'
    case 'rest':
      return 'cell-tint-rest'
    case 'availability':
      return 'cell-tint-avail'
    case 'absence':
      return 'cell-tint-abs'
    case 'duty':
    case 'other':
      return 'cell-tint-duty'
    default:
      return 'cell-tint-empty'
  }
}

/** Codice compatto: «M7S» → «M7» (lo slot non serve nella vista personale). */
function displayToken(token: string): string {
  return isWorkToken(token) ? tokenLabel(token) : token
}

/** Tinte della legenda della variante E. */
const TINT_LEGEND: { cls: string; code: string; label: string }[] = [
  { cls: 'cell-tint-p', code: 'P', label: 'pomeriggio' },
  { cls: 'cell-tint-m', code: 'M', label: 'mattina' },
  { cls: 'cell-tint-n', code: 'N', label: 'notte' },
  { cls: 'cell-tint-rest', code: 'RR', label: 'riposo' },
  { cls: 'cell-tint-avail', code: 'D', label: 'disponibilità' },
  { cls: 'cell-tint-abs', code: 'A', label: 'assenza' },
  { cls: 'cell-tint-duty', code: 'Sp', label: 'senza sezione' },
]

// ─── confronto fra più dipendenti ────────────────────────────────────────────

/** Altezza/larghezza di una cella del confronto (una cifra corta come «M10S» ci sta). */
const CMP_COL = 'w-[34px] h-[34px]'
const CMP_ROW_H = 36       // cella + gap fra le righe
const CMP_HEAD_H = 26      // intestazione con i numeri dei giorni
const CMP_CHROME_H = 300   // header pagina + nav mese + legenda + bottom nav (stima)
const CMP_MAX_PEOPLE = 8   // oltre, la tabella diventa illeggibile (e pesante)

/** Altezza finestra, senza setState in effect (e senza mismatch in SSR). */
function subscribeResize(callback: () => void) {
  window.addEventListener('resize', callback)
  return () => window.removeEventListener('resize', callback)
}

/** Divide 1..totalDays in blocchi contigui, uno per «riga» della tabella. */
function splitDays(totalDays: number, segments: number): number[][] {
  const per = Math.max(1, Math.ceil(totalDays / segments))
  const chunks: number[][] = []
  for (let start = 1; start <= totalDays; start += per) {
    chunks.push(Array.from({ length: Math.min(per, totalDays - start + 1) }, (_, i) => start + i))
  }
  return chunks
}

interface CompareDay {
  kind: SalaCodeKind
  token: string
  label: string
  mismatch: boolean
  pending: boolean
  theoLabel: string
}

interface CompareRow {
  id: string
  name: string
  cells: CompareDay[]
}

/** Cella di confronto di UNA persona in UN giorno: stessa lettura della griglia. */
function buildCompareDay(real: PersonDayShift | null, theo: string, hasTheoretical: boolean): CompareDay {
  const kind: SalaCodeKind = real ? real.kind : theo ? salaCodeInfo(theo).kind : 'empty'
  return {
    kind,
    token: real ? real.short : theo,
    label: real ? displayToken(real.short) : theo ? displayToken(theo) : '—',
    mismatch: !!(real && hasTheoretical && theo && realTheoreticalMismatch(real.short, theo)),
    pending: !!(real?.pending && !(real && hasTheoretical && theo && realTheoreticalMismatch(real.short, theo))),
    theoLabel: theo ? tokenLabel(theo) : '',
  }
}

/**
 * Tabella di confronto: una riga per dipendente, giorni in orizzontale (scroll
 * laterale se servono più colonne di quelle che stanno nello schermo). Il mese
 * viene spezzato in più blocchi quando l'altezza del dispositivo lo consente,
 * così si evita di scorrere: con 2 soli dipendenti e uno schermo alto l'intero
 * mese sta in 3-4 blocchi senza scroll.
 */
function CompareTable({ rows, chunks, month, todayISO }: {
  rows: CompareRow[]
  chunks: number[][]
  month: string
  todayISO: string
}) {
  return (
    <div className="overflow-x-auto -mx-3 px-3 pb-1">
      <div className="min-w-max">
        {chunks.map((days, ci) => (
          <div key={ci} className={cn(ci > 0 && 'mt-3')}>
            <div className="flex items-end">
              <div className="sticky left-0 z-20 w-[64px] shrink-0 bg-background" />
              {days.map(d => {
                const dateISO = `${month}-${String(d).padStart(2, '0')}`
                const wd = WEEKDAYS[(firstWeekdayOffset(month) + d - 1) % 7]
                const isToday = dateISO === todayISO
                return (
                  <div key={d} className="w-[34px] shrink-0 pb-1 text-center leading-none">
                    <span className={cn('block text-[9px] font-semibold text-muted-foreground', isToday && 'text-primary')}>
                      {wd.slice(0, 3)}
                    </span>
                    <span className={cn('block text-[11px] font-bold tabular-nums', isToday && 'text-primary')}>{d}</span>
                  </div>
                )
              })}
            </div>

            {rows.map(r => (
              <div key={r.id} className="flex items-center py-[1px]">
                <div className="sticky left-0 z-10 w-[64px] shrink-0 bg-background pr-1" title={r.name}>
                  <span className="block truncate text-[11px] font-semibold leading-tight">{r.name}</span>
                </div>
                {days.map(d => {
                  const c = r.cells[d - 1]
                  if (!c) return <div key={d} className={cn(CMP_COL, 'shrink-0')} />
                  const dateISO = `${month}-${String(d).padStart(2, '0')}`
                  const title = `${r.name} · ${dateISO} — ${c.label}`
                    + (c.pending ? ' · da confermare' : '')
                    + (c.mismatch ? ` · teorico: ${c.theoLabel}` : '')
                  return (
                    <div
                      key={d}
                      title={title}
                      className={cn(
                        'cell-day shrink-0 rounded-lg flex flex-col items-center justify-center text-center',
                        CMP_COL,
                        cellTintClass(c.kind, c.token),
                        !c.mismatch && c.pending && 'is-pend',
                        dateISO === todayISO && 'is-today',
                      )}
                    >
                      {c.mismatch && c.theoLabel && (
                        <span className="text-[8px] font-semibold leading-none line-through opacity-60">
                          {c.theoLabel}
                        </span>
                      )}
                      <span className="text-[10px] font-bold leading-none">{c.label}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export interface UserOption {
  id: string
  nome: string | null
  cognome: string | null
}

interface Props {
  currentUserId: string
  profile: UserOption | null
  users: UserOption[]
  uploadedMonths: string[]
  tree: ShiftTeamTree | null
  initialMonth: string
}

export function TuoTurnoClient({ currentUserId, profile, users, uploadedMonths, tree, initialMonth }: Props) {
  const [selectedUserId, setSelectedUserId] = useState(currentUserId)
  const [month, setMonth] = useState(initialMonth)
  const [schedules, setSchedules] = useState<Record<string, SalaSchedule | null>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Confronto fra più dipendenti: `compareIds` è la selezione attiva, `compareDraft`
  // quella che si sta compilando nel popup.
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareDraft, setCompareDraft] = useState<string[]>([])
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const duplicateCognomi = useMemo(() => buildDuplicateCognomi(users), [users])
  const uploaded = useMemo(() => new Set(uploadedMonths), [uploadedMonths])
  const isRealMonth = uploaded.has(month)

  const selectedUser = useMemo(
    () => users.find(u => u.id === selectedUserId) ?? profile ?? null,
    [users, selectedUserId, profile],
  )
  const displayName = selectedUser
    ? [selectedUser.cognome, selectedUser.nome].filter(Boolean).join(' ')
    : '—'

  // I mesi caricati dai PDF si leggono dal DB (una volta per mese).
  useEffect(() => {
    if (!uploaded.has(month) || month in schedules) return
    let cancelled = false
    getSalaSchedule(createClient(), month)
      .then(data => { if (!cancelled) setSchedules(prev => ({ ...prev, [month]: data })) })
      .catch(() => { if (!cancelled) setSchedules(prev => ({ ...prev, [month]: null })) })
    return () => { cancelled = true }
  }, [month, uploaded, schedules])

  const realSchedule = isRealMonth ? schedules[month] : null
  const loadingReal = isRealMonth && !(month in schedules)
  const today = todayISO()
  const totalDays = daysInMonth(month)

  // Formato compatto v2: codici completi per persona (assenze incluse) + celle
  // gialle «da confermare». Senza data si ricade sulle sezioni del giorno.
  const realPeople = useMemo(
    () => (realSchedule?.data ? decodeSalaMonth(realSchedule.data) : null),
    [realSchedule],
  )
  const realPerson = useMemo(
    () => (realPeople ? findMonthPerson(realPeople, selectedUser, duplicateCognomi) : null),
    [realPeople, selectedUser, duplicateCognomi],
  )
  const realShiftOfDay = (d: number): PersonDayShift | null => {
    if (!isRealMonth) return null
    if (realPerson) return personDayShift(realPerson, d)
    return legacyRealShift(realSchedule?.schedule?.[d], selectedUser, duplicateCognomi)
  }

  const hasTheoretical = useMemo(
    () => !!findMemberForUser(tree, selectedUser, duplicateCognomi),
    [tree, selectedUser, duplicateCognomi],
  )

  // ── confronto fra più dipendenti ──────────────────────────────────────────
  const viewportHeight = useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 700)
  const comparing = compareIds.length >= 2
  const comparePeople = useMemo(
    () => compareIds.map(id => users.find(u => u.id === id)).filter((u): u is UserOption => !!u),
    [compareIds, users],
  )
  const compareRows = useMemo<CompareRow[]>(() => {
    if (!comparing) return []
    return comparePeople.map(u => {
      const person = realPeople ? findMonthPerson(realPeople, u, duplicateCognomi) : null
      const hasTheo = !!findMemberForUser(tree, u, duplicateCognomi)
      const cells = Array.from({ length: totalDays }, (_, i) => {
        const d = i + 1
        const dateISO = `${month}-${String(d).padStart(2, '0')}`
        const real: PersonDayShift | null = !isRealMonth
          ? null
          : person
            ? personDayShift(person, d)
            : legacyRealShift(realSchedule?.schedule?.[d], u, duplicateCognomi)
        const theo = theoreticalTokenFor(tree, u, dateISO, duplicateCognomi)
        return buildCompareDay(real, theo, hasTheo)
      })
      return { id: u.id, name: [u.cognome, u.nome].filter(Boolean).join(' '), cells }
    })
  }, [comparing, comparePeople, realPeople, tree, duplicateCognomi, totalDays, month, isRealMonth, realSchedule])

  // Quanti blocchi di giorni per riga: più ne stanno in altezza, meno si scorre
  // in orizzontale — con 2 dipendenti e uno schermo alto il mese sta tutto in 3-4 blocchi.
  const compareChunks = useMemo(() => {
    if (!comparing) return []
    const perBlock = compareRows.length * CMP_ROW_H + CMP_HEAD_H
    const available = Math.max(150, viewportHeight - CMP_CHROME_H)
    const maxByHeight = Math.max(1, Math.min(4, Math.floor(available / perBlock)))
    return splitDays(totalDays, Math.min(maxByHeight, Math.ceil(totalDays / 7)))
  }, [comparing, compareRows.length, viewportHeight, totalDays])

  const goPrev = () => setMonth(m => addMonths(m, -1))
  const goNext = () => setMonth(m => addMonths(m, 1))

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) goNext()
    else goPrev()
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...users].sort((a, b) => (a.cognome ?? '').localeCompare(b.cognome ?? ''))
    if (!q) return list
    return list.filter(u => `${u.cognome ?? ''} ${u.nome ?? ''}`.toLowerCase().includes(q))
  }, [users, query])

  const toggleCompare = (id: string) => {
    setCompareDraft(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length >= CMP_MAX_PEOPLE ? prev : [...prev, id])
  }
  // Sotto i 2 dipendenti il confronto non ha senso: il pulsante chiude la vista.
  const confirmCompare = () => {
    setCompareIds(compareDraft.length >= 2 ? compareDraft : [])
    setCompareOpen(false)
  }

  return (
    <main className="max-w-lg mx-auto px-3 pt-6 pb-4">
      {/* Intestazione: tocca il nome per cambiare persona, o «Confronta» per più dipendenti */}
      <div className="mb-4 mr-14 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-snug">Il tuo turno</h1>
          {comparing ? (
            <p className="mt-0.5 truncate text-base text-muted-foreground">
              <span className="font-semibold text-foreground">Confronto fra {comparePeople.length}</span> dipendenti
            </p>
          ) : (
            <button
              onClick={() => { setQuery(''); setPickerOpen(true) }}
              className="mt-0.5 inline-flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Scegli di chi vedere i turni"
            >
              <span className="font-semibold text-foreground">{displayName}</span>
              <ChevronDown size={16} />
            </button>
          )}
        </div>
        <button
          onClick={() => { setCompareDraft(compareIds); setQuery(''); setCompareOpen(true) }}
          aria-label={comparing ? 'Modifica il confronto' : 'Confronta i turni di più dipendenti'}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors',
            comparing
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Users size={14} />
          {comparing ? 'Modifica' : 'Confronta'}
        </button>
      </div>

      {/* Navigazione mese */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goPrev}
          aria-label="Mese precedente"
          className="p-2 rounded-xl border border-border/60 hover:bg-muted transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="text-lg font-semibold leading-tight">{formatMonthLabel(month)}</p>
          <p className={cn('text-[11px] leading-tight', isRealMonth ? 'text-primary' : 'text-muted-foreground')}>
            {isRealMonth
              ? (loadingReal ? 'caricamento…' : 'turni reali (PDF)')
              : 'turni teorici'}
          </p>
        </div>
        <button
          onClick={goNext}
          aria-label="Mese successivo"
          className="p-2 rounded-xl border border-border/60 hover:bg-muted transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {comparing ? (
        loadingReal ? (
          // Il PDF del mese sta arrivando: righe skeleton, come le altre pagine.
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: Math.min(comparePeople.length * 2, 8) }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <CompareTable rows={compareRows} chunks={compareChunks} month={month} todayISO={today} />
        )
      ) : (
        <>
          {/* Settimana */}
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAYS.map(w => (
              <span key={w} className="text-center text-[11px] font-semibold text-muted-foreground">{w}</span>
            ))}
          </div>

          {/* Giorni — swipe orizzontale per cambiare mese */}
          <div
            className="grid grid-cols-7 gap-1.5 select-none"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {loadingReal ? (
              // Il PDF del mese sta arrivando: celle skeleton SOLO per i giorni reali,
              // come le card vuote di coda (il mese può non iniziare di lunedì).
              Array.from({ length: totalDays }).map((_, i) => (
                <Skeleton key={`sk-${i}`} className="h-[76px] w-full rounded-xl" />
              ))
            ) : (
              <>
                {/* Niente card vuote PRIMA del giorno 1: le celle scartate del lunedì
                    lasciano la griglia allineata da sola (coerente con i vuoti di coda,
                    che non vengono generati a fine mese). */}
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
                  const dateISO = `${month}-${String(d).padStart(2, '0')}`
                  const real = realShiftOfDay(d)
                  const theo = theoreticalTokenFor(tree, selectedUser, dateISO, duplicateCognomi)
                  const isToday = dateISO === today
                  // In evidenza c'è il reale del PDF; se manca, il teorico.
                  const primaryKind: SalaCodeKind = real
                    ? real.kind
                    : theo ? salaCodeInfo(theo).kind : 'empty'
                  const primaryToken = real ? real.short : theo
                  const primaryLabel = real
                    ? displayToken(real.short)
                    : theo ? displayToken(theo) : '—'
                  // Un reale diverso dal teorico (anche solo per sezione) va notato subito.
                  const mismatch = !!(real && hasTheoretical && theo && realTheoreticalMismatch(real.short, theo))
                  // Evidenziazione UNICA per card: l'anello ambra «da confermare» vince
                  // sulla condizione «diverso dal teorico» (solo barrato + tooltip).
                  const showPending = !!real?.pending && !mismatch

                  const realLabel = real ? (real.kind === 'work' ? tokenLabel(real.short) : `${real.label} (${real.short})`) : 'nessun turno'
                  const theoLabel = theo ? tokenLabel(theo) : 'nessun turno'
                  const pendingLabel = real?.pending ? ' · da confermare' : ''
                  const cellTitle = isRealMonth
                    ? `${dateISO} — reale: ${realLabel}${pendingLabel} · teorico: ${theoLabel}${mismatch ? ' (diversi)' : ''}`
                    : `${dateISO} — teorico: ${theoLabel}`

                  return (
                    <div
                      key={d}
                      title={cellTitle}
                      className={cn(
                        'cell-day rounded-xl min-h-[76px] px-0.5 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center',
                        cellTintClass(primaryKind, primaryToken),
                        !mismatch && showPending && 'is-pend',
                        isToday && 'is-today',
                      )}
                    >
                      <span className="text-[14px] font-extrabold leading-none tracking-tight tabular-nums">{d}</span>
                      {mismatch && theo && (
                        <span className="text-[10px] font-semibold leading-none line-through opacity-60">
                          {displayToken(theo)}
                        </span>
                      )}
                      <span className="text-[11px] font-bold leading-tight">{primaryLabel}</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </>
      )}

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {TINT_LEGEND.map(({ cls, code, label }) => (
          <span key={code} className="inline-flex items-center gap-1.5">
            <span className={cn('cell-day rounded px-1.5 py-0.5 text-[11px] font-bold leading-none', cls)}>
              {code}
            </span>
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="cell-day is-pend rounded px-1.5 py-0.5 text-[11px] font-bold leading-none">M4</span>
          da confermare
        </span>
      </div>

      {comparing ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          <b>Una riga per dipendente</b>, i giorni in orizzontale con giorno della settimana e numero.
          Il codice è il <b>reale</b> del PDF (o il <b>teorico</b>, se il reale manca); quando i due
          differiscono il teorico compare <b>barrato</b> e sta nel tooltip, mentre l&apos;<b>anello
          ambra</b> segna i turni <b>da confermare</b> (sfondo giallo sul PDF). Con pochi dipendenti il mese
          viene spezzato in più blocchi per non farti scorrere; altrimenti scorri la tabella in
          orizzontale. Il mese si cambia con le frecce ‹ › (in confronto lo swipe è disattivato).
        </p>
      ) : isRealMonth ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          <b>L&apos;intera card è tinta dal turno</b>: azzurro pomeriggio, rosa mattina, lilla notte,
          grigio riposi, rosso assenze, verde attività senza sezione. Il codice in evidenza è il{' '}
          <b>reale</b> del PDF; se il reale manca compare il <b>teorico</b>. Quando i due
          differiscono, il teorico appare <b>barrato</b> sopra il codice (e nel tooltip del giorno).
          L&apos;<b>anello ambra</b> segna i turni con sfondo giallo sul PDF, cioè <b>da confermare</b>.
          RM/RC/RI = riposi, D = disponibilità, A = altre presenze,
          F.E. = ferie, VS = visita sanitaria, Sp/ISp/Dis/Tutor = attività senza sezione.
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Mese non caricato: si vedono i <b>turni teorici</b> della rotazione, con la stessa tinta
          per tipo di turno. RM/RC/RI = riposi, D = disponibilità.
        </p>
      )}
      {!comparing && !hasTheoretical && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Questa persona non è nelle squadre dei turni teorici: senza PDF non compare nulla.
        </p>
      )}
      {!comparing && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">Scorri a destra o sinistra per cambiare mese.</p>
      )}

      {/* Selettore utente */}
      <Dialog open={pickerOpen} onOpenChange={v => !v && setPickerOpen(false)}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>Turni di chi?</DialogTitle></DialogHeader>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cerca cognome o nome…"
              className="pl-8"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1 py-2">Nessun dipendente trovato.</p>
            ) : (
              filteredUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUserId(u.id); setPickerOpen(false) }}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors',
                    u.id === selectedUserId ? 'bg-primary/10 font-medium' : 'hover:bg-muted',
                  )}
                >
                  <span className="flex-1 min-w-0 truncate">{[u.cognome, u.nome].filter(Boolean).join(' ')}</span>
                  {u.id === currentUserId && (
                    <span className="text-[10px] text-muted-foreground shrink-0">tu</span>
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Selettore multiplo: confronto fra più dipendenti */}
      <Dialog open={compareOpen} onOpenChange={v => !v && setCompareOpen(false)}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>Confronta i turni</DialogTitle></DialogHeader>
          <p className="text-xs leading-snug text-muted-foreground">
            Scegli da 2 a {CMP_MAX_PEOPLE} dipendenti: i loro turni finiscono in una tabella, una riga
            a testa, giorno per giorno.
          </p>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cerca cognome o nome…"
              className="pl-8"
            />
          </div>

          {compareDraft.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {compareDraft.map(id => {
                const u = users.find(x => x.id === id)
                if (!u) return null
                return (
                  <button
                    key={id}
                    onClick={() => toggleCompare(id)}
                    aria-label={`Togli ${u.cognome ?? ''}`}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                  >
                    {u.cognome}
                    <X size={11} />
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto -mx-1">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1 py-2">Nessun dipendente trovato.</p>
            ) : (
              filteredUsers.map(u => {
                const on = compareDraft.includes(u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleCompare(u.id)}
                    aria-pressed={on}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors',
                      on ? 'bg-primary/10 font-medium' : 'hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'w-4 h-4 shrink-0 rounded border flex items-center justify-center',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                      )}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{[u.cognome, u.nome].filter(Boolean).join(' ')}</span>
                    {u.id === currentUserId && (
                      <span className="text-[10px] text-muted-foreground shrink-0">tu</span>
                    )}
                  </button>
                )
              })
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setCompareDraft([])}
              disabled={compareDraft.length === 0}
              className="rounded-xl border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              Azzera
            </button>
            <Button className="flex-1" onClick={confirmCompare} disabled={compareDraft.length < 2 && !comparing}>
              {compareDraft.length >= 2
                ? `Confronta (${compareDraft.length})`
                : comparing ? 'Chiudi confronto' : 'Scegli almeno 2'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
