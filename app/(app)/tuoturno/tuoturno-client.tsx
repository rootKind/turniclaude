'use client'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Search, X } from 'lucide-react'
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
import {
  cardPaletteStore,
  CARD_KINDS,
  mismatchStyleStore,
  pendingRingStore,
  predictTheoreticalMonth,
  type CardKind,
  type CardPalette,
  type MismatchStyle,
  type PendingRing,
  type PersonTheoretical,
} from '@/lib/person-cycle'
import type { DaySchedule, SalaSchedule, ShiftTeamTree } from '@/types/database'
import { buildCompareGroups, type CompareGroupUser } from '@/lib/compare-groups'
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

/** Palette vuota (snapshot server per useSyncExternalStore). */
const EMPTY_PALETTE: CardPalette = {}

/** Classe CSS di default per ogni tipologia di contenuto (i colori vivono in globals.css). */
const TINT_BY_KIND: Record<CardKind, string> = {
  pomeriggio: 'cell-tint-p',
  mattina: 'cell-tint-m',
  notte: 'cell-tint-n',
  rest: 'cell-tint-rest',
  availability: 'cell-tint-avail',
  absence: 'cell-tint-abs',
  duty: 'cell-tint-duty',
}

/** Codice del giorno → tipologia di contenuto (per la palette personalizzabile); null = cella vuota. */
function kindOf(kind: SalaCodeKind, token: string): CardKind | null {
  if (kind === 'work') {
    if (token[0] === 'M') return 'mattina'
    if (token[0] === 'P') return 'pomeriggio'
    if (token[0] === 'N') return 'notte'
    return 'duty'
  }
  if (kind === 'rest') return 'rest'
  if (kind === 'availability') return 'availability'
  if (kind === 'absence') return 'absence'
  if (kind === 'duty' || kind === 'other') return 'duty'
  return null
}

/** Tinta di default della card (variante E): il colore segue il tipo di contenuto. */
function cellTintClass(kind: SalaCodeKind, token: string): string {
  const k = kindOf(kind, token)
  return k ? TINT_BY_KIND[k] : 'cell-tint-empty'
}

/** Converte {bg,text} nelle variabili CSS consumate dalle tinte .cell-tint-* (mai usate direttamente). */
function inlineColors(v: { bg: string; text: string } | undefined): CSSProperties | undefined {
  return v ? ({ '--c-bg': v.bg, '--c-text': v.text } as CSSProperties) : undefined
}

/** Override inline della palette personalizzata (pannello «Colori»); undefined = default del tema. */
function cardOverride(kind: SalaCodeKind, token: string, palette: CardPalette): CSSProperties | undefined {
  const k = kindOf(kind, token)
  return k ? inlineColors(palette[k]) : undefined
}

/** Codice compatto: «M7S» → «M7» (lo slot non serve nella vista personale). */
function displayToken(token: string): string {
  return isWorkToken(token) ? tokenLabel(token) : token
}

/** ─── Card turno CONDIVISA: un solo codice per la griglia personale E il confronto ───
 * Stessa struttura, stesse classi, stessa logica split/strike/pending/today:
 * ciò che cambiano sono le dimensioni (scala «sm» per le celle del confronto)
 * e la larghezza (w-full nelle tabelle, larghezza libera nella grid). Così ogni
 * fix alla card vale automaticamente per entrambe le schermate. */
function ShiftDayCard({
  day,
  real,
  theo,
  isToday,
  size,
  title,
  palette,
  mismatchStyle,
  className,
}: {
  day: number
  /** Reale del PDF; null = mese teorico (mostra solo il teorico). */
  real: { kind: SalaCodeKind; short: string; label: string; pending?: boolean } | null
  theo: string
  isToday?: boolean
  /** 'lg' = griglia personale (card 76px, badge assoluto); 'sm' = confronto (44px, data in chip inline). */
  size: 'lg' | 'sm'
  title?: string
  /** Palette e stile mismatch arrivano dal chiamante: la pagina è già sottoscritta
      ai rispettivi store (niente useSyncExternalStore dentro le card del loop). */
  palette: CardPalette
  mismatchStyle: MismatchStyle
  className?: string
}) {
  // In evidenza c'è il reale del PDF; se manca, il teorico.
  const primaryKind: SalaCodeKind = real
    ? real.kind
    : theo ? salaCodeInfo(theo).kind : 'empty'
  const primaryToken = real ? real.short : theo
  const primaryLabel = real ? displayToken(real.short) : theo ? displayToken(theo) : '—'
  const mismatch = !!(real && theo && realTheoreticalMismatch(real.short, theo))
  const showPending = !!real?.pending
  const theoKind: SalaCodeKind = theo ? salaCodeInfo(theo).kind : 'empty'
  const split = mismatch && mismatchStyle === 'split'
  // truncate anche su lg: a 320px le card scendono a ~37px e codici a 4 lettere
  // (SPCA…) escono dalla card; sotto ~375px l'ellipsis subentra solo lì.
  const codeSize = size === 'lg' ? 'text-[14px] font-extrabold leading-tight max-w-full truncate' : 'text-[11px] font-bold leading-none max-w-full truncate'
  const theoSize = size === 'lg' ? 'text-[11px] font-bold leading-none max-w-full truncate' : 'text-[9px] font-bold leading-none max-w-full truncate'
  return (
    <div
      title={title}
      className={cn(
        'cell-day relative text-center flex',
        size === 'lg'
          ? cn('rounded-xl min-h-[76px]', split ? 'cell-split px-0 py-0' : 'px-0.5 pt-3 pb-1.5 flex-col items-center justify-center gap-1')
          : cn('rounded-lg h-[44px]', split ? 'cell-split px-0 py-0' : 'px-0.5 pt-[3px] pb-0.5 flex-col items-center justify-center gap-0.5'),
        cellTintClass(primaryKind, primaryToken),
        showPending && 'is-pend',
        isToday && 'is-today',
        className,
      )}
      style={split ? undefined : cardOverride(primaryKind, primaryToken, palette)}
    >
      {size === 'lg' ? (
        <span className="day-badge tabular-nums">{day}</span>
      ) : (
        <span className="cmp-day tabular-nums">{day}</span>
      )}
      {split ? (
        <>
          <span
            className={cn('cell-half cell-half-theo cell-barred', cellTintClass(theoKind, theo || ''))}
            style={cardOverride(theoKind, theo || '', palette)}
          >
            <span className={theoSize}>{theo ? displayToken(theo) : '—'}</span>
          </span>
          <span
            className={cn('cell-half', cellTintClass(primaryKind, primaryToken))}
            style={cardOverride(primaryKind, primaryToken, palette)}
          >
            <span className={codeSize}>{primaryLabel}</span>
          </span>
        </>
      ) : (
        <>
          {mismatch && theo && (
            <span className={cn('font-semibold leading-none line-through opacity-60 max-w-full truncate', size === 'lg' ? 'text-[12px]' : 'text-[8px]')}>
              {displayToken(theo)}
            </span>
          )}
          <span className={codeSize}>{primaryLabel}</span>
        </>
      )}
    </div>
  )
}

// ─── confronto fra più dipendenti ────────────────────────────────────────────

/** Cella del confronto: 44px di ALTEZZA — la larghezza si adatta al blocco
    (w-full): il confronto usa tutta la pagina. Il badge data NON è assoluto
    (sovrapponeva il codice: illeggibile) ma inline in testa. */
const CMP_COL = 'h-[44px] w-[34px]'
const CMP_CELL_FLEX = 'flex-1 basis-[34px] min-w-0'
const CMP_ROW_H = 46       // cella + gap fra le righe
const CMP_HEAD_H = 26      // intestazione con i numeri dei giorni
const CMP_CHROME_FALLBACK = 300 // stima chrome (header+nav) PRIMA della misura reale
const CMP_MAX_PEOPLE = 8   // oltre, la tabella diventa illeggibile (e pesante)
const CMP_COL_W = 34       // larghezza LOGICA colonna (le celle stretched riempiono il blocco)

/** Dimensioni finestra, senza setState in effect (e senza mismatch in SSR). */
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
  pending: boolean
}

interface CompareRow {
  id: string
  name: string
  cells: CompareDay[]
}

/** Cella di confronto di UNA persona in UN giorno: SOLO il turno reale (richiesta
    12/09/2026: meno informazioni, più spazio — teorico e split/strike restano
    solo nella griglia personale). Fallback: nessun reale nel mese → il teorico
    diventa il valore della cella. */
function buildCompareDay(real: PersonDayShift | null, theo: string, hasTheoretical: boolean): CompareDay {
  const useTheo = !real && hasTheoretical && !!theo
  const kind: SalaCodeKind = useTheo ? salaCodeInfo(theo).kind : real ? real.kind : 'empty'
  return {
    kind,
    token: useTheo ? theo : real ? real.short : '',
    label: useTheo ? displayToken(theo) : real ? displayToken(real.short) : '—',
    pending: !!real?.pending,
  }
}

/**
 * Tabella di confronto: una riga per dipendente, giorni in orizzontale (scroll
 * laterale se servono più colonne di quelle che stanno nello schermo). Il mese
 * viene spezzato in più blocchi quando l'altezza del dispositivo lo consente,
 * così si evita di scorrere: con 2 soli dipendenti e uno schermo alto l'intero
 * mese sta in 3-4 blocchi senza scroll.
 */
function CompareTable({ rows, chunks, month, todayISO, palette }: {
  rows: CompareRow[]
  chunks: number[][]
  month: string
  todayISO: string
  palette: CardPalette
}) {
  return (
    <div className="cmp-table overflow-x-auto -mx-3 px-3 pb-1">
      <div className="min-w-max">
        {chunks.map((days, ci) => (
          <div key={ci} className={cn(ci > 0 && 'mt-3')}>
            <div className="flex items-end">
              <div className="sticky left-0 z-20 w-[64px] shrink-0 bg-background" />
              {days.map(d => {
                const dateISO = `${month}-${String(d).padStart(2, '0')}`
                const wd = WEEKDAYS[(firstWeekdayOffset(month) + d - 1) % 7]
                const isToday = dateISO === todayISO
                // Le teste di colonna crescono con le celle (flex-1 come w-full)
                return (
                  <div key={d} className={cn('pb-1 text-center leading-none', CMP_CELL_FLEX)}>
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
                  if (!c) return <div key={d} className={cn(CMP_COL, CMP_CELL_FLEX)} />
                  const dateISO = `${month}-${String(d).padStart(2, '0')}`
                  const empty = c.kind === 'empty' && !c.token
                  const title = `${r.name} · ${dateISO} — ${empty ? 'nessun turno' : c.label}`
                    + (c.pending ? ' · da confermare' : '')
                  // STESSO componente della griglia personale (size sm, SOLO reale:
                  // theo=null → mai split/strike, il teorico compare solo come
                  // contenuto di fallback quando la riga non ha turni reali).
                  return (
                    <ShiftDayCard
                      key={d}
                      day={d}
                      real={empty ? null : { kind: c.kind, short: c.token, label: c.label, pending: c.pending }}
                      theo=""
                      isToday={dateISO === todayISO}
                      size="sm"
                      title={title}
                      palette={palette}
                      mismatchStyle="split"
                      className={CMP_CELL_FLEX}
                    />
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

/** Riga del pannello colori: anteprima della tinta + selettori sfondo/testo + ripristino. */
function PaletteRow({ kind, label, hint, value, onChange, onClear }: {
  kind: CardKind
  label: string
  hint: string
  value: { bg: string; text: string } | undefined
  onChange: (v: { bg: string; text: string }) => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span
        className={cn('cell-day inline-flex h-9 w-12 items-center justify-center rounded-lg text-[11px] font-bold', TINT_BY_KIND[kind])}
        style={inlineColors(value)}
      >
        M7
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">{label}</span>
        <span className="block truncate text-[10px] leading-tight text-muted-foreground">{hint}</span>
      </span>
      <label className="relative h-7 w-7 shrink-0" title="Colore sfondo">
        <input
          type="color"
          value={value?.bg ?? '#000000'}
          onChange={e => onChange({ bg: e.target.value, text: value?.text ?? '#ffffff' })}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`${label}: colore sfondo`}
        />
        <span
          className="block h-7 w-7 rounded-full border border-border"
          style={{ background: value?.bg }}
        />
      </label>
      <label className="relative h-7 w-7 shrink-0" title="Colore testo">
        <input
          type="color"
          value={value?.text ?? '#ffffff'}
          onChange={e => onChange({ bg: value?.bg ?? '#000000', text: e.target.value })}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`${label}: colore testo`}
        />
        <span
          className="block h-7 w-7 rounded-full border border-border"
          style={{ background: value?.text }}
        />
      </label>
      {value && (
        <button
          onClick={onClear}
          title="Ripristina il colore predefinito"
          aria-label={`Ripristina ${label}`}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcw size={13} />
        </button>
      )}
    </div>
  )
}

export interface UserOption {
  id: string
  nome: string | null
  cognome: string | null
  is_secondary?: boolean | null   // true = Noni
  is_manager?: boolean | null
  show_in_compare?: boolean | null // false = nascosto dal selettore Confronta (scelta admin)
}

interface Props {
  currentUserId: string
  profile: UserOption | null
  users: UserOption[]
  uploadedMonths: string[]
  tree: ShiftTeamTree | null
  /** Predittore del teorico per utente (dalla storia dei PDF, vedi page.tsx). */
  personTheoretical: Record<string, PersonTheoretical>
  initialMonth: string
}

export function TuoTurnoClient({ currentUserId, profile, users, uploadedMonths, tree, personTheoretical, initialMonth }: Props) {
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
  // Pannello «Personalizza» + palette e stile delle modifiche (persistiti in locale).
  const [colorsOpen, setColorsOpen] = useState(false)
  // Selettore mese/anno (aperto dall'etichetta tra le frecce).
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const palette = useSyncExternalStore(cardPaletteStore.subscribe, cardPaletteStore.get, () => EMPTY_PALETTE)
  const mismatchStyle = useSyncExternalStore(mismatchStyleStore.subscribe, mismatchStyleStore.get, () => 'split' as MismatchStyle)
  // Contorno dei giorni «da confermare»: giallo/rosso, continuo/tratteggiato.
  const pendingRing = useSyncExternalStore(pendingRingStore.subscribe, pendingRingStore.get, () => 'yellow-solid' as PendingRing)
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

  // ── Azioni del FAB nella barra di navigazione ────────────────────────────
  // La bottom-nav emette CustomEvent (stesso schema di turnisala/turniferie);
  // qui li ascoltiamo e apriamo i rispettivi dialog.
  useEffect(() => {
    const openPersonalizza = () => setColorsOpen(true)
    const openConfronta = () => { setCompareDraft(compareIds); setQuery(''); setCompareOpen(true) }
    document.addEventListener('tuoturno-open-personalizza', openPersonalizza)
    document.addEventListener('tuoturno-open-confronta', openConfronta)
    return () => {
      document.removeEventListener('tuoturno-open-personalizza', openPersonalizza)
      document.removeEventListener('tuoturno-open-confronta', openConfronta)
    }
  }, [compareIds])

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

  // ── teorico: tre sorgenti in ordine di priorità ──────────────────────────
  // 1. riga base del PDF del mese (esatta per definizione);
  // 2. predizione dalla STORIA dei PDF (ciclo dedotto o rotazione a blocchi);
  // 3. rotazione delle squadre del DB (solo ultimo fallback).
  const theoSrc = selectedUser ? personTheoretical[selectedUser.id] ?? null : null
  const theoPredicted = useMemo(
    () => predictTheoreticalMonth(theoSrc, month),
    [theoSrc, month],
  )
  const theoreticalFor = (d: number): string => {
    if (isRealMonth && realPerson) {
      // Il PDF è la verità: la riga base stampata vale anche quando è vuota.
      return realPerson.teorico[d - 1] ?? ''
    }
    const pred = theoPredicted[d - 1] ?? ''
    if (pred) return pred
    return theoreticalTokenFor(tree, selectedUser, `${month}-${String(d).padStart(2, '0')}`, duplicateCognomi)
  }
  // ── confronto fra più dipendenti ──────────────────────────────────────────
  const viewportHeight = useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 700)
  const viewportWidth = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 700)
  // Chrome MISURATO: tutto ciò che sta sopra la tabella (header pagina + nav
  // mese) + la bottom nav sotto. Niente stima fissa: al variare di font/density
  // il numero di blocchi resta quello giusto. La misura è ASINCRONA (request-
  //AnimationFrame): niente setState dentro l'effetto, niente loop di layout.
  const monthNavRef = useRef<HTMLDivElement | null>(null)
  const [chromePx, setChromePx] = useState<number | null>(null)
  const measureChrome = useCallback(() => {
    // chrome = tutto tranne lo spazio per la tabella: SOPRA (dal bordo superiore
    // del viewport al fondo della nav mese) + SOTTO (dal top della bottom nav al
    // fondo del viewport; se la nav copre l'ultimo pixel, la tabella finirebbe sotto).
    const top = monthNavRef.current?.getBoundingClientRect().bottom ?? 0
    const nav = document.querySelector('nav')
    const bottom = nav ? Math.max(0, window.innerHeight - nav.getBoundingClientRect().top) : 0
    const next = Math.round(top + bottom)
    setChromePx(prev => (prev === next ? prev : next))
  }, [])
  const comparing = compareIds.length >= 2
  useEffect(() => {
    if (!comparing) return
    let raf = requestAnimationFrame(measureChrome)
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measureChrome) }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [comparing, measureChrome])
  const comparePeople = useMemo(
    () => compareIds.map(id => users.find(u => u.id === id)).filter((u): u is UserOption => !!u),
    [compareIds, users],
  )
  const compareRows = useMemo<CompareRow[]>(() => {
    if (!comparing) return []
    return comparePeople.map(u => {
      const person = realPeople ? findMonthPerson(realPeople, u, duplicateCognomi) : null
      const src = personTheoretical[u.id] ?? null
      const predicted = predictTheoreticalMonth(src, month)
      const hasTheo = !!(
        (isRealMonth && person?.teorico.some(t => t)) ||
        src ||
        findMemberForUser(tree, u, duplicateCognomi)
      )
      const cells = Array.from({ length: totalDays }, (_, i) => {
        const d = i + 1
        const dateISO = `${month}-${String(d).padStart(2, '0')}`
        const real: PersonDayShift | null = !isRealMonth
          ? null
          : person
            ? personDayShift(person, d)
            : legacyRealShift(realSchedule?.schedule?.[d], u, duplicateCognomi)
        const theo = (isRealMonth ? person?.teorico[d - 1] : undefined)
          || predicted[d - 1]
          || theoreticalTokenFor(tree, u, dateISO, duplicateCognomi)
        return buildCompareDay(real, theo, hasTheo)
      })
      return { id: u.id, name: [u.cognome, u.nome].filter(Boolean).join(' '), cells }
    })
  }, [comparing, comparePeople, realPeople, tree, duplicateCognomi, totalDays, month, isRealMonth, realSchedule, personTheoretical])

  // Quanti blocchi di giorni per riga: SI ADATTA ANCHE ALLA LARGHEZZA — in ogni
  // blocco devono stare le colonne del blocco + la colonna nome (64px) entro la
  // larghezza disponibile: altrimenti si spezza di più (con 2 righe di 44px resta
  // tutto leggibile e il mese riempie tutta la pagina invece di accatastarsi).
  const compareChunks = useMemo(() => {
    if (!comparing) return []
    const perBlock = compareRows.length * CMP_ROW_H + CMP_HEAD_H
    // Spazio davvero disponibile: chrome MISURATO nel DOM (header pagina + nav
    // mese + bottom nav reali del dispositivo), fallback alla stima fissa.
    const available = Math.max(150, viewportHeight - (chromePx ?? CMP_CHROME_FALLBACK))
    // IN ALTEZZA (richiesta 12/09/2026): niente cap artificiale a 4 — su schermi
    // lunghi il mese si SPANDE in vertica (più blocchi, zero scroll) invece di
    // lasciare metà pagina vuota.
    const maxByHeight = Math.max(1, Math.floor(available / perBlock))
    // IN LARGHEZZA: la main è max-w-lg (512px); min 5 giorni per colonna —
    // sotto, i codici tipo MDCIF non ci stanno più anche comprimendo.
    const availW = Math.max(280, Math.min(viewportWidth, 512) - 24)
    const maxByWidth = Math.max(5, Math.floor((availW - 64) / CMP_COL_W))
    // Blocchi MINIMI per la larghezza, ma MAI più del necessario: si preferiscono
    // blocchi larghi (colonna nome ripetuta meno volte, celle più respirate).
    const minChunks = Math.ceil(totalDays / maxByWidth)
    const chunkCount = Math.max(minChunks, Math.min(maxByHeight, Math.ceil(totalDays / 7)))
    return splitDays(totalDays, Math.min(chunkCount, totalDays))
  }, [comparing, compareRows.length, viewportHeight, viewportWidth, totalDays, chromePx])

  const goPrev = () => setMonth(m => addMonths(m, -1))
  const goNext = () => setMonth(m => addMonths(m, 1))

  // Swipe ORIZZONTALE su TUTTA la pagina (richiesta 13/09/2026): prima era solo
  // sulla griglia dei giorni; ora, come in turnisala, ascolta il documento così
  // funziona anche in modalità CONFRONTO e su tutta l'area pagina. Va ignorato
  // se il gesto parte dal selettore mese/anno (.month-pop ha le sue colonne
  // scorrevoli) o dentro un dialog (radix li renderizza in portale fuori da
  // main), e se il gesto è verticale (scroll) o troppo corto.
  useEffect(() => {
    const skip = (t: EventTarget | null) =>
      t instanceof Element &&
      !!t.closest('.month-pop, [role="dialog"], [data-radix-popper-content-wrapper]')
    const onTouchStart = (e: TouchEvent) => {
      if (skip(e.target)) { touchStart.current = null; return }
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    const onTouchEnd = (e: TouchEvent) => {
      const start = touchStart.current
      touchStart.current = null
      if (!start || skip(e.target)) return
      const dx = e.changedTouches[0].clientX - start.x
      const dy = e.changedTouches[0].clientY - start.y
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
      setMonth(m => addMonths(m, dx < 0 ? 1 : -1))
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...users].sort((a, b) => (a.cognome ?? '').localeCompare(b.cognome ?? ''))
    if (!q) return list
    return list.filter(u => `${u.cognome ?? ''} ${u.nome ?? ''}`.toLowerCase().includes(q))
  }, [users, query])

  // Elenco del CONFRONTO: solo chi l'admin ha reso visibile (show_in_compare),
  // diviso nei gruppi «Noni» / «DCO» con una sezione per squadra dei turni
  // teorici (in terza → in seconda → rilievo → semplici A-D → varianti → altre).
  const compareGroups = useMemo(() => buildCompareGroups(users, tree), [users, tree])
  // filtro di ricerca dentro gruppi e sezioni
  const compareVisibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return compareGroups
    return compareGroups
      .map(g => ({
        ...g,
        sections: g.sections
          .map(s => ({ ...s, users: s.users.filter(u => `${u.cognome ?? ''} ${u.nome ?? ''}`.toLowerCase().includes(q)) }))
          .filter(s => s.users.length > 0),
      }))
      .filter(g => g.sections.length > 0)
  }, [compareGroups, query])

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
    <main data-pending-ring={pendingRing} className="max-w-lg mx-auto px-3 pt-6 pb-4">
      {/* Intestazione: tocca il nome per cambiare persona; le azioni (confronto,
          personalizzazione) vivono nel Fab in basso a destra, con mini-Fab che spuntano */}
      <div className="mb-4 flex items-start justify-between gap-3">
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
      </div>

      {/* Navigazione mese */}
      <div ref={monthNavRef} className="flex items-center justify-between mb-3">
        <button
          onClick={goPrev}
          aria-label="Mese precedente"
          className="p-2 rounded-xl border border-border/60 hover:bg-muted transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          {/* Mese e anno SELEZIONABILI: tap etichetta o frecce → menù di scelta rapida.
              Il menù è ancorato al bottone (lo «span» mese anno): parte da lì, non
              dalla caption sotto. */}
          <div className="relative inline-block">
            {/* Nessun bordo: l'affordance è il CHEVRON (segnale universale di
                menù a tendina, come il trigger di turnisala) + il feedback hover. */}
            <button
              type="button"
              onClick={() => setMonthPickerOpen(v => !v)}
              aria-label="Scegli mese e anno"
              aria-expanded={monthPickerOpen}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold leading-tight text-lg hover:bg-muted active:bg-muted transition-colors"
            >
              {formatMonthLabel(month)}
              <ChevronDown size={16} className={cn('text-muted-foreground transition-transform', monthPickerOpen && 'rotate-180')} />
            </button>
            {monthPickerOpen && (
              <MonthYearPicker
                month={month}
                uploadedMonths={uploadedMonths}
                onPick={m => { setMonth(m); setMonthPickerOpen(false) }}
                onClose={() => setMonthPickerOpen(false)}
              />
            )}
          </div>
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
          <CompareTable rows={compareRows} chunks={compareChunks} month={month} todayISO={today} palette={palette} />
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
          <div className="grid grid-cols-7 gap-1.5 select-none">
            {loadingReal ? (
              // Il PDF del mese sta arrivando: celle skeleton SOLO per i giorni reali.
              // I sostegni dell'offset sono prima, così i skeleton cadono sulle colonne giuste.
              <>
                {Array.from({ length: offset }).map((_, i) => (
                  <div key={`pad-sk-${i}`} aria-hidden />
                ))}
                {Array.from({ length: totalDays }).map((_, i) => (
                  <Skeleton key={`sk-${i}`} className="h-[76px] w-full rounded-xl" />
                ))}
              </>
            ) : (
              <>
                {/* Sostegni INVISIBILI per l'offset del lunedì: allineano il giorno 1 alla
                    sua colonna (la grid non salta celle da sola). Niente bordi/riempimenti:
                    le «card vuote» prima del mese sono sparite alla vista, non dall'layout. */}
                {Array.from({ length: offset }).map((_, i) => (
                  <div key={`pad-${i}`} aria-hidden />
                ))}
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
                  const dateISO = `${month}-${String(d).padStart(2, '0')}`
                  const real = realShiftOfDay(d)
                  const theo = theoreticalFor(d)
                  const isToday = dateISO === today
                  const realLabel = real ? (real.kind === 'work' ? tokenLabel(real.short) : `${real.label} (${real.short})`) : 'nessun turno'
                  const theoLabel = theo ? tokenLabel(theo) : 'nessun turno'
                  const pendingLabel = real?.pending ? ' · da confermare' : ''
                  const cellTitle = isRealMonth
                    ? `${dateISO} — reale: ${realLabel}${pendingLabel} · teorico: ${theoLabel}${real && theo && realTheoreticalMismatch(real.short, theo) ? ' (diversi)' : ''}`
                    : `${dateISO} — teorico: ${theoLabel}`
                  return (
                    <ShiftDayCard
                      key={d}
                      day={d}
                      real={real ? { kind: real.kind, short: real.short, label: real.label, pending: real.pending } : null}
                      theo={theo}
                      isToday={isToday}
                      size="lg"
                      title={cellTitle}
                      palette={palette}
                      mismatchStyle={mismatchStyle}
                    />
                  )
                })}
              </>
            )}
          </div>
        </>
      )}

      {/* Pannello personalizza: stile delle modifiche + tinta di ogni tipologia */}
      <Dialog open={colorsOpen} onOpenChange={setColorsOpen}>
        <DialogContent className="max-h-[80vh] max-w-sm flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>Personalizza le card</DialogTitle></DialogHeader>
          <p className="text-xs leading-snug text-muted-foreground">
            Scegli sfondo e testo per ogni tipologia, come mostrare i giorni diversi dal teorico e il
            contorno dei giorni da confermare: si applicano subito e restano su questo dispositivo.
            Senza personalizzazione valgono i colori del tema.
          </p>
          <div className="rounded-xl border border-border/60 p-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Contorno giorni da confermare
            </p>
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  ['yellow-solid', 'Giallo', 'Cornice gialla continua (predefinita)'],
                  ['yellow-dashed', 'Tratteggio', 'Cornice gialla tratteggiata'],
                  ['red-solid', 'Rosso', 'Cornice rossa continua'],
                  ['red-dashed', 'Rosso tratteggiato', 'Cornice rossa tratteggiata'],
                ] as const
              ).map(([value, label, title]) => (
                <button
                  key={value}
                  onClick={() => pendingRingStore.set(value)}
                  title={title}
                  aria-pressed={pendingRing === value}
                  className={cn(
                    'rounded-md px-1 py-1.5 text-[10px] font-semibold leading-tight transition-colors',
                    pendingRing === value
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {/* anteprima: mini cornice nello stile della variante */}
                  <span
                    className={cn(
                      'mx-auto mb-1 block h-4 w-7 rounded-[4px] border-2 bg-muted/50',
                      value.endsWith('-dashed') ? 'border-dashed' : 'border-solid',
                    )}
                    style={{ borderColor: value.startsWith('red') ? '#dc2626' : 'var(--cell-pend-ring)' }}
                  />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 p-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Giorni diversi dal teorico
            </p>
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
              {(
                [
                  ['split', 'Card divisa', 'Teorico sbarrato sopra, reale sotto'],
                  ['strike', 'Teorico barrato', 'Card intera, teorico barrato sopra il codice'],
                ] as const
              ).map(([value, label, title]) => (
                <button
                  key={value}
                  onClick={() => mismatchStyleStore.set(value)}
                  title={title}
                  aria-pressed={mismatchStyle === value}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                    mismatchStyle === value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Tipologia</span>
            <span>Riempimento</span>
            <span>Contorno</span>
          </div>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {CARD_KINDS.map(({ kind, label, hint }) => (
              <PaletteRow
                key={kind}
                kind={kind}
                label={label}
                hint={hint}
                value={palette[kind]}
                onChange={v => cardPaletteStore.set(kind, v)}
                onClear={() => cardPaletteStore.set(kind, null)}
              />
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => cardPaletteStore.reset()}
            disabled={Object.keys(palette).length === 0}
          >
            Ripristina tutti i colori predefiniti
          </Button>
        </DialogContent>
      </Dialog>

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
            Scegli da 2 a {CMP_MAX_PEOPLE} dipendenti: i loro turni reali finiscono in una tabella,
            una riga a testa, giorno per giorno. Per i mesi senza PDF si confrontano i turni teorici.
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
            {compareVisibleGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1 py-2">Nessun dipendente trovato.</p>
            ) : (
              compareVisibleGroups.map(group => (
                <div key={group.key} className="mb-2">
                  {group.sections.map(sec => (
                    <div key={sec.key || group.key}>
                      {sec.label && (
                        <p className="px-1 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/90">
                          {sec.label} · {sec.users.length}
                        </p>
                      )}
                      {sec.users.map(u => {
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
                            <span className="flex-1 min-w-0 truncate">
                              {[u.cognome, u.nome].filter(Boolean).join(' ')}
                            </span>
                            {u.id === currentUserId && (
                              <span className="text-[10px] text-muted-foreground shrink-0">tu</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ))
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

/** Selettore rapido di MESE e ANNO: due colonne scorrevoli, il mese lascia in evidenza
 *  quelli con PDF caricato (pallino). ANNI: TUTTO il millennio (2001–3000) —
 *  il teorico si calcola per QUALSIASI mese/anno; la lista parte scrollata
 *  sull'anno selezionato. Selezione = #dfe8f2 chiaro / #454545 scuro
 *  (picker-sel-m / picker-sel-y). */
function MonthYearPicker({ month, uploadedMonths, onPick, onClose }: {
  month: string
  uploadedMonths: string[]
  onPick: (m: string) => void
  onClose: () => void
}) {
  const [y, m] = month.split('-').map(Number)
  const years = useMemo(() => {
    const list: number[] = []
    for (let yy = 2020; yy <= 2100; yy++) list.push(yy)
    return list
  }, [])
  // La lista anni parte scrollata sull'anno selezionato (~30px per voce).
  const yearListRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = yearListRef.current
    if (el) el.scrollTop = Math.max(0, (y - 2020) * 30 - el.clientHeight / 2 + 15)
  }, [y])
  const ref = useRef<HTMLDivElement>(null)
  // Tap fuori dal pannello lo chiude; tasto ESC pure.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [onClose])
  return (
    <div
      ref={ref}
      className="month-pop absolute left-1/2 top-full z-30 mt-2 w-[240px] -translate-x-1/2 rounded-xl border border-border bg-card p-2 shadow-lg"
    >
      {/* Niente teste «Mese»/«Anno»: le colonne si spiegano da sole (l'anno è
          una lista di numeri) e il menù parte direttamente dal bottone. */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {MONTHS_IT.map((label, i) => {
              const iso = `${y}-${String(i + 1).padStart(2, '0')}`
              const on = i + 1 === m
              const hasPdf = uploadedMonths.includes(iso)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onPick(iso)}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold transition-colors',
                    on ? 'picker-sel-m' : 'hover:bg-muted',
                  )}
                >
                  {label}
                  {/* Pallino PDF: accent del tema (#dfe8f2 chiaro / #454545 scuro)
                      su tutte le voci, selezionate incluse. */}
                  {hasPdf && <span className="pdf-dot h-1.5 w-1.5 rounded-full" aria-label="PDF caricato" />}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <div ref={yearListRef} className="flex max-h-56 flex-col overflow-y-auto">
            {years.map(yy => (
              <button
                key={yy}
                type="button"
                onClick={() => onPick(`${yy}-${String(m).padStart(2, '0')}`)}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold transition-colors',
                  yy === y ? 'picker-sel-y' : 'hover:bg-muted',
                )}
              >
                {yy}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
