// Contratto delle righe «Teorico ≠ reale» (18/09/2026): un teorico senza
// posizione nella giornata mostra la SIGLA PDF della sua cella (A/AG7/F.E.…) presa
// dal mese v2 — «assente» SOLO se la cella PDF è vuota. Omonimi: la sigla matcha
// il NOME esatto (realCodes è indicizzato anche per nome normalizzato), non solo
// il cognome. I confermati (stesso turno+sezione) non producono righe.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'theoreal-'))
try {
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText

  // Il transpile mantiene il path alias: lo riscrivo sul file vicino.
  const tt = transpile(readFileSync('lib/turni-teorici.ts', 'utf8')).replaceAll('@/lib/shift-tokens', './shift-tokens.js')
  const st = transpile(readFileSync('lib/shift-tokens.ts', 'utf8'))
  writeFileSync(join(dir, 'turni-teorici.js'), tt)
  writeFileSync(join(dir, 'shift-tokens.js'), st)
  const mod = await import(pathToFileURL(join(dir, 'turni-teorici.js')).href)
  const { theoRealSectionCompare } = mod.default ?? mod

  // ── dati di prova ──────────────────────────────────────────────────────────
  const member = full_name => ({ is_active: true, full_name, pattern: [] })
  const tree = {
    types: [
      {
        is_active: true,
        cycle_days: 28,
        pattern_start: '2026-09-14',
        teams: [
          {
            id: 't1',
            members: [
              { ...member('ROSSI MARIO'), pattern: ['M4S'] },
              { ...member('DI NAPOLI M.'), pattern: ['M6'] },
              { ...member('DI NAPOLI A.'), pattern: ['M7'] },
              { ...member('BIANCHI ANNA'), pattern: ['M8'] },
              { ...member('VERDI LUCA'), pattern: ['M9'] },
            ],
          },
        ],
      },
    ],
  }
  const emptyShift = () => ({ surnames: { T: [], S: [], noSlot: [] }, tirocinanti: [] })
  const realDay = {
    sections: {
      6: { M: { ...emptyShift(), surnames: { ...emptyShift().surnames, noSlot: ['DI NAPOLI M.'] } }, N: emptyShift(), P: emptyShift() },
      7: { M: { ...emptyShift(), surnames: { ...emptyShift().surnames, noSlot: ['DI NAPOLI A.'] } }, N: emptyShift(), P: emptyShift() },
      8: { M: { ...emptyShift(), surnames: { ...emptyShift().surnames, noSlot: ['BRAVO GINO'] } }, N: emptyShift(), P: emptyShift() },
    },
    altriPresenti: [],
  }
  // Mese v2: sigle del PDF per il giorno 14 (indici day-1).
  const realCodes = new Map([
    ['rossi mario', 'A'],
    ['bianchi anna', 'AG7'],
    ['di napoli m.', 'M6'],
    ['di napoli a.', 'M7'],
    ['bravo gino', 'RM'],
    // VERDI LUCA: nessuna traccia nel PDF (cella vuota).
  ])

  // ── verifica ───────────────────────────────────────────────────────────────
  const out = theoRealSectionCompare('2026-09', 14, tree, [], realDay, realCodes)
  const rows = k => (out.get(k)?.rows ?? []).map(r => `${r.name}|${r.theo}→${r.real}`)

  // ROSSI: cella PDF «A» → la SIGLA, non «assente» (il fix di oggi).
  assert.deepEqual(rows('4|M'), ['ROSSI MARIO|M4S→A'], 'assenza col codice PDF A')
  // BIANCHI: cella PDF «AG7» → sigla completa.
  assert.deepEqual(rows('8|M'), ['BIANCHI ANNA|M8→AG7'], 'assenza col codice PDF AG7')
  // VERDI: nessuna traccia nel PDF → resta «assente».
  assert.deepEqual(rows('9|M'), ['VERDI LUCA|M9→assente'], 'cella vuota = assente')
  // Omonimi confermati (DI NAPOLI M. in 6, DI NAPOLI A. in 7): NESSUNA riga.
  assert.equal(out.get('6|M')?.rows.length ?? 0, 0, 'DI NAPOLI M. confermato')
  assert.equal(out.get('7|M')?.rows.length ?? 0, 0, 'DI NAPOLI A. confermato')
  // Extra: BRAVO GINO non previsto in 8 → «Nuovi».
  assert.deepEqual(out.get('8|M')?.extras ?? [], [{ name: 'BRAVO GINO', real: 'M8', theo: '' }], 'blocco Nuovi')

  // Senza mese v2 (realCodes assente) si ricade su «assente» come prima del fix.
  const outNoV2 = theoRealSectionCompare('2026-09', 14, tree, [], realDay, undefined)
  assert.deepEqual(
    (outNoV2.get('4|M')?.rows ?? []).map(r => r.real),
    ['assente'],
    'fallback senza mese v2',
  )

  console.log('OK — sigle assenze dal mese v2, «assente» solo con cella vuota, omonimi e Nuovi invariati')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
