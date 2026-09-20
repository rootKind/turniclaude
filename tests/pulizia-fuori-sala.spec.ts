import { test, expect } from '@playwright/test'
import { dayStatesForRequests, findFulfilledShiftRequests, type ShiftRequestRow } from '../lib/queries/shift-cleanup'
import { applyTokenToDay } from '../lib/shift-tokens'
import { fuoriSalaInfo, type MonthPersonShifts } from '../lib/sala-month'
import type { DaySchedule } from '../types/database'

/** Il calendario (sezioni) ricostruito da UNA delle due righe del PDF. */
function calendarioDa(people: MonthPersonShifts[], riga: 'days' | 'teorico'): Record<number, DaySchedule> {
  const calendario: Record<number, DaySchedule> = {}
  for (let d = 1; d <= 31; d++) calendario[d] = { sections: {}, altriPresenti: [], altriPresentiTokens: [] }
  for (const p of people) {
    for (let d = 1; d <= 31; d++) applyTokenToDay(calendario[d], p.name, p[riga][d - 1] ?? '')
  }
  return calendario
}

/**
 * LA PULIZIA DEI CAMBI: SOLO TURNI CONFERMATI, MAI IPOTESI (26/09/2026).
 *
 * Tre regole, in ordine di quanto sono facili da sbagliare:
 *
 * 1. si guarda SOLO la riga REALE del PDF, mai il `teorico` (le due righe
 *    differiscono in ~40% delle celle: nei mesi di dev, a settembre 1156 su 2910);
 * 2. una cella GIALLA è un'IPOTESI di turno («diverse dal teorico», parole
 *    dell'utente), non un turno confermato: da lì non si decide NIENTE — né «il
 *    cambio è già avvenuto» né «quel giorno non sei in sala»;
 * 3. oltre ai cambi già avvenuti si ripuliscono i giorni FUORI SALA: assenze
 *    (A, AG7, F, F.E., VS, Trasf) e attività senza sezione (trasferte, corsi,
 *    istruttori, turni «nudi»). Restano fuori — per decisione, non per
 *    dimenticanza — riposi (RC/RI/RM), disponibilità (D) e codici che la board
 *    non mostra (G, Na, MSb, TIR, 12.14…): il confine è qui sotto, provato.
 *
 * Il turno reale del giorno arriva dalla forma compatta v2 del mese, l'unica che
 * conserva il codice di OGNI persona in OGNI giorno (il calendario espanso ha
 * sezioni e «altri presenti», non le assenze) e l'unica che porta il giallo.
 */

const users = [{ id: 'u1', nome: 'Mario', cognome: 'Rossi' }]
const users2 = [{ id: 'u2', nome: 'Nicola', cognome: 'Piscopo' }]
const CHIAVE = 'u1|2026-09-10'

/** La riga reale di un giorno: codice + giallo (ipotesi). */
const riga = (token: string, pending = false) => ({ token, pending })

function giornoCon(token: string, name = 'ROSSI'): DaySchedule {
  const day: DaySchedule = { sections: {}, altriPresenti: [], altriPresentiTokens: [] }
  applyTokenToDay(day, name, token)
  return day
}

function richiesta(over: Partial<ShiftRequestRow> = {}): ShiftRequestRow {
  return {
    id: 1,
    user_id: 'u1',
    offered_shift: 'Pomeriggio',
    shift_date: '2026-09-10',
    requested_shifts: ['Mattina'],
    user: { id: 'u1', nome: 'Mario', cognome: 'Rossi' },
    ...over,
  }
}

test.describe('pulizia cambi: i giorni fuori sala', () => {
  test('il codice del giorno dice se è assenza o attività senza sezione', () => {
    // Assenze (famiglia del PDF) → etichetta sua.
    expect(fuoriSalaInfo('A')).toEqual({ code: 'A', label: 'Altre presenze' })
    expect(fuoriSalaInfo('AG7')).toEqual({ code: 'AG7', label: 'Assenza' })
    expect(fuoriSalaInfo('F.E.')).toEqual({ code: 'F.E.', label: 'Ferie' })
    expect(fuoriSalaInfo('F')).toEqual({ code: 'F', label: 'Ferie' })
    expect(fuoriSalaInfo('VS')).toEqual({ code: 'VS', label: 'Visita sanitaria' })
    expect(fuoriSalaInfo('Trasf')).toEqual({ code: 'Trasf', label: 'Trasferta' })
    // Attività senza sezione: la board le mette nella riga «Altre attività».
    expect(fuoriSalaInfo('DisNa')).toEqual({ code: 'DisNa', label: 'Trasferta' })
    expect(fuoriSalaInfo('NDisNa')).toEqual({ code: 'NDisNa', label: 'Trasferta' })
    expect(fuoriSalaInfo('M')).toEqual({ code: 'M', label: 'Trasferta' })
    expect(fuoriSalaInfo('SpN')).toEqual({ code: 'SpN', label: 'Corso' })
    expect(fuoriSalaInfo('MTUTOR')).toEqual({ code: 'MTUTOR', label: 'Istruttore' })
  })

  test('riposi, disponibilità e codici invisibili NON contano (confine deciso)', () => {
    for (const t of ['RC', 'RI', 'RM', 'D', 'G', 'Na', 'MSb', 'TIR', '12.14']) {
      expect(fuoriSalaInfo(t), `«${t}» non deve far scattare la pulizia`).toBeNull()
    }
    // Un turno su una CARD di sezione non è «fuori sala»: è il turno che c'è.
    expect(fuoriSalaInfo('M7S')).toBeNull()
    expect(fuoriSalaInfo('')).toBeNull()
    expect(fuoriSalaInfo(null)).toBeNull()
  })

  test('il cambio già avvenuto resta un caso a sé (esaudito)', () => {
    const out = findFulfilledShiftRequests(
      [richiesta()], users, '2026-09', { 10: giornoCon('M7S') }, undefined,
      new Map([[CHIAVE, riga('M7S')]]),
    )
    expect(out).toHaveLength(1)
    expect(out[0].reason).toBe('esaudito')
    expect(out[0].actual_shift).toBe('M')
  })

  test('assente quel giorno: la richiesta va pulita, con il codice nel motivo', () => {
    const out = findFulfilledShiftRequests(
      [richiesta()], users, '2026-09', { 10: giornoCon('F.E.') }, undefined,
      new Map([[CHIAVE, riga('F.E.')]]),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      reason: 'fuori-sala', actual_shift: null, day_code: 'F.E.', day_label: 'Ferie',
    })
  })

  test('trasferta, corso e istruttore: stessa pulizia, etichetta diversa', () => {
    for (const [token, label] of [['DisNa', 'Trasferta'], ['SpN', 'Corso'], ['MTUTOR', 'Istruttore'], ['A', 'Altre presenze']] as const) {
      const out = findFulfilledShiftRequests(
        [richiesta()], users, '2026-09', { 10: giornoCon(token) }, undefined,
        new Map([[CHIAVE, riga(token)]]),
      )
      expect(out, `«${token}» deve essere ripulito`).toHaveLength(1)
      expect(out[0].day_label).toBe(label)
      expect(out[0].day_code).toBe(token)
    }
  })

  test('riposo: NON si pulisce (e il turno su una card, se non è fra quelli chiesti, nemmeno)', () => {
    const riposo = findFulfilledShiftRequests(
      [richiesta()], users, '2026-09', { 10: giornoCon('RC') }, undefined,
      new Map([[CHIAVE, riga('RC')]]),
    )
    expect(riposo, 'il riposo è fuori dalla pulizia').toHaveLength(0)

    const altroTurno = findFulfilledShiftRequests(
      [richiesta()], users, '2026-09', { 10: giornoCon('P7S') }, undefined,
      new Map([[CHIAVE, riga('P7S')]]),
    )
    expect(altroTurno, 'un turno diverso da quelli chiesti non è una richiesta morta').toHaveLength(0)

    const senzaDati = findFulfilledShiftRequests(
      [richiesta()], users, '2026-09', { 10: giornoCon('') }, undefined, null,
    )
    expect(senzaDati).toHaveLength(0)
  })

  test.describe('cella GIALLA = ipotesi: la pulizia non la tocca', () => {
    /**
     * Il giallo del PDF è una PROPOSTA di turno, non un turno confermato (parole
     * dell'utente, 26/09/2026: «le celle con sfondo giallo sono delle ipotesi di
     * turno reale ma diverse dal teorico»). Da un'ipotesi non si cancella niente:
     * la richiesta resta in attesa della conferma. Qui si prova che il blocco vale
     * per ENTRAMBE le strade della pulizia, e che è il giallo a decidere — gli
     * stessi dati senza giallo finiscono ripuliti.
     */
    test('giorno giallo con il turno chiesto: NON è «già avvenuto»', () => {
      const sched = { 10: giornoCon('M7S') }
      const confermato = findFulfilledShiftRequests(
        [richiesta()], users, '2026-09', sched, undefined, new Map([[CHIAVE, riga('M7S', false)]]),
      )
      expect(confermato, 'senza giallo il cambio risulta già avvenuto').toHaveLength(1)

      const ipotesi = findFulfilledShiftRequests(
        [richiesta()], users, '2026-09', sched, undefined, new Map([[CHIAVE, riga('M7S', true)]]),
      )
      expect(ipotesi, 'col giallo è un’ipotesi: la richiesta resta').toHaveLength(0)
    })

    test('giorno giallo con un’assenza: NON è «fuori sala»', () => {
      const sched = { 10: giornoCon('A') }
      const confermato = findFulfilledShiftRequests(
        [richiesta()], users, '2026-09', sched, undefined, new Map([[CHIAVE, riga('A', false)]]),
      )
      expect(confermato).toHaveLength(1)

      const ipotesi = findFulfilledShiftRequests(
        [richiesta()], users, '2026-09', sched, undefined, new Map([[CHIAVE, riga('A', true)]]),
      )
      expect(ipotesi, 'un’assenza ipotizzata non fa ripulire la richiesta').toHaveLength(0)
    })

    test('il giallo si legge dal v2, giorno per giorno', () => {
      const giorni = (indice: number, token: string) => Array.from({ length: 31 }, (_, i) => (i === indice ? token : ''))
      const people: MonthPersonShifts[] = [{
        name: 'ROSSI', days: giorni(9, 'A'), teorico: [], yellow: [10],
      }]
      const stati = dayStatesForRequests(
        new Map([['2026-09', people]]),
        [{ user_id: 'u1', shift_date: '2026-09-10' }, { user_id: 'u1', shift_date: '2026-09-11' }],
        users,
      )
      expect(stati.get('u1|2026-09-10'), 'il giorno 10 è giallo').toEqual({ token: 'A', pending: true })
      expect(stati.get('u1|2026-09-11'), 'il giorno 11 non lo è').toEqual({ token: '', pending: false })
    })
  })

  test('si guarda SOLO la riga reale, mai il teorico (caso Piscopo, 29/09/2026)', () => {
    // Il dato vero di dev: il PDF stampa in teoria «N7T» (Notte in sezione 7) ma
    // la riga REALE di quel giorno dice «A» (Altre presenze), e la cella NON è
    // gialla (misurato: è un'assenza vera, non un'ipotesi). Con la riga reale la
    // richiesta (offre Notte, cerca Pomeriggio) va ripulita; con la teorica no —
    // sembrerebbe che quel giorno il turno ce l'ha.
    const piscopo: MonthPersonShifts = {
      name: 'PISCOPO',
      days: Array.from({ length: 31 }, (_, i) => (i === 28 ? 'A' : '')),
      teorico: Array.from({ length: 31 }, (_, i) => (i === 28 ? 'N7T' : '')),
      yellow: [],
    }
    const req = [richiesta({
      id: 7, user_id: 'u2', user: { id: 'u2', nome: 'Nicola', cognome: 'Piscopo' },
      shift_date: '2026-09-29', offered_shift: 'Notte', requested_shifts: ['Pomeriggio'],
    })]

    const conReale = findFulfilledShiftRequests(
      req, users2, '2026-09', calendarioDa([piscopo], 'days'), undefined,
      dayStatesForRequests(new Map([['2026-09', [piscopo]]]), [{ user_id: 'u2', shift_date: '2026-09-29' }], users2),
    )
    expect(conReale, 'il giorno reale è un’assenza: la richiesta non è più eseguibile').toHaveLength(1)
    expect(conReale[0]).toMatchObject({ reason: 'fuori-sala', day_code: 'A', day_label: 'Altre presenze' })

    const conTeorico = findFulfilledShiftRequests(
      req, users2, '2026-09', calendarioDa([piscopo], 'teorico'), undefined,
      dayStatesForRequests(
        new Map([['2026-09', [{ ...piscopo, days: piscopo.teorico }]]]),
        [{ user_id: 'u2', shift_date: '2026-09-29' }], users2),
    )
    expect(conTeorico, 'col teorico non si ripulirebbe niente: è la riga che NON usiamo').toHaveLength(0)
  })

  test('anche il «già avvenuto» guarda la riga reale', () => {
    // Reale: il turno chiesto c'è → il cambio è avvenuto. Teorico: riposo.
    // La pulizia deve decidere sul reale (il teorico qui direbbe «non è cambiato niente»).
    const rossi: MonthPersonShifts = {
      name: 'ROSSI',
      days: Array.from({ length: 31 }, (_, i) => (i === 9 ? 'M7S' : '')),
      teorico: Array.from({ length: 31 }, (_, i) => (i === 9 ? 'RC' : '')),
      yellow: [],
    }
    const conReale = findFulfilledShiftRequests(
      [richiesta()], users, '2026-09', calendarioDa([rossi], 'days'), undefined,
      dayStatesForRequests(new Map([['2026-09', [rossi]]]), [{ user_id: 'u1', shift_date: '2026-09-10' }], users),
    )
    expect(conReale).toHaveLength(1)
    expect(conReale[0]).toMatchObject({ reason: 'esaudito', actual_shift: 'M' })

    const conTeorico = findFulfilledShiftRequests(
      [richiesta()], users, '2026-09', calendarioDa([rossi], 'teorico'), undefined,
      dayStatesForRequests(
        new Map([['2026-09', [{ ...rossi, days: rossi.teorico }]]]),
        [{ user_id: 'u1', shift_date: '2026-09-10' }], users),
    )
    expect(conTeorico, 'sul teorico il turno chiesto non c’è: non è una decisione che ci riguarda').toHaveLength(0)
  })

  test('i dati del giorno si leggono dal v2, per la persona giusta e nel giorno giusto', () => {
    const giorni = (token: string, indice: number) => Array.from({ length: 31 }, (_, i) => (i === indice ? token : ''))
    const people: MonthPersonShifts[] = [{ name: 'ROSSI', days: giorni('F.E.', 9), teorico: [], yellow: [] }]
    const stati = dayStatesForRequests(
      new Map([['2026-09', people]]),
      [{ user_id: 'u1', shift_date: '2026-09-10' }, { user_id: 'u1', shift_date: '2026-09-11' }],
      users,
    )
    expect(stati.get('u1|2026-09-10')).toEqual({ token: 'F.E.', pending: false })
    expect(stati.get('u1|2026-09-11')).toEqual({ token: '', pending: false })
    // Nessuna persona del mese per quel mese: nessuna chiave (e la pulizia, senza
    // dati, resta quella di prima: solo i cambi già avvenuti).
    expect(dayStatesForRequests(new Map(), [{ user_id: 'u1', shift_date: '2026-09-10' }], users).size).toBe(0)
  })
})
