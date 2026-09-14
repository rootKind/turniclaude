// Catalogo completo dei token per la classificazione guidata (22/09/2026):
// per OGNI codice unico del DB stampa frequenza + 3 esempi (persona · mese ·
// giorno), diviso in: (1) già in «Altri presenti», (2) in colonne di sezione,
// (3) INVISIBILI sulla board — la lista da spiegare all'utente.
// Usa il modulo reale lib/shift-tokens.ts (transpilato) per il routing esatto.
// Non stampa mai valori segreti.
import fs from 'node:fs'
import path from 'node:path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
let envPath = null
for (let dir = root; ; dir = path.dirname(dir)) {
  const c = path.join(dir, '.env.local')
  if (fs.existsSync(c)) { envPath = c; break }
  if (dir === path.dirname(dir)) break
}
if (!envPath) { console.error('.env.local non trovato'); process.exit(1) }
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('env mancanti'); process.exit(1) }
const rest = (table, search) =>
  fetch(`${URL}/rest/v1/${table}${search}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  }).then(r => r.json())

// modulo reale
const dir = mkdtempSync(join(tmpdir(), 'catalog-'))
const tpl = ts.transpileModule(fs.readFileSync('lib/shift-tokens.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replaceAll('@/types/database', './types-stub.js')
writeFileSync(join(dir, 'types-stub.js'), 'module.exports = {}\n')
writeFileSync(join(dir, 'shift-tokens.js'), tpl)
const { applyTokenToDay } = await import(pathToFileURL(join(dir, 'shift-tokens.js')).href)

function apply(token) {
  const day = { sections: {}, altriPresenti: [] }
  const produced = applyTokenToDay(day, 'X', token)
  if (!produced) return 'invisibile'
  if (day.altriPresenti.length === 1) return 'altri-presenti'
  if (Object.keys(day.sections).length > 0) return 'sezione'
  return 'invisibile'
}

function decode(data) {
  const codes = data.codes ?? []
  const out = []
  ;(data.rows ?? []).forEach((row, ri) => {
    ;(row.d ?? []).forEach((ci, i) => {
      const token = codes[ci]
      if (token) out.push({ day: i + 1, token, name: data.names?.[ri] ?? '?' })
    })
  })
  return out
}

const months = await rest('sala_schedule', '?select=month,schedule&order=month.asc')

// token → { count, kind, examples: [] }
const catalog = new Map()
for (const row of months) {
  if (!row.schedule?.codes) continue
  for (const { day, token, name } of decode(row.schedule)) {
    const kind = apply(token)
    if (!catalog.has(token)) catalog.set(token, { count: 0, kind, examples: [] })
    const e = catalog.get(token)
    e.count++
    if (e.examples.length < 3) e.examples.push(`${name} · ${row.month} · g${day}`)
  }
}

const buckets = { 'altri-presenti': [], sezione: [], invisibile: [] }
for (const [token, e] of catalog) buckets[e.kind]?.push([token, e])

for (const [kind, list] of Object.entries(buckets)) {
  list.sort((a, b) => b[1].count - a[1].count)
  console.log(`\n=== ${kind.toUpperCase()} (${list.reduce((a, [, e]) => a + e.count, 0)} celle, ${list.length} codici) ===`)
  for (const [token, e] of list) {
    // nel bucket invisibile segnala i veri codici assenza (A/AG/F/RM/RC/RI/VS/D)
    const isPlainAbsence = /^(A|AG|F|RM|RC|RI|VS|D)$/.test(token)
    console.log(`${token.padEnd(14)} ${String(e.count).padStart(5)}×${isPlainAbsence ? ' [ASSENZA]' : ''}   ${e.examples.join(' | ')}`)
  }
}

rmSync(dir, { recursive: true, force: true })
