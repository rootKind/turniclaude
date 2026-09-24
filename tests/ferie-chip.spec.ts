import { test, expect, employeeLoginEnabled, E2E_BASE_URL } from './fixtures'
import type { Page } from '@playwright/test'
import { gruppiCompatibiliFerie, titoloCatena } from '../lib/vacation-compat-dashboard'
import type { VacationRequestWithInterests, VacationPeriod } from '../types/database'

/**
 * Le CHIP «COMPATIBILI» e «⛓ A CATENA» della lista ferie (richiesta 25/09/2026).
 *
 * Prima della pubblicazione l'utente non aveva modo di capire, guardando la
 * lista, chi potesse accettare il suo periodo: lo scopriva solo nel dialog di
 * creazione. Le chip usano lo STESSO motore del dialog
 * (findCompatibleVacationRequests + findVacationChains): qui si provano
 *
 *   • sulla LOGICA (gruppiCompatibiliFerie): dirette senza doppioni, catene
 *     distinte, possesso escluso, titoli nel formato del giro;
 *   • sull'E2E: le card visibili con ciascuna chip combaciano con l'attesa
 *     ricalcolata dai dati in cache (per le catene si verifica la VALIDITÀ del
 *     giro: ogni nodo cede al successivo e l'ultimo chiude con l'utente).
 *
 * Serve la service-role in `.env.local` e il dev server su `E2E_BASE_URL`.
 */

// ── LOGICA ────────────────────────────────────────────────────────────────────

const req = (
  id: number,
  user_id: string,
  cognome: string,
  offered: VacationPeriod,
  targets: VacationPeriod[],
): VacationRequestWithInterests => ({
  id,
  user_id,
  offered_period: offered,
  target_periods: targets,
  year: 2027,
  is_pending: false,
  created_at: '2026-09-01T10:00:00Z',
  user: { id: user_id, nome: null, cognome, is_secondary: false },
  vacation_request_interests: [],
})

const IO = 'u-io'
const mia = req(1, IO, 'Io', 2, [3]) // offro P2, cerco P3

// I due E2E dello stesso file STANNO IN UN SOLO worker: in parallelo i magic
// link contemporanei ogni tanto prendono il rate limit di Supabase (vedi
// tests/per-me-dashboard.spec.ts).
test.describe.configure({ mode: 'default' })

test('la diretta è lo scambio a due: offre ciò che cerco e cerca ciò che offro', () => {
  const { dirette, catene } = gruppiCompatibiliFerie(
    [mia, req(2, 'u-b', 'Rossi', 3, [2])],
    [mia],
  )
  expect(dirette.map(r => r.id)).toEqual([2])
  expect(catene).toHaveLength(0)
})

test('la catena a tre chiude il giro e il titolo racconta il percorso', () => {
  // B vuole il mio P2 e offre P6; C vuole P6 e offre P3 (che cerco io).
  const { dirette, catene } = gruppiCompatibiliFerie(
    [mia, req(2, 'u-b', 'Di Monda', 6, [2]), req(3, 'u-c', 'Sabia', 3, [6])],
    [mia],
  )
  expect(dirette).toHaveLength(0)
  expect(catene).toHaveLength(1)
  expect(catene[0].titolo).toBe('⛓ Catena: tu P2 → Di Monda P6 → Sabia P3 → tu')
  expect(catene[0].requests.map(r => r.id)).toEqual([2, 3])
})

test('una richiesta può stare in una diretta E in una catena (gruppi diversi)', () => {
  // B è diretta con me; C vuole P3 e offre P3: la catena B→C si chiude.
  const { dirette, catene } = gruppiCompatibiliFerie(
    [mia, req(2, 'u-b', 'Rossi', 3, [2]), req(3, 'u-c', 'Bianchi', 3, [3])],
    [mia],
  )
  expect(dirette.map(r => r.id)).toEqual([2])
  expect(catene[0].requests.map(r => r.id)).toEqual([2, 3])
})

test('con due richieste proprie nessuna richiesta appare due volte nelle dirette', () => {
  const ancheP3 = req(9, IO, 'Io', 3, [2])
  const { dirette } = gruppiCompatibiliFerie(
    [mia, ancheP3, req(2, 'u-b', 'Rossi', 3, [2])], // B matcha ENTRAMBE le mie
    [mia, ancheP3],
  )
  expect(dirette.map(r => r.id)).toEqual([2])
})

test('le catene identiche trovate da richieste proprie diverse sono deduplicate', () => {
  const ancheP3 = req(9, IO, 'Io', 3, [2])
  const b = req(2, 'u-b', 'Rossi', 6, [2])
  const c = req(3, 'u-c', 'Bianchi', 3, [6])
  const { catene } = gruppiCompatibiliFerie([mia, ancheP3, b, c], [mia, ancheP3])
  expect(catene).toHaveLength(1)
  expect(catene[0].titolo).toContain('tu P2 →')
})

test('le mie richieste non finiscono mai nei gruppi (non ci si scambia da soli)', () => {
  const { dirette, catene } = gruppiCompatibiliFerie(
    [mia, req(2, IO, 'Io', 3, [2])],
    [mia],
  )
  expect(dirette).toHaveLength(0)
  expect(catene).toHaveLength(0)
})

test('il titolo richiede almeno due nodi intermedi e si chiude con l\'utente', () => {
  expect(titoloCatena(mia, [req(2, 'u-b', 'Rossi', 6, [2])])).toBe('⛓ Catena: tu P2 → Rossi P6 → tu')
})

// ── E2E ───────────────────────────────────────────────────────────────────────

/** Viewer con richieste 2027 su dev (P2 → [1,3,4,5,6]). */
const VIEWER = 'Minino'
const ANNO = 2027

interface VacCache {
  id: number
  user_id: string
  offered_period: number
  target_periods: number[]
  user: { cognome: string | null } | null
}

async function cacheFerie(page: Page): Promise<{ mioId: string; richieste: VacCache[] }> {
  return page.evaluate(() => {
    const uid = localStorage.getItem('cache:last-user-id') ?? ''
    const p = localStorage.getItem(`cache:${uid}:user-profile`)
    const raw = localStorage.getItem(`cache:${uid}:vacation-requests-false-${2027}`)
    return {
      mioId: p ? JSON.parse(p).data.id : '',
      richieste: raw ? (JSON.parse(raw).data as VacCache[]) : [],
    }
  })
}

test('E2E: le chip «Compatibili» e «A catena» combaciano con i dati della lista', async ({ asEmployee }) => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')
  test.setTimeout(90_000)

  // SU DEV nessun DCO ha oggi catene reali (il giro possibile passa da un Noni,
  // invisibile nella vista DCO). Il test CREÀ le due richieste che chiudono la
  // catena Minino P2 → B P6 → C P3 → Minino e le RIMUOVE alla fine: la prova
  // resta ripetibile e il database torna com'era.
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const idDi = async (cognome: string): Promise<string> => {
    const { data } = await admin.from('users').select('id').ilike('cognome', cognome).maybeSingle()
    if (!data) throw new Error(`utente non trovato: ${cognome}`)
    return data.id
  }
  const [b, c] = await Promise.all([idDi('Piccirillo'), idDi('Cicia')])
  const { data: create, error: createErr } = await admin
    .from('vacation_requests')
    .insert([
      { user_id: b, offered_period: 6, target_periods: [2], year: ANNO },  // vuole il mio P2
      { user_id: c, offered_period: 3, target_periods: [6], year: ANNO },  // vuole P6 di B
    ])
    .select('id')
  expect(createErr, 'inserimento richieste di prova').toBeNull()
  const idsProva = (create ?? []).map(r => r.id as number)

  const page = await asEmployee(VIEWER)
  try {
    await page.goto(`${E2E_BASE_URL}/vacanze?dev=rootkind-dev-2026`)
    await page.waitForFunction(ids => {
      const uid = localStorage.getItem('cache:last-user-id')
      const raw = uid ? localStorage.getItem(`cache:${uid}:vacation-requests-false-${2027}`) : null
      if (!raw) return false
      const lista = JSON.parse(raw).data as Array<{ id: number }>
      return ids.every(id => lista.some(r => r.id === id))
    }, idsProva, { timeout: 30_000 })

    const { mioId, richieste } = await cacheFerie(page)
    expect(mioId).toBeTruthy()
    const mie = richieste.filter(r => r.user_id === mioId)
    expect(mie.length, 'il viewer ha richieste nell\'anno').toBeGreaterThan(0)
    const altrui = richieste.filter(r => r.user_id !== mioId)
    const perId = new Map(richieste.map(r => [r.id, r]))

    // Attesa DIRETTE: semplice definizione dello scambio a due.
    const diretteAttese = new Set(
      altrui
        .filter(r => mie.some(m =>
          (r.target_periods as number[]).includes(m.offered_period) &&
          m.target_periods.includes(r.offered_period)))
        .map(r => r.id),
    )
    expect(diretteAttese.size, 'il nostro scenario crea almeno una diretta').toBeGreaterThan(0)

    // Chip «Compatibili»: conteggio e card visibili.
    const chipDirette = page.getByRole('button', { name: /^Compatibili/ })
    await chipDirette.click()
    await expect(chipDirette.locator('.chip-count')).toHaveText(String(diretteAttese.size))
    const visteDirette = await page.locator('[data-vac-request]').evaluateAll(els => els.map(e => Number(e.getAttribute('data-vac-request'))))
    expect(new Set(visteDirette)).toEqual(diretteAttese)
    expect(page.locator('[data-catena]')).toHaveCount(0)

    // Chip «⛓ A catena»: un gruppo per catena, e OGNI giro è VALIDO:
    // il primo nodo riceve il mio periodo, ogni nodo cede al successivo,
    // l'ultimo offre qualcosa che cerco.
    const chipCatene = page.getByRole('button', { name: /A catena/ })
    await chipCatene.click()
    await expect(page.locator('[data-catena]').first()).toBeAttached({ timeout: 15_000 })

    const gruppi = await page.locator('[data-catena]').evaluateAll(els => els.map(el => ({
      titolo: el.getAttribute('data-catena') ?? '',
      ids: [...el.querySelectorAll('[data-vac-request]')].map(e => Number(e.getAttribute('data-vac-request'))),
    })))
    await expect(chipCatene.locator('.chip-count')).toHaveText(String(gruppi.length))
    expect(gruppi.length, 'lo scenario crea almeno una catena').toBeGreaterThan(0)

    const nodiVisti = new Set<number>()
    for (const g of gruppi) {
      expect(g.titolo).toMatch(/^⛓ Catena: tu P\d( → \S+ P\d)+ → tu$/)
      expect(g.ids.length).toBeGreaterThanOrEqual(2)
      // validità del giro con i dati reali
      expect(mie.some(m => perId.get(g.ids[0])?.target_periods.includes(m.offered_period)), 'il primo nodo vuole il mio periodo').toBe(true)
      for (let i = 0; i < g.ids.length - 1; i++) {
        expect(perId.get(g.ids[i + 1])?.target_periods.includes(perId.get(g.ids[i])!.offered_period), `il nodo ${i + 1} vuole ciò che offre il nodo ${i}`).toBe(true)
      }
      expect(mie.some(m => m.target_periods.includes(perId.get(g.ids[g.ids.length - 1])!.offered_period)), 'l\'ultimo offre qualcosa che cerco').toBe(true)
      g.ids.forEach(id => nodiVisti.add(id))
    }
    const visteCatene = await page.locator('[data-vac-request]').evaluateAll(els => els.map(e => Number(e.getAttribute('data-vac-request'))))
    expect(new Set(visteCatene)).toEqual(nodiVisti)
  } finally {
    // Pulizia: le richieste di prova spariscono anche se un'asserzione cade.
    for (const id of idsProva) {
      const { error } = await admin.from('vacation_requests').delete().eq('id', id)
      expect(error ?? null, `pulizia richiesta ${id}`).toBeNull()
    }
  }
})

test('E2E: senza richieste proprie le chip sono disabilitate con il suggerimento', async ({ asEmployee }) => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')
  const page = await asEmployee('Piscopo') // DCO senza richieste ferie su dev
  await page.goto(`${E2E_BASE_URL}/vacanze?dev=rootkind-dev-2026`)
  await page.waitForFunction(() => {
    const uid = localStorage.getItem('cache:last-user-id')
    return !!uid && !!localStorage.getItem(`cache:${uid}:user-profile`)
  }, undefined, { timeout: 30_000 })

  const chip = page.getByRole('button', { name: /^Compatibili/ })
  await expect(chip).toBeDisabled()
  await expect(chip).toHaveAttribute('title', /Pubblica una tua richiesta/)
  await expect(page.getByRole('button', { name: /A catena/ })).toBeDisabled()
})
