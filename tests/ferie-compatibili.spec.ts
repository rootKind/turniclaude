import { test, expect } from '@playwright/test'
import { getEffectivePeriodForYear, getVacationPeriodForYear, vacationFilterKeeps, VACATION_PERIOD_LABELS_SHORT } from '../lib/vacations'
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
