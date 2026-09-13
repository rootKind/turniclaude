import type {
  DaySchedule,
  SalaSchedule,
  ShiftAdjustment,
  ShiftTeamMember,
  ShiftTeamTree,
  ShiftTypeGroup,
} from '@/types/database'
import { applyTokenToDay } from '@/lib/shift-tokens'

// ─── date helpers (UTC, senza timezone) ──────────────────────────────────────

const DAY_MS = 86400000

export function parseDateUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseDateUTC(toISO) - parseDateUTC(fromISO)) / DAY_MS)
}

export function monthStartISO(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export function addDays(iso: string, days: number): string {
  const d = new Date(parseDateUTC(iso) + days * DAY_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ─── aggiustamenti (comando shift) ───────────────────────────────────────────
// Cumulativo: per la data D contano tutti gli aggiustamenti con effective_date
// <= D. Un delta +1 sposta i turni di un giorno in avanti a partire da quella
// data (il token che era al giorno D-1 ora è al giorno D).

export function adjustmentOffset(adjustments: ShiftAdjustment[], teamId: string, dateISO: string): number {
  let offset = 0
  for (const a of adjustments) {
    if (a.effective_date > dateISO) continue
    if (a.scope === 'global' || a.team_id === teamId) offset += a.delta_days
  }
  return offset
}

// ─── token teorico per un membro in una data ─────────────────────────────────

export function tokenForMember(
  type: Pick<ShiftTypeGroup, 'cycle_days' | 'pattern_start'>,
  member: Pick<ShiftTeamMember, 'pattern'>,
  teamId: string,
  adjustments: ShiftAdjustment[],
  dateISO: string,
): string {
  const offset = adjustmentOffset(adjustments, teamId, dateISO)
  const anchor = addDays(type.pattern_start, offset)
  /* Il periodo è la lunghezza del pattern DEL MEMBRO, non cycle_days del tipo:
     dopo il super-ciclo (es. «in terza» 84gg) i membri senza storia PDF hanno
     conservato pattern più corti (28) — indicizzarli con il periodo del tipo
     produce indici fuori pattern (token vuoto = persona che sparisce dai
     mesi teorici). Ogni pattern cicla sulla SUA lunghezza. */
  const period = Math.max(1, member.pattern.length || type.cycle_days)
  const idx = ((daysBetween(anchor, dateISO) % period) + period) % period
  return member.pattern[idx] ?? ''
}

// ─── generazione di un mese teorico ──────────────────────────────────────────

function daysInMonthISO(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function generateTheoreticalMonth(
  month: string,
  tree: Pick<ShiftTeamTree, 'types'>,
  adjustments: ShiftAdjustment[],
): SalaSchedule {
  const schedule: Record<number, DaySchedule> = {}
  const nDays = daysInMonthISO(month)
  for (let d = 1; d <= nDays; d++) schedule[d] = { sections: {}, altriPresenti: [] }

  for (const type of tree.types) {
    if (!type.is_active) continue
    for (const team of type.teams) {
      for (const member of team.members) {
        if (!member.is_active) continue
        for (let d = 1; d <= nDays; d++) {
          const dateISO = `${month}-${String(d).padStart(2, '0')}`
          const token = tokenForMember(type, member, team.id, adjustments, dateISO)
          if (!token) continue
          applyTokenToDay(schedule[d], member.full_name, token)
        }
      }
    }
  }

  return {
    month,
    schedule,
    uploaded_at: '',
    source: 'theoretical',
  }
}

// ─── teorico ≠ reale (visualizzazione admin, 15/09/2026) ─────────────────

/** Nome canonico per il confronto: minuscole, niente titolo, spazi uniti. */
function normName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

export interface TheoRealDiff {
  /** Nome del membro (come nell'albero teorico). */
  name: string
  /** Codice teorico atteso (token completo, es. «M4»). */
  theo: string
  /** Codice reale dal PDF (token completo), se presente. */
  real: string | null
  /** true = nel PDF la persona NON c'è per niente quel giorno. */
  missing: boolean
}

/**
 * Per un GIORNO di un mese caricato da PDF, confronta il teorico (dall'albero
 * squadre, token per membro) con il reale (day schedule derivato dal PDF).
 * Restituisce SOLO le persone che deviano: turno in sezione/slot diversi,
 * codice differente o assenza dal PDF (missing). Le persone di «altriPresenti»
 * senza sezione si confrontano per PRESENZA (teoria in sezione ma real no = diff;
 * entrambi senza sezione = ok).
 *
 * Il matching nome è per normalizzazione minima (minuscole + spazi): l'albero
 * usa «COGNOME Nome», il PDF «COGNOME N.» — il confronto riguarda il COGNOME
 * (prefisso del nome normalizzato) con fallback sul nome intero.
 */
export function theoRealDiffsForDay(
  month: string,
  day: number,
  tree: Pick<ShiftTeamTree, 'types'>,
  adjustments: ShiftAdjustment[],
  realDay: DaySchedule | undefined,
): TheoRealDiff[] {
  // 1) teorico: nome → token del giorno.
  const theoByName = new Map<string, { token: string; full: string }>()
  const dateISO = `${month}-${String(day).padStart(2, '0')}`
  for (const type of tree.types) {
    if (!type.is_active) continue
    for (const team of type.teams) {
      for (const member of team.members) {
        if (!member.is_active) continue
        const token = tokenForMember(type, member, team.id, adjustments, dateISO)
        if (!token) continue
        theoByName.set(normName(member.full_name), { token, full: member.full_name })
      }
    }
  }
  // 2) reale: il PDF mette la persona in (sezione, shift, slot) oppure in altriPresenti.
  // Ricostruiamo per ogni persona reale la DESCRIZIONE del suo turno: «shift» + sezione.
  const realByCognome = new Map<string, { shift: string; section: string | null; token: string | null }>()
  if (realDay) {
    const put = (name: string, shift: string, section: string | null) => {
      const cognome = normName(name).split(' ')[0]
      if (!cognome) return
      // NB: persone con lo stesso cognome (omonimi) — l'ultima vince; il PDF
      // distingue con l'iniziale del nome, qui resta un limite accettato.
      realByCognome.set(cognome, { shift, section, token: null })
    }
    for (const [section, shifts] of Object.entries(realDay.sections)) {
      for (const shift of ['M', 'P', 'N'] as const) {
        const data = shifts[shift]
        if (!data) continue
        for (const n of [...data.surnames.T, ...data.surnames.S, ...data.surnames.noSlot]) put(n, shift, section)
        for (const n of data.tirocinanti) put(n, shift, section)
      }
    }
    for (const n of realDay.altriPresenti) put(n, '—', null) // presente ma senza sezione (M nudo, riposo lavorato, G…)
  }
  // 3) confronto: per ogni membro teorico con turno IN SEZIONE, guarda dove
  //    really è finito. Teorico senza sezione (M/P/N nudi, riposi, assenze) NON
  //    produce diff: il PDF non dà una posizione da contrapporre.
  const diffs: TheoRealDiff[] = []
  for (const [key, { token, full }] of theoByName) {
    const m = /^(M|P|N)\s*(\d+)$/.exec(token)
    if (!m) continue // riposi, M nudi, TUTOR, ecc.: nessun confronto posizionale
    const theoShift = m[1]
    const cognome = key.split(' ')[0]
    const real = realByCognome.get(cognome)
    if (!real) {
      // Nel PDF non c'è: o assente o in codice non-posizionale. Diff SOLO se il
      // teorico lo mette IN SEZIONE e il reale non lo vede da nessuna parte:
      // segnalarlo come missing (la sezione quel giorno è diversa dal previsto).
      diffs.push({ name: full, theo: token, real: null, missing: true })
      continue
    }
    if (real.section !== null && (real.shift !== theoShift || real.section !== m[2])) {
      diffs.push({ name: full, theo: token, real: `${real.shift}${real.section}`, missing: false })
    }
    // real.section === null: presente in altriPresenti (es. riposo lavorato): il
    // teorico aspettava la sezione → è comunque una differenza.
    if (real.section === null) {
      diffs.push({ name: full, theo: token, real: 'presente', missing: false })
    }
  }
  return diffs
}

// ─── mesi teorici disponibili ────────────────────────────────────────────────
// Mesi non caricati a mano, dal mese precedente fino a +12 mesi in avanti.

export function theoreticalMonthList(
  uploadedMonths: string[],
  fromMonth?: string,
  toMonth?: string,
): string[] {
  const uploaded = new Set(uploadedMonths)
  const now = new Date()
  const from = fromMonth ?? monthStartISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7)
  const to = toMonth ?? monthStartISO(new Date(now.getFullYear(), now.getMonth() + 12, 1)).slice(0, 7)

  const list: string[] = []
  let [y, m] = from.split('-').map(Number)
  while (`${y}-${String(m).padStart(2, '0')}` <= to) {
    const month = `${y}-${String(m).padStart(2, '0')}`
    if (!uploaded.has(month)) list.push(month)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return list
}