// Valida il predittore del teorico (lib/person-cycle.ts) sui dati reali:
// 1) livello «cycle» (periodo rigido): dedotto dai mesi PDF fino a LUGLIO,
//    verificato su SETTEMBRE — il buco di AGOSTO è ignorato dal ciclo rigido.
// 2) livello «rotation» (macchina a stati): allenato fino a GIUGNO, verificato
//    su LUGLIO (mesi consecutivi, come accadrà per i mesi futuri).
// 3) sanità futura: mostra le predizioni di MININO per il mese dopo l'ultimo PDF.
import fs from 'node:fs'
import path from 'node:path'

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
const rest = (t, s) => fetch(`${URL}/rest/v1/${t}${s}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).then(r => r.json())

console.log(`Progetto: ${URL.replace('https://', '').split('.')[0]} (atteso dev: uokfixddsuqcjddbfkln)`)

// ── specchio di lib/person-cycle.ts ──────────────────────────────────────────
const MIN_DAYS = 14
const MIN_TAIL = 7
const MAX_PERIOD = 60
const MIN_CYCLE_CONFIDENCE = 0.85

const dayKey = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000) }
const isoFromDayKey = k => new Date(k * 86400000).toISOString().slice(0, 10)
const daysInMonthOf = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }

function isWorkToken(t) { return /^[MNP][A-Z0-9]/.test(t) || /^DC/.test(t) }

function cycleKey(token) {
  const t = (token ?? '').trim()
  if (!t) return ''
  if (/^[MNP][A-Z0-9]/.test(t)) return t.replace(/(TIR|[ST])$/, '')
  if (/^DC/.test(t)) return t
  if (/^(RM|RC|RI)$/.test(t)) return 'R'
  return ''
}

function personNameMatches(fullName, user) {
  const fn = fullName.trim().toLowerCase()
  const cognome = (user.cognome ?? '').trim().toLowerCase()
  const nome = (user.nome ?? '').trim().toLowerCase()
  if (!fn || !cognome) return false
  if (fn === cognome) return true
  const prefixed = fn.match(/^(.*)\s+([a-z]+)\.$/)
  if (prefixed && prefixed[1] === cognome) return !!nome && nome.startsWith(prefixed[2])
  return false
}

function deduceCycleFromSeq(seq, months) {
  if (seq.size < MIN_DAYS) return null
  const keys = [...seq.keys()].sort((a, b) => a - b)
  const first = keys[0]
  const last = keys[keys.length - 1]
  const maxPeriod = Math.min(last - first + 1 - MIN_TAIL, MAX_PERIOD)
  if (maxPeriod < 1) return null
  const days = [...seq.entries()].sort((a, b) => a[0] - b[0])
  for (let p = 1; p <= maxPeriod; p++) {
    const tally = Array.from({ length: p }, () => new Map())
    let compared = 0
    for (const [key, token] of days) {
      const k = cycleKey(token)
      if (!k) continue
      compared++
      const t = tally[(key - first) % p]
      const cur = t.get(k)
      if (cur) cur.n++
      else t.set(k, { n: 1, raw: token })
    }
    if (tally.some(t => t.size === 0)) continue
    let ok = 0, bad = 0
    const cycle = []
    for (const t of tally) {
      let bestN = 0, raw = '', tot = 0
      for (const { n, raw: r } of t.values()) { tot += n; if (n > bestN) { bestN = n; raw = r } }
      ok += bestN; bad += tot - bestN; cycle.push(raw)
    }
    if (compared > 0 && bad / compared > 0.02) continue
    const keySet = new Set(cycle.map(cycleKey))
    if (keySet.size < 2) continue
    if (![...keySet].some(k => k !== 'R')) continue
    return { months, cycle, anchor: isoFromDayKey(first), support: ok, confidence: ok / compared }
  }
  return null
}

function tokenFromCycle(cyc, dateISO) {
  const p = cyc.cycle.length
  const idx = (((dayKey(dateISO) - dayKey(cyc.anchor)) % p) + p) % p
  return cyc.cycle[idx] ?? ''
}

function buildRuns(seq) {
  const keys = [...seq.keys()].sort((a, b) => a - b)
  const segments = []
  for (const k of keys) {
    const seg = segments[segments.length - 1]
    if (seg && k === seg[seg.length - 1] + 1) seg.push(k)
    else segments.push([k])
  }
  const runs = []
  for (const seg of segments) {
    let cur = null
    for (const k of seg) {
      const raw = seq.get(k)
      if (isWorkToken(raw)) {
        if (cur && k === cur.end + 1) { cur.tokens.push(raw); cur.end = k }
        else {
          if (cur) runs.push({ tokens: cur.tokens, endKey: cur.end, before: cur.buffer })
          cur = { tokens: [raw], end: k, buffer: [] }
        }
      } else if (cur) cur.buffer.push(raw)
    }
    if (cur) runs.push({ tokens: cur.tokens, endKey: cur.end, before: cur.buffer })
  }
  const segStarts = new Set(segments.map(s => s[0]))
  runs.forEach((r, i) => {
    if (i === 0 || segStarts.has(r.endKey - r.tokens.length + 1)) r.before = null
  })
  return runs
}

const seqEquals = (a, b) => a.length === b.length && a.every((t, i) => t === b[i])
const seqStartsWith = (a, b) => a.length >= b.length && b.every((t, i) => a[i] === t)

function buildMachine(runs) {
  if (runs.length < 2) return null
  const trustedSuccessor = s => {
    if (!s.before) return false
    return runs.some(r => seqEquals(r.tokens, s.tokens) || (seqStartsWith(r.tokens, s.tokens) && r.tokens.length > s.tokens.length))
  }
  const tally = {}
  for (let k = 0; k < runs.length - 1; k++) {
    const succ = runs[k + 1]
    if (!trustedSuccessor(succ)) continue
    ;(tally[runs[k].tokens.map(cycleKey).join('|')] ??= []).push({ b: succ.before.join('|'), t: succ.tokens, order: k })
  }
  const states = {}
  for (const [sig, list] of Object.entries(tally)) {
    const counts = new Map()
    for (const it of list) counts.set(it.b, (counts.get(it.b) ?? 0) + 1)
    let bestB = '', bestN = -1
    for (const [b, n] of counts) if (n > bestN) { bestB = b; bestN = n }
    const winner = [...list].reverse().find(it => it.b === bestB)
    states[sig] = { b: bestB.split('|'), t: winner.t }
  }
  if (Object.keys(states).length === 0) return null
  const current = runs[runs.length - 1].tokens
  let completion = null
  if (!current.some(t => t.startsWith('N') || t.startsWith('DC'))) {
    for (let k = runs.length - 2; k >= 0; k--) {
      if (seqStartsWith(runs[k].tokens, current) && runs[k].tokens.length > current.length) { completion = runs[k].tokens; break }
    }
  }
  return { states, current, completion, lastKey: runs[runs.length - 1].endKey }
}

function buildPersonTheoretical(seq, months) {
  if (seq.size < MIN_DAYS) return null
  const cycle = deduceCycleFromSeq(seq, months)
  if (cycle && cycle.confidence >= MIN_CYCLE_CONFIDENCE) return { tier: 'cycle', cycle, machine: null }
  const machine = buildMachine(buildRuns(seq))
  if (machine) return { tier: 'rotation', cycle, machine }
  if (cycle) return { tier: 'cycle', cycle, machine: null }
  return null
}

function predictMonth(src, month) {
  const n = daysInMonthOf(month)
  if (!src) return new Array(n).fill('')
  if (src.tier === 'cycle' && src.cycle) {
    return Array.from({ length: n }, (_, i) => tokenFromCycle(src.cycle, `${month}-${String(i + 1).padStart(2, '0')}`))
  }
  if (src.tier === 'rotation' && src.machine) {
    const { states, completion, lastKey } = src.machine
    const out = new Array(n).fill('')
    const startKey = dayKey(`${month}-01`)
    const endKey = startKey + n - 1
    let day = Math.max(startKey, lastKey + 1)
    if (day > endKey) return out
    const emit = raw => { if (day >= startKey && day <= endKey) out[day - startKey] = raw; day++ }
    let anchor = [...src.machine.current]
    if (completion && seqStartsWith(completion, anchor) && completion.length > anchor.length) {
      for (const t of completion.slice(anchor.length)) emit(t)
      anchor = [...completion]
    }
    for (let guard = 0; guard < 80 && day <= endKey; guard++) {
      const st = states[anchor.map(cycleKey).join('|')]
      if (!st) break
      for (const t of st.b) emit(t)
      for (const t of st.t) emit(t)
      anchor = [...st.t]
    }
    return out
  }
  return new Array(n).fill('')
}

// ── dati ─────────────────────────────────────────────────────────────────────
const [users, schedules] = await Promise.all([
  rest('users', '?select=id,nome,cognome&order=cognome.asc'),
  rest('sala_schedule', '?select=month,schedule&order=month.asc'),
])
const pdfMonths = new Map()
for (const s of schedules ?? []) if (s.schedule?.v === 2) pdfMonths.set(s.month, s.schedule)
const months = [...pdfMonths.keys()].sort()
console.log('Mesi PDF v2:', months.join(', '))

const codeOf = (data, i) => data.codes[i ?? 0] ?? ''
function personSeq(months, name) {
  const seq = new Map()
  for (const month of months) {
    const data = pdfMonths.get(month)
    const idx = data.names.findIndex(n => n === name)
    if (idx < 0) continue
    const row = data.rows[idx]
    for (let d = 1; d <= data.days; d++) seq.set(dayKey(`${month}-${String(d).padStart(2, '0')}`), codeOf(data, row?.t?.[d - 1]))
  }
  return seq
}

// ── 1) livello «cycle» su tutte le persone: allena fino a LUG, verifica SET ──
const trainCycle = months.slice(0, -1)         // 03..07 (agosto assente)
const testCycle = months[months.length - 1]    // 09
console.log(`\n── 1) LIVELLO CYCLE — allenamento ${trainCycle.join(',')} → verifica ${testCycle} ──`)
const test2 = pdfMonths.get(testCycle)
let cycGood = 0, cycTot = 0
const cycleRows = []
for (const name of test2.names) {
  const seq = personSeq(trainCycle, name)
  if (seq.size < MIN_DAYS) continue
  const cyc = deduceCycleFromSeq(seq, trainCycle)
  if (!cyc) { cycleRows.push({ name, tier: 'no-cycle' }); continue }
  let ok = 0, tot = 0
  for (let d = 1; d <= test2.days; d++) {
    const iso = `${testCycle}-${String(d).padStart(2, '0')}`
    const pk = cycleKey(tokenFromCycle(cyc, iso))
    const bk = cycleKey(codeOf(test2, test2.rows[test2.names.indexOf(name)]?.t?.[d - 1]))
    if (!pk && !bk) continue
    tot++
    if (pk === bk) ok++
  }
  const pct = tot ? ok / tot : 0
  cycTot++
  if (pct >= 0.9) cycGood++
  cycleRows.push({ name, tier: `cycle ${(cyc.confidence * 100).toFixed(0)}% p${cyc.cycle.length}`, pct: Math.round(pct * 100) })
}
for (const r of cycleRows.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))) {
  console.log(`${r.tier.padEnd(18)} ${r.pct !== undefined ? String(r.pct).padStart(3) + '%' : '  —'}  ${r.name}`)
}
console.log(`Persone con ciclo rigido: ${cycTot}, con ≥90% sul mese di verifica: ${cycGood}`)

// ── 2) livello «rotation» su tutte le persone: fino a GIU → verifica LUG ─────
const trainRot = months.filter(m => m < '2026-07')   // 03..06
const testRot = '2026-07'
console.log(`\n── 2) LIVELLO ROTATION — allenamento ${trainRot.join(',')} → verifica ${testRot} ──`)
const test1 = pdfMonths.get(testRot)
let rotGood = 0, rotTot = 0
const rotRows = []
for (const name of test1.names) {
  const seq = personSeq(trainRot, name)
  if (seq.size < MIN_DAYS) continue
  const src = buildPersonTheoretical(seq, trainRot)
  if (!src) { rotRows.push({ name, tier: 'none' }); continue }
  const pred = predictMonth(src, testRot)
  let ok = 0, tot = 0
  const diffs = []
  for (let d = 1; d <= test1.days; d++) {
    const pk = cycleKey(pred[d - 1] ?? '')
    const bk = cycleKey(codeOf(test1, test1.rows[test1.names.indexOf(name)]?.t?.[d - 1]))
    if (!pk && !bk) continue
    tot++
    if (pk === bk) ok++
    else if (diffs.length < 8) diffs.push(`g${d}:${pred[d - 1] || '—'}≠${codeOf(test1, test1.rows[test1.names.indexOf(name)]?.t?.[d - 1]) || '—'}`)
  }
  const pct = tot ? ok / tot : 0
  rotTot++
  if (pct >= 0.9) rotGood++
  rotRows.push({ name, tier: src.tier === 'cycle' ? 'cycle' : 'rotation', pct: Math.round(pct * 100), diffs })
}
for (const r of rotRows.sort((a, b) => b.pct - a.pct)) {
  console.log(`${String(r.pct).padStart(3)}%  ${(r.tier === 'cycle' ? '(cycle) ' : '(mach)  ')}${r.name}${r.diffs?.length ? '   ' + r.diffs.join(' ') : ''}`)
}
console.log(`Persone predette (cycle+rotation): ${rotTot}, con ≥90%: ${rotGood}`)

// ── 3) sanità futura: predizioni MININO per i mesi dopo l'ultimo PDF ─────────
const minino = (users ?? []).find(u => `${u.cognome} ${u.nome ?? ''}`.toLowerCase().includes('minino'))
const nameMinino = minino ? test2.names.find(n => personNameMatches(n, minino)) ?? 'MININO' : 'MININO'
console.log(`\n── 3) FUTURO — predizioni per ${nameMinino} (storia completa) ──`)
const seqAll = personSeq(months, nameMinino)
const srcAll = buildPersonTheoretical(seqAll, months)
console.log('tier:', srcAll?.tier ?? 'none', srcAll?.cycle ? `(ciclo rigido p${srcAll.cycle.cycle.length} conf ${(srcAll.cycle.confidence * 100).toFixed(1)}%)` : '')
const fmt = arr => arr.map((t, i) => `${String(i + 1).padStart(2, ' ')}:${t || '--'}`).join(' ')
for (const m of ['2026-10', '2026-11', '2026-12']) {
  if (srcAll?.tier === 'cycle') {
    console.log(`[${m}] ${fmt(predictMonth(srcAll, m))}`)
  } else {
    console.log(`[${m}] ${fmt(predictMonth(srcAll, m))}`)
  }
}
