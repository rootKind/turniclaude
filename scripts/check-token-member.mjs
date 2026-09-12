// Contratto di tokenForMember dopo il fix del periodo per-membro:
// 1. membri con pattern LUNGO (≥ cycle_days) → stesso comportamento di prima
// 2. membri con pattern CORTO (28gg in una tipologia 84) → cicla sulla SUA
//    lunghezza invece di restituire '' per idx ≥ 28 (persone scomparse
//    dai mesi teorici lontani)
// 3. date precedenti all'ancoraggio → modulo sempre positivo
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Estraggo tokenForMember dal modulo reale (type-stripping di Node lo importa
// direttamente, ma il modulo tira dentro @/types → stub con loader map).
const src = readFileSync('lib/turni-teorici.ts', 'utf8')

// in-page eval: definisco i dipendenti e copio il corpo della funzione
const DAY_MS = 86400000
const parseDateUTC = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const daysBetween = (f, t) => Math.round((parseDateUTC(t) - parseDateUTC(f)) / DAY_MS)
const addDays = (iso, days) => { const d = new Date(parseDateUTC(iso) + days * DAY_MS); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
const adjustmentOffset = () => 0

// cattura la funzione dal sorgente reale (ripulita dalle annotazioni TS)
const fnMatch = src.match(/export function tokenForMember[\s\S]*?\n}/)
assert.ok(fnMatch, 'tokenForMember found in source')
const cleaned = fnMatch[0]
  .replace('export function', 'function')
  .replace(/type: Pick<[^>]*>[^,]*,/, 'type,')
  .replace(/member: Pick<[^>]*>[^,]*,/, 'member,')
  .replace(/teamId: string,/, 'teamId,')
  .replace(/adjustments: ShiftAdjustment\[\],/, 'adjustments,')
  .replace(/dateISO: string,\r?\n\): string \{/, 'dateISO) {')
const tokenForMember = new Function(
  'daysBetween', 'addDays', 'adjustmentOffset',
  `${cleaned}; return tokenForMember`,
)(daysBetween, addDays, adjustmentOffset)

const type84 = { cycle_days: 84, pattern_start: '2026-03-01' }
const long = { pattern: Array.from({ length: 84 }, (_, i) => `T${i % 10}`) }
const short = { pattern: Array.from({ length: 28 }, (_, i) => `S${i % 7}`) }

// 1. pattern lungo: idx cicla su 84 (84 giorni dopo l'ancoraggio → idx 0)
assert.equal(tokenForMember(type84, long, 't1', [], '2026-05-24'), 'T0')
assert.equal(tokenForMember(type84, long, 't1', [], '2026-05-27'), 'T3')

// 2. pattern corto: DEVE ciclare su 28 (prima restituiva '' per idx ≥ 28)
const far = tokenForMember(type84, short, 't1', [], '2026-05-24') // 84gg → idx 84%28=0
assert.equal(far, 'S0', `short pattern far date: got "${far}", want "S0"`)
const mid = tokenForMember(type84, short, 't1', [], '2026-03-29') // 28gg → idx 0
assert.equal(mid, 'S0')
const mid2 = tokenForMember(type84, short, 't1', [], '2026-03-30') // 29gg → idx 1
assert.equal(mid2, 'S1')

// 3. data PRIMA dell'ancoraggio: modulo positivo (2025-02-15 = -379gg)
const past = tokenForMember(type84, short, 't1', [], '2025-02-15')
assert.ok(past.startsWith('S'), `past date token: "${past}"`)
console.log('check past-date token:', past)

// 4. pattern vuoto → '' senza crash
assert.equal(tokenForMember(type84, { pattern: [] }, 't1', [], '2026-05-24'), '')

console.log('all tokenForMember checks passed')
