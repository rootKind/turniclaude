// Misurazione click→contenuto su BUILD DI PRODUZIONE con throttling Fast 3G
// (21/09/2026). Per ogni navigazione della catena misura:
//  - click→contenuto: dal click sul controllo di nav al primo selettore di
//    CONTENUTO della pagina (mai presente negli skeleton);
//  - richieste REST Supabase e byte di rete (documento + XHR) della navigazione.
// Catena deterministica: i bottoni «Turni Sala e Ferie»/«Cambi» TOGGLANO tra
// le due pagine del gruppo quando si è già nel gruppo, altrimenti seguono le
// chiavi localStorage turni-last-page/cambi-last-page → la catena parte da
// /tuoturno (fuori da entrambi i gruppi) con le chiavi pre-seedate, e ogni
// gruppo viene attraversato in sequenza prima che le pagine riscrivano le chiavi.
// Scenari: COLD (storage vuoto) e WARM (stesso context: riscaldamento + misura).
// Uso: node scripts/measure-nav-prod.mjs [baseURL] [out.json]
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const OUT = process.argv[3] ?? 'measure-nav-prod.json'

const state = JSON.parse(readFileSync('tests/.auth-state.json', 'utf8'))
state.origins.forEach(o => {
  if (o.origin === 'http://localhost:3000') o.origin = BASE
})

// Catena: ogni step parte dalla pagina precedente (from) e clicca il controllo
// reale della bottom-nav. content = selettore di CONTENUTO, assente dagli skeleton.
const NAVS = [
  // 21/09/2026: i bottoni gruppo sono diventati <Link prefetch> → ora sono <a>.
  { name: 'turnisala',   from: '/tuoturno',     click: '[aria-label="Turni Sala e Ferie"]', content: '.sala-toolbar-bg' },
  { name: 'turniferie',  from: '/turnisala',    click: '[aria-label="Turni Sala e Ferie"]', content: 'h1:has-text("Turni Ferie")' },
  { name: 'vacanze',     from: '/turniferie',   click: '[aria-label="Cambi"]',                    content: 'h1:has-text("Ferie Sala")' },
  { name: 'dashboard',   from: '/vacanze',      click: '[aria-label="Cambi"]',                    content: 'h1:has-text("Turni Sala")' },
  { name: 'tuoturno',    from: '/dashboard',    click: '[aria-label="Il tuo turno"]',             content: '[aria-label="Scegli mese e anno"]' },
  { name: 'impostazioni',from: '/tuoturno',     click: 'a[href="/impostazioni"]',                 content: 'h1:has-text("Impostazioni")' },
  { name: 'notifiche',   from: '/impostazioni', click: 'a[href="/notifiche"]',                    content: 'h1:has-text("Notifiche")' },
]

function newBucket(label) { return { label, pages: {} } }

function attachLogging(page, bucket) {
  bucket.rest = bucket.rest ?? []
  bucket.bytes = bucket.bytes ?? 0
  page.on('request', req => {
    const url = req.url()
    if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) {
      bucket.rest.push(url.replace(/\?.*/, ''))
    }
  })
  page.on('response', async res => {
    const req = res.request()
    if (req.isNavigationRequest() || ['xhr', 'fetch'].includes(req.resourceType())) {
      try {
        const body = await res.body()
        bucket.bytes += body.length + 220 // + stima header
      } catch { /* body già consumato o stream annullato */ }
    }
  })
}

async function measureChain(context, bucket) {
  // Re-seed delle chiavi nav: le pagine dei gruppi le riscrivono al mount,
  // quindi ogni passata riparte dai valori che la catena si aspetta.
  const seeder = await context.newPage()
  await seeder.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
  await seeder.evaluate(() => {
    localStorage.setItem('turni-last-page', '/turnisala')
    localStorage.setItem('cambi-last-page', '/vacanze')
  })
  await seeder.close()

  // Pagina di ingresso (fuori misura): /tuoturno non tocca le chiavi dei gruppi.
  const first = NAVS[0]
  const entry = await throttlePage(await context.newPage())
  attachLogging(entry, bucket)
  entry.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)))
  await entry.goto(`${BASE}${first.from}`, { waitUntil: 'load', timeout: 120000 })
  await entry.waitForSelector('nav', { timeout: 30000 })
  await entry.waitForTimeout(3000)

  let page = entry
  for (const nav of NAVS) {
    const navBucket = { rest: [], bytes: 0 }
    attachLogging(page, navBucket)
    const t0 = Date.now()
    await page.locator(nav.click).first().click()
    try {
      await page.waitForSelector(nav.content, { timeout: 60000 })
    } catch (e) {
      console.log(`  TIMEOUT su ${nav.name}: url=${page.url()}`)
      console.log('  h1 visibili:', (await page.locator('h1').allInnerTexts()).join(' | ').slice(0, 150))
      throw e
    }
    const ms = Date.now() - t0
    bucket.pages[nav.name] = { ms, rest: navBucket.rest.length, kb: Math.round(navBucket.bytes / 1024) }
    // aspetta che la rete si quieti prima della prossima misura
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
  await page.close()
}

// Fast 3G: RTT 150 ms, down 1.6 Mbps, up 750 Kbps (profilo mobile reale).
// L'emulazione CDP è PER-PAGE: sessione creata sulla pagina che vive per
// l'intera catena (chiuderla prima annullava il throttling).
async function throttlePage(page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Network.enable')
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  return page
}

const browser = await chromium.launch()
const results = { base: BASE, throttle: 'Fast 3G (150ms RTT, 1.6Mbps/750Kbps)', scenario: {} }

// ── Scenario COLD: storage vuoto, ogni navigazione in una page nuova ────────
{
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 } })
  const bucket = newBucket('cold')
  await measureChain(ctx, bucket)
  results.scenario.cold = bucket
  await ctx.close()
}

// ── Scenario WARM: riscaldamento completo (IDB/query cache piene), poi misura ──
{
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 } })
  const warmUp = newBucket('warm-up (non misurato)')
  await measureChain(ctx, warmUp)
  const bucket = newBucket('warm')
  await measureChain(ctx, bucket)
  results.scenario.warm = bucket
  await ctx.close()
}

await browser.close()
writeFileSync(OUT, JSON.stringify(results, null, 2))

// Riepilogo a terminale
for (const [label, b] of Object.entries(results.scenario)) {
  console.log(`\n── ${label.toUpperCase()} ──`)
  for (const [page, m] of Object.entries(b.pages)) {
    console.log(`${page.padEnd(14)} ${String(m.ms).padStart(6)} ms   ${String(m.rest).padStart(2)} REST   ${String(m.kb).padStart(4)} KB`)
  }
}
console.log('\nOK →', OUT)
