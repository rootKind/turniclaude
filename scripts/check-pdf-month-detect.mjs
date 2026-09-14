// Contratto del rilevamento mese/anno dai PDF (upload multiplo, 19/09/2026).
// Verifica: forme «mese anno»/«anno mese», forme numeriche ISO/UE, punteggi
// cumulati fra pagine, ambiguità → null, mese senza anno → anno corrente con
// confidenza ridotta, testo senza segnali → null.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'pdf-month-'))
try {
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText

  const tpl = transpile(readFileSync('lib/pdf-month-detect.ts', 'utf8'))
  writeFileSync(join(dir, 'pdf-month-detect.js'), tpl)
  const { detectMonthFromText, candidatesFromLine, MONTH_NAMES_IT } = await import(pathToFileURL(join(dir, 'pdf-month-detect.js')).href)

  const NOW = new Date(2026, 8, 19) // 19 settembre 2026, per test deterministici

  // ── forme con nome del mese + anno ──────────────────────────────────────────
  assert.equal(detectMonthFromText('Turni Settembre 2026\nRESPONSABILE', NOW).month, '2026-09', '«Settembre 2026»')
  assert.equal(detectMonthFromText('SETTEMBRE 2026', NOW).month, '2026-09', 'maiuscolo')
  assert.equal(detectMonthFromText('Febbraio 2027 - Turni', NOW).month, '2027-02', '«Febbraio 2027»')
  assert.equal(detectMonthFromText('2026 settembre\nlegenda', NOW).month, '2026-09', '«2026 settembre»')

  // ── forme numeriche ────────────────────────────────────────────────────────
  assert.equal(detectMonthFromText('Periodo 2026-09', NOW).month, '2026-09', 'ISO 2026-09')
  assert.equal(detectMonthFromText('09/2026 turni sala', NOW).month, '2026-09', 'UE 09/2026')
  assert.equal(detectMonthFromText('09-2026', NOW).month, '2026-09', '09-2026')

  // ── cumulo fra pagine (header su ogni pagina) ──────────────────────────────
  const multi = Array(3).fill('Turni Ottobre 2026').join('\n') + '\nRossi 4 5 6 M M M'
  assert.equal(detectMonthFromText(multi, NOW).month, '2026-10', 'header ripetuto su più pagine')
  const conf = detectMonthFromText(multi, NOW).confidence
  assert.ok(conf >= 0.9, `confidenza alta con header ripetuto (${conf})`)

  // ── mese senza anno: anno corrente, confidenza ridotta ─────────────────────
  const noYear = detectMonthFromText('Settembre', NOW)
  assert.equal(noYear.month, '2026-09', 'mese senza anno → anno corrente')
  assert.ok(noYear.confidence < 0.6, `confidenza ridotta senza anno (${noYear.confidence})`)

  // ── ambiguità: due mesi con lo stesso peso → null ──────────────────────────
  assert.equal(detectMonthFromText('Marzo 2026\nOttobre 2026', NOW).month, null, 'due mesi parimerito → ambiguo')

  // ── nessun segnale ─────────────────────────────────────────────────────────
  assert.equal(detectMonthFromText('Rossi Mario\nM M M RC', NOW).month, null, 'testo senza mese → null')
  assert.equal(detectMonthFromText('', NOW).month, null, 'testo vuoto → null')

  // ── i nomi delle persone non devono generare falsi positivi ────────────────
  // «D ANGELO» contiene «d» ma le voci del registro hanno radice di 4 lettere.
  assert.equal(detectMonthFromText('D ANGELO 1 2 3\nMARZANO 4 5 6', NOW).month, null, 'cognomi ≠ mesi')
  assert.equal(MONTH_NAMES_IT.length, 12, '12 mesi nel registro')

  // ── candidati per riga ─────────────────────────────────────────────────────
  assert.ok(candidatesFromLine('Turni Giugno 2026').some(c => c.month === 6 && c.year === 2026), 'candidato giugno 2026')

  console.log('OK — rilevamento mese/anno: forme IT/ISO/UE, cumulo pagine, ambiguità e falsi positivi')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
