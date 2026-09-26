// I CICLI HANNO UNA DATA DI INIZIO VALIDITÀ (migration 037) — test del
// `patternInVigore`: è la regola che permette di cambiare asset da una data
// senza riscrivere i mesi in cui valeva il ciclo precedente.
//
// Il caso reale: dal 01/10/2026 la 5ª sezione diventa la JOLLY, quindi i
// membri della squadra in terza passano da `P5T`/`M5T` a `PJ`/`MJ`. Scrivendo
// il nuovo ciclo nella colonna, settembre sarebbe passato dal 98,3% al 81,5%
// di accordo col suo PDF; con lo storico ogni mese resta col ciclo che valeva.
import { expect, test } from '@playwright/test'
import { patternInVigore, tokenForMember } from '../lib/turni-teorici'

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
