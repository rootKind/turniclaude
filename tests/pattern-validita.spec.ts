// I CICLI HANNO UNA DATA DI INIZIO VALIDITÀ (migration 037) — test del
// `patternInVigore`: è la regola che permette di cambiare asset da una data
// senza riscrivere i mesi in cui valeva il ciclo precedente.
//
// Il caso reale: dal 01/10/2026 la 5ª sezione diventa la JOLLY, quindi i
// membri della squadra in terza passano da `P5T`/`M5T` a `PJ`/`MJ`. Scrivendo
// il nuovo ciclo nella colonna, settembre sarebbe passato dal 98,3% al 81,5%
// di accordo col suo PDF; con lo storico ogni mese resta col ciclo che valeva.
import { expect, test } from '@playwright/test'
import { generateTheoreticalMonth, lunghezzaCicloInVigore, patternInVigore, theoRealSectionCompare, tokenForMember } from '../lib/turni-teorici'
import { emptyShift } from '../lib/shift-tokens'
import type { DaySchedule, SalaSchedule } from '../types/database'

const TIPO = { cycle_days: 84, pattern_start: '2026-03-01' }
const cicloPrima = Array.from({ length: 84 }, (_, i) => (i % 3 === 0 ? 'P5T' : i % 3 === 1 ? 'M5T' : 'RC'))
const cicloDopo = cicloPrima.map(t => (t === 'P5T' ? 'PJ' : t === 'M5T' ? 'MJ' : t))
const membro = {
  pattern: cicloPrima,
  patterns: [
    { from_date: '2026-03-01', pattern: cicloPrima },
    { from_date: '2026-10-01', pattern: cicloDopo },
  ],
}

test('il ciclo in vigore è quello della data richiesta', () => {
  expect(patternInVigore(membro, '2026-07-15')).toEqual(cicloPrima)
  expect(patternInVigore(membro, '2026-09-30')).toEqual(cicloPrima)
  expect(patternInVigore(membro, '2026-10-01')).toEqual(cicloDopo)
  expect(patternInVigore(membro, '2027-01-01')).toEqual(cicloDopo)
})

test('senza storico vale il ciclo di base, anche prima del primo scalino', () => {
  const senzaStorico = { pattern: cicloPrima }
  expect(patternInVigore(senzaStorico, '2026-01-01')).toEqual(cicloPrima)
  expect(patternInVigore(senzaStorico, '2026-10-01')).toEqual(cicloPrima)
  expect(patternInVigore({ pattern: cicloPrima, patterns: [] }, '2026-10-01')).toEqual(cicloPrima)
})

test('il token di settembre non cambia e quello di ottobre sì', () => {
  const a = tokenForMember(TIPO, membro, 'squadra', [], '2026-09-30')
  const b = tokenForMember(TIPO, membro, 'squadra', [], '2026-10-01')
  const idx = (d: string) => (Math.round((Date.parse(d) - Date.parse('2026-03-01')) / 86400000) % 84 + 84) % 84
  expect(a).toBe(cicloPrima[idx('2026-09-30')])
  expect(b).toBe(cicloDopo[idx('2026-10-01')])
  // il punto in cui il ciclo cambia: tutti i giorni di settembre sono quelli di
  // prima, tutti quelli di ottobre quelli nuovi
  for (let g = 1; g <= 30; g++) {
    const d = `2026-09-${String(g).padStart(2, '0')}`
    expect(tokenForMember(TIPO, membro, 'squadra', [], d)).toBe(cicloPrima[idx(d)])
  }
  for (let g = 1; g <= 31; g++) {
    const d = `2026-10-${String(g).padStart(2, '0')}`
    expect(tokenForMember(TIPO, membro, 'squadra', [], d)).toBe(cicloDopo[idx(d)])
  }
})

test('un secondo scalino più recente vince, e uno più vecchio no', () => {
  const conDue = {
    pattern: cicloPrima,
    patterns: [
      { from_date: '2026-10-01', pattern: cicloDopo },
      { from_date: '2026-12-01', pattern: cicloPrima },
      { from_date: '2026-01-01', pattern: cicloDopo },
    ],
  }
  expect(patternInVigore(conDue, '2026-09-30')).toEqual(cicloDopo)  // l'unico in vigore
  expect(patternInVigore(conDue, '2026-10-15')).toEqual(cicloDopo)  // dal 01/10
  expect(patternInVigore(conDue, '2026-12-01')).toEqual(cicloPrima)  // dal 01/12
})

// Il caso reale che ha reso necessaria `lunghezzaCicloInVigore`: le scorte di
// rilievo hanno 9 membri con cicli da 252 token dentro la tipologia «Scorte»,
// che ha cycle_days = 28. Il pannello usava quel 28 come riferimento e quindi
// bloccava il salvataggio di quei membri come se fossero sbagliati.
const rilievo = {
  pattern: Array.from({ length: 252 }, (_, i) => `M${(i % 9) + 2}`),
  patterns: [
    { from_date: '2026-03-01', pattern: Array.from({ length: 252 }, () => 'M5T') },
    { from_date: '2026-10-01', pattern: Array.from({ length: 252 }, () => 'MJ') },
  ],
}

// IL CICLO VUOTO È «NON IN SQUADRA DA QUELLA DATA» (27/09/2026)
// Serve al subentro: dal 1°October 2026 COPPOLA prende il posto di CASTELLONE
// in ASTER. CASTELLONE esce con un ciclo vuoto da quella data (altrimenti
// resterebbe un turno teorico senza riscontro reale in ogni mese successivo) e
// COPPOLA entra avendo un ciclo vuoto fino a lì. Un ciclo vuoto non deve
// ripiegare sul cycle_days della tipologia, che restituirebbe un turno a caso.
test('un ciclo vuoto vuol dire non in squadra, non un turno a caso', () => {
  const TIPO = { cycle_days: 84, pattern_start: '2026-03-01' }
  const uscente = {
    pattern: cicloPrima,
    patterns: [
      { from_date: '2026-03-01', pattern: cicloPrima },
      { from_date: '2026-10-01', pattern: [] },
    ],
  }
  const entrante = {
    pattern: [],
    patterns: [{ from_date: '2026-10-01', pattern: cicloDopo }],
  }
  // chi esce lavora fino al 30/09 e da ottobre non ha più turni
  expect(tokenForMember(TIPO, uscente, 'squadra', [], '2026-09-30')).not.toBe('')
  expect(tokenForMember(TIPO, uscente, 'squadra', [], '2026-10-01')).toBe('')
  expect(tokenForMember(TIPO, uscente, 'squadra', [], '2026-12-25')).toBe('')
  // chi entra è il contrario
  expect(tokenForMember(TIPO, entrante, 'squadra', [], '2026-09-30')).toBe('')
  expect(tokenForMember(TIPO, entrante, 'squadra', [], '2026-10-01')).not.toBe('')
  // e il pannello dice 0/0 invece di prendere il ciclo_days come riferimento
  expect(lunghezzaCicloInVigore(entrante, '2026-09-30', '2026-09-30', 84)).toBe(0)
  expect(lunghezzaCicloInVigore(entrante, '2026-10-01', '2026-09-30', 84)).toBe(84)
})

test('una persona senza ciclo non viene elencata nel mese teorico', () => {
  const tipo = {
    is_active: true,
    pattern_start: '2026-03-01',
    cycle_days: 84,
    teams: [{
      id: 'sq-aster',
      name: 'ASTER',
      members: [
        { id: 'm1', full_name: 'CASTELLONE', is_active: true, pattern: cicloPrima, patterns: [{ from_date: '2026-03-01', pattern: cicloPrima }, { from_date: '2026-10-01', pattern: [] }] },
        { id: 'm2', full_name: 'COPPOLA', is_active: true, pattern: [], patterns: [{ from_date: '2026-10-01', pattern: cicloDopo }] },
      ],
    }],
  }
  const settembre = generateTheoreticalMonth('2026-09', { types: [tipo] } as never, [])
  const ottobre = generateTheoreticalMonth('2026-10', { types: [tipo] } as never, [])
  // raccoglie ogni stringa del giorno, che sia in sezione o fra gli altri
  // presenti (la struttura di `altriPresenti` è raggruppata per turno)
  const nomiDelMese = (mese: SalaSchedule) => {
    const fuori = new Set<string>()
    const guarda = (x: unknown) => {
      if (typeof x === 'string') { fuori.add(x); return }
      if (Array.isArray(x)) { x.forEach(guarda); return }
      if (x && typeof x === 'object') Object.values(x).forEach(guarda)
    }
    guarda(mese.schedule)
    return [...fuori]
  }
  expect(nomiDelMese(settembre).sort()).toEqual(['CASTELLONE'])
  expect(nomiDelMese(ottobre).sort()).toEqual(['COPPOLA'])
})

test('il riferimento del pannello è il ciclo in vigore, non il cycle_days del tipo', () => {
  // prima del 1° ottobre il ciclo è il 252 col jolly vecchio
  expect(lunghezzaCicloInVigore(rilievo, '2026-09-26', '2026-09-26', 28)).toBe(252)
  // dal 1° ottobre quello col jolly nuovo: sempre 252
  expect(lunghezzaCicloInVigore(rilievo, '2026-10-01', '2026-09-26', 28)).toBe(252)
  // una data nuova (non c'è ancora un ciclo) prende quello di oggi
  expect(lunghezzaCicloInVigore(rilievo, '2027-01-01', '2026-10-15', 28)).toBe(252)
  // un membro con la colonna VUOTA non è in squadra: il riferimento è 0, non
  // il cycle_days della tipologia (cambia da quando la colonna vuota vuol dire
  // «non in squadra»: vedi il test sul ciclo vuoto qui sotto)
  expect(lunghezzaCicloInVigore({ pattern: [] }, '2026-10-01', '2026-10-01', 28)).toBe(0)
  // e un membro senza storico usa la colonna
  expect(lunghezzaCicloInVigore({ pattern: cicloPrima }, '2026-10-01', '2026-10-01', 28)).toBe(84)
})

// SENZA ACCOUNT UTENTE IL TURNO ESCE LO STESSO (27/09/2026)
// COPPOLA entra in ASTER al posto di CASTELLONE senza `user_id`, come gli altri
// ~80 membri dell'albero: in anagrafica non c'è, ma il turno deve comparire in
// /turnisala e combaciare col PDF reale. Il turno viaggia per NOME del membro
// (`applyTokenToDay(schedule[d], member.full_name, token)`) e il confronto
// teorico≠reale abbina per cognome (`surnameKey`): l'account serve solo per
// gli omonimi (bare owner), per i cambi e per le ferie.
const cicloCOPPOLA = ['RI', 'M3S', 'M3S', 'M3S', 'M3S', 'M3S', 'RC']
const alberoSenzaUtente = (userId: string | null) => ({
  types: [{
    is_active: true,
    pattern_start: '2026-03-01',
    cycle_days: 7,
    teams: [{
      id: 'sq-aster',
      name: 'ASTER',
      members: [{
        id: 'm-coppola',
        full_name: 'COPPOLA',
        user_id: userId,
        is_active: true,
        pattern: cicloCOPPOLA,
        patterns: [{ from_date: '2026-09-01', pattern: cicloCOPPOLA }],
      }],
    }],
  }],
}) as never

test('il mese teorico non cambia se il membro ha o no un account utente', () => {
  const senza = generateTheoreticalMonth('2026-10', alberoSenzaUtente(null), [])
  const con = generateTheoreticalMonth('2026-10', alberoSenzaUtente('u-1'), [])
  expect(senza.schedule).toEqual(con.schedule)
  // e il turno c'è davvero: nel ciclo da 7 ci sono 5 giorni di servizio e 2 di
  // assenza (RC/RI), quindi in ottobre COPPOLA è in sezione 22 volte
  const inSezione = Object.values(senza.schedule).filter(d =>
    Object.values(d.sections).some(s => s.M.surnames.S.includes('COPPOLA')),
  ).length
  expect(inSezione).toBe(22)
})

test('senza account, il PDF reale combacia col turno teorico per cognome', () => {
  const tree = alberoSenzaUtente(null)
  // primo giorno di ottobre in cui il ciclo dà il turno in sezione 3 (M3S)
  const membro = { pattern: cicloCOPPOLA, patterns: [{ from_date: '2026-09-01', pattern: cicloCOPPOLA }] }
  const giorno = [...Array(31).keys()]
    .map(i => i + 1)
    .find(d => tokenForMember({ cycle_days: 7, pattern_start: '2026-03-01' }, membro, 'sq-aster', [], `2026-10-${String(d).padStart(2, '0')}`) === 'M3S')!
  // 1) stesso turno e sezione → riga CONFERMATA: sparisce dalle righe e non
  //    finisce fra le «Nuovi» (è quello che la board mostra sotto la card)
  const confermato = theoRealSectionCompare('2026-10', giorno, tree, [], {
    sections: { '3': { M: { surnames: { T: [], S: ['COPPOLA'], noSlot: [] }, tirocinanti: [] }, P: emptyShift(), N: emptyShift() } },
    altriPresenti: [],
  })
  // la sezione non compare proprio: la riga è confermata, quindi niente da
  // mostrare sotto la card (la board la mostra già con il suo turno)
  expect(confermato.get('3|M')).toBeUndefined()
  // 2) sezione diversa → riga rossa che dice dove sta davvero
  const spostato = theoRealSectionCompare('2026-10', giorno, tree, [], {
    sections: { '1': { M: { surnames: { T: [], S: ['COPPOLA'], noSlot: [] }, tirocinanti: [] }, P: emptyShift(), N: emptyShift() } },
    altriPresenti: [],
  })
  const riga = spostato.get('3|M')!.rows.find(r => r.name === 'COPPOLA')
  expect(riga).toEqual({ name: 'COPPOLA', theo: 'M3S', real: 'M1' })
  // e non viene anche elencato fra i «Nuovi» della sezione dove sta davvero:
  // la stessa persona è un posto solo, non due righe
  expect([...spostato.values()].flatMap(c => c.extras).map(e => e.name)).not.toContain('COPPOLA')
})
