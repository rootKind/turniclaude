import { test, expect } from '@playwright/test'
import { scopertiForDay, type MonthPersonShifts } from '../lib/sala-month'
import {
  NIGHT_MIN_DEFAULTS,
  defaultMinFor,
  defaultSnapshot,
  effectiveEntry,
  minValuesForDay,
  snapshotForDay,
  withMinimoEntry,
} from '../lib/sala-minimi'
import type { SalaMinimoEntry } from '../types/database'

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
