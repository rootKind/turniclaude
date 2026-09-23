#!/usr/bin/env node
// scripts/genera-screenshot-manifest.mjs
//
// M11 — LE SCHERMATE DEL MANIFEST (23/09/2026).
//
// Il manifest dichiara due `screenshots`: sono il riquadro che il foglio di
// installazione di Chrome mostra al posto di una riga di testo («installa Turni»)
// — su Android è la differenza fra un'installazione che si capisce e una che si
// accetta alla cieca. Non sono disegni: sono fotografie dell'app vera, e questo
// script è l'unico modo onesto di rifarle.
//
// Le scatta a due misure, che sono quelle che il manifest deve dichiarare
// (`sizes` deve combaciare col PNG, altrimenti il browser lo scarta):
//
//   · `board-telefono.png`  — 393×852 a densità 3 → 1179×2556, `form_factor: narrow`
//   · `dashboard-largo.png` — 1440×900 a densità 1 → 1440×900, `form_factor: wide`
//
// PERCHÉ NON 1080 DI LARGHEZZA. La larghezza della finestra è ciò che decide il
// layout dell'app (le media query sono in CSS px): una foto da 1080px di lato
// mostrerebbe il layout da DESKTOP dentro una cornice da telefono — cioè
// esattamente la bugia che il foglio di installazione non deve raccontare. La
// densità alta serve a rendere nitida la stessa larghezza, non a inventarne una.
//
// Uso (col dev server acceso: `npm run dev`, o contro la deploy su `E2E_BASE_URL`):
//
//   node scripts/genera-screenshot-manifest.mjs
//
// Rilancia quando cambia la pelle (una milestone di design) o quando cambia la
// board: sono la vetrina dell'app, e invecchiano.
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const AUTH = 'tests/.auth-state.json'
const OUT = 'public/screenshots'

// Backdoor di sviluppo di `PwaGuard`: senza, la pagina rimbalza su /installa
// (che è la cosa GIUSTA nel browser, ed è il motivo per cui le foto si fanno
// con il bypass: quello che si fotografa è l'app dentro la sua pelle).
const BYPASS = 'rootkind-dev-2026'

const SCHERMATE = [
  {
    file: 'board-telefono.png',
    percorso: '/turnisala',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    formFactor: 'narrow',
    label: 'I turni di sala del giorno',
  },
  {
    file: 'dashboard-largo.png',
    percorso: '/dashboard',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    formFactor: 'wide',
    label: 'La dashboard su schermo largo',
  },
]

/** Larghezza e altezza lette dall'header PNG (IHDR): due interi big-endian al byte 16. */
function dimensioniPng(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

if (!existsSync(AUTH)) {
  console.error(`Manca ${AUTH}: le foto si fanno da una sessione autenticata (tests/auth.setup.ts).`)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
try {
  for (const schermata of SCHERMATE) {
    const context = await browser.newContext({
      viewport: schermata.viewport,
      deviceScaleFactor: schermata.deviceScaleFactor,
      storageState: AUTH,
      locale: 'it-IT',
      // Tema scuro: è quello in cui la PWA si presenta (manifest `#0a0a0a`) e
      // quello delle icone. Uno sfondo chiaro renderebbe il riquadro incoerente
      // con lo splash che l'utente vede subito dopo.
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const url = `${BASE}${schermata.percorso}?dev=${BYPASS}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    // L'app monta dopo l'idratazione: si aspetta che i dati siano arrivati
    // (le board/le dashboard disegnano uno scheletro prima) invece di sperare.
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1200)
    const percorso = `${OUT}/${schermata.file}`
    const png = await page.screenshot({ path: percorso })
    const { width, height } = dimensioniPng(png)
    console.log(`${percorso}  ${width}x${height}  (${schermata.formFactor}) — ${schermata.label}`)
    await context.close()
  }
} finally {
  await browser.close()
}
