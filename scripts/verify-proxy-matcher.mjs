// Verifica del matcher di proxy.ts (middleware).
//
// Perché esiste: il 13/09/2026 il manifest è passato da /manifest.json (file
// statico) a /manifest.webmanifest (route dinamica) e l'esclusione nel matcher
// è rimasta scritta sul vecchio nome → il manifest ha ripreso a passare dal
// middleware (e dalla sessione Supabase) a ogni fetch, senza che nulla lo
// segnalasse. Questo script rende quel caso un test ripetibile.
//
// Il verdetto NON viene da una copia della regex scritta a mano: il matcher
// viene compilato da getMiddlewareMatchers di Next, lo stesso codice che Next
// usa a build time, a partire dalla stringa letta da proxy.ts.
//
// Uso: node scripts/verify-proxy-matcher.mjs

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getMiddlewareMatchers } = require('next/dist/build/analysis/get-page-static-info')

const src = readFileSync('proxy.ts', 'utf8')

const block = src.match(/matcher:\s*\[([\s\S]*?)\n\s*\]/)
if (!block) { console.error('matcher non trovato in proxy.ts'); process.exit(1) }
// Via i commenti prima di estrarre: contengono apostrofi italiani.
const clean = block[1].split('\n').filter(line => !line.trim().startsWith('//')).join('\n')
const sources = [...clean.matchAll(/'([^']*)'/g)].map(m => m[1])
if (sources.length === 0) { console.error('nessuna stringa di matcher trovata'); process.exit(1) }

const compiled = getMiddlewareMatchers(sources, {})
const regexes = compiled.map(c => new RegExp(c.regexp))
const runs = path => regexes.some(re => re.test(path))

// [percorso, il middleware deve girare?]
const CASES = [
  ['/manifest.webmanifest', false, 'manifest PWA (dinamico, pubblico)'],
  ['/manifest.json', false, 'vecchio nome (non più servito)'],
  ['/sw.js', false, 'service worker'],
  ['/icons/icon-192.png', false, 'icone'],
  ['/api/events', false, 'route API'],
  ['/login', false, 'accesso'],
  ['/', true, 'landing (match ma esce subito, essendo pubblica)'],
  ['/installa', false, 'pagina pubblica di installazione'],
  ['/dashboard', true, 'protetta'],
  ['/turnisala', true, 'protetta'],
  ['/turnisala/2026-09', true, 'protetta (sotto-pagina)'],
  ['/tuoturno', true, 'protetta'],
  ['/turniferie', true, 'protetta'],
  ['/vacanze', true, 'protetta'],
  ['/impostazioni', true, 'protetta'],
  ['/notifiche', true, 'protetta'],
  ['/admin', true, 'protetta'],
]

let failed = 0
for (const [path, expected, label] of CASES) {
  const actual = runs(path)
  const ok = actual === expected
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${(actual ? 'gira ' : 'salta')}  ${path.padEnd(20)} ${label}`)
}

console.log(`\n${CASES.length - failed}/${CASES.length} casi corretti`)
process.exit(failed === 0 ? 0 : 1)
