import { test, expect } from '@playwright/test'
import { scopertiDetailForDay, scopertiForDay, type MonthPersonShifts, type SalaSlotKind } from '../lib/sala-month'
import {
  NIGHT_MIN_DEFAULTS,
  coveringPeriod,
  defaultMinFor,
  defaultSnapshot,
  effectiveEntry,
  minValuesForDay,
  periodCovers,
  periodsForCell,
  snapshotForDay,
  turnoPassato,
  withMinimoEntry,
  withMinimoPeriod,
  withoutMinimoPeriod,
} from '../lib/sala-minimi'
import type { SalaMinimoEntry, SalaMinimoPeriod } from '../types/database'

/**
 * LE CARD SCOPERTE, provate sulla LOGICA e non sui dati (richieste 27/09 e
 * 15/09/2026).
 *
 * Perché non basta il test dal vivo (`dipendente.spec.ts`): la scopertura
 * dipende dal PDF caricato e dal periodo. Nel mese attualmente in archivio la
 * VECCHIA regola (solo gialli) non segnala più niente, mentre la nuova ne trova
 * 11 — provata qui su casi costruiti a mano, gira in millisecondi senza dev
 * server né service-role, quindi non si salta mai.
 *
 * Due cose si difendono qui:
 *  1. `scopertiForDay` — scoperto = reali sotto il MINIMO **o** persona
 *     spostata da un giallo; le due cause non si sommano (la stessa persona non
 *     va contata due volte).
 *  2. `lib/sala-minimi` — i default (piantina doppia→2, tabella della notte) e
 *     la storia datata: il minimo di un giorno E TURNO è quello in vigore lì, e
 *     finché nessuna voce lo copre la regola NON si applica. Una voce può
 *     entrare a metà giornata (richiesta 16/09/2026).
 */

/** Una persona su un mese di 1 giorno: reale | teorico | giorni gialli. */
const persona = (name: string, real: string, teo: string, yellow: number[] = []): MonthPersonShifts => ({
  name,
  days: [real],
  teorico: [teo],
  yellow,
})

const GIORNO = 1
/** Minimi chiave «SEZIONE|TURNO» come li costruisce `minValuesForDay`. */
const mins = (values: Record<string, number>) => new Map(Object.entries(values))
const chiavi = (m: Map<string, number>) => [...m.entries()].map(([k, n]) => (n > 1 ? `${k}×${n}` : k))

const card = (sectionKey: string | undefined, title: string, type: 'single' | 'double') =>
  ({ sectionKey, title, type })

test.describe('scoperti: causa GIALLO (la regola del 27/09, senza minimi)', () => {
  test('2 attese e 1 reale → scoperta anche se la card non è vuota', () => {
    // X è stato chiamato sulla DCP|M (giallo sostituto): la DCIF|M perde una
    // delle due persone attese e resta con la sola Y.
    const persone = [
      persona('X', 'MDCP', 'MDCIF', [GIORNO]),
      persona('Y', 'MDCIF', 'MDCIF'),
    ]
    expect(chiavi(scopertiForDay(persone, GIORNO))).toEqual(['DCIF|M'])
  })

  test('se qualcuno copre il posto, la card non è più scoperta (ma paga la sua)', () => {
    const persone = [
      persona('X', 'MDCP', 'MDCIF', [GIORNO]),
      persona('Y', 'MDCIF', 'MDCIF'),
      persona('Z', 'MDCIF', 'MDCCM', [GIORNO]),
    ]
    const scoperti = scopertiForDay(persone, GIORNO)
    expect(scoperti.has('DCIF|M'), 'DCIF|M ha di nuovo 2 reali su 2 attese').toBe(false)
    expect(scoperti.has('DCCM|M'), 'Z ha lasciato scoperta la sua DCCM|M').toBe(true)
  })

  test("il RICHIEDENTE (assenza sul proprio turno) non svuota la card d'origine", () => {
    const persone = [persona('W', 'A', 'MDCIF', [GIORNO])]
    expect([...scopertiForDay(persone, GIORNO)]).toEqual([])
  })

  test('senza giallo non c’è scopertura, nemmeno con meno reali che attese', () => {
    // Due attese, un solo reale, nessuna cella gialla: è una divergenza
    // normale e non va segnalata (v8: «solo quelle gialle»). Con i minimi
    // configurati, invece, questa card PUÒ essere scoperta — vedi sotto.
    const persone = [persona('Q', 'MDCIF', 'MDCIF'), persona('R', '', 'MDCIF')]
    expect([...scopertiForDay(persone, GIORNO)]).toEqual([])
  })

  test('il sostituto che lavora nella STESSA card non la scopre', () => {
    const persone = [persona('W', 'MDCIF', 'MDCIF', [GIORNO])]
    expect([...scopertiForDay(persone, GIORNO)]).toEqual([])
  })
})

test.describe('scoperti: causa MINIMO (il caso ROTONDO)', () => {
  test('sotto il minimo senza nessun giallo → scoperta, e si sa di quante persone', () => {
    // ROTONDO ha il teorico a G (fuori da ogni sezione): niente gialli, ma la
    // DOppia 4° resta con una persona sola. La vecchia regola non lo vedeva.
    const persone = [
      persona('ROTONDO', 'G', 'G'),
      persona('COMPAGNO', 'M4T', 'M4T'),
    ]
    expect(chiavi(scopertiForDay(persone, GIORNO, mins({ '4|M': 2 })))).toEqual(['4|M'])
    expect(scopertiForDay(persone, GIORNO, mins({ '4|M': 2 })).get('4|M')).toBe(1)
  })

  test('card vuota su minimo 2 → due persone mancanti (due chip)', () => {
    expect(scopertiForDay([], GIORNO, mins({ '6|P': 2 })).get('6|P')).toBe(2)
  })

  test('card sopra il minimo → nessuna segnalazione', () => {
    const persone = [persona('A', 'M6T', 'M6T'), persona('B', 'M6T', 'M6T')]
    expect([...scopertiForDay(persone, GIORNO, mins({ '6|M': 2 }))]).toEqual([])
  })

  test('giallo e minimo sulla stessa card: le due cause NON si sommano', () => {
    // Minimo 2, nessun reale: mancano 2 persone. Il giallo ne spiega una sola —
    // il conteggio resta 2, non 3.
    const persone = [
      persona('X', 'MDCP', 'MDCIF', [GIORNO]),   // spostato altrove dal giallo
      persona('Y', 'G', 'MDCIF'),                // fuori sezione per conto suo
    ]
    const m = scopertiForDay(persone, GIORNO, mins({ 'DCIF|M': 2 }))
    expect(m.get('DCIF|M'), 'giallo (1) e minimo (2) non si sommano').toBe(2)
  })

  test('senza minimi configurati vale solo la causa gialla', () => {
    const persone = [persona('A', 'G', 'G')]
    expect([...scopertiForDay(persone, GIORNO, null)]).toEqual([])
    expect([...scopertiForDay(persone, GIORNO)]).toEqual([])
  })
})

test.describe('lib/sala-minimi: default, storia datata e turni', () => {
  const PIANTINA = [
    card('6', 'DCO 6°', 'double'),
    card('8', 'DCO  8°', 'single'),
    card(undefined, 'DCP', 'single'),
    card('M3M40', 'ASTER M3M40', 'single'),
  ]

  test('M/P escono dalla piantina: doppia → 2, singola → 1', () => {
    const c6 = PIANTINA[0]
    const c8 = PIANTINA[1]
    expect(defaultMinFor(c6, 'M')).toBe(2)
    expect(defaultMinFor(c6, 'P')).toBe(2)
    expect(defaultMinFor(c8, 'M')).toBe(1)
  })

  test('la notte ha la sua tabella: RIC/DCIF/8/9/11/M3M40 a 0, il 4° a 1', () => {
    expect(NIGHT_MIN_DEFAULTS.RIC).toBe(0)
    expect(NIGHT_MIN_DEFAULTS.DCIF).toBe(0)
    expect(NIGHT_MIN_DEFAULTS['8']).toBe(0)
    expect(NIGHT_MIN_DEFAULTS['9']).toBe(0)
    expect(NIGHT_MIN_DEFAULTS['11']).toBe(0)
    expect(NIGHT_MIN_DEFAULTS.M3M40).toBe(0)
    expect(NIGHT_MIN_DEFAULTS['4']).toBe(1)
    // Le doppie restano a 2 e la DCIF è l'unica delle due «capi» a essere vuota.
    expect(NIGHT_MIN_DEFAULTS['6']).toBe(2)
    expect(NIGHT_MIN_DEFAULTS['10']).toBe(2)
    expect(NIGHT_MIN_DEFAULTS.DCCM).toBe(1)
    expect(NIGHT_MIN_DEFAULTS.DCP).toBe(1)
    for (const c of PIANTINA) {
      for (const shift of ['M', 'P', 'N'] as const) {
        expect(defaultSnapshot(PIANTINA)[`${c.sectionKey ?? c.title}|${shift}`]).toBe(defaultMinFor(c, shift))
      }
    }
  })

  test('finché nessuna voce copre il giorno, la regola NON si applica', () => {
    const layout = { minimums: [{ from: '2026-09-15', values: { '6|M': 2 } }] }
    expect(minValuesForDay(layout, PIANTINA, '2026-09-14', 'M')).toBeNull()
    expect(minValuesForDay(layout, PIANTINA, '2026-09-15', 'M')?.get('6|M')).toBe(2)
  })

  test('la storia è datata: il 10 vale la voce del 1, il 20 quella del 15', () => {
    const layout = {
      minimums: [
        { from: '2026-09-01', values: { '6|M': 2, '8|M': 0 } },
        { from: '2026-09-15', values: { '6|M': 1, '8|M': 1 } },
      ],
    }
    expect(minValuesForDay(layout, PIANTINA, '2026-09-10', 'M')?.get('6|M')).toBe(2)
    expect(minValuesForDay(layout, PIANTINA, '2026-09-10', 'M')?.get('8|M')).toBe(0)
    expect(minValuesForDay(layout, PIANTINA, '2026-09-20', 'M')?.get('6|M')).toBe(1)
    expect(minValuesForDay(layout, PIANTINA, '2026-09-20', 'M')?.get('8|M')).toBe(1)
  })

  test('il minimo è PER TURNO: la notte resta quella della notte', () => {
    const layout = { minimums: [{ from: '2026-09-01', values: { '6|N': 2, '8|N': 0, 'M3M40|N': 0 } }] }
    const notte = minValuesForDay(layout, PIANTINA, '2026-09-10', 'N')
    expect(notte?.get('6|N')).toBe(2)
    expect(notte?.get('8|N')).toBe(0)
    expect(notte?.get('M3M40|N')).toBe(0)
    // Un valore mancante nella voce ricade sul default della piantina.
    expect(minValuesForDay(layout, PIANTINA, '2026-09-10', 'P')?.get('6|P')).toBe(2)
  })

  test('un valore assente o storto nella voce ricade sul default', () => {
    const layout = { minimums: [{ from: '2026-09-01', values: { '6|M': Number.NaN } }] }
    expect(minValuesForDay(layout, PIANTINA, '2026-09-10', 'M')?.get('6|M')).toBe(2)
  })

  test('snapshotForDay precompila TUTTI i turni e dice da quando vale', () => {
    const layout = { minimums: [{ from: '2026-09-01', values: { '6|M': 3 } }] }
    const s = snapshotForDay(layout, PIANTINA, '2026-09-10')
    expect(s.from).toBe('2026-09-01')
    expect(s.values['6|M']).toBe(3)
    expect(s.values['6|N']).toBe(2)          // dalla tabella notte
    expect(s.values['8|N']).toBe(0)
    expect(Object.keys(s.values)).toHaveLength(PIANTINA.length * 3)
    const vuoto = snapshotForDay({}, PIANTINA, '2026-09-10')
    expect(vuoto.from).toBeNull()
    expect(vuoto.values['6|M']).toBe(2)
  })

  test('withMinimoEntry sostituisce la voce della stessa data e tiene l’ordine', () => {
    const a: SalaMinimoEntry = { from: '2026-09-15', values: { '6|M': 1 } }
    const b: SalaMinimoEntry = { from: '2026-09-01', values: { '6|M': 2 } }
    const c: SalaMinimoEntry = { from: '2026-09-15', values: { '6|M': 3 } }
    const dopo = withMinimoEntry([a], b)
    expect(dopo.map(e => e.from)).toEqual(['2026-09-01', '2026-09-15'])
    const sostituito = withMinimoEntry(dopo, c)
    expect(sostituito).toHaveLength(2)
    expect(effectiveEntry(sostituito, '2026-09-20', 'M')?.values['6|M']).toBe(3)
  })

  test('una voce può entrare in vigore da un TURNO preciso (richiesta 16/09/2026)', () => {
    // I valori sono per CHIAVE sezione|TURNO, quindi ogni turno si interroga con
    // la propria chiave: è la forma in cui `minValuesForDay` costruisce la mappa.
    const layout = {
      minimums: [
        { from: '2026-09-01', values: { '6|M': 2, '6|P': 2, '6|N': 2 } },
        { from: '2026-09-20', fromShift: 'P' as const, values: { '6|M': 0, '6|P': 3, '6|N': 3 } },
      ],
    }
    // La MATTINA del 20 resta alla voce del 1: il cambio comincia dal pomeriggio.
    expect(minValuesForDay(layout, PIANTINA, '2026-09-20', 'M')?.get('6|M')).toBe(2)
    // Dal pomeriggio del 20 in poi vale la voce nuova — notte compresa.
    expect(minValuesForDay(layout, PIANTINA, '2026-09-20', 'P')?.get('6|P')).toBe(3)
    expect(minValuesForDay(layout, PIANTINA, '2026-09-20', 'N')?.get('6|N')).toBe(3)
    // Dal giorno dopo la voce vale su TUTTI i turni.
    expect(minValuesForDay(layout, PIANTINA, '2026-09-21', 'M')?.get('6|M')).toBe(0)
    expect(minValuesForDay(layout, PIANTINA, '2026-09-21', 'P')?.get('6|P')).toBe(3)
    // Anche il pannello lo dice: precompilato dal giorno+turno che sta guardando.
    expect(snapshotForDay(layout, PIANTINA, '2026-09-20', 'M').from).toBe('2026-09-01')
    expect(snapshotForDay(layout, PIANTINA, '2026-09-20', 'P').from).toBe('2026-09-20')
    expect(snapshotForDay(layout, PIANTINA, '2026-09-20', 'P').fromShift).toBe('P')
  })

  test('senza turno dichiarato vale da tutta la giornata (voci scritte prima)', () => {
    const layout = { minimums: [{ from: '2026-09-01', values: { '6|M': 1 } }] }
    for (const shift of ['M', 'P', 'N'] as const) {
      expect(effectiveEntry(layout.minimums, '2026-09-01', shift)?.values['6|M'], shift).toBe(1)
    }
    expect(snapshotForDay(layout, PIANTINA, '2026-09-10').fromShift).toBe('M')
    // Il giorno prima nessuna voce copre.
    expect(effectiveEntry(layout.minimums, '2026-08-31', 'N')).toBeNull()
  })

  test('due voci dello stesso giorno con turni diversi convivono', () => {
    const mattina: SalaMinimoEntry = { from: '2026-09-20', fromShift: 'M', values: { '6|M': 2 } }
    const pomeriggio: SalaMinimoEntry = { from: '2026-09-20', fromShift: 'P', values: { '6|P': 3 } }
    const dopo = withMinimoEntry([mattina], pomeriggio)
    expect(dopo).toHaveLength(2)
    expect(dopo.map(e => e.fromShift)).toEqual(['M', 'P'])
    // Sostituire la STESSA coppia data+turno aggiorna la voce, non ne aggiunge una.
    expect(withMinimoEntry(dopo, { ...pomeriggio, values: { '6|P': 1 } })).toHaveLength(2)
    expect(effectiveEntry(dopo, '2026-09-20', 'M')?.fromShift).toBe('M')
    expect(effectiveEntry(dopo, '2026-09-20', 'P')?.fromShift).toBe('P')
    expect(effectiveEntry(dopo, '2026-09-20', 'N')?.fromShift).toBe('P')
  })
})

/**
 * QUALE POSTO MANCA (richiesta 16/09/2026, sera).
 *
 * La riga «— scoperto» si scrive come un NOME, con lo stile dello slot che manca:
 * titolare dritto, sussidio in corsivo attenuato. Qui si difende la lettura del
 * posto, con i codici veri del PDF («M6T» = sezione 6 titolare, «M6S» = sussidio).
 */
test.describe('scoperti: titolare o sussidio', () => {
  // La forma delle card nella piantina: doppia → T + S, singola → senza slot.
  const previsti = new Map<string, SalaSlotKind[]>([['6|M', ['T', 'S']], ['RIC|M', ['noSlot']]])

  test('doppia con un solo titolare: manca il SUSSIDIO', () => {
    const persone = [persona('T1', 'M6T', 'M6T')]
    const info = scopertiDetailForDay(persone, GIORNO, mins({ '6|M': 2 }), previsti).get('6|M')!
    expect(info.count).toBe(1)
    expect(info.slots).toEqual(['S'])
  })

  test('doppia vuota: prima il titolare, poi il sussidio', () => {
    const info = scopertiDetailForDay([], GIORNO, mins({ '6|M': 2 }), previsti).get('6|M')!
    expect(info.count).toBe(2)
    expect(info.slots).toEqual(['T', 'S'])
  })

  test('il giallo che sposta un sussidio lascia il posto del sussidio', () => {
    // X aveva il teorico «M6S» (sussidio della 6°) ed è stato chiamato sulla DCP.
    const persone = [persona('X', 'MDCP', 'M6S', [GIORNO])]
    const info = scopertiDetailForDay(persone, GIORNO, mins({ '6|M': 1 }), previsti).get('6|M')!
    expect(info.count).toBe(1)
    expect(info.slots).toEqual(['S'])
  })

  test('sezione alfabetica (RIC): posto senza slot, si scrive come un nome', () => {
    const info = scopertiDetailForDay([], GIORNO, mins({ 'RIC|M': 1 }), previsti).get('RIC|M')!
    expect(info.slots).toEqual(['noSlot'])
  })

  test('minimo più alto della piantina: le righe in più prendono l’ultimo posto', () => {
    const info = scopertiDetailForDay([], GIORNO, mins({ '6|M': 3 }), previsti).get('6|M')!
    expect(info.count).toBe(3)
    expect(info.slots).toEqual(['T', 'S', 'S'])
  })
})

/**
 * PERIODI PER CASELLA (richiesta 16/09/2026, sera): «questa sezione, in questo
 * periodo, prevede N persone».
 *
 * Precedenza: il periodo che copre giorno e turno vince sulla voce in vigore;
 * fuori dai periodi di una casella vale il DEFAULT della piantina (doppia → 2,
 * singola → 1, tabella della notte); se non c'è né voce né periodo, la regola
 * resta spenta. La fine è INCLUSA.
 */
test.describe('minimi: periodi per casella', () => {
  /** Le stesse card dei test sopra: la 6° è DOPPIA, la 8° singola. */
  const CARDS = [card('6', 'DCO 6°', 'double'), card('8', 'DCO  8°', 'single')]
  const periodo = (p: Partial<SalaMinimoPeriod>): SalaMinimoPeriod =>
    ({ card: '6', shift: 'P', from: '2026-10-01', to: '2026-10-31', value: 0, ...p })

  test('dentro il periodo vale il valore del periodo', () => {
    const layout = {
      minimums: [{ from: '2026-09-01', values: { '6|P': 2 } }],
      minimumPeriods: [periodo({ from: '2026-10-15', to: '2026-10-20' })],
    }
    expect(minValuesForDay(layout, CARDS, '2026-10-16', 'P')?.get('6|P')).toBe(0)
    // …e il pannello mostra il numero in vigore, non quello della voce.
    expect(snapshotForDay(layout, CARDS, '2026-10-16', 'P').values['6|P']).toBe(0)
  })

  test('fuori dal periodo torna il default della piantina (non la voce)', () => {
    const layout = {
      minimums: [{ from: '2026-09-01', values: { '6|P': 3 } }],
      minimumPeriods: [periodo({ from: '2026-10-15', to: '2026-10-20', value: 0 })],
    }
    // La 6° è DOPPIA: il default di pomeriggio è 2, non il 3 della voce.
    expect(minValuesForDay(layout, CARDS, '2026-10-14', 'P')?.get('6|P')).toBe(2)
    expect(minValuesForDay(layout, CARDS, '2026-10-21', 'P')?.get('6|P')).toBe(2)
  })

  test('il periodo vale per il turno della sua casella, non per gli altri', () => {
    const layout = { minimumPeriods: [periodo({ from: '2026-10-15', to: '2026-10-20', value: 0 })] }
    expect(minValuesForDay(layout, CARDS, '2026-10-16', 'P')?.get('6|P')).toBe(0)
    // La MATTINA non ha niente configurato (né periodi né voce): resta spenta,
    // esattamente come quando i minimi non erano ancora configurati per un turno.
    expect(minValuesForDay(layout, CARDS, '2026-10-16', 'M')).toBeNull()
    // Un turno senza NESSUNA configurazione (minimo e periodo): regola spenta.
    expect(minValuesForDay({ minimumPeriods: [] }, CARDS, '2026-10-16', 'P')).toBeNull()
  })

  test('storia: più periodi della stessa casella, ognuno col valore del suo tempo', () => {
    const marzo = periodo({ from: '2026-03-01', to: '2026-04-30', value: 0 })
    const maggio = periodo({ from: '2026-05-01', value: 1 })
    const periods = withMinimoPeriod(withMinimoPeriod([], marzo), maggio)
    const layout = { minimumPeriods: periods }
    expect(minValuesForDay(layout, CARDS, '2026-03-15', 'P')?.get('6|P')).toBe(0)
    expect(minValuesForDay(layout, CARDS, '2026-04-30', 'P')?.get('6|P')).toBe(0)
    expect(minValuesForDay(layout, CARDS, '2026-05-01', 'P')?.get('6|P')).toBe(1)
    // Il periodo senza fine vale ancora oggi.
    expect(minValuesForDay(layout, CARDS, '2026-09-30', 'P')?.get('6|P')).toBe(1)
    // Salvarlo di nuovo con lo stesso inizio lo SOSTITUISCE, non lo duplica.
    const sostituito = withMinimoPeriod(periods, { ...maggio, value: 2 })
    expect(sostituito).toHaveLength(2)
    expect(minValuesForDay({ minimumPeriods: sostituito }, CARDS, '2026-06-01', 'P')?.get('6|P')).toBe(2)
    // …e si può togliere.
    const senza = withoutMinimoPeriod(sostituito, '6', 'P', '2026-05-01')
    expect(periodsForCell(senza, '6', 'P')).toHaveLength(1)
  })

  test('i confini: inizio dal PROPRIO turno, fine INCLUSA', () => {
    // «Dal 15/10 turno P»: la mattina del 15 è fuori, dal pomeriggio è dentro.
    const p = periodo({ from: '2026-10-15', fromShift: 'P', to: '2026-10-20', toShift: 'M' })
    expect(periodCovers(p, '2026-10-15', 'M')).toBe(false)
    expect(periodCovers(p, '2026-10-15', 'P')).toBe(true)
    expect(periodCovers(p, '2026-10-15', 'N')).toBe(true)
    // «Al 20/10 turno M»: solo la mattina del 20, poi si esce.
    expect(periodCovers(p, '2026-10-20', 'M')).toBe(true)
    expect(periodCovers(p, '2026-10-20', 'P')).toBe(false)
    expect(periodCovers(p, '2026-10-21', 'M')).toBe(false)
    // Senza turni dichiarati: dal primo all'ultimo istante di quei giorni.
    const tutto = periodo({ from: '2026-10-15', to: '2026-10-15' })
    for (const s of ['M', 'P', 'N'] as const) expect(periodCovers(tutto, '2026-10-15', s), s).toBe(true)
  })

  test('il periodo che copre il giorno è quello che decide (anche i reali)', () => {
    const layout = {
      minimums: [{ from: '2026-09-01', values: { '6|P': 2 } }],
      minimumPeriods: [periodo({ from: '2026-10-15', to: '2026-10-20', value: 0 })],
    }
    const mins = minValuesForDay(layout, CARDS, '2026-10-16', 'P')!
    // Con minimo 0 e nessun reale non manca nessuno → nessuna riga in card.
    expect(scopertiForDay([], GIORNO, mins).has('6|P'), 'minimo 0 non segnala nulla').toBe(false)
    // Con una persona spostata via da un giallo, invece, la riga c'è: e il posto
    // è quello del teorico (la sezione era presidiata da un sussidio).
    const persone = [persona('X', 'MDCP', 'P6S', [GIORNO])]
    const info = scopertiDetailForDay(persone, GIORNO, mins)
    expect(info.get('6|P')?.count).toBe(1)
    expect(info.get('6|P')?.slots).toEqual(['S'])
    expect(coveringPeriod(layout.minimumPeriods, '6', 'P', '2026-10-16')?.value).toBe(0)
  })
})

test.describe('scoperto e turni FINITI: orari veri M 6–14, P 14–22, N 22–6 (correzione 25/09/2026)', () => {
  // La chip gialla «— scoperto» resta per il presente/futuro; quando il turno è
  // già finito (o il giorno è passato) la board lo scrive a testo grigio. Gli
  // orari VERI (richiesta 25/09): la mattina 6–14, il pomeriggio 14–22 e la
  // notte di data D corre dalle 22 di D−1 alle 6 DI D → la sua chip diventa
  // grigia ALLE 6 di D, con l'inizio della mattina. Durante la notte in corso
  // (fino alle 6) resta gialla: è ancora «adesso».
  const ore = (h: number) => new Date(2026, 8, 24, h, 0, 0) // 24/09/2026, ora locale

  test('mattina finita dalle 14 (quando parte il pomeriggio), pomeriggio dalle 22', () => {
    expect(turnoPassato('M', ore(6))).toBe(false)
    expect(turnoPassato('M', ore(13))).toBe(false)
    expect(turnoPassato('M', ore(14))).toBe(true)
    expect(turnoPassato('P', ore(14))).toBe(false)
    expect(turnoPassato('P', ore(21))).toBe(false)
    expect(turnoPassato('P', ore(22))).toBe(true)
  })

  test('la NOTTE di data D finisce alle 6 DI D: grigia da lì, gialla prima (era il bug del 24/9)', () => {
    expect(turnoPassato('N', ore(5))).toBe(false)
    expect(turnoPassato('N', ore(6))).toBe(true)
    expect(turnoPassato('N', ore(9))).toBe(true)
    expect(turnoPassato('N', ore(20))).toBe(true)
    expect(turnoPassato('N', ore(23))).toBe(true)
  })

  test('il vincolo `giornoPassato` della board: la notte di OGGI resta gialla finché è in corso (la sera prima, data di domani)', () => {
    const oggi = '2026-09-24'
    // Replica della condizione di desk-board (giornoPassato):
    const passato = (dayISO: string, shift: 'M' | 'P' | 'N', now: Date) =>
      dayISO < oggi || (dayISO === oggi && turnoPassato(shift, now))
    // Alle 23 del 24 si guarda la notte del 25 (partita alle 22): in corso → gialla.
    expect(passato('2026-09-25', 'N', ore(23))).toBe(false)
    // La notte DATATA 24 è finita alle 6 del 24: di pomeriggio è già un fatto.
    expect(passato('2026-09-24', 'N', ore(20))).toBe(true)
    // Ieri, a qualsiasi ora: grigia.
    expect(passato('2026-09-23', 'N', ore(8))).toBe(true)
    // Il pomeriggio di oggi alle 15 è finito alle 22: ancora giallo.
    expect(passato('2026-09-24', 'P', ore(15))).toBe(false)
  })
})

test.describe('vincolo minimi della sezione J (richiesta 24/09/2026)', () => {
  // La J nasce a ottobre: prima non doveva esserci NESSUNO, da ottobre in poi
  // solo 1 persona in M e P, mai di notte. Il modello esistente lo esprime con
  // DUE voci di storia (la prima porta la regola accesa dal 1/10).
  const CARDS_J = [{ sectionKey: '5', title: 'DCO 5°', type: 'double' as const }, { sectionKey: 'J', title: 'JOLLY', type: 'single' as const }]

  test('due voci: zero fino al 30/9, poi 1 in M e P e 0 di notte', () => {
    const layout = {
      minimums: [
        { from: '2026-09-24', fromShift: 'M' as const, values: { 'J|M': 0, 'J|P': 0, 'J|N': 0 } },
        { from: '2026-10-01', fromShift: 'M' as const, values: { 'J|M': 1, 'J|P': 1, 'J|N': 0 } },
      ],
    }
    // Settembre: la J non è presidiata da programma (e non segnala scoperti).
    expect(minValuesForDay(layout, CARDS_J, '2026-09-24', 'M')?.get('J|M')).toBe(0)
    expect(minValuesForDay(layout, CARDS_J, '2026-09-30', 'P')?.get('J|P')).toBe(0)
    // Ottobre: 1 in mattina e pomeriggio, 0 di notte.
    expect(minValuesForDay(layout, CARDS_J, '2026-10-01', 'M')?.get('J|M')).toBe(1)
    expect(minValuesForDay(layout, CARDS_J, '2026-10-01', 'P')?.get('J|P')).toBe(1)
    expect(minValuesForDay(layout, CARDS_J, '2026-10-15', 'N')?.get('J|N')).toBe(0)
    // La regola è accesa solo dal 1/10: prima il giorno non è coperto da nessuna voce.
    expect(minValuesForDay(layout, CARDS_J, '2026-09-23', 'M')).toBeNull()
  })

  test('una persona in J di mattina a ottobre NON è scoperta; zero persone lo è (fino a fine settembre no)', () => {
    const layout = {
      minimums: [{ from: '2026-10-01', fromShift: 'M' as const, values: { 'J|M': 1, 'J|P': 1, 'J|N': 0 } }],
    }
    const mins = minValuesForDay(layout, CARDS_J, '2026-10-05', 'M')!
    const personaJ = persona('X', 'MJ', 'MJ')
    expect(scopertiForDay([personaJ], GIORNO, mins).has('J|M')).toBe(false)
    expect(scopertiForDay([], GIORNO, mins).get('J|M')).toBe(1)
  })
})
