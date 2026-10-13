// Conta le richieste al SERVER della PWA in una sessione tipica.
//
// «Richiesta al server» = documento HTML, payload RSC, prefetch, route handler.
// Sono ESCLUSE le risorse statiche (/_next/static, icone, font) e le chiamate
// dirette a Supabase, che non passano da Vercel.
//
// Serve a una domanda sola: una navigazione nell'app costa al server UNA
// richiesta o SEI? Il prefetch è la differenza: da quando (14/09/2026) i bottoni
// della barra sono <Link prefetch>, aprire una pagina fa partire da sola la
// preparazione delle pagine vicine, e ognuna di quelle è un render sul server.
//
// Le due colonne che contano:
//   • `render`    = la richiesta ha fatto LAVORARE il server (pagina dinamica:
//                   middleware + layout + query a ogni giro);
//   • `prerender` = il server aveva già tutto pronto (pagina statica).
// Un prefetch di pagina statica è quindi gratis; uno di pagina dinamica è lavoro
// che il server fa per una pagina che l'utente non ha chiesto.
//
// Dal 13/10/2026 la misura guarda anche al DIETRO: le query dirette a Supabase
// (byte inclusi), perché le pagine che non renderizzano più sul server prendono i
// dati dal client. Un render in meno vale solo se il conto del resto non esplode.
//
// La sessione non usa password né il vecchio tests/.auth-state.json (scade):
// la crea `tests/employee-session.ts` col link magico admin (service-role in
// .env.local), lo stesso percorso dei test E2E.
//
// Uso: node scripts/count-server-requests.mjs [baseURL] [out.json] [cognome]
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const OUT = process.argv[3] ?? 'count-server-requests.json'
const WHO = process.argv[4] ?? 'Di Monda'

// E2E_BASE_URL è letto all'import del modulo: va impostato PRIMA.
process.env.E2E_BASE_URL = BASE
const { sessionForEmployee, asPlaywrightCookies } = await import('../tests/employee-session.ts')
const { preparaBrowser } = await import('../tests/browser-setup.ts')

const STATIC = /\/_next\/static\/|\/icons\/|favicon|\/_next\/image|\.(png|jpg|svg|webp|woff2?|css)$/
/** Chiamate dirette a Supabase: è il «client» che chiede i suoi dati. */
const SUPABASE = /supabase\.co|supabase\.in|localhost:54321/

function isServerRequest(url) {
  if (!url.startsWith(BASE)) return false // Supabase & co. non passano dal server Next
  if (STATIC.test(url)) return false
  return true
}

const phases = []
let current = null

function startPhase(label) {
  current = { label, requests: [], prefetch: 0, api: 0, serverBytes: 0, supa: [], supaBytes: 0 }
  phases.push(current)
}

/** Byte di una risposta, se il browser ce li dà (le opache no: si contano 0). */
async function bodyBytes(res) {
  try {
    const body = await res.body()
    return body?.length ?? 0
  } catch {
    return 0
  }
}

function attach(page) {
  const perUrl = new Map()
  page.on('request', req => {
    if (!current) return
    const url = req.url()
    if (SUPABASE.test(url)) {
      current.supa.push({ url: url.replace(/^https?:\/\/[^/]+/, ''), method: req.method() })
      return
    }
    if (!isServerRequest(url)) return
    // Prefetch RSC: la richiesta che Next fa in anticipo per una pagina che
    // l'utente non ha ancora chiesto (header Next-Router-Prefetch).
    const isPrefetch = /[?&]_rsc=/.test(url) || req.headers()['next-router-prefetch'] === '1'
    const isApi = new URL(url).pathname.startsWith('/api/')
    if (isPrefetch) current.prefetch++
    if (isApi) current.api++
    const entry = { url: url.replace(BASE, ''), prefetch: isPrefetch, api: isApi, served: '?' }
    current.requests.push(entry)
    perUrl.set(url, entry)
  })
  // Il dato che conta non è QUANTE richieste partono, ma quante di quelle
  // richieste hanno fatto LAVORARE il server. Una rotta statica è prerenderizzata
  // a build time e Next lo dichiara negli header; una dinamica viene renderizzata
  // a ogni richiesta (e paga middleware, layout e query).
  page.on('response', res => {
    const url = res.url()
    if (SUPABASE.test(url)) {
      void bodyBytes(res).then(n => { if (current) current.supaBytes += n })
      return
    }
    const entry = perUrl.get(url)
    if (!entry) return
    // Byte che il server ha SPEDITO per questa richiesta: è il peso del lavoro
    // che una pagina dinamica fa per ogni render (dati serializzati dentro l'RSC).
    void bodyBytes(res).then(n => {
      if (!current) return
      entry.bytes = n
      current.serverBytes += n
    })
    const h = res.headers()
    const cache = h['cache-control'] ?? ''
    const xnext = h['x-nextjs-cache'] ?? h['x-vercel-cache'] ?? ''
    entry.served = entry.api
      ? 'api'
      : /s-maxage|public, max-age=\d{6,}/.test(cache) || xnext === 'HIT'
        ? 'prerender'
        : 'render'
    entry.cache = `${xnext || '-'} | ${cache.slice(0, 60)}`
  })
}

const kb = n => (n / 1024).toFixed(1) + ' KB'
const session = await sessionForEmployee(WHO)
console.log(`Base: ${BASE}\nDipendente: ${session.cognome} ${session.nome}\n`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
await ctx.addCookies(asPlaywrightCookies(session))
// Stesso setup del contesto dei test E2E: popup spenti e bypass del guard PWA
// (headless non è una PWA installata e verrebbe rimandato su /installa).
await preparaBrowser(ctx)
await ctx.addInitScript(() => { try { localStorage.setItem('__dev_bypass__', '1') } catch { /* niente localStorage */ } })
const page = await ctx.newPage()
attach(page)
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)))

// 1. Apertura fredda della dashboard + attesa: qui si vede il prefetch dei link
//    della barra, che partono da soli senza che l'utente chieda nulla.
startPhase('apertura /dashboard (+6s di quiete)')
await page.goto(`${BASE}/dashboard`, { waitUntil: 'load', timeout: 120000 })
await page.waitForSelector('nav', { timeout: 60000 })
await page.waitForTimeout(6000)

// 2-4. Tre navigazioni reali, cliccando i controlli della barra.
// `atteso` è il pezzo di URL che DEVE comparire: se non cambia, la misura
// conterebbe solo i prefetch della pagina di partenza.
const NAVS = [
  ['click «Turni sala»', '[aria-label="Turni sala"]', '/turnisala'],
  ['click «Il tuo turno»', '[aria-label="Il tuo turno"]', '/tuoturno'],
  ['click «Cambi»', '[aria-label="Cambi"]', null],
]
for (const [label, click, atteso] of NAVS) {
  startPhase(label)
  await page.locator(click).first().click()
  if (atteso) {
    await page.waitForURL(url => url.pathname.startsWith(atteso), { timeout: 60000 })
      .catch(() => console.log(`  [URL non cambiato verso ${atteso}] ${label}`))
  }
  // L'intestazione della pagina: se l'app disegna, c'è.
  await page.waitForSelector('h1', { timeout: 30000 })
    .catch(() => console.log(`  [nessun h1] ${label}`))
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  console.log(`  → dopo il click: ${page.url().replace(BASE, '')}`)
}

// 5-6. Apertura DIRETTA (documento nuovo) delle due pagine pesanti: è la
//      navigazione di chi apre l'app su quella pagina o la ricarica. La cache
//      IndexedDB resta (è dello stesso contesto), quindi è il caso «PWA a caldo».
for (const path of ['/turnisala', '/tuoturno']) {
  startPhase(`apertura diretta ${path} (a caldo)`)
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2500)
  /* La pagina ha disegnato dati veri, o è rimasta sullo skeleton? Lo skeleton
     della rotta è un componente `Skeleton` (data-slot), quindi si conta: zero
     scheletri = la pagina ha i suoi dati e li ha messi a schermo. */
  const scheletri = await page.locator('[data-slot="skeleton"]').count().catch(() => -1)
  const testo = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
  console.log(`  → ${path}: ${scheletri} skeleton a schermo, ${testo.length} caratteri disegnati`)
}

await ctx.close()
await browser.close()

let total = 0, totalPrefetch = 0, totalRender = 0, totalApi = 0, totalSupa = 0, totalSupaBytes = 0, totalServerBytes = 0
for (const p of phases) {
  total += p.requests.length
  totalPrefetch += p.prefetch
  totalApi += p.api
  totalSupa += p.supa.length
  totalSupaBytes += p.supaBytes
  totalServerBytes += p.serverBytes
  const renders = p.requests.filter(r => r.served === 'render').length
  totalRender += renders
  console.log(`${p.label}`)
  console.log(`  ${String(p.requests.length).padStart(2)} richieste al server, di cui ${p.prefetch} di prefetch`)
  console.log(`  ${String(renders).padStart(2)} hanno fatto renderizzare il server, ${p.requests.length - renders} servite già pronte`)
  console.log(`  ${kb(p.serverBytes)} spediti dal server`)
  console.log(`  ${String(p.supa.length).padStart(2)} chiamate a Supabase (${kb(p.supaBytes)}): è il client che chiede i suoi dati`)
  for (const r of [...p.requests].sort((a, b) => Number(b.prefetch) - Number(a.prefetch)).slice(0, 10)) {
    console.log(`      ${r.prefetch ? 'prefetch' : '        '} ${r.served.padEnd(9)} ${r.url}`)
  }
  const supaCount = new Map()
  for (const s of p.supa) {
    const k = s.url.split('?')[0].replace(/\/rest\/v1\//, '')
    supaCount.set(k, (supaCount.get(k) ?? 0) + 1)
  }
  for (const [k, n] of [...supaCount].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`      supa ×${String(n).padStart(2)}  ${k}`)
  }
  console.log()
}

console.log(`TOTALE: ${total} richieste al server, ${totalPrefetch} di prefetch, ${totalRender} renderizzate, ${totalApi} route handler`)
console.log(`TOTALE SUPABASE: ${totalSupa} chiamate, ${kb(totalSupaBytes)}`)
console.log(`TOTALE SERVER: ${kb(totalServerBytes)} spediti in ${total} richieste`)
writeFileSync(OUT, JSON.stringify({ base: BASE, who: `${session.cognome} ${session.nome}`, total, totalPrefetch, totalRender, totalApi, totalSupa, totalSupaBytes, totalServerBytes, phases }, null, 2))
console.log(`→ ${OUT}`)
