// VERIFICA E2E (24/09/2026): esegue il VERO parsePdfSchedule (lib/pdf-parser.ts
// transpilato al volo) sul PDF di ottobre 2026 e asserisce le gialle:
//   - CIPOLLETTA = [30]  (prima del fix ereditava anche [2,7,11,27,28,29] di MININO)
//   - MININO     = [2,7,11,27,28,29]
// Solo lettura del PDF; nessuna scrittura DB.
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'verify-pdf-'))
try {
  // pdf-parser richiede 'pdf-parse': nel temp dir non c'è node_modules, quindi
  // si crea una junction (funziona su Windows senza privilegi) verso la copia
  // del progetto principale.
  const mainRequire = createRequire('C:/Users/david/Desktop/tools/pwa-v2/package.json')
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  symlinkSync(dirname(mainRequire.resolve('pdf-parse')), join(dir, 'node_modules', 'pdf-parse'), 'junction')
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText

  const stub = 'module.exports = {}\n'
  const put = (file, out) => writeFileSync(join(dir, file), out)

  put('types-stub.js', stub)
  put('shift-tokens.js', transpile(readFileSync('lib/shift-tokens.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js'))
  put('shift-teams-matching.js', transpile(readFileSync('lib/shift-teams-matching.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js'))
  put('clsx-stub.js', 'module.exports = { clsx: (...a) => a.filter(Boolean).join(" ") }\n')
  put('tw-stub.js', 'module.exports = { twMerge: (...a) => a.join(" ") }\n')
  put('utils.js', transpile(readFileSync('lib/utils.ts', 'utf8'))
    .replaceAll('require("clsx")', 'require("./clsx-stub.js")')
    .replaceAll('require("tailwind-merge")', 'require("./tw-stub.js")')
    .replaceAll('@/types/database', './types-stub.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js'))
  put('altri-gruppi.js', transpile(readFileSync('lib/altri-gruppi.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js'))
  put('turni-teorici.js', transpile(readFileSync('lib/turni-teorici.ts', 'utf8'))
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/lib/altri-gruppi', './altri-gruppi.js')
    .replaceAll('@/types/database', './types-stub.js'))
  put('person-shift.js', transpile(readFileSync('lib/person-shift.ts', 'utf8'))
    .replaceAll('@/lib/utils', './utils.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js')
    .replaceAll('@/lib/turni-teorici', './turni-teorici.js')
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/types/database', './types-stub.js'))
  put('sala-month.js', transpile(readFileSync('lib/sala-month.ts', 'utf8'))
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/lib/utils', './utils.js')
    .replaceAll('@/lib/person-shift', './person-shift.js')
    .replaceAll('@/lib/altri-gruppi', './altri-gruppi.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js')
    .replaceAll('@/types/database', './types-stub.js'))
  put('pdf-parser.js', transpile(readFileSync('lib/pdf-parser.ts', 'utf8'))
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/lib/sala-month', './sala-month.js')
    .replaceAll('@/types/database', './types-stub.js'))

  const { parsePdfSchedule } = await import(pathToFileURL(join(dir, 'pdf-parser.js')).href)
  const { decodeSalaMonth } = await import(pathToFileURL(join(dir, 'sala-month.js')).href)

  const buffer = readFileSync('C:/Users/david/Desktop/tools/pwa-v2/Turni esempio/Ottobre_23-09-2026.pdf')
  const schedule = await parsePdfSchedule(buffer, '2026-10')
  const people = decodeSalaMonth(schedule.data)

  const find = nome => people.find(p => p.name.toUpperCase().includes(nome))
  const cipolletta = find('CIPOLLET')
  const minino = find('MININO')

  assert.ok(cipolletta, 'Cipolletta trovata nel PDF')
  assert.ok(minino, 'Minino trovato nel PDF')
  const cy = [...cipolletta.yellow].sort((a, b) => a - b)
  const my = [...minino.yellow].sort((a, b) => a - b)
  console.log(`CIPOLLETTA gialli: [${cy.join(',')}]`)
  console.log(`MININO     gialli: [${my.join(',')}]`)

  assert.deepEqual(cy, [30], 'Cipolletta ha SOLO il giorno 30 (niente più eredità da Minino)')
  assert.deepEqual(my, [2, 7, 11, 27, 28, 29], 'Minino conserva i suoi 6 gialli')

  // I codici reali dei giorni gialli restano quelli del PDF (colonne corrette).
  const cod = (p, g) => p.days[g - 1] ?? ''
  assert.equal(cod(minino, 2), 'M4T', 'Minino g2: codice M4T (come nel PDF)')
  assert.equal(cod(cipolletta, 30), 'P10S', 'Cipolletta g30: codice P10S (mod)')

  console.log('PASS — parse v9: le gialle di ottobre tornano all\'immagine (Cipolletta pulita, Minino intatto)')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
