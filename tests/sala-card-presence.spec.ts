import { test, expect } from '@playwright/test'
import { applyTokenToDay, boardPlacementOf, isSectionTurnToken, parseShiftCode, sectionTurnOf } from '../lib/shift-tokens'
import { salaCodeInfo, spiegaCodiceNonMostrato } from '../lib/sala-month'
import { salaTokenToShiftType } from '../lib/shift-compat'
import { matchesCognome } from '../lib/utils'
import { matchesFocusPerson } from '../lib/person-shift'
import type { DaySchedule } from '../types/database'

/**
 * VERIFICA E BOARD DEVONO RISPONDERE LA STESSA COSA (19/09/2026).
 *
 * Il difetto che questo file difende: la verifica del salto in sala rispondeva
 * «che turno ha questa persona?» con `salaCodeInfo`, che chiama `work` anche i
 * token che la board NON mette su nessuna card — `MTUTOR`, i turni «nudi» `M`/`N`/`P`
 * (SPAGNULO), le trasferte `NDis*`. Risultato: la verifica diceva «Mattina», il
 * salto partiva, e la board rispondeva con il vecchio avviso giallo «X non è in
 * sala… la persona non compare in questa sezione» — anche nei mesi col PDF
 * caricato. Ora esiste UNA definizione di DOVE LA BOARD METTE UN NOME
 * (`boardPlacementOf`: card di sezione, pillola delle «Altre attività», o
 * niente), presa dallo stesso ramo di `applyTokenToDay` con cui la board decide
 * dove scrive un nome: qui si pretende che le due non possano divergere, token
 * per token — «sta su una card» E «si accende nella pillola» comprese.
 *
 * È un test di LOGICA (nessun browser, nessun dato): gira in millisecondi.
 */

/** Token rappresentativi di tutte le famiglie del PDF. */
const TOKEN = [
  'M7S', 'M4', 'P10', 'N5TIR', 'piaptir', 'PRIC', 'M3M40', 'P11',   // turni con sezione
  'M', 'N', 'P',                                                    // turni «nudi» (SPAGNULO)
  'MTUTOR', 'TUTOR',                                                // attività senza sezione
  'NDisNa', 'DisCas', 'SpNw', 'SPCA', 'ISpNw',                      // presenze/trasferte senza sezione
  'RIC', 'DCP',                                                     // sezione scritta senza turno
  'RM', 'RC', 'RI', 'A', 'F', 'D', 'G', '12.14',                    // riposi, assenze, disponibilità, orari
  'MSb', 'GSp@', 'na', 'Na',                                        // invisibili per decisione utente
]

function giornoVuoto(): DaySchedule {
  return { sections: {}, altriPresenti: [], altriPresentiTokens: [] }
}

test.describe('«sta su una card» ha una sola definizione', () => {
  test('sectionTurnOf coincide con applyTokenToDay, token per token', () => {
    for (const token of TOKEN) {
      const day = giornoVuoto()
      applyTokenToDay(day, 'PROVA', token)
      const sezioni = Object.keys(day.sections)
      const sez = sectionTurnOf(token)
      const dove = sezioni.length ? `card «${sezioni.join(',')}»` : (day.altriPresenti.length ? '«altri presenti»' : 'ignorato')

      expect(
        sez !== null,
        `«${token}»: sectionTurnOf dice ${sez ? `card «${sez.section}»` : 'nessuna card'} ma la board lo mette in ${dove}`,
      ).toBe(sezioni.length > 0)

      // Quando la regola dice «card», la sezione deve essere QUELLA che la board usa.
      if (sez) expect(sezioni).toContain(sez.section)
    }
  })

  test('boardPlacementOf coincide con applyTokenToDay: card, pillola o niente', () => {
    for (const token of TOKEN) {
      const day = giornoVuoto()
      applyTokenToDay(day, 'PROVA', token)
      const sezioni = Object.keys(day.sections)
      const attesa = sezioni.length ? 'card' : (day.altriPresenti.length ? 'altri' : 'nessuno')
      const dove = boardPlacementOf(token)
      const letta = dove === null ? 'nessuno' : dove.kind

      expect(
        letta,
        `«${token}»: la regola dice «${letta}» ma la board lo mette in ${sezioni.length ? `card «${sezioni.join(',')}»` : (day.altriPresenti.length ? '«altri presenti»' : 'nessun posto')}`,
      ).toBe(attesa)
      if (dove?.kind === 'card') expect(sezioni).toContain(dove.section)
    }
  })

  test('chi è «presente senza sezione» si accende nella PILLOLA, non su una card', () => {
    // È il caso del collega col giallo: la board queste persone le MOSTRA —
    // nella riga «Altre attività» — quindi il salto deve portare lì e la
    // pillola deve respirare, invece di dichiarare «non è in sala».
    for (const token of ['MTUTOR', 'PTUTOR', 'GTUTOR', 'TUTOR', 'M', 'N', 'P', 'NDisNa', 'DisCas', 'SpN', 'ISpNw', 'Trasf']) {
      const dove = boardPlacementOf(token)
      expect(dove, `«${token}»: la board lo mostra in qualche posto`).not.toBeNull()
      expect(dove!.kind, `«${token}» non è su una card: la sua evidenzia è la pillola`).toBe('altri')
      expect(isSectionTurnToken(token), `«${token}» non è una card`).toBe(false)
    }
    // E chi non compare affatto resta senza posto: lì l'avviso è la verità.
    for (const token of ['G', 'MSb', 'MSp@', '12.14', 'Na', 'RM', 'A', 'F.E.', 'AG7', '']) {
      expect(boardPlacementOf(token), `«${token}» non è nella board`).toBeNull()
    }
  })

  test('chi è in pillola ma PORTA un turno (TUTOR, M/N/P nudi) resta raggiungibile dalla dashboard', () => {
    // La dashboard manda in sala solo se il turno della richiesta combacia con
    // quello del PDF: per questi token la verifica risponde ancora un turno (la
    // board li mostra in pillola), quindi il salto parte e la pillola respira.
    // I codici SENZA turno (corsi `Sp*`, trasferte `Dis*`) restano invece fuori
    // dalla verifica: la board li mostra, ma la richiesta non li riguarda.
    for (const [token, turno] of [['MTUTOR', 'Mattina'], ['PTUTOR', 'Pomeriggio'], ['M', 'Mattina'], ['N', 'Notte'], ['P', 'Pomeriggio']] as const) {
      expect(boardPlacementOf(token)?.kind, `«${token}»: la board lo mostra in pillola`).toBe('altri')
      expect(salaTokenToShiftType(token), `«${token}»: la verifica del turno non blocca il salto`).toBe(turno)
    }
    for (const token of ['SpN', 'ISpNw', 'DisCas', 'GTUTOR']) {
      expect(boardPlacementOf(token)?.kind, `«${token}»: la board lo mostra in pillola`).toBe('altri')
      expect(salaTokenToShiftType(token), `«${token}» non è un turno M/P/N`).toBeNull()
    }
  })

  test('quando la board non disegna la persona, l’avviso dice DOVE la persona è', () => {
    // Il vecchio avviso diceva sempre «la persona non compare in questa sezione».
    // Ora nomina il CODICE del giorno e lo traduce, in una frase che si può leggere.
    expect(spiegaCodiceNonMostrato('RI')).toBe('quel giorno è di riposo (RI)')
    expect(spiegaCodiceNonMostrato('RC')).toBe('quel giorno è di riposo (RC)')
    expect(spiegaCodiceNonMostrato('RM')).toBe('quel giorno è di riposo (RM)')
    expect(spiegaCodiceNonMostrato('D')).toBe('quel giorno è in disponibilità (D)')
    // Le assenze: la frase non si contraddice («assente per assenza» non esiste).
    expect(spiegaCodiceNonMostrato('A')).toBe('quel giorno è assente (A)')
    expect(spiegaCodiceNonMostrato('AG7')).toBe('quel giorno è assente (AG7)')
    expect(spiegaCodiceNonMostrato('F')).toBe('quel giorno è assente per ferie (F)')
    expect(spiegaCodiceNonMostrato('F.E.')).toBe('quel giorno è assente per ferie (F.E.)')
    expect(spiegaCodiceNonMostrato('VS')).toBe('quel giorno è assente per visita sanitaria (VS)')
    // La sezione: con una card nella piantina (c'è, ma sotto un altro turno) e senza.
    expect(spiegaCodiceNonMostrato('M7S', true)).toBe('quel giorno è in sezione «7» (M7S)')
    expect(spiegaCodiceNonMostrato('MIApT')).toContain('che non ha una card sulla board')
    // I codici che la board non disegna per decisione utente: si dice anche quello.
    for (const code of ['G', 'GIAP', 'MSb', '12.14', 'Na']) {
      expect(spiegaCodiceNonMostrato(code), `«${code}»`).toContain('un codice che la board non mostra')
    }
    // E la frase vecchia non torna da nessuna parte.
    for (const code of ['RI', 'A', 'F', 'M7S', 'G']) {
      expect(spiegaCodiceNonMostrato(code)).not.toContain('non compare in questa sezione')
    }
  })

  test('i token «presenti senza sezione» restano turni per il resto dell\'app ma non per il salto', () => {
    // La differenza è il difetto: `salaCodeInfo` continua a rispondere «turno»
    // (etichetta e pillole de «Il tuo turno» ne dipendono), la verifica no.
    for (const [token, turno] of [['MTUTOR', 'Mattina'], ['M', 'Mattina'], ['N', 'Notte'], ['NDisNa', 'Notte']] as const) {
      expect(salaTokenToShiftType(token), `«${token}» è ancora un turno per l'app`).toBe(turno)
      expect(isSectionTurnToken(token), `«${token}» NON è su una card`).toBe(false)
      expect(salaCodeInfo(token).kind, `«${token}» resta classificato dall'app`).toBe('work')
    }
  })

  test('i turni con sezione restano tali', () => {
    for (const [token, sezione] of [['M7S', '7'], ['M11', '11'], ['N10T', '10'], ['PRIC', 'RIC'], ['M3M40', '3M40']] as const) {
      const sez = sectionTurnOf(token)
      expect(sez, `«${token}» deve stare su una card`).not.toBeNull()
      expect(sez!.section).toBe(sezione)
      expect(sez!.shift).toBe(parseShiftCode(token).shift)
    }
  })

  test('l\'omonimo con la riga «solo cognome» si trova anche senza albero nel browser', () => {
    // Per gli omonimi la regola STRETTA della board pretende l'iniziale del nome,
    // e `bareOwners` decide chi possiede la riga col solo cognome — ma
    // `bareOwners` nasce dall'albero squadre, che nel browser può tornare vuoto
    // (documentato in useShiftTeamTreeData: RLS «authenticated»). Senza albero,
    // «ROMANO» non era trovato: la dashboard però mandava lì la persona (la
    // verifica la riconosce), quindi la board rispondeva «non è in sala».
    const dup = new Set(['Romano'])
    expect(matchesCognome(['ROMANO'], 'Romano', 'Raffaele', dup, null), 'la regola stretta da sola non lo trova').toBe(false)
    expect(matchesFocusPerson(['ROMANO'], 'Romano', 'Raffaele', dup, null), 'il flash deve usare anche la regola della verifica').toBe(true)
    // Con le righe che portano l'iniziale si resta precisi: si accende solo il suo.
    expect(matchesFocusPerson(['ESPOSITO AL.'], 'Esposito', 'Alessandro', new Set(['Esposito']), null)).toBe(true)
    expect(matchesFocusPerson(['ESPOSITO AU.'], 'Esposito', 'Alessandro', new Set(['Esposito']), null)).toBe(false)
  })

  test('le varianti a maiuscole miste del PDF valgono come le maiuscole', () => {
    // Il PDF scrive «piaptir», «Mric»: stesso turno, stessa sezione.
    expect(sectionTurnOf('piaptir')?.section).toBe('IAP')
    expect(sectionTurnOf('Mric')?.section).toBe('RIC')
    expect(sectionTurnOf('piaptir')?.shift).toBe('P')
  })
})
