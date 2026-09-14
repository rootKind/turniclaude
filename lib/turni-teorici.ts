import type {
  DaySchedule,
  SalaSchedule,
  ShiftAdjustment,
  ShiftTeamMember,
  ShiftTeamTree,
  ShiftTypeGroup,
} from '@/types/database'
import { ABSENT_CODES, NON_SECTION_DUTIES, applyTokenToDay, isShiftCode, parseShiftCode } from '@/lib/shift-tokens'

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

/**
 * Chiave COGNOME di un nome «COGNOME Nome» / «COGNOME N.»: toglie l'ULTIMO
 * token SOLO quando è un'iniziale (lettera singola, col punto opzionale) —
 * «DI NAPOLI M.» → «di napoli», ma «DE GIOVANNI» resta «de giovanni».
 * Con il vecchio split(' ')[0] tutte le persone DI* collassavano sulla chiave
 * «di» e il confronto matchava la persona sbagliata.
 */
export function surnameKey(s: string): string {
  const n = normName(s)
  const parts = n.split(' ')
  const last = parts[parts.length - 1]
  return parts.length > 1 && /^[a-z]\.?$/.test(last) ? parts.slice(0, -1).join(' ') : n
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
 * Annotazione INVERSA: persona REALE in sezione che secondo il teorico doveva
 * stare ALTROVE (o stare a riposo / non essere prevista). Mostra COSA DOVEVA
 * FARE IN ORIGINE (`theo`, null = nessun turno previsto dall'albero).
 */
export interface TheoRealAnnotation {
  /** Nome come nel PDF. */
  name: string
  /** Token reale (es. «M6S» o «MDCIF»). */
  real: string
  /** Token teorico di origine (es. «RC», «M4S»), null se non previsto. */
  theo: string | null
  /** Sezione reale (chiave card, es. «6» o «DCIF»). */
  section: string
  /** Turno reale (M/P/N). */
  shift: string
}

/**
 * Per un GIORNO di un mese caricato da PDF, confronta il teorico (dall'albero
 * squadre, token per membro) con il reale (day schedule derivato dal PDF).
 * Restituisce SOLO le persone che deviano: turno in sezione/slot diversi,
 * codice differente o ASSENZA dal PDF (missing — teorico in servizio, reale
 * assente: la richiesta del 15/09/2026 di vedere anche chi «doveva lavorare e
 * ha fatto assenza»). Le persone di «altriPresenti» senza sezione si confrontano
 * per PRESENZA (teoria in sezione ma real no = diff; entrambi senza sezione = ok).
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
        // Stessa chiave del lato REALE (surnameKey): con normName un nome con
        // iniziale («DI NAPOLI M.» → «di napoli m.») non matchava mai il reale.
        theoByName.set(surnameKey(member.full_name), { token, full: member.full_name })
      }
    }
  }
  // 2) reale: il PDF mette la persona in (sezione, shift, slot) oppure in altriPresenti.
  // Ricostruiamo per ogni persona reale la DESCRIZIONE del suo turno: «shift» + sezione.
  const realByCognome = new Map<string, { shift: string; section: string | null; token: string | null; full: string }>()
  if (realDay) {
    const put = (name: string, shift: string, section: string | null) => {
      const key = surnameKey(name)
      if (!key) return
      // NB: persone con lo stesso cognome (omonimi) — l'ultima vince; il PDF
      // distingue con l'iniziale del nome, qui resta un limite accettato.
      realByCognome.set(key, { shift, section, token: null, full: name })
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
    /* Posizionale = QUALUNQUE turno di lavoro con sezione: M6, M6S, M6T, MDCIF…
       Il vecchio regex ^(M|P|N)\d+$ riconosceva solo i token nudi (M9): chi era
       teoricamente in M6S (formato più comune) o in una sezione alfabetica e
       risultava ASSENTE nel PDF non produceva nessuna differenza — la striscia
       «≠» non mostrava mai gli assenti. Si usa il parser condiviso dei codici. */
    if (!isShiftCode(token)) continue // riposi, M nudi, SpN: nessun confronto posizionale
    const { shift: theoShift, section: theoSection } = parseShiftCode(token)
    // TUTOR ecc.: il reale li mette in altriPresenti (mai in sezione) — come il
    // teorico non danno una posizione contrappponibile.
    if (ABSENT_CODES.has(token) || NON_SECTION_DUTIES.has(theoSection)) continue
    const real = realByCognome.get(key)
    if (!real) {
      // Nel PDF non c'è: o assente o in codice non-posizionale. Diff SOLO se il
      // teorico lo mette IN SEZIONE e il reale non lo vede da nessuna parte:
      // segnalarlo come missing (la sezione quel giorno è diversa dal previsto).
      diffs.push({ name: full, theo: token, real: null, missing: true })
      continue
    }
    if (real.section !== null && (real.shift !== theoShift || real.section !== theoSection)) {
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

/**
 * Vista INVERSA: per le persone REALI nei turni di sezione del giorno (quelle
 * visibili nelle card), restituisce COSA PREVEDEVA IL TEORICO. Serve a mostrare
 * accanto a chi sta facendo un turno diverso dal suo il codice di origine:
 * es. MININO in M6S con teorico «RC» → «← RC». Le persone non nell'albero
 * (esterni, quadri) escono con theo=null («non previsto»).
 */
export function theoRealAnnotationsForDay(
  month: string,
  day: number,
  tree: Pick<ShiftTeamTree, 'types'>,
  adjustments: ShiftAdjustment[],
  realDay: DaySchedule | undefined,
): TheoRealAnnotation[] {
  if (!realDay) return []
  // 1) teorico: cognome → token del giorno (unica fonte di verità dell'origine).
  const theoByCognome = new Map<string, string>()
  const dateISO = `${month}-${String(day).padStart(2, '0')}`
  for (const type of tree.types) {
    if (!type.is_active) continue
    for (const team of type.teams) {
      for (const member of team.members) {
        if (!member.is_active) continue
        const token = tokenForMember(type, member, team.id, adjustments, dateISO)
        if (!token) continue
        theoByCognome.set(surnameKey(member.full_name), token)
      }
    }
  }
  // 2) annotazioni per ogni persona reale in sezione: teorico diverso → annota.
  const out: TheoRealAnnotation[] = []
  const seen = new Set<string>() // cognome+shift+sezione (dedup tirocinanti/slot)
  for (const [section, shifts] of Object.entries(realDay.sections)) {
    for (const shift of ['M', 'P', 'N'] as const) {
      const data = shifts[shift]
      if (!data) continue
      const people = [...data.surnames.T, ...data.surnames.S, ...data.surnames.noSlot, ...data.tirocinanti]
      for (const name of people) {
        const key = surnameKey(name)
        const dedupKey = `${key}|${shift}|${section}`
        if (!key || seen.has(dedupKey)) continue
        seen.add(dedupKey)
        const theo = theoByCognome.get(key) ?? null
        // steso: il teorico CONFERMA il turno reale stesso → nessuna annotazione.
        const same = theo !== null && (
          (theo === `${shift}${section}`) ||
          // teorico con slot/tipo diverso nella stessa sezione+shift (es. M6S vs M6):
          // il turno è quello previsto, non è una differenza da segnalare.
          new RegExp(`^${shift}\\s*${section}(?:[A-Z]|$)`).test(theo)
        )
        if (same) continue
        out.push({ name, real: `${shift}${section}`, theo, section, shift })
      }
    }
  }
  return out
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