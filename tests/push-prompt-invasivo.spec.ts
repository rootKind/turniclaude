import { test, expect, employeeLoginEnabled, E2E_BASE_URL } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * IL PROMEMORIA NOTIFICHE «MOLTO INVASIVO» (richiesta 25/09/2026).
 *
 * La schermata intera deve: coprire l'app a OGNI avvio quando il permesso non è
 * 'granted'; offrire l'uscita «continua senza notifiche» che però mette un
 * conto di 10 minuti; TORNARE quando il conto è scaduto (anche ricaricando).
 *
 * In headless `Notification.permission` è SEMPRE 'denied' (verificato con
 * tests/probe-perm.spec.ts, anche con grantPermissions) → la schermata qui
 * comparirà in variante «bloccate»: va benissimo, si prova la meccanica. Il
 * fixture automatico mette `push-reminder-dismissed` nel contesto: il primo
 * test lo TOLGE per vedere la schermata, gli altri la manovrano via storage.
 *
 * Serve la service-role per entrare come dipendente; senza, si salta.
 */
test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')

const SCHERMATA = '[role="dialog"][aria-label="Attiva le notifiche"]'

async function apriSenzaRicordi(page: Page, chiaviDaTogliere: string[]) {
  // Il fixture automatico (browser-setup) RISCRIVE lo snooze a ogni load con un
  // init script di contesto: per vederla, la schermata va liberata con un init
  // script di PAGINA, che gira DOPO quelli del contesto e quindi vince.
  await page.addInitScript(chiavi => {
    for (const k of chiavi) localStorage.removeItem(k)
  }, chiaviDaTogliere)
  await page.goto(`${E2E_BASE_URL}/?dev=rootkind-dev-2026`)
  await page.waitForLoadState('domcontentloaded')
}

test('la schermata copre l’app a ogni avvio finché non si decide', async ({ asEmployee }) => {
  const page = await asEmployee('Piscopo')
  await apriSenzaRicordi(page, ['push-reminder-dismissed', 'push-reminder-snoozed-at'])

  const schermata = page.locator(SCHERMATA)
  await expect(schermata).toBeVisible({ timeout: 15_000 })
  // Copre davvero: ruolo dialog modale + titolo invariante per 'denied'
  await expect(schermata.getByText('Le notifiche sono bloccate')).toBeVisible()
  // In 'denied' il CTA Attiva NON esiste (non riaprirebbe il permesso del browser)
  await expect(schermata.getByRole('button', { name: /Attiva le notifiche/ })).toHaveCount(0)
  // Il testo rassicura sulla configurabilità (richiesta esplicita del testo)
  await expect(schermata.getByText(/novità, aggiornamenti e informazioni di sistema/)).toBeVisible()
  // L'uscita esiste ma dichiara il prezzo: torna tra 10 minuti
  await expect(schermata.getByText(/continua senza notifiche \(te lo ricordiamo tra 10 minuti\)/)).toBeVisible()
})

test('«continua senza» apre un conto di 10 minuti e la schermata torna scaduto il conto', async ({ asEmployee }) => {
  const page = await asEmployee('Piscopo')
  await apriSenzaRicordi(page, ['push-reminder-dismissed', 'push-reminder-snoozed-at'])

  const schermata = page.locator(SCHERMATA)
  await expect(schermata).toBeVisible({ timeout: 15_000 })

  // «Continua senza notifiche»: la schermata sparisce SUBITO, ma il conto parte.
  await schermata.getByText(/continua senza notifiche/).click()
  await expect(schermata).toHaveCount(0)
  const snoozed = await page.evaluate(() => Number(localStorage.getItem('push-reminder-snoozed-at') ?? 0))
  expect(snoozed, 'il conto del rimando è stato messo in moto').toBeGreaterThan(0)

  // L'app sotto è usable: il rimando non blocca la navigazione
  await expect(page.getByRole('heading', { name: 'Turni Sala C.C.C.' })).toBeVisible()

  // Il conto SCADUTO riapre la schermata (simulando che siano passati 10+ minuti)
  await page.evaluate(() => {
    const passato = Date.now() - (10 * 60 * 1000 + 5_000)
    localStorage.setItem('push-reminder-snoozed-at', String(passato))
  })
  await expect(schermata).toBeVisible({ timeout: 20_000 })
})

test('il rimando sopravvive al ricaricamento e si spegne solo con la decisione', async ({ asEmployee }) => {
  const page = await asEmployee('Piscopo')
  // Via lo snooze dei test (init script di pagina: vince su quello di contesto)
  await page.addInitScript(() => {
    localStorage.removeItem('push-reminder-dismissed')
  })
  // Conto in moto da poco: la schermata NON deve tornare al load
  await page.goto(`${E2E_BASE_URL}/?dev=rootkind-dev-2026`)
  await page.evaluate(() => localStorage.setItem('push-reminder-snoozed-at', String(Date.now() - 30_000)))
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Dopo i 2,5 s di valutazione: ancora niente schermata (conto attivo)
  await page.waitForTimeout(3_500)
  await expect(page.locator(SCHERMATA)).toHaveCount(0)

  // Scaduto il conto: al prossimo avvio si ripresenta (nessuna esenzione eterna)
  await page.evaluate(() => {
    localStorage.setItem('push-reminder-snoozed-at', String(Date.now() - (10 * 60 * 1000 + 1_000)))
  })
  await page.reload()
  await expect(page.locator(SCHERMATA)).toBeVisible({ timeout: 15_000 })
})
