import { test, expect } from '@playwright/test'
import { getEffectivePeriodForYear, getVacationPeriodForYear, vacationFilterKeeps, VACATION_PERIOD_LABELS_SHORT, basePeriodInteressato, periodInteressatoThisYear, labelPeriodoInteressato } from '../lib/vacations'
import { renderFlowTemplate, resolveMessage } from '../lib/notification-templates'
import type { VacationPeriod } from '../types/database'

/**
 * «SOLO SE COMPATIBILE COL MIO PERIODO» SUI CAMBI FERIE (richiesta 26/09/2026).
 *
 * Un cambio ferie è una permuta: chi pubblica offre il proprio periodo e cerca
 * quelli altrui. Il destinatario può essere parte dello scambio solo se il SUO
 * periodo dell'anno richiesto è fra quelli cercati — la stessa condizione che
 * `findCompatibleVacationRequests` verifica nell'altro verso. Con il filtro
 * attivo (notify_vacation_filter, migration 034) la notifica arriva solo a chi
 * può davvero rispondere alla proposta, e arriva con un testo DEDICATO che dice
 * il suo periodo: come `new_shift.compatible` per i cambi turno.
 *
 * Le due uscite di cautela sono provate qui perché sono la differenza fra un
 * filtro che tace e un filtro che fa sparire una notifica utile: periodo del
 * destinatario IGNOTO e lista dei periodi cercati VUOTA non filtrano.
 */

test.describe('nuovo cambio ferie: il filtro per periodo compatibile', () => {
  test('il periodo del destinatario è fra quelli cercati', () => {
    expect(vacationFilterKeeps(true, 3, [3, 5])).toBe(true)
    expect(vacationFilterKeeps(true, 4, [3, 5])).toBe(false)
    // «qualsiasi periodo» = 5 periodi su 6: resta compatibile con tutti tranne
    // quello offerto (che non può cercare se stesso, il dialog lo esclude).
    const qualsiasi: VacationPeriod[] = [1, 2, 3, 4, 5]
    expect(vacationFilterKeeps(true, 5, qualsiasi)).toBe(true)
    expect(vacationFilterKeeps(true, 6, qualsiasi)).toBe(false)
  })

  test('senza il filtro attivo si riceve tutto, come prima', () => {
    expect(vacationFilterKeeps(false, 4, [3, 5])).toBe(true)
    expect(vacationFilterKeeps(null, 4, [3, 5])).toBe(true)
    expect(vacationFilterKeeps(undefined, 4, [3, 5])).toBe(true)
  })

  test('le uscite di cautela: periodo ignoto e lista vuota non filtrano', () => {
    expect(vacationFilterKeeps(true, null, [3, 5]), 'nessuna assegnazione ferie').toBe(true)
    expect(vacationFilterKeeps(true, undefined, [3, 5])).toBe(true)
    expect(vacationFilterKeeps(true, 4, []), 'richiesta senza mete').toBe(true)
  })

  test('il periodo dell’anno si legge dalla rotazione, con gli override admin', () => {
    // ROTATION_SEQ = [1, 3, 5, 6, 4, 2]: dal periodo base 1, l'anno dopo si è in 3.
    expect(getVacationPeriodForYear(1, 2026)).toBe(1)
    expect(getVacationPeriodForYear(1, 2027)).toBe(3)
    const overrides = new Map<string, VacationPeriod>([['u1', 5]])
    expect(getEffectivePeriodForYear(1, 2027, overrides, 'u1'), 'l’assegnazione dell’admin vince').toBe(5)
    expect(getEffectivePeriodForYear(1, 2027, overrides, 'u2')).toBe(3)
  })

  test('il messaggio dedicato dice il periodo del destinatario', () => {
    const { title, body } = resolveMessage({}, 'new_vacation.compatible.title')
    expect(title).toBe('Nuovo cambio ferie compatibile col tuo periodo')
    expect(renderFlowTemplate(body, {
      cognome_attore: 'Bianchi', periodo: VACATION_PERIOD_LABELS_SHORT[2], periodo_cercati: VACATION_PERIOD_LABELS_SHORT[3],
      anno: '2027', periodo_effettivo: VACATION_PERIOD_LABELS_SHORT[3],
    })).toBe('Bianchi offre 01–15 Lug (2027) e cerca 16–31 Lug: tu sei in 16–31 Lug, uno dei periodi che cerca')
    // Il generico resta il testo di chi NON ha il filtro: i due convivono.
    expect(resolveMessage({}, 'new_vacation.title').title).toBe('Nuovo cambio ferie disponibile')
  })
})

test.describe('il periodo dell\'interessato nelle card ferie', () => {
  /**
   * IL BUG «16–30 GIUGNO» (21/09/2026): nella card della richiesta, la pillola
   * del periodo dell'interessato mostrava SEMPRE P1. Il mapper leggeva l'embed
   * users → vacation_assignments come ARRAY, ma user_id è la PRIMARY KEY della
   * tabella: PostgREST classifica la relazione one-to-one e torna un OGGETTO —
   * l'indice [0] era undefined e tutti cascavano sul fallback finto P1.
   */
  const anno = 2027
  const overrides = new Map<string, VacationPeriod>()

  test('l\'embed one-to-one (oggetto) adesso dà il periodo vero', () => {
    // Forma REALE del payload di produzione (verificata con la sonda):
    const oggetto = { user_id: 'u1', user: { id: 'u1', nome: 'A', cognome: 'B', is_secondary: false, vacation_assignments: { base_period: 6 } } }
    expect(basePeriodInteressato(oggetto).base).toBe(6)
    expect(periodInteressatoThisYear(oggetto, anno, overrides)).toBe(4) // 2026→2027: 6→4
  })

  test('l\'embed many-to-one (array) resta supportato', () => {
    const array = { user_id: 'u2', user: { id: 'u2', nome: 'C', cognome: 'D', is_secondary: false, vacation_assignments: [{ base_period: 3 }] } }
    expect(basePeriodInteressato(array).base).toBe(3)
    expect(periodInteressatoThisYear(array, anno, overrides)).toBe(5) // 2026→2027: 3→5
  })

  test('niente riga di assegnazione: NULL, mai più un periodo finto', () => {
    const vuoto = { user_id: 'u3', user: { id: 'u3', nome: 'E', cognome: 'F', is_secondary: false, vacation_assignments: null } }
    expect(basePeriodInteressato(vuoto).base).toBeNull()
    expect(periodInteressatoThisYear(vuoto, anno, overrides)).toBeNull()
  })

  test('l\'override admin dell\'anno vince sull\'embed', () => {
    const i = { user_id: 'u4', user: { id: 'u4', nome: 'G', cognome: 'H', is_secondary: false, vacation_assignments: { base_period: 6 } } }
    const conOverride = new Map<string, VacationPeriod>([['u4', 2]])
    expect(periodInteressatoThisYear(i, anno, conOverride)).toBe(2)
  })

  test('l\'etichetta dice «Periodo non noto» quando l\'assegnazione è ignota', () => {
    const i = { user_id: 'u5', user: { id: 'u5', nome: 'I', cognome: 'L', is_secondary: false, vacation_assignments: null } }
    expect(labelPeriodoInteressato(i, anno, overrides)).toBe('Periodo non noto')
    const noto = { user_id: 'u6', user: { id: 'u6', nome: 'M', cognome: 'N', is_secondary: false, vacation_assignments: { base_period: 1 } } }
    expect(labelPeriodoInteressato(noto, 2026, overrides)).toBe('16–30 Giugno')
  })
})
