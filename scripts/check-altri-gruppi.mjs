// Test contrattuale del raggruppamento «Altri presenti» (richiesta 22/09/2026).
// Usa il MODULO REALE lib/shift-tokens.ts: verifica che ogni codice deciso con
// l'utente finisca nel gruppo giusto (o resti invisibile / vada in colonna), e
// che il parser allargato mandi in colonna i turni a maiuscole miste.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'altri-gruppi-'))
try {
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText

  writeFileSync(join(dir, 'types-stub.js'), 'module.exports = {}\n')
  writeFileSync(join(dir, 'types-database.js'), 'module.exports = {}\n')

  const tokens = transpile(readFileSync('lib/shift-tokens.ts', 'utf8'))
    .replaceAll('@/types/database', './types-database.js')
  writeFileSync(join(dir, 'shift-tokens.js'), tokens)

  // altri-gruppi.ts è type-only sugli import: stub dei tipi inline
  const gruppi = transpile(readFileSync('lib/altri-gruppi.ts', 'utf8'))
    .replaceAll('@/types/database', './types-database.js')
  writeFileSync(join(dir, 'altri-gruppi.js'), gruppi)

  const { applyTokenToDay, isShiftCode } = await import(pathToFileURL(join(dir, 'shift-tokens.js')).href)
  const { groupAltriPresenti, classificaAltriToken } = await import(pathToFileURL(join(dir, 'altri-gruppi.js')).href)

  function dayFor(token) {
    const day = { sections: {}, altriPresenti: [], altriPresentiTokens: [] }
    const produced = applyTokenToDay(day, 'ROSSI', token)
    return { produced, day }
  }
  function gruppoOf(token) {
    const { produced, day } = dayFor(token)
    if (!produced || day.altriPresenti.length !== 1) return null
    return groupAltriPresenti(day)[0]?.key ?? null
  }

  // ── CORSI SP ────────────────────────────────────────────────────────────────
  for (const t of ['SpN', 'SPCA', 'SPN', 'SPSA', 'SpSa', 'Sp@', 'SPW'])
    assert.equal(gruppoOf(t), 'corsi', `${t} → corsi`)

  // ── ISTRUTTORI SP ───────────────────────────────────────────────────────────
  for (const t of ['ISpN', 'ISpC', 'ISpW'])
    assert.equal(gruppoOf(t), 'istruttori', `${t} → istruttori`)

  // ── TRASFERTE (incluse NDis* notti trasferta, utente 22/09) ────────────────
  for (const t of ['Trasf', 'DisNa', 'DisCas', 'DisSal', 'NDisNa', 'NDisSal', 'NDisCe', 'M', 'N', 'P'])
    assert.equal(gruppoOf(t), 'trasferte', `${t} → trasferte`)

  // ── TUTOR (solo la famiglia TUTOR, G approvata dall'utente) ────────────────
  for (const t of ['MTUTOR', 'PTUTOR', 'GTUTOR', 'tutor'])
    assert.equal(gruppoOf(t), 'tutor', `${t} → tutor`)

  // ── INVISIBILI (decisione utente 22/09: nessuna famiglia G, Na, TIR,
  //    12.14, sabati, e-learning con turno) ──────────────────────────────────
  for (const t of ['G', 'GIAP', 'GRicTir', 'GRICTIR', 'Na', 'TIR', '12.14', 'MSb', 'PSb', 'GSb', 'MSp@', 'GSp@', 'PSp@'])
    assert.equal(gruppoOf(t), null, `${t} resta invisibile`)

  // ── ASSENZE restano fuori ───────────────────────────────────────────────────
  for (const t of ['A', 'AG', 'AG7', 'F', 'F.E.', 'RM', 'RC', 'RI', 'VS', 'D'])
    assert.equal(gruppoOf(t), null, `${t} è assenza, fuori`)

  // ── TURNI CON SEZIONE: in colonna, NON in altri presenti ───────────────────
  for (const t of ['M7S', 'MDCIF', 'MIAP', 'MRIC', 'MDCIFTir', 'Miap', 'piaptir', 'Piaptir']) {
    const { produced, day } = dayFor(t)
    assert.equal(produced, true, `${t} è presenza`)
    assert.equal(day.altriPresenti.length, 0, `${t} NON in altri presenti`)
    assert.ok(Object.keys(day.sections).length > 0, `${t} finisce in colonna`)
  }
  // i turni misti finiscono nella SEZIONE GIUSTA (normalizzata)
  const { day: dTir } = dayFor('MDCIFTir')
  assert.ok(dTir.sections.DCIF?.M, 'MDCIFTir → sezione DCIF mattina')
  assert.ok(dTir.sections.DCIF.M.tirocinanti.includes('ROSSI'), '…come TIROCINANTE')
  const { day: dIap } = dayFor('Miap')
  assert.ok(dIap.sections.IAP?.M, 'Miap → sezione IAP mattina')

  // il parser allargato NON cattura i casi da tenere invisibili
  for (const t of ['NDisNa', 'MSb', 'MSp@', 'Na'])
    assert.equal(isShiftCode(t), false, `${t} non è uno shift code`)

  // ── GRUPPI: ordine, etichette, dedup, fallback v1 ──────────────────────────
  const day = { sections: {}, altriPresenti: [], altriPresentiTokens: [
    { name: 'ROSSI', token: 'DisNa' }, { name: 'NERI', token: 'SpN' }, { name: 'NERI', token: 'ISpN' },
    { name: 'ROSSI', token: 'MTUTOR' }, { name: 'SPAGNULO', token: 'M' }, { name: 'ESPOSITO', token: 'NDisNa' },
  ] }
  const g = groupAltriPresenti(day)
  assert.deepEqual(g.map(x => x.key), ['trasferte', 'corsi', 'istruttori', 'tutor'], 'ordine gruppi')
  assert.equal(g[0].label, 'Trasferte')
  assert.deepEqual(g[0].names, ['ROSSI', 'SPAGNULO', 'ESPOSITO'], 'trasferte = DisNa + M nudo + NDisNa')
  assert.deepEqual(g[1].names, ['NERI'])

  // fallback mesi v1 (senza token): tutto in «altro»
  const gLegacy = groupAltriPresenti({ altriPresenti: ['ROSSI', 'ROSSI', 'NERI'] })
  assert.equal(gLegacy.length, 1)
  assert.equal(gLegacy[0].key, 'altro')
  assert.deepEqual(gLegacy[0].names, ['ROSSI', 'NERI'], 'dedup per nome')

  // classifica diretta
  assert.equal(classificaAltriToken('NDisCas'), 'trasferte')
  assert.equal(classificaAltriToken('GTUTOR'), 'tutor')

  console.log('PASS ✓ — tutti i vincoli contrattuali verificati')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
