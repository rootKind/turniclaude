import { test, expect, employeeLoginEnabled, E2E_BASE_URL } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * E2E della chip «PER ME» della dashboard (richiesta 25/09/2026).
 *
 * La chip che prima isolava solo i cambi offerti («Solo miei») ora unisce le
 * richieste COMPATIBILI col turno del giorno del viewer — lo stesso criterio
 * delle notifiche «nuovo turno pubblicato» (`notify_shift_filter`): turno
 * reale dal PDF del mese, altrimenti teorico; copre se è fra i cercati.
 *
 * L'attesa NON è scritta a mano: per ogni richiesta visibile al viewer il test
 * chiede a `/api/shift-compat` (lo stesso motore server della verifica, che
 * usa `getUserShiftOnDate`) se quel giorno il viewer copre i turni cercati, e
 * ricostruisce l'elenco atteso di card con i loro aria-label. L'invariante:
 *
 *     card visibili in «Per me» == offerti dal viewer + richieste che l'API
 *                                  dice copribili col suo turno
 *
 * Serve la service-role in `.env.local` (senza, i test si saltano) e il dev
 * server su `E2E_BASE_URL` (default http://localhost:3000).
 */
test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')

test.setTimeout(120_000)

/** Il viewer del test: dipendente DCO con richieste proprie nel DB. */
const VIEWER = 'Piscopo'

interface ShiftCache {
  id: number
  shift_date: string
  offered_shift: string
  requested_shifts: string[]
  user_id: string
  user: { cognome: string | null } | null
}

const meseBreve = (dateStr: string): string =>
  new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', month: 'short' })
    .format(new Date(dateStr + 'T12:00:00Z')).replace('.', '')

const giornoNumero = (dateStr: string): string =>
  new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric' })
    .format(new Date(dateStr + 'T12:00:00Z'))

/** Cache utente della pagina: profilo ed elenco shift (le STEISSE query dell'app). */
async function leggiCache(page: Page): Promise<{ profile: { id: string }; shifts: ShiftCache[] }> {
  return page.evaluate(() => {
    const uid = localStorage.getItem('cache:last-user-id') ?? ''
    const p = localStorage.getItem(`cache:${uid}:user-profile`)
    const s = localStorage.getItem(`cache:${uid}:shifts-false-false`)
    return {
      profile: p ? JSON.parse(p).data : null,
      shifts: s ? (JSON.parse(s).data as ShiftCache[]) : [],
    }
  })
}

/**
 * Riproduce il filtro «limite giorni» della dashboard (shift-list →
 * baseShifts): le richieste oltre `max_shift_swap_days` da oggi (Roma) NON
 * sono visibili, anche se presenti nell'elenco in cache.
 */
async function shiftsVisibili(page: Page): Promise<ShiftCache[]> {
  const { shifts, settings } = await page.evaluate(() => {
    const uid = localStorage.getItem('cache:last-user-id') ?? ''
    const s = localStorage.getItem(`cache:${uid}:shifts-false-false`)
    const a = localStorage.getItem(`cache:${uid}:app-settings`)
    return { shifts: s ? JSON.parse(s).data : [], settings: a ? JSON.parse(a).data : null }
  })
  if (!settings?.shift_swap_limit_enabled || !settings?.hide_shifts_beyond_limit) return shifts
  const max = settings.max_shift_swap_days ?? 0
  if (max <= 0) return shifts
  // Oggi a Roma, come `todayRome()` (lib/utils).
  const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
  const limite = new Date(oggi + 'T12:00:00Z')
  limite.setUTCDate(limite.getUTCDate() + max)
  const limiteStr = limite.toISOString().slice(0, 10)
  return shifts.filter((s: ShiftCache) => s.shift_date <= limiteStr)
}

/** Attende che la pagina abbia scritto le SUE cache (profilo + shift). */
async function apriDashboard(page: Page): Promise<{ profile: { id: string }; shifts: ShiftCache[] }> {
  // Bypass del guard «Installa l'app» (come tests/sala-board.ts).
  await page.goto(`${E2E_BASE_URL}/?dev=rootkind-dev-2026`)
  await page.waitForFunction(() => {
    const uid = localStorage.getItem('cache:last-user-id')
    return !!uid
      && !!localStorage.getItem(`cache:${uid}:user-profile`)
      && !!localStorage.getItem(`cache:${uid}:shifts-false-false`)
  }, undefined, { timeout: 30_000 })
  const cache = await leggiCache(page)
  expect(cache.profile?.id, 'profilo in cache').toBeTruthy()
  const shifts = await shiftsVisibili(page)
  expect(shifts.length, 'shift in cache').toBeGreaterThan(0)
  return { profile: cache.profile, shifts }
}

/** Apre la vista «Per me» e aspetta che i gruppi siano montati (AnimatePresence). */
async function apriPerMe(page: Page): Promise<void> {
  await page.getByRole('button', { name: /per me/i }).click()
  // mode="wait" di AnimatePresence: la vecchia lista esce PRIMA che entrino i
  // gruppi — senza questa attesa si legge il DOM della vista precedente.
  await page.locator('[data-perme]').first().waitFor({ state: 'attached', timeout: 15_000 })
}

/** L'API dice che il viewer copre (almeno uno dei) i turni cercati in quella data? */
async function apiCopre(page: Page, date: string, richiesti: string[]): Promise<boolean> {
  if (!richiesti.length) return false
  return page.evaluate(async ({ date, richiesti }) => {
    const risultati = await Promise.all(richiesti.map(r =>
      fetch(`/api/shift-compat?date=${date}&offered=${encodeURIComponent(r)}`)
        .then(res => (res.ok ? res.json() : { ok: false })),
    ))
    return risultati.some(r => r.ok === true)
  }, { date, richiesti })
}

test('la vista «Per me» combacia con il criterio delle notifiche', async ({ asEmployee }) => {
  const page = await asEmployee(VIEWER)
  const { profile, shifts } = await apriDashboard(page)

  // Attesa: per ogni shift visibile al viewer, possessivo o compatibile?
  const attesiOfferti: string[] = []
  const attesiCompatibili: string[] = []
  for (const s of shifts) {
    const label = `Vedi in sala: turno ${s.offered_shift} del ${giornoNumero(s.shift_date)} ${meseBreve(s.shift_date)} di ${s.user?.cognome ?? ''}`
    if (s.user_id === profile.id) { attesiOfferti.push(label); continue }
    if (await apiCopre(page, s.shift_date, s.requested_shifts ?? [])) attesiCompatibili.push(label)
  }

  // Apri la vista «Per me» e raccogli le card NELL'ORDINE DEL DOM.
  await apriPerMe(page)
  const visibili = await page
    .locator('[data-perme] button[aria-label^="Vedi in sala"]')
    .evaluateAll(els => els.map(e => e.getAttribute('aria-label') ?? ''))

  expect(visibili, 'offerti + compatibili, nell\'ordine dei gruppi')
    .toEqual([...attesiOfferti, ...attesiCompatibili])

  // Il contatore della chip è l'unione (stesso numero delle card viste).
  const conteggioChip = await page.getByRole('button', { name: /per me/i }).locator('.chip-count').textContent()
  expect(conteggioChip?.trim()).toBe(String(visibili.length))
})

test('nessun gruppo vuoto e i contatori delle intestazioni combaciano', async ({ asEmployee }) => {
  const page = await asEmployee(VIEWER)
  await apriDashboard(page)
  await apriPerMe(page)

  const gruppi = await page.locator('[data-perme]').evaluateAll(els => els.map(el => ({
    titolo: el.getAttribute('data-perme') ?? '',
    conteggio: el.querySelector('.chip-count')?.textContent ?? '',
    card: el.querySelectorAll('button[aria-label^="Vedi in sala"]').length,
  })))

  expect(gruppi.length, 'solo gruppi non vuoti').toBeGreaterThan(0)
  for (const g of gruppi) {
    expect(g.titolo, 'titolo gruppo').toMatch(/^Offerti da te|Compatibili col tuo turno$/)
    expect(g.conteggio, `contatore di «${g.titolo}»`).toBe(String(g.card))
  }
  // I due gruppi, se ci sono entrambi, stanno nell'ordine deciso.
  if (gruppi.length === 2) expect(gruppi[0].titolo).toBe('Offerti da te')
})
