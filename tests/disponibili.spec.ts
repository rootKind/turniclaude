import { test, expect } from '@playwright/test'
import { disponibiliDelGiorno, conteggioDisponibiliTeorico, squadreContate, type UtenteRef } from '../lib/disponibili'
import type { MonthPersonShifts } from '../lib/sala-month'
import type { ShiftTeamTree } from '../types/database'

/**
 * I DISPONIBILI «D» (richiesta 25/09/2026), provati sulla LOGICA:
 *   • contati SOLO i gruppi: noni (per profilo), terza, seconda,
 *     scorte di rilievo e scorte semplici;
 *   • ESCLUSI: Maternità, RIC/ASTER, chi non ha squadra (manager, ecc.);
 *   • scope: 'dco' senza noni, 'noni' solo noni, 'tutti' entrambi;
 *   • i mesi SENZA PDF contano dal teorico (tokenForMember dei pattern,
 *     che contengono davvero «D» — Squadra C, squadre in seconda…).
 */

const persona = (name: string, days: string[]): MonthPersonShifts => ({
  name,
  days,
  teorico: days.map(() => ''),
  yellow: [],
})

// Albero minimo che replica la produzione (19 squadre → qui le essenziali).
const tree: ShiftTeamTree = {
  types: [
    {
      id: 't-terza', name: 'Squadra in terza', cycle_days: 84, pattern_start: '2026-03-01',
      is_active: true, sort_order: 1,
      teams: [
        { id: 'A', shift_type_id: 't-terza', name: 'Squadra A', phase_offset_days: 0, sort_order: 1, members: [
          { id: 'm-rossi', team_id: 'A', full_name: 'ROSSI MARIO', user_id: null, pattern: ['D', 'M5T'], sort_order: 1, is_active: true, is_lead: false },
        ] },
      ],
    },
    {
      id: 't-seconda', name: 'Squadra in seconda', cycle_days: 84, pattern_start: '2026-03-01',
      is_active: true, sort_order: 2,
      teams: [
        { id: 'AR', shift_type_id: 't-seconda', name: 'Squadra arancione', phase_offset_days: 0, sort_order: 1, members: [
          { id: 'm-bianchi', team_id: 'AR', full_name: 'BIANCHI LUIGI', user_id: null, pattern: ['D'], sort_order: 1, is_active: true, is_lead: false },
        ] },
      ],
    },
    {
      id: 't-scorte', name: 'Scorte', cycle_days: 84, pattern_start: '2026-03-01',
      is_active: true, sort_order: 3,
      teams: [
        { id: 'RIL', shift_type_id: 't-scorte', name: 'Squadra rilievo', phase_offset_days: 0, sort_order: 1, members: [
          { id: 'm-verdi', team_id: 'RIL', full_name: 'VERDI ANNA', user_id: null, pattern: ['D'], sort_order: 1, is_active: true, is_lead: false },
        ] },
        { id: 'SEM', shift_type_id: 't-scorte', name: 'Semplici A', phase_offset_days: 0, sort_order: 2, members: [
          { id: 'm-neri', team_id: 'SEM', full_name: 'NERI PAOLO', user_id: null, pattern: ['D'], sort_order: 1, is_active: true, is_lead: false },
        ] },
        { id: 'MAT', shift_type_id: 't-scorte', name: 'Maternità', phase_offset_days: 0, sort_order: 3, members: [
          { id: 'm-rosa', team_id: 'MAT', full_name: 'ROSA CHIARA', user_id: null, pattern: ['D'], sort_order: 1, is_active: true, is_lead: false },
        ] },
      ],
    },
    {
      id: 't-ric', name: 'RIC/ASTER', cycle_days: 84, pattern_start: '2026-03-01',
      is_active: true, sort_order: 5,
      teams: [
        { id: 'RIC', shift_type_id: 't-ric', name: 'RIC', phase_offset_days: 0, sort_order: 1, members: [
          { id: 'm-gialli', team_id: 'RIC', full_name: 'GIALLI ELENA', user_id: null, pattern: ['D'], sort_order: 1, is_active: true, is_lead: false },
        ] },
      ],
    },
  ],
  adjustments: [],
}

const utenti: UtenteRef[] = [
  { id: 'u-noni-1', cognome: 'BLU', nome: 'SARA', is_secondary: true },
  { id: 'u-noni-2', cognome: 'VERDE', nome: 'LUCA', is_secondary: true },
  { id: 'u-dco-1', cognome: 'ROSSI', nome: 'MARIO', is_secondary: false },
  { id: 'u-mgr', cognome: 'GRIGI', nome: 'ADMIN', is_secondary: false, is_manager: true },
]

const GIORNO = 1

test.describe('gruppi contati ed esclusi', () => {
  test('conta terza, seconda, rilievo, semplici; esclude Maternità, RIC/ASTER e senza squadra', () => {
    const people = [
      persona('ROSSI MARIO', ['D']),      // terza → SÌ
      persona('BIANCHI LUIGI', ['D']),    // seconda → SÌ
      persona('VERDI ANNA', ['D']),       // rilievo → SÌ
      persona('NERI PAOLO', ['D']),       // semplici → SÌ
      persona('ROSA CHIARA', ['D']),      // Maternità → NO
      persona('GIALLI ELENA', ['D']),     // RIC/ASTER → NO
      persona('GRIGI ADMIN', ['D']),      // manager senza squadra → NO
      persona('ESCLUSO FILIPPO', ['D']),  // nessuna squadra → NO
    ]
    const res = disponibiliDelGiorno(people, GIORNO, tree, utenti, 'tutti')
    expect(res.nomi.sort()).toEqual(['BIANCHI LUIGI', 'NERI PAOLO', 'ROSSI MARIO', 'VERDI ANNA'])
  })

  test('il token è esattamente «D» (case-insensitive), non M5D o altro', () => {
    const people = [
      persona('ROSSI MARIO', ['M5D']),    // non è D
      persona('BIANCHI LUIGI', ['d']),    // minuscolo → conta
    ]
    const res = disponibiliDelGiorno(people, GIORNO, tree, utenti, 'tutti')
    expect(res.nomi).toEqual(['BIANCHI LUIGI'])
  })

  test('solo i gruppi contati hanno squadre; la Maternità non è tra esse', () => {
    const labels = squadreContate(tree).map(s => s.label)
    expect(labels).toEqual(['Squadra A', 'Squadra arancione', 'Squadra rilievo', 'Semplici A'])
  })
})

test.describe('scope: tutti / dco / noni', () => {
  const people = [
    persona('ROSSI MARIO', ['D']),   // squadra (DCO)
    persona('BLU SARA', ['D']),      // nona
    persona('VERDE LUCA', ['D']),    // nono
  ]

  test('tutti: squadre + noni', () => {
    expect(disponibiliDelGiorno(people, GIORNO, tree, utenti, 'tutti').count).toBe(3)
  })

  test('dco: solo squadre, noni esclusi', () => {
    const res = disponibiliDelGiorno(people, GIORNO, tree, utenti, 'dco')
    expect(res.nomi).toEqual(['ROSSI MARIO'])
  })

  test('noni: SOLO i noni', () => {
    const res = disponibiliDelGiorno(people, GIORNO, tree, utenti, 'noni')
    expect(res.nomi.sort()).toEqual(['BLU SARA', 'VERDE LUCA'])
  })

  test('un nono con D conta in «tutti» e «noni», mai in «dco»', () => {
    for (const [scope, atteso] of [['tutti', 1], ['noni', 1], ['dco', 0]] as const) {
      expect(disponibiliDelGiorno([persona('BLU SARA', ['D'])], GIORNO, tree, utenti, scope).count, scope).toBe(atteso)
    }
  })
})

test.describe('mesi senza PDF: conteggio dal TEORICO', () => {
  test('i membri delle squadre con «D» nel pattern del giorno contano (esclusa Maternità)', () => {
    // Il 2026-03-01 è il pattern_start: pattern[0] = 'D' per Squadra A, 'D' per
    // arancione/rilievo/semplici/Maternità/RIC → attesi 4 (A, arancione, rilievo, semplici).
    const n = conteggioDisponibiliTeorico(tree, '2026-03', 1, 'dco')
    expect(n).toBe(4)
  })

  test('per i noni il teorico vale 0 (non sono nell\'albero)', () => {
    expect(conteggioDisponibiliTeorico(tree, '2026-03', 1, 'noni')).toBe(0)
  })

  test('senza albero: 0', () => {
    expect(conteggioDisponibiliTeorico(null, '2026-03', 1, 'dco')).toBe(0)
  })
})
