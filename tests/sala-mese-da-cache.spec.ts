import { test, expect } from './fixtures'
import { E2E_BASE_URL } from './employee-session'
import { adminClient } from './supabase-admin'
import { decodeSalaMonth, isSalaMonthData } from '../lib/sala-month'
import { sectionTurnOf } from '../lib/shift-tokens'

/**
 * IL MESE DALLA CACHE NON DECIDE SE UNA PERSONA C'È (19/09/2026).
 *
 * Il caso vero: un collega vedeva l'avviso GIALLO «…la persona non compare in
 * questa sezione» su card il cui turno esisteva nel PDF (`/turnisala` si apriva
 * correttamente dal dispositivo dell'utente, stesso commit). La differenza non era
 * la versione dell'app ma il DATO LOCALE: la board disegna SUBITO la copia in
 * IndexedDB e riconvalida in background — se quella copia è più vecchia del PDF
 * (basta un ricaricamento del mese dopo la sua ultima visita) il nome cercato non
 * c'è, e la board dichiarava «non è in sala» su un mese che stava per essere
 * sostituito. Ora la board aspetta la riconvalida (`scheduleFresco`).
 *
 * Qui si rifà quel giro, su dati veri:
 *  1. si apre il mese (rete) e si pretende che la card si accenda: senza questo
 *     passo un «non si accende» non direbbe se è colpa della cache o del caso;
 *  2. si CORROMPE la copia in cache (la persona tolta dal giorno, come dopo un PDF
 *     ricaricato);
 *  3. si rallenta la rete e si riapre la stessa URL: la board disegna la copia
 *     vecchia… e non deve dire niente; poco dopo arriva il mese vero e la card si
 *     accende.
 */

const DEV = 'dev=rootkind-dev-2026'
const MESE = '2026-08'
const CHI_APRE = 'Minino'

/** Una persona di quel mese con un turno su una sezione che HA una card. */
async function casoUtile() {
  const sb = adminClient()
  if (!sb) return null
  const { data: layoutRow } = await sb.from('sala_layout').select('layout').eq('id', 1).maybeSingle()
  const cards = (layoutRow?.layout as { cards?: Array<{ sectionKey?: string; title: string }> } | undefined)?.cards ?? []
  const chiavi = new Set(cards.map(c => c.sectionKey ?? c.title))
  const { data: row } = await sb.from('sala_schedule').select('schedule').eq('month', MESE).maybeSingle()
  if (!row || !isSalaMonthData(row.schedule)) return null
  const { data: users } = await sb.from('users').select('cognome')
  const quanti = new Map<string, number>()
  for (const u of users ?? []) {
    const k = (u.cognome ?? '').toUpperCase()
    quanti.set(k, (quanti.get(k) ?? 0) + 1)
  }
  for (const p of decodeSalaMonth(row.schedule)) {
    const cognome = (p.name ?? '').trim().split(' ')[0]
    // Cognome unico: il flash non deve dipendere dagli omonimi (quello è un altro test).
    if (!cognome || quanti.get(cognome.toUpperCase()) !== 1) continue
    for (let i = 0; i < p.days.length; i++) {
      const sez = sectionTurnOf(p.days[i])
      if (sez && chiavi.has(sez.section)) return { cognome, giorno: i + 1, shift: sez.shift }
    }
  }
  return null
}

/** Toglie la persona dal giorno COPIATO IN CACHE (come un PDF ricaricato dopo). */
async function invecchiaCache(
  page: import('@playwright/test').Page,
  caso: { cognome: string; giorno: number },
): Promise<number> {
  return page.evaluate(async ({ mese, cognome, giorno }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('turni-sala-cache', 1)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    const leggi = <T,>(req: IDBRequest<T>) => new Promise<T>(resolve => { req.onsuccess = () => resolve(req.result) })
    const chiave = await leggi(db.transaction('months', 'readonly').objectStore('months').getAllKeys())
      .then(keys => (keys as IDBValidKey[]).find(k => typeof k === 'string' && k.endsWith(`:sala-${mese}`)))
    if (typeof chiave !== 'string') return 0
    type Slot = 'T' | 'S' | 'noSlot'
    type Sezione = Record<string, { surnames: Record<Slot, string[]>; tirocinanti: string[] }>
    const entry = await leggi(db.transaction('months', 'readonly').objectStore('months').get(chiave) as IDBRequest<unknown>) as
      | { schedule?: { schedule?: Record<number, { sections?: Record<string, Sezione> }> } }
      | undefined
    const day = entry?.schedule?.schedule?.[giorno]
    if (!day?.sections) return 0
    let tolte = 0
    const taglia = (nomi: string[]) => nomi.filter(n => {
      const tieni = !String(n).toUpperCase().startsWith(cognome.toUpperCase())
      if (!tieni) tolte++
      return tieni
    })
    for (const sezione of Object.values(day.sections)) {
      for (const turno of Object.values(sezione)) {
        for (const slot of ['T', 'S', 'noSlot'] as Slot[]) {
          if (Array.isArray(turno?.surnames?.[slot])) turno.surnames[slot] = taglia(turno.surnames[slot])
        }
        if (Array.isArray(turno?.tirocinanti)) turno.tirocinanti = taglia(turno.tirocinanti)
      }
    }
    await new Promise<void>(resolve => {
      const tx = db.transaction('months', 'readwrite')
      tx.objectStore('months').put(entry, chiave)
      tx.oncomplete = () => resolve()
    })
    return tolte
  }, { mese: MESE, cognome: caso.cognome, giorno: caso.giorno })
}

test('il mese dalla cache (non riconvalidato) non fa dire «non è in sala»', async ({ asEmployee }) => {
  test.setTimeout(180_000)
  const caso = await casoUtile()
  test.skip(!caso, `nessuna persona con sezione collegata a una card in ${MESE}`)
  const { cognome, giorno, shift } = caso!
  const page = await asEmployee(CHI_APRE)
  const url = `${E2E_BASE_URL}/turnisala?${DEV}&m=${MESE}&d=${giorno}&t=${shift}&c=${cognome}`

  // (1) Mese fresco dalla rete: la card DEVE accendersi.
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await expect(
    page.locator('.desk-card-flash'),
    `${cognome} il ${giorno}/${MESE} non si accende nemmeno col mese fresco: caso non valido`,
  ).toBeVisible({ timeout: 25_000 })

  // (2) La copia in cache diventa vecchia: la persona non c'è più.
  const tolte = await invecchiaCache(page, { cognome, giorno })
  expect(tolte, 'la copia in cache non conteneva la persona: niente da invecchiare').toBeGreaterThan(0)

  // (3) Rete lenta: la board disegna la copia vecchia per un attimo — è la
  //     finestra in cui usciva il giallo del collega.
  await page.route('**/rest/v1/sala_schedule*', async route => {
    await new Promise(r => setTimeout(r, 1500))
    await route.continue()
  })

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  expect(
    await page.locator('[data-sonner-toast]').filter({ hasText: 'non è in sala' }).count(),
    'la board ha dichiarato «non è in sala» guardando la copia in cache non riconvalidata',
  ).toBe(0)

  // (4) Arrivata la riconvalida, la card si accende.
  await expect(
    page.locator('.desk-card-flash'),
    'con il mese riconvalidato la card doveva accendersi',
  ).toBeVisible({ timeout: 25_000 })
  // Il cognome sulla card è nel formato del PDF (maiuscolo): confronto insensibile al caso.
  expect((await page.locator('.desk-card-flash').innerText()).toUpperCase()).toContain(cognome.toUpperCase())
})
