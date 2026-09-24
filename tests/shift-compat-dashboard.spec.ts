import { test, expect } from '@playwright/test'
import { groupShiftsForMe, MINE_HEADER, COMPATIBLE_HEADER, type CompatContext, type ShiftForCompat } from '../lib/shift-compat-dashboard'
import type { MonthPersonShifts } from '../lib/sala-month'
import type { ShiftTeamTree } from '../types/database'

/**
 * Il gruppo «PER ME» della dashboard (richiesta 25/09/2026), provato sulla
 * LOGICA (`groupShiftsForMe`): la chip che unisce i cambi offerti dall'utente
 * alle richieste COMPATIBILI col suo turno — lo stesso criterio delle
 * notifiche «nuovo turno pubblicato» (`notify_shift_filter`): turno REALE dal
 * PDF del mese, altrimenti TEORICO dalla rotazione delle squadre; copre se è
 * fra i turni cercati. Regole provate qui:
 *   • il possesso vince sempre (anche quando quel giorno sono in riposo) e
 *     nessuna richiesta finisce in due gruppi;
 *   • il PDF reale batte il teorico; un riposo NON ripiega sul teorico;
 *   • il giorno IGNOTO (né PDF né teorico) non nasconde nulla: resta compatibile;
 *   • i gruppi vuoti non esistono e l'ordine di arrivo resta dentro ciascuno.
 */

interface S extends ShiftForCompat { id: number }

const shift = (id: number, user_id: string, shift_date: string, requested: string[]): S => ({
  id, user_id, shift_date, requested_shifts: requested,
})

const persona = (name: string, days: string[]): MonthPersonShifts => ({
  name, days, teorico: days.map(() => ''), yellow: [],
})

/** Settembre 2026 (30 giorni) con un solo token alla data indicata.
 *  Nome alla PDF («ROSSI M.», non «ROSSI MARIO»): è il formato delle righe
 *  reali e l'unico che `personNameMatches` riconosce — specchio fedele di
 *  `getUserShiftOnDate`. */
const giorni = (day: number, token: string, totale = 30): string[] =>
  Array.from({ length: totale }, (_, i) => (i === day - 1 ? token : ''))

// Albero minimo: ROSSI MARIO legato a u-rossi. Ancoraggio 2026-03-01,
// pattern di 4: [RM, M5T, RM, RM] → il TEORICO è M ogni giorno ≡1 (mod 4),
// es. 2026-03-02 e 2026-09-10 (193 giorni dopo l'ancoraggio, 193 % 4 = 1).
const tree: ShiftTeamTree = {
  types: [
    {
      id: 't-terza', name: 'Squadra in terza', cycle_days: 84, pattern_start: '2026-03-01',
      is_active: true, sort_order: 1,
      teams: [
        { id: 'A', shift_type_id: 't-terza', name: 'Squadra A', phase_offset_days: 0, sort_order: 1, members: [
          { id: 'm-rossi', team_id: 'A', full_name: 'ROSSI MARIO', user_id: 'u-rossi', pattern: ['RM', 'M5T', 'RM', 'RM'], sort_order: 1, is_active: true, is_lead: false },
        ] },
      ],
    },
  ],
  adjustments: [],
}

const ctxBase = (over: Partial<CompatContext> = {}): CompatContext => ({
  effectiveUserId: 'u-rossi',
  myNome: 'Mario',
  myCognome: 'Rossi',
  peopleByMonth: new Map(),
  tree,
  duplicateCognomi: new Set(),
  users: [
    { id: 'u-rossi', cognome: 'Rossi' },
    { id: 'u-bianchi', cognome: 'Bianchi' },
  ],
  ...over,
})

const pdfSettembre = (giorno: number, token: string): Map<string, MonthPersonShifts[]> =>
  new Map([['2026-09', [persona('ROSSI M.', giorni(giorno, token))]]])

test('i titoli dei gruppi sono quelli decisi con il richiedente', () => {
  expect(MINE_HEADER).toBe('Offerti da te')
  expect(COMPATIBLE_HEADER).toBe('Compatibili col tuo turno')
})

test('il teorico decide la compatibilità quando il mese non ha PDF', () => {
  // 2026-03-02 → teorico M per ROSSI: copre chi cerca M, non chi cerca P.
  const { gruppi, totaleUnione } = groupShiftsForMe(
    [
      shift(1, 'u-bianchi', '2026-03-02', ['Mattina']),
      shift(2, 'u-bianchi', '2026-03-02', ['Pomeriggio']),
    ],
    ctxBase(),
  )
  expect(gruppi).toHaveLength(1)
  expect(gruppi[0].titolo).toBe(COMPATIBLE_HEADER)
  expect(gruppi[0].shifts.map(s => s.id)).toEqual([1])
  expect(totaleUnione).toBe(1)
})

test('il PDF reale batte il teorico e il riposo non ripiega sul teorico', () => {
  // Il 10/9 il TEORICO di ROSSI sarebbe M (193 % 4 = 1), ma il PDF dice RM:
  // il giorno è deciso = riposo → non copre il turno M cercato.
  const riposo = groupShiftsForMe(
    [shift(1, 'u-bianchi', '2026-09-10', ['Mattina'])],
    ctxBase({ peopleByMonth: pdfSettembre(10, 'RM') }),
  )
  expect(riposo.gruppi).toHaveLength(0)

  // L'11/9 il PDF dice P8T: copre chi cerca Pomeriggio (il teorico sarebbe RM).
  const turno = groupShiftsForMe(
    [shift(2, 'u-bianchi', '2026-09-11', ['Pomeriggio'])],
    ctxBase({ peopleByMonth: pdfSettembre(11, 'P8T') }),
  )
  expect(turno.gruppi).toHaveLength(1)
  expect(turno.gruppi[0].titolo).toBe(COMPATIBLE_HEADER)
})

test('il possesso vince sempre e nessuna richiesta finisce in due gruppi', () => {
  const { gruppi } = groupShiftsForMe(
    [
      shift(1, 'u-rossi', '2026-09-10', ['Mattina']),   // mio NONOSTANTE il riposo PDF
      shift(2, 'u-bianchi', '2026-09-14', ['Mattina']), // compatibile (teorico M)
    ],
    ctxBase({ peopleByMonth: pdfSettembre(10, 'RM') }),
  )
  expect(gruppi).toHaveLength(2)
  expect(gruppi[0].titolo).toBe(MINE_HEADER)
  expect(gruppi[0].shifts.map(s => s.id)).toEqual([1])
  expect(gruppi[1].titolo).toBe(COMPATIBLE_HEADER)
  expect(gruppi[1].shifts.map(s => s.id)).toEqual([2])
})

test('DCO+: il possesso comprende i Noni (titolo dedicato) senza doppioni', () => {
  const possessivo = (s: ShiftForCompat) => s.user_id === 'u-rossi' || s.user_id === 'u-noni'
  const { gruppi } = groupShiftsForMe(
    [
      shift(1, 'u-rossi', '2026-09-10', ['Mattina']),
      shift(2, 'u-noni', '2026-09-12', ['Notte']),
      shift(3, 'u-bianchi', '2026-09-14', ['Mattina']), // teorico M → compatibile
    ],
    ctxBase({
      possessivo,
      titoloMiei: 'Offerti da te e dai Noni',
      peopleByMonth: pdfSettembre(10, 'RM'),
    }),
  )
  expect(gruppi).toHaveLength(2)
  expect(gruppi[0].titolo).toBe('Offerti da te e dai Noni')
  expect(gruppi[0].shifts.map(s => s.id)).toEqual([1, 2])
  expect(gruppi[1].shifts.map(s => s.id)).toEqual([3])
})

test('i gruppi vuoti non esistono e le richieste senza preferenze spariscono', () => {
  const soloMiei = groupShiftsForMe(
    [shift(1, 'u-rossi', '2026-09-10', ['Mattina'])],
    ctxBase({ peopleByMonth: pdfSettembre(10, 'RM') }),
  )
  expect(soloMiei.gruppi.map(g => g.titolo)).toEqual([MINE_HEADER])

  const nessuno = groupShiftsForMe(
    [shift(2, 'u-bianchi', '2026-09-11', [])], // nessuna preferenza: nulla da coprire
    ctxBase({ peopleByMonth: pdfSettembre(10, 'RM') }),
  )
  expect(nessuno.gruppi).toHaveLength(0)
  expect(nessuno.totaleUnione).toBe(0)
})

test('il giorno ignoto (né PDF né teorico) non nasconde nulla', () => {
  // Un viewer che non è né nel PDF né nell'albero: come le notifiche senza
  // fonti, la richiesta resta compatibile invece di sparire.
  const { gruppi } = groupShiftsForMe(
    [shift(1, 'u-bianchi', '2026-09-10', ['Mattina'])],
    ctxBase({ effectiveUserId: 'u-sconosciuto', myNome: null, myCognome: null }),
  )
  expect(gruppi).toHaveLength(1)
  expect(gruppi[0].titolo).toBe(COMPATIBLE_HEADER)
})

test("l'ordine di arrivo resta dentro ciascun gruppo", () => {
  const { gruppi } = groupShiftsForMe(
    [
      shift(1, 'u-bianchi', '2026-09-14', ['Mattina']), // compatibile (teorico M)
      shift(2, 'u-rossi', '2026-09-10', ['Mattina']),   // mio (PDF RM)
      shift(3, 'u-bianchi', '2026-03-02', ['Mattina']), // compatibile (teorico M)
      shift(4, 'u-rossi', '2026-09-11', ['Mattina']),   // mio
    ],
    ctxBase({ peopleByMonth: pdfSettembre(10, 'RM') }),
  )
  expect(gruppi.map(g => g.titolo)).toEqual([MINE_HEADER, COMPATIBLE_HEADER])
  expect(gruppi[0].shifts.map(s => s.id)).toEqual([2, 4])
  expect(gruppi[1].shifts.map(s => s.id)).toEqual([1, 3])
})
