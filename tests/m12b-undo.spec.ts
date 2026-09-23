import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'

/**
 * M12b — L'ANNULLA E LE VIE D'USCITA (23/09/2026).
 *
 * Sono le due metà di M12 che il piano aveva lasciato indietro, e hanno in
 * comune la stessa frase: «e adesso?». La prima la fa chi cancella qualcosa per
 * sbaglio (o con un gesto veloce), la seconda chi apre una schermata e non trova
 * niente.
 *
 * L'ANNULLA. Non tutte le azioni dell'app sono reversibili, e la distinzione non
 * è una formalità: la cronologia delle notifiche è LOCALE (`localStorage`), quindi
 * si può rimettere esattamente com'era — è ciò che fa `lib/undo.ts` con
 * l'istantanea presa da chi muta. Tutto ciò che scrive sul database (eliminare un
 * utente, svuotare i cambi) resta con la CONFERMA, che è la rete giusta per
 * un'azione che non si può disfare. Le prove qui sotto coprono le tre azioni
 * reversibili: la riga cancellata con lo swipe, la cronologia svuotata e le
 * notifiche segnate come lette.
 *
 * LE VIE D'USCITA. Uno stato vuoto senza un comando lascia la persona ferma.
 * La passata li ha trovati in una decina di schermate; qui si provano i due casi
 * in cui la via d'uscita NON è «vai da un'altra parte» ma «sistema quello che hai
 * scritto»: una ricerca senza risultati, che si aggiusta azzerandola.
 */
const DEV = 'dev=rootkind-dev-2026'

/** Tre notifiche, tutte non lette: bastano per lo swipe, lo svuotamento e le letture. */
const SEMINA = [
  { id: 'prova-1', title: 'Comunicazione 1', read: false },
  { id: 'prova-2', title: 'Comunicazione 2', read: false },
  { id: 'prova-3', title: 'Comunicazione 3', read: false },
]

const semina = (page: import('@playwright/test').Page, voci = SEMINA) =>
  page.addInitScript((voci) => {
    localStorage.setItem(
      'notification-history',
      JSON.stringify(
        voci.map((v, i) => ({
          id: v.id,
          title: v.title,
          body: 'Voce seminata dalla spec di M12b.',
          timestamp: Date.now() - i * 60_000,
          read: v.read,
          type: 'system',
          shiftId: null,
        })),
      ),
    )
  }, voci)

const storico = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('notification-history') ?? '[]') as { read: boolean }[])

/** Il comando «Annulla» dello snackbar. Sonner lo rende nel suo contenitore. */
const annullaToast = (page: import('@playwright/test').Page) =>
  page.locator('[data-sonner-toaster]').getByRole('button', { name: 'Annulla' })

/**
 * Il gesto di scorrimento, con eventi touch veri. React legge `touches` /
 * `changedTouches` dall'evento NATIVO: oggetti normali con `clientX` bastano, e
 * non serve costruire dei `Touch` (che non tutti i motori sanno istanziare).
 * Toccare la riga reale e non il suo `boundingBox` al pixel conta: il gesto è
 * quello dell'utente, non una chiamata al gestore.
 */
async function scorri(locator: import('@playwright/test').Locator, dx: number) {
  await locator.evaluate((el, dx) => {
    const punto = (x: number) => ({ clientX: x, clientY: 0, identifier: 1, target: el })
    const fuoco = (type: string, x: number) => {
      const e = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(e, 'touches', { value: [punto(x)] })
      Object.defineProperty(e, 'changedTouches', { value: [punto(x)] })
      el.dispatchEvent(e)
    }
    fuoco('touchstart', 200)
    fuoco('touchmove', 200 + dx)
    fuoco('touchend', 200 + dx)
  }, dx)
}

test.describe('M12b — l’annulla nello snackbar', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(180_000)

  test('la riga cancellata con lo swipe torna con «Annulla»', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await semina(page)
    await page.goto(`${E2E_BASE_URL}/notifiche?${DEV}`, { waitUntil: 'domcontentloaded' })

    const prima = page.getByText('Comunicazione 1', { exact: true })
    await expect(prima).toBeVisible()
    expect((await storico(page)).length, 'tre voci seminate').toBe(3)

    // La sezione di una notifica di tipo `system` è «Comunicazioni admin»
    // (`notification-list.tsx`, `SEZIONE_DI`), non «Sistema»: il tipo dice cosa
    // è successo, la sezione come si raggruppa.
    const riga = page.locator('[data-notif-sezione="admin"] [data-notif-riga]').first()
    await scorri(riga, -100)

    // La riga se ne va, e con lei una voce dello storico…
    await expect(prima).toHaveCount(0, { timeout: 10_000 })
    expect((await storico(page)).length, 'lo swipe cancella davvero').toBe(2)

    // …ma lo snackbar dice che si può tornare indietro, e ci torna.
    await annullaToast(page).click()
    await expect(prima).toBeVisible()
    // L'ORDINE conta: l'istantanea rimette l'elenco com'era, non la voce in fondo.
    const titoli = await page.evaluate(() =>
      (JSON.parse(localStorage.getItem('notification-history') ?? '[]') as { title: string }[]).map(
        (e) => e.title,
      ),
    )
    expect(titoli, 'l’elenco intero, nell’ordine di prima').toEqual([
      'Comunicazione 1',
      'Comunicazione 2',
      'Comunicazione 3',
    ])
  })

  test('la cronologia svuotata torna con «Annulla»', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await semina(page)
    await page.goto(`${E2E_BASE_URL}/notifiche?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Comunicazione 1', { exact: true })).toBeVisible()

    // Svuotare resta un'azione con la CONFERMA (non si tocca): l'annulla è in più,
    // ed è la rete per chi conferma per sbaglio.
    await page.locator('button[data-nav-actions="control"]').click()
    await page.getByRole('button', { name: 'Elimina tutte' }).click()
    const allarme = page.locator('[data-slot="dialog-content"]')
    await allarme.getByRole('button', { name: 'Elimina tutte' }).click()

    await expect(page.getByText('Nessuna notifica ricevuta')).toBeVisible()
    expect((await storico(page)).length).toBe(0)

    await annullaToast(page).click()
    await expect(page.getByText('Comunicazione 1', { exact: true })).toBeVisible()
    expect((await storico(page)).length, 'tutte e tre, di nuovo').toBe(3)
  })

  test('«Segna tutte come lette» si può annullare', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await semina(page)
    await page.goto(`${E2E_BASE_URL}/notifiche?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Comunicazione 1', { exact: true })).toBeVisible()

    await page.locator('button[data-nav-actions="control"]').click()
    await page.getByRole('button', { name: 'Segna tutte come lette' }).click()
    await expect
      .poll(async () => (await storico(page)).every((e) => e.read), { message: 'tutte lette' })
      .toBe(true)

    await annullaToast(page).click()
    await expect
      .poll(async () => (await storico(page)).some((e) => !e.read), { message: 'tornate non lette' })
      .toBe(true)
  })
})

test.describe('M12b — ogni stato vuoto offre una via d’uscita', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(180_000)

  test('la ricerca senza risultati si azzera, e la tabella torna', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/admin/statistiche?${DEV}`, { waitUntil: 'domcontentloaded' })

    const ricerca = page.getByPlaceholder('Cerca nome...')
    await expect(ricerca).toBeVisible({ timeout: 30_000 })
    // La tabella ha delle righe PRIMA: senza questa premessa, «torna» non
    // significherebbe niente.
    const righe = page.locator('table tbody tr')
    expect(await righe.count(), 'la classifica utenti ha delle righe').toBeGreaterThan(0)

    await ricerca.fill('zzzzzz')
    await expect(page.getByText('Nessun utente trovato.')).toBeVisible()
    expect(await righe.count()).toBe(0)

    await page.getByRole('button', { name: 'Azzera ricerca e filtro' }).click()
    await expect(page.getByText('Nessun utente trovato.')).toHaveCount(0)
    expect(await righe.count(), 'la classifica è tornata').toBeGreaterThan(0)
  })

  test('l’elenco «Vedi come» senza risultati si azzera', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/admin?${DEV}`, { waitUntil: 'domcontentloaded' })

    await page.getByText('Vedi come', { exact: true }).click()
    const campo = page.getByPlaceholder('Cerca per nome...')
    await expect(campo).toBeVisible()
    // L'elenco arriva da `/api/admin/users`: la prima riga va ASPETTATA. Contare
    // subito dopo l'apertura misura il vuoto della richiesta in volo, non lo
    // stato vuoto dell'app.
    const voci = page.locator('[data-slot="dialog-content"] button.hover\\:bg-accent')
    await expect(voci.first()).toBeVisible({ timeout: 20_000 })
    expect(await voci.count(), 'ci sono utenti da scegliere').toBeGreaterThan(0)

    await campo.fill('zzzzzz')
    await expect(page.getByText('Nessun utente trovato')).toBeVisible()

    await page.getByRole('button', { name: 'Azzera la ricerca' }).click()
    await expect(page.getByText('Nessun utente trovato')).toHaveCount(0)
    expect(await voci.count(), 'i nomi sono tornati').toBeGreaterThan(0)
  })
})
