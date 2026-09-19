import { test, expect } from '@playwright/test'
import { ownShiftMatchesOffer, userCoversRequest } from '../lib/shift-compat'
import { buildRosterUserIds, omonimiaInSala } from '../lib/shift-teams-matching'
import type { ShiftTeamTree, ShiftType } from '../types/database'

/**
 * QUELLO CHE OFFRONO I CAMBI TURNO DEV'ESSERE UN TURNO CHE SI HA (25/09/2026).
 *
 * La verifica pre-pubblicazione chiedeva la cosa sbagliata: «il mio turno di quel
 * giorno è fra quelli che cerco?» — la domanda del filtro notifiche, che ha senso
 * per CHI RICEVE (posso coprire il tuo cambio solo se quel giorno ho uno dei turni
 * che chiedi) ma non per il richiedente. L'UI non lascia cercare il turno che si
 * offre, quindi quella condizione era insoddisfacibile per costruzione: il popup
 * usciva SEMPRE. Caso vero: **Pietro Nevano, 25/09/2026, offriva Notte cercando
 * Mattina** e il PDF gli dà `N5T` (Notte) su quella data — la richiesta era
 * perfettamente in regola e l'avviso è uscito lo stesso.
 *
 * La domanda giusta è di POSSESSO: quel giorno ho il turno che offro? E quando il
 * dato non c'è (nessun PDF e nessuna squadra, oppure OMONIMO che l'albero non
 * lega: la PRODUZIONE ha zero membri con `user_id`) NON si accusa nessuno: il
 * difetto da non rifare è esattamente un avviso falso.
 *
 * L'altra metà della trincea è `UserShiftOnDate.certain`, provata qui sotto con i
 * due alberi reali: quello di dev (NEVANO P. legato a Pietro) e quello della
 * produzione (membro «NEVANO» senza legame, dove la riga bare è di tutti e due).
 *
 * E la regola che li distingue è il ROSTER (`omonimiaInSala`, 25/09/2026): due
 * utenti con lo stesso cognome sono un'omonimia solo se sono DUE i colleghi IN
 * TURNO. Giuseppe Nevano non ha nessun membro attivo nelle squadre — non è nei
 * turni, e infatti i PDF scrivono solo «NEVANO» — quindi non rende ambiguo il
 * cognome di Pietro. Se il roster non è legato a nessuno (la produzione di oggi),
 * non si sa chi lavora e si tace: meglio nessuna risposta che un'accusa.
 */
test.describe('la verifica pre-pubblicazione guarda il turno OFFERTO', () => {
  const mia = (shift: ShiftType | null, source: 'real' | 'theoretical' | 'none' = 'real', certain = true) => ({ shift, source, certain })

  test('il caso Nevano: offro Notte e ho Notte → nessun avviso', () => {
    const mine = mia('Notte')
    expect(ownShiftMatchesOffer(mine, 'Notte'), 'la richiesta era in regola e non deve avvisare').toBe(true)
    // La prova che l'avviso usciva davvero: la VECCHIA domanda su quegli stessi
    // dati risponde «no» (il suo turno non è fra quelli cercati) — ed è per questo
    // che il popup era inevitabile.
    expect(userCoversRequest(mine.shift, ['Mattina']), 'il predicato del filtro notifiche, riusato qui, diceva no').toBe(false)
  })

  test('offro un turno che quel giorno non ho → avviso', () => {
    expect(ownShiftMatchesOffer(mia('Notte'), 'Mattina')).toBe(false)
    expect(ownShiftMatchesOffer(mia('Pomeriggio', 'theoretical'), 'Notte')).toBe(false)
    expect(ownShiftMatchesOffer(mia(null), 'Notte'), 'riposo: quel turno non lo cedi').toBe(false)
    expect(ownShiftMatchesOffer(mia(null, 'theoretical'), 'Pomeriggio')).toBe(false)
  })

  test('senza dati non si accusa nessuno', () => {
    expect(ownShiftMatchesOffer(mia(null, 'none'), 'Notte'), 'nessun PDF e nessuna squadra: non si sa').toBe(true)
    expect(ownShiftMatchesOffer(mia('Notte', 'real', false), 'Mattina'), 'riga attribuibile solo con riserva: non si accusa').toBe(true)
    expect(ownShiftMatchesOffer(mia('Pomeriggio'), null), 'senza turno offerto non c\'è niente da verificare').toBe(true)
  })
})

test.describe('omonimia fra colleghi IN TURNO: il roster decide (25/09/2026)', () => {
  const users = [
    { id: 'u-pietro', nome: 'Pietro', cognome: 'Nevano' },
    { id: 'u-giuseppe', nome: 'Giuseppe', cognome: 'Nevano' },
    { id: 'u-altro', nome: 'Alba', cognome: 'Rossi' },
  ]

  /** Un albero minimo con un solo membro (legato o no, attivo o no). */
  const albero = (fullName: string, userId: string | null, attivo = true) =>
    ({
      types: [{
        is_active: true, cycle_days: 28, pattern_start: '2026-09-14',
        teams: [{ id: 't1', name: 'Rilievo D', members: [{ is_active: attivo, full_name: fullName, user_id: userId, pattern: ['M4S'] }] }],
      }],
    }) as unknown as ShiftTeamTree

  const inSala = (cognome: string | null, tree: ShiftTeamTree | null) =>
    omonimiaInSala(cognome, users, buildRosterUserIds(tree))

  test('dev: NEVANO P. legato a Pietro → la riga nuda è di Pietro, Giuseppe non la tocca', () => {
    const dev = albero('NEVANO P.', 'u-pietro')
    expect(inSala('Nevano', dev), 'un solo Nevano in turno: niente omonimia').toEqual({ ambigua: false, proprietarioId: 'u-pietro' })
    // E la conseguenza sui due fratelli, uno per uno:
    const certo = (userId: string) => {
      const { ambigua, proprietarioId } = inSala('Nevano', dev)
      return !ambigua && (!proprietarioId || proprietarioId === userId)
    }
    expect(certo('u-pietro'), 'Pietro è in turno: il turno è il suo').toBe(true)
    expect(certo('u-giuseppe'), 'Giuseppe è fuori dai turni: non decide niente').toBe(false)
  })

  test('produzione di oggi (87 membri, zero legami): si tace', () => {
    const prod = albero('NEVANO', null)
    expect(buildRosterUserIds(prod).size, 'senza user_id nessuno è in turno').toBe(0)
    expect(inSala('Nevano', prod), 'due Nevano nell\'app e nessuno attribuibile: ambiguo').toEqual({ ambigua: true, proprietarioId: null })
  })

  test('membro spento o tipologia spenta: non è «in turno»', () => {
    expect(inSala('Nevano', albero('NEVANO P.', 'u-pietro', false)).ambigua, 'membro inattivo').toBe(true)
    const tipologiaSpenta = {
      types: [{
        is_active: false, cycle_days: 28, pattern_start: '2026-09-14',
        teams: [{ id: 't1', name: 'Rilievo D', members: [{ is_active: true, full_name: 'NEVANO P.', user_id: 'u-pietro', pattern: ['M4S'] }] }],
      }],
    } as unknown as ShiftTeamTree
    expect(inSala('Nevano', tipologiaSpenta).ambigua, 'turnazione spenta').toBe(true)
  })

  test('due colleghi in turno: resta ambiguo (serve l\'iniziale)', () => {
    const due = {
      types: [{
        is_active: true, cycle_days: 28, pattern_start: '2026-09-14',
        teams: [{
          id: 't1', name: 'Rilievo D',
          members: [
            { is_active: true, full_name: 'NEVANO P.', user_id: 'u-pietro', pattern: ['M4S'] },
            { is_active: true, full_name: 'NEVANO G.', user_id: 'u-giuseppe', pattern: ['M4S'] },
          ],
        }],
      }],
    } as unknown as ShiftTeamTree
    expect(inSala('Nevano', due)).toEqual({ ambigua: true, proprietarioId: null })
  })

  test('cognomi non omonimi e dati mancanti: mai incertezza', () => {
    expect(inSala('Rossi', null).ambigua).toBe(false)
    expect(inSala(null, null).ambigua).toBe(false)
    expect(inSala('Nevano', null).ambigua, 'nessun roster: due utenti, si tace').toBe(true)
  })
})
