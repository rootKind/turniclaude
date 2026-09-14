// Contratto del blocco «Assenti» per turno teorico (richiesta 23/09/2026):
// le sigle di assenza del PDF (A/AG7/F.E./VS) compaiono SOLO nel turno
// teorico (M/P/N) della persona, mai ripetute sugli altri turni. Usa i
// MODULI REALI transpilati (turni-teorici + shift-tokens + altri-gruppi).
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'assenti-'))
try {
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText

  writeFileSync(join(dir, 'types-stub.js'), 'module.exports = {}\n')
  writeFileSync(join(dir, 'shift-tokens.js'), transpile(readFileSync('lib/shift-tokens.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js'))
  writeFileSync(join(dir, 'altri-gruppi.js'), transpile(readFileSync('lib/altri-gruppi.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js'))
  const tt = transpile(readFileSync('lib/turni-teorici.ts', 'utf8'))
    .replaceAll('@/types/database', './types-stub.js')
    .replaceAll('@/lib/shift-tokens', './shift-tokens.js')
    .replaceAll('@/lib/altri-gruppi', './altri-gruppi.js')
    .replaceAll('@/lib/shift-teams-matching', './shift-teams-matching.js')
  writeFileSync(join(dir, 'turni-teorici.js'), tt)
  writeFileSync(join(dir, 'shift-teams-matching.js'), transpile(readFileSync('lib/shift-teams-matching.ts', 'utf8')).replaceAll('@/types/database', './types-stub.js').replaceAll('@/lib/utils', './stub.js'))
  writeFileSync(join(dir, 'stub.js'), 'module.exports = {}\n')

  const { assentiPerTurno } = await import(pathToFileURL(join(dir, 'turni-teorici.js')).href)

  const member = (full_name, pattern) => ({ is_active: true, full_name, pattern })
  const tree = {
    types: [{
      is_active: true, cycle_days: 28, pattern_start: '2026-09-14',
      teams: [{ id: 't1', members: [
        member('ROSSI MARIO', ['M4S']),
        member('BIANCHI ANNA', ['P8S']),
        member('VERDI LUCA', ['N6']),
        member('NERI GINO', ['M7']),
        member('NERI ALDO', ['P9']),
      ] }],
    }],
  }
  const realCodes = new Map([
    ['rossi mario', 'F.E.'], ['rossi', 'F.E.'],
    ['bianchi anna', 'AG7'], ['bianchi', 'AG7'],
    ['verdi luca', 'VS'], ['verdi', 'VS'],
    ['neri aldo', 'A'],
    ['neri', 'RM'],
  ])
  const out = assentiPerTurno('2026-09', 14, tree, [], realCodes)
  const names = s => (out.get(s) ?? []).map(a => a.name + ' ' + a.code)

  assert.deepEqual(names('M'), ['ROSSI MARIO F.E.'], 'Rossi (teorico M) solo in M')
  assert.deepEqual(names('P'), ['BIANCHI ANNA AG7', 'NERI ALDO A'], 'P: Bianchi + Neri Aldo')
  assert.deepEqual(names('N'), ['VERDI LUCA VS'], 'Verdi (teorico N) solo in N')
  assert.equal(out.size, 3, 'tre turni coinvolti')

  assert.ok(names('P').some(t => t.startsWith('NERI ALDO ')), 'nome completo risolve anche fra omonimi')
  assert.ok(
    !names('M').some(t => t.startsWith('NERI')) &&
    !names('P').some(t => t.includes('RM')),
    'bare di omonimo senza legato: non attribuito',
  )

  assert.ok(!names('M').some(t => t.startsWith('NERI GINO')), 'teorico in servizio: fuori')
  assert.equal([...out.values()].flat().find(a => a.code === 'F.E.')?.code, 'F.E.')

  const outNoV2 = assentiPerTurno('2026-09', 14, tree, [], undefined)
  assert.equal(outNoV2.size, 0, 'senza v2: nessun assente')

  const treeN = {
    types: [{
      is_active: true, cycle_days: 28, pattern_start: '2026-09-14',
      teams: [{ id: 'tn', members: [
        { ...member('NEVANO PIETRO', ['M5']), user_id: 'u-pietro' },
        { ...member('NEVANO GIUSEPPE', ['P9']) },
      ] }],
    }],
  }
  const bareOwners = new Map([['nevano', { cognome: 'Nevano', nameNorm: 'nevano pietro', initial: 'p', userId: 'u-pietro' }]])
  const realCodesN = new Map([
    ['nevano', 'AG7'],
    ['nevano g.', 'A'],
  ])
  const outN = assentiPerTurno('2026-09', 14, treeN, [], realCodesN, bareOwners, new Set(['Nevano']))
  const nM = outN.get('M') ?? []
  const nP = outN.get('P') ?? []
  assert.deepEqual(nM.map(a => a.name), ['NEVANO PIETRO'], 'bare NEVANO = Pietro (legato), turno M')
  assert.deepEqual(nP.map(a => a.name), ['NEVANO GIUSEPPE'], 'iniziale g. = Giuseppe, turno P')
  assert.equal(nP[0]?.code, 'A')

  console.log('PASS — assenti solo nel loro turno teorico, omonimi e bare owner coerenti')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
