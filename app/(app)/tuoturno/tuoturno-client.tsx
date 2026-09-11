'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

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
  const offset = firstWeekdayOffset(month)

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

  return (
    <main className="max-w-lg mx-auto px-3 pt-6 pb-4">
      {/* Intestazione: tocca il nome per vedere i turni di un'altra persona */}
      <div className="mb-4">
        <h1 className="text-xl font-bold leading-snug">Il tuo turno</h1>
        <button
          onClick={() => { setQuery(''); setPickerOpen(true) }}
          className="mt-0.5 inline-flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Scegli di chi vedere i turni"
        >
          <span className="font-semibold text-foreground">{displayName}</span>
          <ChevronDown size={16} />
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
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`empty-${i}`} className="rounded-xl border border-dashed border-border/50 min-h-[76px]" />
        ))}
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
                mismatch && 'is-diff',
                real?.pending && 'is-pend',
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
      </div>

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
        <span className="inline-flex items-center gap-1.5">
          <span className="cell-day is-diff rounded px-1.5 py-0.5 text-[11px] font-bold leading-none">M4</span>
          reale ≠ teorico
        </span>
      </div>

      {isRealMonth ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          <b>L&apos;intera card è tinta dal turno</b>: azzurro pomeriggio, rosa mattina, lilla notte,
          grigio riposi, rosso assenze, verde attività senza sezione. Il codice in evidenza è il{' '}
          <b>reale</b> del PDF; se il reale manca compare il <b>teorico</b>. Quando i due
          differiscono, il teorico appare <b>barrato</b> sopra il codice e la card prende il{' '}
          <b>bordo tratteggiato rosso</b>. L&apos;<b>anello ambra</b> segna i turni con sfondo giallo sul
          PDF, cioè <b>da confermare</b>. RM/RC/RI = riposi, D = disponibilità, A = altre presenze,
          F.E. = ferie, VS = visita sanitaria, Sp/ISp/Dis/Tutor = attività senza sezione.
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Mese non caricato: si vedono i <b>turni teorici</b> della rotazione, con la stessa tinta
          per tipo di turno. RM/RC/RI = riposi, D = disponibilità.
        </p>
      )}
      {!hasTheoretical && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Questa persona non è nelle squadre dei turni teorici: senza PDF non compare nulla.
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">Scorri a destra o sinistra per cambiare mese.</p>

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
    </main>
  )
}
