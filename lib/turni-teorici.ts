import type {
  DaySchedule,
  SalaSchedule,
  ShiftAdjustment,
  ShiftTeamMember,
  ShiftTeamTree,
  ShiftTypeGroup,
} from '@/types/database'
import { ABSENT_CODES, NON_SECTION_DUTIES, applyTokenToDay, isShiftCode, parseShiftCode } from '@/lib/shift-tokens'
import { type BareOwnerMap } from '@/lib/shift-teams-matching'

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
  for (let d = 1; d <= nDays; d++) schedule[d] = { sections: {}, altriPresenti: [], altriPresentiTokens: [] }

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

/** Nome canonico per il confronto: minuscole, niente titolo, spazi uniti.
 *  Esportata: la mappa dei codici PDF di desk-board è indicizzata anche con
 *  questa chiave (match esatto per gli omonimi). */
export function normName(s: string): string {
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

/**
 * RIGA «compatta» della sezione del giorno: chi il teorico prevede e come sta
 * davvero nel PDF. Sostituisce le vecchie strisce «≠» / «←» (troppo larghe:
 * richiesta 17/09/2026 di condensare le informazioni).
 */
export interface TheoRealRow {
  /** Nome del membro (come nell'albero teorico). */
  name: string
  /** Codice teorico atteso (token completo, es. «M6S»). */
  theo: string
  /** Stato REALE nel PDF, già compatto: turno/sezione alternativa, sigla di
   *  assenza/riposo com'è nel PDF («A», «AG7», «F.E.»…), «presente» senza
   *  sezione o «assente» (nessuna traccia nel PDF). */
  real: string
}

/**
 * Persona REALE (visibile nelle card del giorno) che il teorico NON prevedeva
 * in questo turno/sezione: di provenienza — doveva stare altrove, riposare
 * (RC/RI/RM/D) o non è in scheda. La provenienza esce nel blocco «Nuovi».
 */
export interface TheoRealExtra {
  name: string
  real: string
  /** Codice teorico di origine (es. «RC», «M4S»), '' se non previsto dall'albero. */
  theo: string
}

/**
 * Riepilogo COMPLETO per un GIORNO/SEZIONE: le righe teoriche (una per membro
 * previsto) e le extra (reali di provenienza diversa). Il matching è per
 * cognome — vedi surnameKey.
 */
export interface TheoRealSectionCompare {
  rows: TheoRealRow[]
  extras: TheoRealExtra[]
  /** true se la sezione esiste SOLO nel teorico (nessun reale quel giorno). */
  theoreticalOnly: boolean
}

/** Una persona nel PDF reale del giorno, con il contesto del suo turno. */
interface RealEntry {
  /** Turno (M/P/N) in cui appare; «—» se in altriPresenti. */
  shift: string
  /** Sezione in cui appare; null se senza sezione (altriPresenti). */
  section: string | null
  /** Nome completo come nel PDF. */
  full: string
  /** Nome normalizzato (match esatto contro l'albero, per gli omonimi). */
  exact: string
  /** Codice PDF di chi non è in sezione (assenza/riposo/altri presenti): '' se in sezione. */
  code: string
}

/**
 * CONFRONTO COMPATTO per un GIORNO (richiesta 17/09/2026: niente frecce/uguale,
 * informazioni condensate perché manca larghezza). Per OGNI sezione del teorico:
 *  - rows: una riga per membro teorico del giorno → nome + codice teorico + stato
 *    reale compatto (turno/sezione alternativa, codice PDF di assenza come
 *    «A»/«AG7»/«F.E.», «assente» se non c'è, «presente» se senza sezione);
 *  - extras: persone REALI nel turno/sezione che il teorico non prevedeva lì
 *    (da altro turno, da riposo RC/RI/RM/D o non in scheda) con la provenienza.
 * Le righe dove il teorico è CONFERMATO (stesso turno+sezione) NON compaiono:
 * le card mostrano già i nomi reali.
 *
 * `realCodes`: sigla PDF (giorno `day`) per ogni persona NON in sezione —
 * assenze/riposi COME NEL PDF («A», «AG7», «F.E.»…). Con il solo day-schedule
 * quei codici sono perduti (un assente non entra nella giornata); si
 * ricostruiscono dal mese v2 (`SalaSchedule.data` → decodeSalaMonth) quando
 * disponibile. UNA persona senza posizione né sigla resta «assente».
 *
 * `bareOwners` (lib/shift-teams-matching, da buildBareOwners(tree,
 * duplicateCognomi)): omonimi con membro LEGATO via user_id — la riga PDF con
 * il SOLO cognome («NEVANO») appartiene al legato (Pietro), gli altri omonimi
 * matchano solo con l'iniziale («NEVANO G.»).
 */
export function theoRealSectionCompare(
  month: string,
  day: number,
  tree: Pick<ShiftTeamTree, 'types'>,
  adjustments: ShiftAdjustment[],
  realDay: DaySchedule | undefined,
  realCodes?: Map<string, string>,
  bareOwners?: BareOwnerMap | null,
): Map<string, TheoRealSectionCompare> {
  const dateISO = `${month}-${String(day).padStart(2, '0')}`
  // 1) teorico: token per MEMBRO (non collassato per cognome: gli omonimi
  //    «DI NAPOLI M.» / «DI NAPOLI A.» hanno token diversi lo stesso giorno).
  //    Match ESATTO per nome normalizzato quando il PDF ha l'iniziale
  //    («DI NAPOLI A.»), altrimenti fallback sulla chiave COGNOME.
  interface TheoMember { exactKey: string; cognomeKey: string; token: string; full: string; nameNorm: string }
  const theoMembers: TheoMember[] = []
  const theoByExact = new Map<string, string>()
  const theoByCognome = new Map<string, string>()
  for (const type of tree.types) {
    if (!type.is_active) continue
    for (const team of type.teams) {
      for (const member of team.members) {
        if (!member.is_active) continue
        const token = tokenForMember(type, member, team.id, adjustments, dateISO)
        if (!token) continue
        const exactKey = normName(member.full_name)
        const cognomeKey = surnameKey(member.full_name)
        theoMembers.push({ exactKey, cognomeKey, token, full: member.full_name, nameNorm: exactKey })
        theoByExact.set(exactKey, token)
        // Omonimi: la chiave cognome vale solo se NON ambigua; se c'è un legato
        // (user_id) il bare è SUO, quindi la sua sigla vince la collisione.
        if (!theoByCognome.has(cognomeKey) || member.user_id) theoByCognome.set(cognomeKey, token)
      }
    }
  }
  // Proprietario del nome BARE per cognome (omonimi con membro LEGATO, caso
  // NEVANO): dalla mappa dei bare owner. Il proprietario conta solo se il suo
  // membro è davvero fra i previsti dal teorico (altrimenti il PDF bare
  // resterebbe senza destinatario). Chiave cognome → nome normalizzato.
  const bareOwnerOf = new Map<string, string>()
  if (bareOwners?.size) {
    for (const [key, owner] of bareOwners) {
      if (theoByExact.has(owner.nameNorm)) bareOwnerOf.set(key, owner.nameNorm)
    }
  }
  // 2) reale: TUTTE le posizioni per cognome (omonimi: «DI NAPOLI M.» e
  //    «DI NAPOLI A.» condividono la chiave e possono essere in sezioni diverse
  //    lo stesso giorno) + codice PDF per i non-in-sezione.
  const realByCognome = new Map<string, RealEntry[]>()
  if (realDay) {
    const put = (name: string, shift: string, section: string | null) => {
      const key = surnameKey(name)
      if (!key) return
      const norm = normName(name)
      // Nome BARE (solo cognome) di un cognome con legato: la posizione è del
      // legato («NEVANO» →nevano p.»), così i match ESATTI per omonimo funzionano.
      const ownerNorm = bareOwnerOf.get(key)
      const exact = ownerNorm && norm === key ? ownerNorm : norm
      const list = realByCognome.get(key) ?? []
      // prima posizione vince per la STESSA persona (dedup tirocinanti/slot)
      if (list.some(r => r.shift === shift && r.section === section)) return
      list.push({ shift, section, full: name, exact, code: realCodes?.get(key) ?? '' })
      realByCognome.set(key, list)
    }
    for (const [section, shifts] of Object.entries(realDay.sections)) {
      for (const shift of ['M', 'P', 'N'] as const) {
        const data = shifts[shift]
        if (!data) continue
        for (const n of [...data.surnames.T, ...data.surnames.S, ...data.surnames.noSlot]) put(n, shift, section)
        for (const n of data.tirocinanti) put(n, shift, section)
      }
    }
    for (const n of realDay.altriPresenti) put(n, '—', null)
  }

  const out = new Map<string, TheoRealSectionCompare>()
  const ensure = (section: string, shift: string) => {
    const key = `${section}|${shift}`
    if (!out.has(key)) out.set(key, { rows: [], extras: [], theoreticalOnly: false })
    return out.get(key)!
  }
  const sectionHasRealPeople = (section: string) =>
    [...realByCognome.values()].some(list => list.some(r => r.section === section))

  // 3) righe TEORICHE: una per membro previsto IN SERVIZIO con sezione.
  //    Con gli OMONIMI una chiave cognome ha più posizioni reali: prima si
  //    cerca la CONFERMA (stesso turno+sezione — quella persona c'è, riga via),
  //    poi per le righe restanti si sceglie la posizione NON ancora usata,
  //    preferendo lo stesso turno (chi si sposta resta di solito nel turno).
  const claimed = new Set<RealEntry>()
  for (const tm of theoMembers) {
    const { token, full, cognomeKey } = tm
    if (!isShiftCode(token)) continue
    const { shift, section } = parseShiftCode(token)
    if (ABSENT_CODES.has(token) || NON_SECTION_DUTIES.has(section)) continue
    // Sigla REALE del PDF per questa persona (mese v2): match ESATTO sul nome
    // normalizzato (gli OMONIMI hanno celle diverse: DI NAPOLI M. ≠ DI NAPOLI A.),
    // altrimenti la prima sigla trovata sul COGNOME.
    const norm = normName(full)
    // Omonimi con LEGATO (caso NEVANO): il bare («NEVANO») è del legato — i non
    // proprietari non possono né prendere le sue posizioni né la sua sigla.
    const ownerNorm = bareOwnerOf.get(cognomeKey)
    const isOwner = !ownerNorm || norm === ownerNorm
    const cognomeCode = isOwner ? realCodes?.get(cognomeKey) : undefined
    const exactCode = realCodes?.get(norm)
    // Omonimi: le posizioni reali della STESSA persona (nome esatto) se il PDF
    // le distingue («DI NAPOLI A.»), altrimenti tutte quelle del cognome — ma i
    // NON proprietari del bare vedono SOLO le posizioni con la loro iniziale.
    const cognomeList = realByCognome.get(cognomeKey) ?? []
    const exactList = cognomeList.filter(c => c.exact === norm)
    const candidates = !isOwner ? exactList : exactList.length ? exactList : cognomeList
    const confirmed = candidates.find(c => !claimed.has(c) && c.section !== null && c.shift === shift && c.section === section)
    if (confirmed) {
      claimed.add(confirmed)
      continue
    }
    const free = candidates.filter(c => !claimed.has(c))
    const real = free.find(c => c.section !== null && c.shift === shift) ?? free[0]
    if (real) claimed.add(real)
    // Nessuna posizione nella giornata: la sigla REALE del PDF (A/AG7/F.E.…)
    // dal mese v2; se nemmeno quella c'è la persona è proprio «assente».
    const absenceCode = exactCode ?? cognomeCode
    const status = real
      ? real.section !== null
        ? `${real.shift}${real.section}`
        : real.code || 'presente'
      : absenceCode || 'assente'
    ensure(section, shift).rows.push({ name: full, theo: token, real: status })
  }

  // 4) EXTRAS: persone REALI in sezione che il teorico non prevedeva LÌ
  //    (altro turno, riposo RC/RI/RM/D, assenza o non in scheda).
  const seenExtras = new Set<string>()
  if (realDay) {
    for (const [section, shifts] of Object.entries(realDay.sections)) {
      for (const shift of ['M', 'P', 'N'] as const) {
        const data = shifts[shift]
        if (!data) continue
        const people = [...data.surnames.T, ...data.surnames.S, ...data.surnames.noSlot, ...data.tirocinanti]
        for (const name of people) {
          const key = surnameKey(name)
          const dedup = `${key}|${shift}|${section}`
          if (!key || seenExtras.has(dedup)) continue
          seenExtras.add(dedup)
          const theoToken = theoByExact.get(normName(name)) ?? theoByCognome.get(key)
          // Non è un «Nuovi» se una posizione reale di questo cognome con lo
          // stesso turno+sezione è stata CONSUMATA da un teorico confermato
          // (omonimi: l'altro DI NAPOLI non genera un extra falso qui).
          const consumed = (realByCognome.get(key) ?? []).some(
            c => claimed.has(c) && c.shift === shift && c.section === section,
          )
          if (consumed) continue
          ensure(section, shift).extras.push({ name, real: `${shift}${section}`, theo: theoToken ?? '' })
        }
      }
    }
  }

  // 5) le sezioni SOLO teoriche (nessun reale) restano con theoreticalOnly=true:
  //    le righe «assente» bastano a raccontarle.
  for (const [key, cmp] of out) {
    const [section] = key.split('|')
    cmp.theoreticalOnly = !sectionHasRealPeople(section)
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
