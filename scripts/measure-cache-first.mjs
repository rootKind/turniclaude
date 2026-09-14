// Misurazione A/B cache-first (20/09/2026): variante BEFORE (13a3bee) vs AFTER
// (cbf2e7d) su due server dev. Per ogni variante logga TUTTE le richieste REST
// Supabase e i websocket realtime, e misura il tempo click→contenuto del
// cambio mese su /turnisala (prima visita = rete, rivisita = cache IDB).
// Output: JSON con fasi, conteggi e latenze.
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const VARIANT = process.argv[2] ?? 'after'
const BASE = process.argv[3] ?? 'http://localhost:3000'
const OUT = process.argv[4] ?? `measure-${VARIANT}.json`

const state = JSON.parse(readFileSync('tests/.auth-state.json', 'utf8'))
state.origins.forEach(o => {
  if (o.origin === 'http://localhost:3000') o.origin = BASE
})

const results = { variant: VARIANT, base: BASE, rest: [], ws: [], phases: {} }

function startLogging(page) {
  page.on('request', req => {
    const url = req.url()
    if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) {
      results.rest.push({ t: Date.now(), method: req.method(), url: url.replace(/\?.*/, ''), phase: results.currentPhase ?? '?' })
    }
    if (url.startsWith('wss://') || url.startsWith('ws://')) {
      results.ws.push({ t: Date.now(), url: url.slice(0, 80), phase: results.currentPhase ?? '?' })
    }
  })
}

async function freshPage(context, phase) {
  const page = await context.newPage()
  results.currentPhase = phase
  startLogging(page)
  return page
}

async function waitBoard(page) {
  await page.waitForSelector('.sala-card-bg', { timeout: 20000 })
}

const browser = await chromium.launch()

try {
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 800 } })

  // ── FASE 1: cold start /turnisala (prima apertura dispositivo "pulito") ────
  let page = await freshPage(ctx, 'cold-turnisala')
  const t0 = Date.now()
  await page.goto(`${BASE}/turnisala`, { waitUntil: 'domcontentloaded' })
  await waitBoard(page)
  results.phases.coldTurnisalaMs = Date.now() - t0

  // Finestra storage: QUANTI mesi in IDB dopo il cold start (solo AFTER li scrive)
  results.phases.idbMonthsAfterCold = await page.evaluate(async () => {
    try {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('turni-sala-cache'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
      const tx = db.transaction('months', 'readonly')
      const keys = await new Promise(res => { const q = tx.objectStore('months').getAllKeys(); q.onsuccess = () => res(q.result) })
      return keys.length
    } catch { return -1 } // DB assente = funzionalità non presente
  })

  // ── FASE 2: cambio mese → OTTOBRE 2026 (prima visita: dalla rete) ──────────
  // Uso il calendario del day-picker: apro il pannello, scelgo mese/anno.
  // NB (21/09/2026): l'off-by-one della tendina «Scegli mese» è stato CORRETTO
  // nel codice, quindi ora value = indice 0-based del mese, come un <select>
  // normalissimo.
  async function pickMonthYear(page, monthIndex0, year) {
    // Il trigger è il bottone data in testa alla toolbar: primo button dell'header.
    const trigger = page.locator('.sala-toolbar-bg button').first()
    await trigger.click()
    const panel = page.locator('.cal-panel')
    await panel.waitFor({ state: 'visible', timeout: 5000 })
    await panel.locator('select[aria-label="Scegli mese"]').selectOption(String(monthIndex0))
    await panel.locator('select[aria-label="Scegli anno"]').selectOption(String(year))
    // Clicca il giorno 15 del mese scelto nel calendario
    await panel.locator('table button', { hasText: /^15$/ }).first().click()
  }

  results.currentPhase = 'month-first-visit'
  const t1 = Date.now()
  await pickMonthYear(page, 9, 2026) // 9 = ottobre (0-based)
  await page.waitForFunction(
    () => document.body.innerText.includes('OTTOBRE') || document.body.innerText.includes('Ottobre'),
    { timeout: 20000 },
  )
  await waitBoard(page)
  results.phases.monthFirstVisitMs = Date.now() - t1

  // ── FASE 3: ritorno a SETTEMBRE (AFTER: cache IDB hit; BEFORE: rete) ───────
  results.currentPhase = 'month-revisit'
  const t2 = Date.now()
  await pickMonthYear(page, 8, 2026) // 8 = settembre (0-based)
  await page.waitForFunction(
    () => document.body.innerText.includes('SETT') || document.body.innerText.includes('Settembre'),
    { timeout: 20000 },
  )
  await waitBoard(page)
  results.phases.monthRevisitMs = Date.now() - t2

  // ── FASE 4: reload a caldo (stesso tab) + cambio mese rivisitato ───────────
  results.currentPhase = 'warm-reload'
  const restBeforeReload = results.rest.length
  const t3 = Date.now()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitBoard(page)
  results.phases.warmReloadMs = Date.now() - t3
  results.phases.warmReloadRestCalls = results.rest.length - restBeforeReload
  await page.close()

  // ── FASE 5: /tuoturno cold + swipe mesi ────────────────────────────────────
  page = await freshPage(ctx, 'cold-tuoturno')
  const t4 = Date.now()
  await page.goto(`${BASE}/tuoturno`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main', { timeout: 20000 })
  results.phases.coldTuoturnoMs = Date.now() - t4

  results.currentPhase = 'tuoturno-month-prev'
  const t5 = Date.now()
  await page.getByRole('button', { name: 'Mese precedente' }).click()
  await page.waitForTimeout(1200) // attesa fetch/espansione
  results.phases.tuoturnoPrevMonthMs = Date.now() - t5

  results.currentPhase = 'tuoturno-month-next'
  const t6 = Date.now()
  await page.getByRole('button', { name: 'Mese successivo' }).click().catch(async () => {
    // il bottone "successivo" può avere altra label: uso la freccia destra
    await page.locator('button:has(svg.lucide-chevron-right)').first().click()
  })
  await page.waitForTimeout(1200)
  results.phases.tuoturnoNextMonthMs = Date.now() - t6
  await page.close()

  await ctx.close()
} finally {
  await browser.close()
}

// Riepilogo REST per fase
results.restSummary = {}
for (const r of results.rest) {
  const k = r.phase
  results.restSummary[k] = (results.restSummary[k] ?? 0) + 1
}

writeFileSync(OUT, JSON.stringify(results, null, 2))
console.log(`OK ${VARIANT}:`, JSON.stringify(results.phases), 'REST per fase:', JSON.stringify(results.restSummary))
