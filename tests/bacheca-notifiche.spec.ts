import { test, expect, E2E_BASE_URL, findEmployee } from './fixtures'
import { NOTIF_TYPES } from '../types/database'

/**
 * BACHECA NOTIFICHE: OGNI tipo deve avere la sua sezione (18/09/2026).
 *
 * Il tipo viaggia dentro la push, il service worker lo copia nella voce salvata
 * sul dispositivo (public/sw.js) e la bacheca lo usa per raggruppare. Il push
 * «novità» del changelog partiva col tipo 'changelog_new' mentre la bacheca
 * conosceva solo gli altri cinque: la notifica arrivava sul telefono e poi
 * SPARIVA dall'elenco — nessun gruppo la conteneva e non c'era un fallback,
 * quindi nessun errore e nessuna traccia.
 *
 * Qui si entra come dipendente, si scrivono nella storia le voci di TUTTI i tipi
 * della lista condivisa (più una con un tipo che non esiste, a prova della rete
 * di sicurezza) e si pretende che ognuna compaia nella sua sezione. Non serve
 * una push vera: la bacheca legge la storia salvata sul dispositivo
 * (lib/notification-storage).
 *
 * Le SEZIONI sono poche e larghe (18/09/2026: nove erano un indice, non una
 * bacheca), e il test lo difende in modo esatto: l'elenco completo delle
 * intestazioni, in ordine, invece di un controllo per singola voce.
 */
const SEZIONI = ['Comunicazioni admin', 'Sistema', 'Cambi turno', 'Cambi ferie', 'Altre notifiche']

const VOCI = [
  { type: 'system',            titolo: 'COMUNICAZIONE-ADMIN', sezione: 'Comunicazioni admin' },
  { type: 'changelog_new',     titolo: 'NOVITA-APP',          sezione: 'Sistema' },
  { type: 'shift_outcome',     titolo: 'ESITO-CAMBIO',        sezione: 'Cambi turno' },
  { type: 'interest',          titolo: 'INTERESSE-TURNO',     sezione: 'Cambi turno' },
  { type: 'new_shift',         titolo: 'NUOVO-CAMBIO',        sezione: 'Cambi turno' },
  { type: 'cleanup',           titolo: 'PULIZIA-CAMBI',       sezione: 'Cambi turno' },
  { type: 'vacation_outcome',  titolo: 'ESITO-FERIE',         sezione: 'Cambi ferie' },
  { type: 'vacation_interest', titolo: 'INTERESSE-FERIE',     sezione: 'Cambi ferie' },
  { type: 'new_vacation',      titolo: 'NUOVO-CAMBIO-FERIE',  sezione: 'Cambi ferie' },
]

/** Tipo che non esiste in NOTIF_TYPES: è la voce scritta da una build più nuova. */
const IGNOTA = { type: 'tipo_di_una_build_futura', titolo: 'VOCE-SCONOSCIUTA', sezione: 'Altre notifiche' }

test('la bacheca mostra ogni tipo di notifica (changelog compreso)', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente per entrare (service-role in .env.local)')
  const page = await asEmployee('Di Monda')

  const ora = Date.now()
  const storia = [...VOCI, IGNOTA].map((v, i) => ({
    id: `prova-${v.type}`,
    title: v.titolo,
    body: `Corpo di prova per «${v.type}»`,
    timestamp: ora - i * 60_000,
    read: i > 0,
    type: v.type,
  }))
  // La storia vive in localStorage: si scrive PRIMA che l'app parta, così la
  // bacheca la trova al primo render (nessuna scrittura a pagina aperta).
  await page.addInitScript(entries => {
    localStorage.setItem('notification-history', JSON.stringify(entries))
  }, storia)

  await page.goto(`${E2E_BASE_URL}/notifiche?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })

  for (const v of [...VOCI, IGNOTA]) {
    await expect(page.getByText(v.titolo, { exact: true }), `${v.type}: la voce deve comparire`).toBeVisible()
  }

  // L'elenco ESATTO delle sezioni visibili, in ordine: quattro sezioni larghe più
  // la rete di sicurezza per la voce col tipo sconosciuto. Un tipo nuovo non deve
  // aggiungere una sezione (e se ne aggiungi una, questo test lo dice).
  const intestazioni = (await page.locator('[data-notif-sezione-titolo]').allTextContents()).map(t => t.trim())
  expect(intestazioni, 'sezioni della bacheca, in ordine').toEqual(SEZIONI)

  // Ogni voce sta nella sua sezione (verifica per tipo, con messaggio parlante).
  for (const v of [...VOCI, IGNOTA]) {
    await expect(
      page.locator(`[data-notif-sezione]`).filter({ hasText: v.sezione }).getByText(v.titolo, { exact: true }),
      `${v.type}: la voce sta sotto «${v.sezione}»`,
    ).toBeVisible()
  }

  // COPERTURA, due lati: (a) la tabella qui sopra prova ESATTAMENTE i tipi della
  // lista condivisa (se nasce un tipo nuovo, questo test lo reclama invece di
  // passare a vuoto); (b) il tipo ignoto NON è nella lista — serve a provare la
  // rete di sicurezza.
  const noti = new Set<string>(NOTIF_TYPES)
  expect([...VOCI].map(v => v.type).sort(), 'la tabella copre tutti i tipi di NOTIF_TYPES').toEqual([...NOTIF_TYPES].sort())
  expect(noti.has(IGNOTA.type), 'il tipo ignoto NON è in NOTIF_TYPES (serve la rete di sicurezza)').toBe(false)
})
