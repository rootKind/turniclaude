// Analisi «Altri presenti» su TUTTI i mesi reali del DB dev (22/09/2026).
// Usa il MODULO REALE lib/shift-tokens.ts (transpilato): la classificazione è
// per definizione identica al routing di applyTokenToDay. Stampa frequenze ed
// esempi per gruppo + i codici NON routati (oggi invisibili sulla board).
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

// ── modulo reale ─────────────────────────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'altri-'))
const tpl = ts.transpileModule(fs.readFileSync('lib/shift-tokens.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replaceAll('@/types/database', './types-stub.js')
writeFileSync(join(dir, 'types-stub.js'), 'module.exports = {}\n')
writeFileSync(join(dir, 'shift-tokens.js'), tpl)
const { applyTokenToDay, ABSENT_CODES } = await import(pathToFileURL(join(dir, 'shift-tokens.js')).href)

// il token finisce in altriPresenti? Provo direttamente con applyTokenToDay.
function routesToAltriPresenti(token) {
  const day = { sections: {}, altriPresenti: [] }
  const produced = applyTokenToDay(day, 'X', token)
  return produced && day.altriPresenti.length === 1
}
// il token finisce in una colonna di sezione (comportamento corretto, non «nascosto»)
function isSectioned(token) {
  const day = { sections: {}, altriPresenti: [] }
  const produced = applyTokenToDay(day, 'X', token)
  return produced && day.altriPresenti.length === 0 && Object.keys(day.sections).length > 0
}

// ── gruppi proposti ──────────────────────────────────────────────────────────
function classify(token) {
  const t = token.trim()
  if (/^ISp[A-Za-z]/i.test(t) || /^SPW$/i.test(t)) return 'SP · istruttore'
  if (/^Sp[A-Za-z@]/i.test(t) || /^Dis[A-Za-z]/i.test(t)) return 'SP · discente'
  if (/^(?:[MNP])?TUTOR$/i.test(t)) return 'Istruzione/Tutor'
  if (/^[MNP]$/.test(t)) return 'Turno senza sezione'
  return `DA CLASSIFICARE (${t})`
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
console.log(`Mesi reali nel DB: ${months.length}\n`)

const global = new Map()
const perMonth = new Map()
const examples = new Map()
const hidden = new Map()

for (const row of months) {
  const sched = row.schedule
  if (!sched?.codes) continue
  const counts = new Map()
  for (const { token } of decode(sched)) {
    if (routesToAltriPresenti(token)) {
      const g = classify(token)
      counts.set(g, (counts.get(g) ?? 0) + 1)
      global.set(g, (global.get(g) ?? 0) + 1)
      if (!examples.has(g)) examples.set(g, new Map())
      const em = examples.get(g)
      em.set(token, (em.get(token) ?? 0) + 1)
    } else {
      const t = token.trim()
      if (!t || ABSENT_CODES.has(t)) continue      // vuoti/assenze: correttamente fuori
      if (isSectioned(token)) continue             // turni con sezione: correttamente in colonna
      hidden.set(t, (hidden.get(t) ?? 0) + 1)      // invisibili sulla board
    }
  }
  perMonth.set(row.month, counts)
}

console.log('=== CELLE «ALTRI PRESENTI» per gruppo (7 mesi, routing REALE) ===')
for (const [g, n] of [...global.entries()].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(6)}  ${g}`)

console.log('\n=== ESEMPI per gruppo ===')
for (const [g, em] of examples) {
  const top = [...em.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log(`${g}: ${top.map(([t, n]) => `${t}(${n})`).join(', ')}`)
}

console.log('\n=== DENSITÀ per mese ===')
for (const [month, counts] of perMonth) {
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}: ${n}`).join(' · ')
  const tot = [...counts.values()].reduce((a, b) => a + b, 0)
  console.log(`${month}  tot=${tot}  ${parts}`)
}

console.log('\n=== CODICI NON ROUTATI (oggi invisibili su /turnisala, esclusi vuoti/assenze/turni con sezione) ===')
console.log([...hidden.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t, n]) => `${t}(${n})`).join(', '))

rmSync(dir, { recursive: true, force: true })
