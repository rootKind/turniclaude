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
    P('SICA', ['P10T'], ['P10T'], [1]),       // richiedente (pendente) → card 10|P
    P('MUCCI', ['P10T'], ['D'], [1]),         // sostituto da D → 10|P (destinazione)
    P('CAIAZZO M.', ['P6S'], ['RI'], [1]),    // sostituto su riposo → 6|P (destinazione)
    P('SENATORE', ['MDCP'], ['D'], [1]),      // sostituto da D → DCP|M (destinazione)
    P('DI MONDA', ['A'], ['NDCP'], [1]),      // richiedente → DCP|N (colonna teorica)
    P('FATIGATI', ['P6S'], ['P6S'], [1]),     // richiedente (reale=teo, pendente) → 6|P
    P('ESPOSITO', ['M5T'], ['P10T'], [1]),    // sostituto cambio turno → SOLO 5|M (v8)
    P('NERI', ['SpCA'], ['P7S'], [1]),        // v3: corso con teorico di sezione → 7|P (teo)
    P('SPURIA', ['P5S'], ['P5S'], [1]),       // richiedente (reale=teo) → 5|P
    P('DI MEO 24', ['MDCP'], ['PDCIF'], []),  // v8: definitivo NON giallo → MAI segnalato
    P('NON_GIALLO', ['A'], ['M3S'], []),      // assenza non evidenziata → fuori sempre
  ]
  // v8 (26/09): SOLO le celle gialle generano la chip — un definitivo non
  // giallo (DI MEO 24) non è mai segnalato; la destinazione unica resta.
  const y8 = yellowForDay(people, 1)
  assert.ok(![...y8.values()].flat().some(e => e.name === 'DI MEO 24'), 'v8: definitivo non giallo MAI segnalato')
  assert.ok(![...y8.values()].flat().some(e => e.name === 'NON_GIALLO'), 'assenza non evidenziata SEMPRE fuori')
  // v7: showCode = sigla del reale DENTRO la chip SOLO per assenze/corsi —
  // v8: la chip sta su UNA sola card (teorica per il richiedente,
  // di DESTINAZIONE per il sostituto — ESPOSITO M5T→P10T: solo 5|M).
  const fmt = e => `${e.name}:${e.role}:${e.target}:${e.showCode}`
  assert.deepEqual(y8.get('10|P')?.map(fmt), ['SICA:richiedente:teo:false', 'MUCCI:sostituto:real:false'], 'card 10 P: richiesta pendente + sostituto da D (destinazione)')
  assert.deepEqual(y8.get('5|M')?.map(fmt), ['ESPOSITO:sostituto:real:false'], 'v8: sostituto SOLO sulla destinazione (5|M)')
  assert.ok(!y8.get('10|P')?.some(e => e.name === 'ESPOSITO'), 'v8: niente chip sulla card di ORIGINE del sostituto')
  assert.deepEqual(y8.get('7|P')?.map(fmt), ['NERI:richiedente:teo:true'], 'corso SpCA con teorico di sezione → card teorica CON sigla (corso)')
  assert.deepEqual(y8.get('DCP|N')?.map(fmt), ['DI MONDA:richiedente:teo:true'], 'richiedente assente nella colonna teorica, sigla A (assenza → in chip)')
  assert.deepEqual(y8.get('DCP|M')?.map(fmt), ['SENATORE:sostituto:real:false'], 'sostituto da D sulla destinazione DCP|M')
  assert.equal(y8.get('6|P')?.length, 2, 'CAIAZZO + FATIGATI sulla 6 P')

  // Giorno diverso: nessuna voce.
  assert.equal(yellowForDay(people, 2).size, 0, 'giorno senza gialli → mappa vuota')

  console.log('PASS — gialli v8: SOLO celle gialle (i definitivi non gialli non si segnalano), chip su UNA sola card (destinazione per i sostituti)')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
