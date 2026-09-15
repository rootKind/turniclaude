// Contratto delle CELLE GIALLE del PDF (richiesta 24/09/2026): per ogni cella
// gialla, classifyYellowCell distingue RICHIEDENTE (congedo accordato: assenza
// A/AG7/F.E./VS o reale = teorico di sezione) da SOSTITUTO (lavora sul riposo
// RC/RM/RI, arriva dalla Disponibilità «D», o cambia turno). yellowForDay
// aggrega sotto la chiave «sezione|turno» della card (richiedente = colonna
// teorica, sostituto = reale). I gialli NON compatibili con un congedo restano
// fuori (nessun falso positivo su celle gialle spurie).
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'yellow-'))
try {
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText

  const stub = 'module.exports = {}\n'
  const put = (file, out) => writeFileSync(join(dir, file), out)

  // shift-tokens: solo tipi dallo stub.
  put('types-stub.js', stub)
  put('shift-tokens.js', transpile(readFileSync('lib/shift-tokens.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js'))
  // shift-teams-matching: solo tipi.
  put('shift-teams-matching.js', transpile(readFileSync('lib/shift-teams-matching.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js'))
  // utils → shift-teams-matching (clsx/tailwind-merge stubbati: servono solo a cn()).
  put('clsx-stub.js', 'module.exports = { clsx: (...a) => a.filter(Boolean).join(" ") }\n')
  put('tw-stub.js', 'module.exports = { twMerge: (...a) => a.join(" ") }\n')
  put('utils.js', transpile(readFileSync('lib/utils.ts', 'utf8'))
    .replaceAll('require("clsx")', 'require("./clsx-stub.js")')
    .replaceAll('require("tailwind-merge")', 'require("./tw-stub.js")')
    .replaceAll('@/types/database', './types-stub.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js'))
  // turni-teorici → shift-tokens + altri-gruppi (per person-shift).
  put('altri-gruppi.js', transpile(readFileSync('lib/altri-gruppi.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js'))
  put('turni-teorici.js', transpile(readFileSync('lib/turni-teorici.ts', 'utf8'))
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/lib/altri-gruppi', './altri-gruppi.js')
    .replaceAll('@/types/database', './types-stub.js'))
  // person-shift → utils, shift-teams-matching, turni-teorici, shift-tokens.
  put('person-shift.js', transpile(readFileSync('lib/person-shift.ts', 'utf8'))
    .replaceAll('@/lib/utils', './utils.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js')
    .replaceAll('@/lib/turni-teorici', './turni-teorici.js')
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/types/database', './types-stub.js'))
  // sala-month → tutti i sopra.
  put('sala-month.js', transpile(readFileSync('lib/sala-month.ts', 'utf8'))
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/lib/utils', './utils.js')
    .replaceAll('@/lib/person-shift', './person-shift.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js')
    .replaceAll('@/types/database', './types-stub.js'))

  const mod = await import(pathToFileURL(join(dir, 'sala-month.js')).href)
  const { classifyYellowCell, yellowForDay, isLeaveToken } = mod

  // ── isLeaveToken ───────────────────────────────────────────────────────────
  for (const t of ['A', 'VS', 'AG', 'AG7', 'F', 'F.E.', 'F.E', 'FE']) assert.ok(isLeaveToken(t), `${t} è congedo`)
  for (const t of ['M5S', 'RC', 'D', '', 'SpN']) assert.ok(!isLeaveToken(t), `${t} NON è congedo`)

  // ── classifyYellowCell: RICHIEDENTE ────────────────────────────────────────
  assert.equal(classifyYellowCell('A', 'NDCP')?.role, 'richiedente', 'assenza → richiedente')
  assert.equal(classifyYellowCell('AG7', 'PDCP')?.role, 'richiedente', 'AG7 → richiedente')
  assert.equal(classifyYellowCell('P10T', 'P10T')?.role, 'richiedente', 'reale = teorico di sezione → richiedente')
  assert.equal(classifyYellowCell('M5S', 'M5S')?.role, 'richiedente', 'reale = teorico (M) → richiedente')

  // ── classifyYellowCell: SOSTITUTO ──────────────────────────────────────────
  assert.equal(classifyYellowCell('P10T', 'D')?.role, 'sostituto', 'da Disponibilità → sostituto')
  assert.equal(classifyYellowCell('MDCP', 'D')?.role, 'sostituto', 'sezione alfabetica da D → sostituto')
  assert.equal(classifyYellowCell('P6S', 'RI')?.role, 'sostituto', 'lavora sul proprio riposo → sostituto')
  // NB: P4S/P7S è stesso TURNO (cambia solo la sezione) → NON è cambio turno.
  // La cella gialla con reale lavorativo ≠ teorico, teorico NON «D»/riposo è
  // ambigua: il classificatore NON la marca (niente falsi positivi).
  assert.equal(classifyYellowCell('P4S', 'P7S'), null, 'stesso turno, sezione diversa: NON classificato')
  assert.equal(classifyYellowCell('M5T', 'P10T')?.role, 'sostituto', 'cambio turno M→P → sostituto')

  // Casi FUORI (nessun falso positivo).
  assert.equal(classifyYellowCell('RC', 'RC'), null, 'riposo su riposo: non è né richiesta né sostituzione')
  assert.equal(classifyYellowCell('P5S', 'P5S') === undefined, false, 'sanity: chiamata valida')
  assert.equal(classifyYellowCell('', ''), null, 'cella vuota')

  // ── yellowForDay: aggregazione per card ───────────────────────────────────
  const P = (name, days, teorico, yellow) => ({ name, days, teorico, yellow })
  const people = [
    P('SICA', ['P10T'], ['P10T'], [1]),       // richiedente → card 10|P
    P('MUCCI', ['P10T'], ['D'], [1]),         // sostituto → card 10|P (reale)
    P('CAIAZZO M.', ['P6S'], ['RI'], [1]),    // sostituto su riposo → 6|P
    P('SENATORE', ['MDCP'], ['D'], [1]),      // sostituto → DCP|M (sezione DCP, mattina)
    P('DI MONDA', ['A'], ['NDCP'], [1]),      // richiedente → DCP|N (colonna teorica, notte)
    P('FATIGATI', ['P6S'], ['P6S'], [1]),     // richiedente → 6|P
    P('ESPOSITO', ['M5T'], ['P10T'], [1]),    // sostituto cambio turno → 5|M
    P('SPURIA', ['P5S'], ['P5S'], [1]),       // richiedente (reale=teo) → 5|P
    P('NON_GIALLO', ['A'], ['M3S'], []),      // senza giallo → fuori sempre
  ]
  const y = yellowForDay(people, 1)
  assert.deepEqual([...y.keys()].sort(), ['10|P', '5|M', '5|P', '6|P', 'DCP|M', 'DCP|N'], 'chiavi sezione|turno')
  assert.deepEqual(y.get('10|P')?.map(e => `${e.name}:${e.role}`), ['SICA:richiedente', 'MUCCI:sostituto'], 'card 10 P = coppia richiesta+sostituto')
  assert.deepEqual(y.get('DCP|N')?.map(e => e.name), ['DI MONDA'], 'richiedente nella colonna teorica (notte)')
  assert.equal(y.get('6|P')?.length, 2, 'CAIAZZO + FATIGATI sulla 6 P')
  assert.ok(![...y.values()].flat().some(e => e.name === 'NON_GIALLO'), 'senza giallo mai incluso')

  // Giorno diverso: nessun giallo.
  assert.equal(yellowForDay(people, 2).size, 0, 'giorno senza gialli → mappa vuota')

  console.log('PASS — gialli: richiedente/sostituto, chiavi per card, falsi positivi esclusi')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
