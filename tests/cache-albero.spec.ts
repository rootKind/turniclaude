// IL RESTORE DA IndexedDB NON SOVRASCRIVE UN DATO PIÙ FRESCO (27/09/2026).
//
// Il bug: `QueryProvider` rimetteva in cache la copia persistita di
// `['shift-team-tree']` con il suo `dataUpdatedAt` ORIGINALE e senza guardare
// se il client avesse già in mano qualcosa di più recente. Su /turnisala
// quell'albero è quello che il server ha appena mandato con la pagina, quindi
// quando la fetch client arrivava prima della lettura da IDB (corsa) il restore
// la buttava via e la board tornava all'assetto di prima — LONI A. con il ciclo
// da 252 delle scorte invece che da 84 della rosa — per tutta la staleTime di 6
// ore. Qui si blocca la regola, non l'app: `ilRestoreVale` è la funzione che il
// provider chiama.
import { test, expect } from '@playwright/test'
import { ilRestoreVale } from '../lib/query-idb-cache'

const ORA = 1_757_000_000_000 // un istante qualsiasi
const UNA_ORA = 60 * 60 * 1000

test.describe('restore della cache anagrafica', () => {
  test('senza niente in mano il restore vale: è la prima visita, la copia serve', () => {
    expect(ilRestoreVale(ORA, undefined)).toBe(true)
  })

  test('query in mano senza dati (fetch ancora in volo): il restore vale', () => {
    expect(ilRestoreVale(ORA, { data: undefined, dataUpdatedAt: 0 })).toBe(true)
  })

  test('copia più recente di quello in mano: il restore vale', () => {
    // L'app è stata chiusa ieri, la sessione è nuova: la copia è la più nuova.
    expect(ilRestoreVale(ORA, { data: { tipos: [] }, dataUpdatedAt: ORA - UNA_ORA })).toBe(true)
  })

  test('stesso istante: il restore non fa male', () => {
    expect(ilRestoreVale(ORA, { data: { tipos: [] }, dataUpdatedAt: ORA })).toBe(true)
  })

  test('dato IN MANO più fresco: il restore viene SCARTATO', () => {
    // Il caso reale: la pagina ha già l'albero del server, la copia su IDB è di
    // prima dell'assetto di ottobre. Rimetterla farebbe vedere un asset abolito.
    const inMano = { data: { tipi: ['in terza'] }, dataUpdatedAt: ORA }
    expect(ilRestoreVale(ORA - UNA_ORA, inMano)).toBe(false)
  })

  test('un secondo di freschezza basta per scartare la copia', () => {
    const inMano = { data: { tipi: ['in terza'] }, dataUpdatedAt: ORA + 1000 }
    expect(ilRestoreVale(ORA, inMano)).toBe(false)
  })
})
