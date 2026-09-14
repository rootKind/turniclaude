// Contratto bare-owner (richiesta 14/09/2026): Pietro Nevano è LEGATO al membro
// «NEVANO P.» di Rilievo D via user_id, Giuseppe è senza squadra. Nei PDF il
// cognome di solito è BARE («NEVANO»), qualche volta con iniziale («NEVANO G.»):
// la riga bare è SEMPRE di Pietro; Giuseppe matcha solo con l'iniziale. E dove
// appare il solo cognome in UI, gli omonimi mostrano l'iniziale («Nevano P.»).
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'nevano-'))
try {
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText

  // Il transpile mantiene il path alias: lo riscrivo sui file vicini.
  const stm = transpile(readFileSync('lib/shift-teams-matching.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js')
  const utils = transpile(readFileSync('lib/utils.ts', 'utf8'))
    .replaceAll('@/types/database', './types-stub.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js')
    // clsx/tailwind-merge servono solo a cn(): il transpile produce require("clsx") — stub per il test.
    .replaceAll('require("clsx")', 'require("./clsx-stub.js")')
    .replaceAll('require("tailwind-merge")', 'require("./clsx-stub.js")')
  const pshift = transpile(readFileSync('lib/person-shift.ts', 'utf8'))
    .replaceAll('@/types/database', './types-stub.js')
    .replaceAll('@/lib/utils', './utils.js')
    .replaceAll('@/lib/turni-teorici', './turni-teorici.js')
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js')
  const tt = transpile(readFileSync('lib/turni-teorici.ts', 'utf8'))
    .replaceAll('@/types/database', './types-stub.js')
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js')
  const sm = transpile(readFileSync('lib/sala-month.ts', 'utf8'))
    .replaceAll('@/types/database', './types-stub.js')
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/lib/utils', './utils.js')
    .replaceAll('@/lib/person-shift', './person-shift.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js')

  writeFileSync(join(dir, 'types-stub.js'), 'module.exports = {}\n')
  writeFileSync(join(dir, 'clsx-stub.js'), 'module.exports = { clsx: (...a) => a.filter(Boolean).join(" "), twMerge: s => s }\n')
  writeFileSync(join(dir, 'shift-tokens.js'), transpile(readFileSync('lib/shift-tokens.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js'))
  writeFileSync(join(dir, 'shift-teams-matching.js'), stm)
  writeFileSync(join(dir, 'utils.js'), utils)
  writeFileSync(join(dir, 'turni-teorici.js'), tt)
  writeFileSync(join(dir, 'person-shift.js'), pshift)
  writeFileSync(join(dir, 'sala-month.js'), sm)

  const matching = (await import(pathToFileURL(join(dir, 'shift-teams-matching.js')).href)).default ?? await import(pathToFileURL(join(dir, 'shift-teams-matching.js')).href)
  const utilsMod = (await import(pathToFileURL(join(dir, 'utils.js')).href)).default ?? await import(pathToFileURL(join(dir, 'utils.js')).href)
  const pshiftMod = (await import(pathToFileURL(join(dir, 'person-shift.js')).href)).default ?? await import(pathToFileURL(join(dir, 'person-shift.js')).href)
  const ttMod = (await import(pathToFileURL(join(dir, 'turni-teorici.js')).href)).default ?? await import(pathToFileURL(join(dir, 'turni-teorici.js')).href)
  const smMod = (await import(pathToFileURL(join(dir, 'sala-month.js')).href)).default ?? await import(pathToFileURL(join(dir, 'sala-month.js')).href)
  const { buildBareOwners, userOwnsBareName, isBareOwnedName, lookupNameDisplay, formatSurnameInitial } = matching
  const { matchesCognome, formatDisplayName } = utilsMod
  const { personNameMatches, realShiftFor } = pshiftMod
  const { theoRealSectionCompare } = ttMod
  const { findMonthPerson } = smMod

  // ── anagrafica di prova (come nel DB) ──────────────────────────────────────
  const pietro = { id: 'u-pietro', nome: 'Pietro', cognome: 'Nevano' }
  const giuseppe = { id: 'u-giuseppe', nome: 'Giuseppe', cognome: 'Nevano' }
  const users = [pietro, giuseppe, { id: 'u-x', nome: 'Alba', cognome: 'Rossi' }]
  const duplicateCognomi = utilsMod.buildDuplicateCognomi(users)
  assert.ok(duplicateCognomi.has('Nevano'), 'Nevano è omonimo fra gli utenti')

  // ── albero: Rilievo D = LONI A. + NEVANO P. (legato a Pietro) ─────────────
  const member = (full_name, user_id = null, pattern = ['M4S']) => ({ is_active: true, full_name, user_id, pattern })
  const tree = {
    types: [
      {
        is_active: true, cycle_days: 28, pattern_start: '2026-09-14',
        teams: [{ id: 't1', members: [member('LONI A.', null, ['RM']), member('NEVANO P.', 'u-pietro')] }],
      },
    ],
  }
  const bareOwners = buildBareOwners(tree, duplicateCognomi)
  assert.equal(bareOwners.size, 1, 'una sola voce: nevano')
  assert.equal(bareOwners.get('nevano')?.nameNorm, 'nevano p.', 'il proprietario bare è Pietro (membro legato)')

  // ── matching PDF ────────────────────────────────────────────────────────────
  // «NEVANO» bare → SOLO Pietro.
  assert.equal(isBareOwnedName('NEVANO', bareOwners), true, 'NEVANO è bare-owned')
  assert.equal(personNameMatches('NEVANO', pietro, duplicateCognomi, bareOwners), true, 'bare → Pietro')
  assert.equal(personNameMatches('NEVANO', giuseppe, duplicateCognomi, bareOwners), false, 'bare NON → Giuseppe')
  // «NEVANO G.» → SOLO Giuseppe (l'iniziale non corrisponde a Pietro).
  assert.equal(personNameMatches('NEVANO G.', giuseppe, duplicateCognomi, bareOwners), true, 'NEVANO G. → Giuseppe')
  assert.equal(personNameMatches('NEVANO G.', pietro, duplicateCognomi, bareOwners), false, 'NEVANO G. NON → Pietro')
  // «NEVANO P.» → Pietro.
  assert.equal(personNameMatches('NEVANO P.', pietro, duplicateCognomi, bareOwners), true, 'NEVANO P. → Pietro')
  // matchesCognome si comporta uguale.
  assert.equal(matchesCognome(['NEVANO'], 'Nevano', 'Pietro', duplicateCognomi, bareOwners), true, 'matchesCognome bare → Pietro')
  assert.equal(matchesCognome(['NEVANO'], 'Nevano', 'Giuseppe', duplicateCognomi, bareOwners), false, 'matchesCognome bare NON → Giuseppe')
  assert.equal(matchesCognome(['NEVANO G.'], 'Nevano', 'Giuseppe', duplicateCognomi, bareOwners), true, 'matchesCognome NEVANO G. → Giuseppe')
  // Senza mappa (albero assente) comportamento precedente: bare matcha per cognome.
  assert.equal(personNameMatches('NEVANO', pietro, duplicateCognomi, null), true, 'senza mappa: bare → cognome (Pietro ok)')
  // Gli altri cognomi non cambiano.
  assert.equal(personNameMatches('ROSSI', users[2], duplicateCognomi, bareOwners), true, 'non-omonimo invariato')
  assert.equal(userOwnsBareName('Rossi', 'Alba', bareOwners), false, 'cognome non omonimo non è bare owner')

  // ── findMonthPerson: riga PDF del mese ─────────────────────────────────────
  const people = [
    { name: 'NEVANO', days: ['M4S', ''], teorico: ['M4S', ''], yellow: [] },
    { name: 'NEVANO G.', days: ['A', ''], teorico: ['M8', ''], yellow: [] },
  ]
  assert.equal(findMonthPerson(people, pietro, duplicateCognomi, bareOwners)?.name, 'NEVANO', 'riga mese bare → Pietro')
  assert.equal(findMonthPerson(people, giuseppe, duplicateCognomi, bareOwners)?.name, 'NEVANO G.', 'riga mese con iniziale → Giuseppe')

  // ── realShiftFor: posizione nella giornata ─────────────────────────────────
  const emptyShift = () => ({ surnames: { T: [], S: [], noSlot: [] }, tirocinanti: [] })
  const day = {
    sections: {
      4: { M: { ...emptyShift(), surnames: { ...emptyShift().surnames, T: ['NEVANO'] } }, N: emptyShift(), P: emptyShift() },
    },
    altriPresenti: ['NEVANO G.'],
  }
  const realPietro = realShiftFor(day, pietro, duplicateCognomi, bareOwners)
  assert.equal(realPietro.token, 'M4T', 'NEVANO in sezione 4 → Pietro M4T')
  const realGiuseppe = realShiftFor(day, giuseppe, duplicateCognomi, bareOwners)
  assert.equal(realGiuseppe.presentNoSection, true, 'NEVANO G. in altriPresenti → Giuseppe presente senza sezione')

  // ── theoRealSectionCompare: il teorico NEVANO P. consuma il PDF bare ──────
  const realDay = {
    sections: {
      4: { M: { ...emptyShift(), surnames: { ...emptyShift().surnames, T: ['NEVANO'] } }, N: emptyShift(), P: emptyShift() },
    },
    altriPresenti: [],
  }
  const realCodes = new Map([['nevano', 'AG7'], ['nevano p.', 'AG7']])
  // pattern M4S per NEVANO P.: 2026-09-14 = anchor, giorno 14 → M4S, confermato → nessuna riga.
  const cmp = theoRealSectionCompare('2026-09', 14, tree, [], realDay, realCodes, bareOwners)
  assert.equal(cmp.get('4|M')?.rows.length ?? 0, 0, 'NEVANO P. confermato dal PDF bare: nessuna riga')
  assert.equal(cmp.get('4|M')?.extras.length ?? 0, 0, 'nessun extra spurio dal bare')

  // Teorico spostato: NEVANO P. atteso in sezione 5, reale bare in sezione 4.
  const tree5 = {
    types: [{
      is_active: true, cycle_days: 28, pattern_start: '2026-09-14',
      teams: [{ id: 't1', members: [member('NEVANO P.', 'u-pietro', ['M5S'])] }],
    }],
  }
  const cmp2 = theoRealSectionCompare('2026-09', 14, tree5, [], realDay, realCodes, bareOwners)
  const rows2 = cmp2.get('5|M')?.rows ?? []
  assert.deepEqual(rows2.map(r => `${r.name}|${r.real}`), ['NEVANO P.|M4'], 'spostamento: riga con la sezione reale')

  // ── visualizzazione: iniziali per gli omonimi ─────────────────────────────
  assert.equal(formatDisplayName(pietro, duplicateCognomi), 'Nevano P.', 'displayName con iniziale')
  assert.equal(formatDisplayName(giuseppe, duplicateCognomi), 'Nevano G.', 'displayName con iniziale')
  assert.equal(formatSurnameInitial('Nevano', 'Pietro', true), 'Nevano P.', 'formatSurnameInitial omonimo')
  assert.equal(formatSurnameInitial('Nevano', 'Pietro', false), 'Nevano', 'formatSurnameInitial non-omonimo')
  // Mappa display con le TRE forme → «Nevano P.»
  const nameDisplay = new Map([
    ['nevano pietro', 'Nevano P.'],
    ['nevano', 'Nevano P.'],
    ['nevano p.', 'Nevano P.'],
    ['nevano giuseppe', 'Nevano G.'],
    ['nevano g.', 'Nevano G.'],
  ])
  assert.equal(lookupNameDisplay('NEVANO', nameDisplay), 'Nevano P.', 'bare → iniziale proprietario')
  assert.equal(lookupNameDisplay('NEVANO G.', nameDisplay), 'Nevano G.', 'iniziale → iniziale Giuseppe')
  assert.equal(lookupNameDisplay('ROSSI', nameDisplay), null, 'non-omonimo: nessuna voce, resta cognome')

  console.log('OK — bare-owner: NEVANO→Pietro, NEVANO G.→Giuseppe, matching mese/giorno/confronto coerenti, iniziali in UI')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
