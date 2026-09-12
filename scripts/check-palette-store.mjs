// Contratto di cardPaletteStore: getSnapshot deve essere stabile tra i render
// (useSyncExternalStore confronta con Object.is; un oggetto nuovo a ogni chiamata
// manda React in loop e manda in errore la pagina).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Stub di localStorage PRIMA dell'import del modulo
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

// person-cycle.ts è TS: node 26 strip-a i tipi, ma gli import @/ non risolvono.
// Copio il modulo in una tmp dir e riscrivo solo la riga d'import problematica,
// oppure — più semplice — estraggo il sorgente e lo valuto senza gli import.
const src = fs.readFileSync('lib/person-cycle.ts', 'utf8')
const start = src.indexOf('// ─── colori delle card')
if (start < 0) { console.error('sezione palette non trovata'); process.exit(1) }
const paletteSrc = src.slice(start)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palette-'))
const modFile = path.join(dir, 'palette.ts')
fs.writeFileSync(modFile, paletteSrc)

const mod = await import(pathToFileURL(modFile).href)

// 1. Prima lettura: due chiamate → STESSO riferimento
const a = mod.cardPaletteStore.get()
const b = mod.cardPaletteStore.get()
if (a !== b) { console.error('FAIL: getSnapshot non stabile (oggetti diversi a ogni chiamata)'); process.exit(1) }
console.log('ok: getSnapshot stabile (stesso riferimento)')

// 2. Notifica + cambio riferimento al set
let notified = 0
const unsub = mod.cardPaletteStore.subscribe(() => notified++)
mod.cardPaletteStore.set('mattina', { bg: '#112233', text: '#fedcba' })
const c = mod.cardPaletteStore.get()
if (c === a) { console.error('FAIL: il set non ha cambiato il riferimento'); process.exit(1) }
if (notified !== 1) { console.error('FAIL: subscriber non notificato'); process.exit(1) }
if (c.mattina?.bg !== '#112233') { console.error('FAIL: valore non letto al get successivo'); process.exit(1) }
console.log('ok: set aggiorna riferimento, notifica e persiste su localStorage')

// 3. Nuova getSnapshot dopo il set: stabile
const d = mod.cardPaletteStore.get()
if (d !== c) { console.error('FAIL: getSnapshot instabile dopo il set'); process.exit(1) }
console.log('ok: getSnapshot stabile dopo il set')

// 4. Reset: svuota e notifica
mod.cardPaletteStore.reset()
if (mod.cardPaletteStore.get().mattina !== undefined) { console.error('FAIL: reset non ha svuotato'); process.exit(1) }
if (notified !== 2) { console.error('FAIL: reset non ha notificato'); process.exit(1) }
console.log('ok: reset svuota e notifica')

// 5. Persistenza reale: ricarico il "modulo" con la cache azzerata (nuovo tmp)
store.set('tuoturno-colori', JSON.stringify({ pomeriggio: { bg: '#3366aa', text: '#ffffff' } }))
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'palette-'))
fs.writeFileSync(path.join(dir2, 'palette2.ts'), paletteSrc)
const mod2 = await import(pathToFileURL(path.join(dir2, 'palette2.ts')).href)
const p2 = mod2.cardPaletteStore.get()
if (p2.pomeriggio?.bg !== '#3366aa') { console.error('FAIL: palette da localStorage non letta'); process.exit(1) }
console.log('ok: palette letta da localStorage')

// 6. Validazione: colori malformati scartati
store.set('tuoturno-colori', JSON.stringify({ notte: { bg: 'red', text: '#fff' } }))
const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'palette-'))
fs.writeFileSync(path.join(dir3, 'palette3.ts'), paletteSrc)
const mod3 = await import(pathToFileURL(path.join(dir3, 'palette3.ts')).href)
if (mod3.cardPaletteStore.get().notte !== undefined) { console.error('FAIL: colore invalido accettato'); process.exit(1) }
console.log('ok: colori malformati scartati')

unsub()
execSync(`rm -rf "${dir}" "${dir2}" "${dir3}"`)
console.log('\nTUTTI I CHECK PASSATI')
