'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getSalaSchedule } from '@/lib/queries/sala-schedule'
import { buildDuplicateCognomi, cn, SHIFT_PILL_CLASSES } from '@/lib/utils'
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
  type PersonDayShift,
  type SalaCodeKind,
} from '@/lib/sala-month'
import type { DaySchedule, SalaSchedule, SalaShiftType, ShiftTeamTree, ShiftType } from '@/types/database'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]
const WEEKDAYS = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM']
const SHIFT_LABEL: Record<SalaShiftType, ShiftType> = {
  M: 'Mattina',
  P: 'Pomeriggio',
  N: 'Notte',
}

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

/** Stile dei codici non-turno, con i colori della legenda del PDF. */
const KIND_CLASSES: Record<SalaCodeKind, string> = {
  empty: '',
  work: '',
  rest: 'bg-muted/70 text-muted-foreground',
  availability: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  absence: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  duty: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  other: 'bg-muted/70 text-muted-foreground',
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
        {Array.from({ length: offset }).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
          const dateISO = `${month}-${String(d).padStart(2, '0')}`
          const real = realShiftOfDay(d)
          const realToken = real && real.kind === 'work' ? real.short : null
          const theo = theoreticalTokenFor(tree, selectedUser, dateISO, duplicateCognomi)
          const isToday = dateISO === today
          // Un reale diverso dal teorico (anche solo per sezione) va notato subito.
          const mismatch = isRealMonth && hasTheoretical
            ? realTheoreticalMismatch(realToken, theo)
            : false
          // Stesso turno (M/P/N) ma sezione diversa: differenza più blanda.
          const sectionOnly = mismatch
            && isWorkToken(realToken ?? '')
            && isWorkToken(theo)
            && realToken![0] === theo[0]
          // C'è una "card reale" solo se il PDF assegna davvero qualcosa.
          const hasReal = !!real

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
                'rounded-xl border px-1.5 py-1.5 min-h-[78px] flex flex-col gap-1',
                isToday
                  ? 'border-primary'
                  : mismatch && !sectionOnly
                    ? 'border-amber-500/50 bg-amber-500/[0.06]'
                    : 'border-border/60',
                'bg-card',
              )}
            >
              <span className="flex items-center justify-between leading-none">
                <span className={cn('text-xs font-semibold tabular-nums', isToday && 'text-primary')}>{d}</span>
                {mismatch && (
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      sectionOnly ? 'border border-amber-500' : 'bg-amber-500',
                    )}
                  />
                )}
              </span>

              {hasReal ? (
                <>
                  <TokenChip
                    token={real!.short}
                    kind={real!.kind}
                    pending={real!.pending}
                    title={`${realLabel}${pendingLabel}${hasTheoretical && mismatch ? ' — diverso dal teorico' : ''}`}
                  />
                  <TokenChip
                    token={theo || null}
                    secondary
                    title={`Teorico: ${theo || 'nessun turno'}`}
                  />
                </>
              ) : (
                // Nessun turno reale: il teorico occupa tutta la casella.
                <span className="flex-1 flex items-center justify-center min-h-0">
                  <TokenChip
                    token={theo || null}
                    size="lg"
                    title={`Teorico: ${theo || 'nessun turno'}`}
                  />
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {(['M', 'P', 'N'] as SalaShiftType[]).map(s => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold', SHIFT_PILL_CLASSES[SHIFT_LABEL[s]])}>
              {s}
            </span>
            {SHIFT_LABEL[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold', KIND_CLASSES.rest)}>RR</span>
          riposo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold', KIND_CLASSES.availability)}>D</span>
          disponibilità
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold', KIND_CLASSES.absence)}>A</span>
          assenza
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold', KIND_CLASSES.duty)}>Sp</span>
          attività senza sezione
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> tipo diverso
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border border-amber-500" /> solo sezione
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold border border-dashed border-amber-500">M4</span>
          turno da confermare
        </span>
      </div>

      {isRealMonth ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Sopra il turno <b>reale</b> del PDF, sotto il <b>teorico</b> della rotazione (in grigio quando
          il reale è presente); se il turno reale manca, il teorico riempie la casella. Il pallino
          segnala le giornate in cui i due non coincidono. I turni con <b>bordo tratteggiato</b> hanno
          lo sfondo giallo sul PDF, cioè sono <b>da confermare</b>. RM/RC/RI = riposi, D = disponibilità,
          A = altre presenze, F.E. = ferie, VS = visita sanitaria, Sp/ISp/Dis/Tutor = attività senza sezione.
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Mese non caricato: si vedono i <b>turni teorici</b> della rotazione. RM/RC/RI = riposi,
          D = disponibilità.
        </p>
      )}
      {!hasTheoretical && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Questa persona non è nelle squadre dei turni teorici: sotto non compare nulla.
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

function TokenChip({ token, kind = 'work', secondary = false, size = 'sm', placeholder = '—', pending = false, title }: {
  token: string | null
  kind?: SalaCodeKind
  secondary?: boolean
  size?: 'sm' | 'lg'
  placeholder?: string
  pending?: boolean
  title?: string
}) {
  if (!token) {
    return <span className="text-[11px] leading-none text-muted-foreground/70" title={title}>{placeholder}</span>
  }
  const work = kind === 'work' && isWorkToken(token)
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center justify-center rounded font-semibold leading-none truncate',
        size === 'lg' ? 'px-2 py-1 text-base' : 'px-1 py-0.5 text-[11px]',
        secondary
          ? 'bg-muted/50 text-muted-foreground/90'
          : work
            ? SHIFT_PILL_CLASSES[SHIFT_LABEL[token[0] as SalaShiftType]]
            : KIND_CLASSES[kind],
        // Sfondo giallo nel PDF = «turno da confermare»: bordo tratteggiato ambra.
        pending && !secondary && 'border border-dashed border-amber-500',
      )}
    >
      {work ? tokenLabel(token) : token}
    </span>
  )
}
