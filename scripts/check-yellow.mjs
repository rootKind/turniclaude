// Contratto delle CELLE GIALLE del PDF (v3, 25/09/2026): per ogni cella
// gialla, classifyYellowCell distingue RICHIEDENTE (congedo accordato: assenza
// A/AG7/F.E./VS, reale = teorico di sezione, o attività SENZA sezione tipo
// SpCA con teorico di sezione) da SOSTITUTO (lavora sul riposo RC/RM/RI,
// arriva dalla Disponibilità «D», cambia turno O sezione). yellowForDay
// aggrega sotto la chiave «sezione|turno» delle card: SEZIONE TEORICA sempre
// (il PDF colloca lì la persona), + sezione REALE per il sostituto. I gialli
// spurî restano fuori (nessun falso positivo).
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
  // NB: P4S/P7S è stesso TURNO con cambio SEZIONE → sostituto (v3): il giallo
  // segue la persona sulla card reale oltre alla teorica.
  assert.equal(classifyYellowCell('P4S', 'P7S')?.role, 'sostituto', 'cambio sezione a stesso turno → sostituto')
  assert.equal(classifyYellowCell('M5T', 'P10T')?.role, 'sostituto', 'cambio turno M→P → sostituto')
  // v3: attività SENZA sezione (SpCA/SpN/Dis*/TUTOR…) con teorico di sezione →
  // richiedente: pallino sulla card teorica, fuori dai sottogruppi.
  assert.equal(classifyYellowCell('SpCA', 'P7S')?.role, 'richiedente', 'corso SpCA con teorico di sezione → richiedente')
  assert.equal(classifyYellowCell('ISpN', 'M3S')?.role, 'richiedente', 'istruttore ISpN con teorico di sezione → richiedente')
  assert.equal(classifyYellowCell('DisNa', 'N5S')?.role, 'richiedente', 'trasferta con teorico di sezione → richiedente')
  assert.equal(classifyYellowCell('SpCA', 'D'), null, 'corso con teorico Disponibilità: NON classificato (nessuna card)')

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
    P('ESPOSITO', ['M5T'], ['P10T'], [1]),    // sostituto cambio turno → 5|M + teo 10|P
    P('NERI', ['SpCA'], ['P7S'], [1]),        // v3: corso con teorico di sezione → 7|P (richiedente)
    P('SPURIA', ['P5S'], ['P5S'], [1]),       // richiedente (reale=teo) → 5|P
    P('NON_GIALLO', ['A'], ['M3S'], []),      // senza giallo → fuori sempre
  ]
  const y = yellowForDay(people, 1)
  assert.deepEqual([...y.keys()].sort(), ['10|P', '5|M', '5|P', '6|P', '7|P', 'DCP|M', 'DCP|N'], 'chiavi sezione|turno')
  // v4 (25/09/2026): target 'teo' = la persona resta IN ELENCO sulla sua card
  // teorica (pallino + sigla reale solo se diversa); 'real' = SOSTITUTO,
  // mai in elenco, riga in FONDO col codice reale.
  const fmt = e => `${e.name}:${e.role}:${e.target}:${e.showCode}`
  assert.deepEqual(y.get('10|P')?.map(fmt), ['SICA:richiedente:teo:false', 'MUCCI:sostituto:real:true', 'ESPOSITO:sostituto:teo:true'], 'card 10 P: richiesta pendente (no sigla), sostituto in fondo, teorico di ESPOSITO con sigla')
  // v2 (24/09/2026): il sostituto che cambia turno viene sparso ANCHE sulla
  // sua sezione teorica (da dove viene) — ESPOSITO su 5|M (reale, in fondo)
  // e 10|P (teo, in elenco).
  assert.deepEqual(y.get('5|M')?.map(fmt), ['ESPOSITO:sostituto:real:true'], 'sostituto nella card dove lavora (in fondo)')
  assert.deepEqual(y.get('7|P')?.map(fmt), ['NERI:richiedente:teo:true'], 'v4: corso SpCA con teorico di sezione → in elenco sulla card teorica con sigla reale')
  assert.deepEqual(y.get('DCP|N')?.map(fmt), ['DI MONDA:richiedente:teo:true'], 'richiedente assente nella colonna teorica, sigla A')
  assert.deepEqual(y.get('DCP|M')?.map(fmt), ['SENATORE:sostituto:real:true'], 'sostituto da D sulla card reale DCP|M')
  assert.equal(y.get('6|P')?.length, 2, 'CAIAZZO + FATIGATI sulla 6 P')
  assert.ok(![...y.values()].flat().some(e => e.name === 'NON_GIALLO'), 'senza giallo mai incluso')

  // Giorno diverso: nessun giallo.
  assert.equal(yellowForDay(people, 2).size, 0, 'giorno senza gialli → mappa vuota')

  console.log('PASS — gialli v4: sostituito in elenco col pallino, sostituto in fondo, sigla reale, corsi senza sezione sulla card teorica')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
