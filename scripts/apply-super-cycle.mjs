// Applica alle tipologie del DB il ciclo «sup» dedotto dalla storia dei PDF:
//  - shift_types.cycle_days = periodo minimo reale (es. 84gg per «in terza»)
//  - shift_types.pattern_start = anchor comune (2026-03-01, primo giorno PDF)
//  - pattern dei membri = codici COMPLETI (turno+sezione) per classe di resto
// Uso: node scripts/apply-super-cycle.mjs                    (anteprima, NON scrive)
//      node scripts/apply-super-cycle.mjs --apply             (scrive, con backup JSON)
//      node scripts/apply-super-cycle.mjs --apply --only=ROTONDO   (solo un membro)
//      node scripts/apply-super-cycle.mjs --dump              (pattern completi)
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
const APPLY = process.argv.includes('--apply')
const DUMP = process.argv.includes('--dump')   // stampa il pattern COMPLETO di ogni membro
// --only=<sottostringa>: limita REPORT e SCRITTURE ai membri che matchano il nome
// (nel team: misura di sicurezza per applicare UNA correzione senza toccare gli
// altri membri che la stessa passata proporrebbe di cambiare).
const ONLY = (process.argv.find(a => a.startsWith('--only=')) ?? '').slice('--only='.length).trim().toUpperCase()
const selezionato = m => !ONLY || m.full_name.toUpperCase().includes(ONLY)
const hdr = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const rest = (t, s) => fetch(`${URL}/rest/v1/${t}${s}`, { headers: hdr }).then(r => r.json())
const patch = async (t, q, body) => { const r = await fetch(`${URL}/rest/v1/${t}${q}`, { method: 'PATCH', headers: hdr, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${t} PATCH ${r.status}: ${await r.text()}`); return true }

const COMMON_ANCHOR = '2026-03-01'   // primo giorno coperto dai PDF (lunedi)
const dayKey = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000) }
const norm = t => (t ?? '').trim().replace(/TIR$/, '')

/**
 * Token che DICONO qualcosa sulla rotazione: turni M/P/N (con o senza sezione,
 * anche a maiuscole miste come «piaptir») e i codici visibili di riposo/
 * disponibilità/assenza (ABSENT_CODES + AG<n> + F.E.).
 *
 * TUTTO IL RESTO È INVISIBILE — la famiglia G (G, GIAP, GRicTir), Na, MSb, 12.14,
 * i suffissi TIR… — e NON deve concorrere alla maggioranza per classe: è il bug
 * che ha distrutto la rotazione di ROTONDO. Da maggio il suo teorico è una serie
 * di G (5 mesi su 7), quindi il G vinceva la maggioranza in 46 classi su 84 e il
 * pattern usciva con 46 G e un solo passaggio sulle sezioni. Un codice invisibile
 * non racconta il piano: racconta solo che l'ufficio quel giorno ha scritto altro.
 */
const informative = t => {
  const x = norm(t)
  if (!x) return false
  if (/^[MNPmnp][A-Za-z0-9@]+$/.test(x) || /^[MNP]$/.test(x)) return true
  if (['RI', 'RC', 'RM', 'D', 'A', 'F', 'VS'].includes(x)) return true
  if (/^AG\d+$/i.test(x)) return true
  if (/^F\.?E\.?$/i.test(x)) return true
  return false
}

const [types, teams, members, schedules, templates] = await Promise.all([
  rest('shift_types', '?select=id,name,cycle_days,pattern_start,is_active,sort_order&order=sort_order.asc'),
  rest('shift_teams', '?select=id,shift_type_id,name,sort_order'),
  rest('shift_team_members', '?select=id,team_id,full_name,pattern,is_active,is_lead&order=sort_order.asc'),
  rest('sala_schedule', '?select=month,schedule&order=month.asc'),
  // Cicli di catalogo: possono contenere una copia del pattern di un membro (il
  // «LANGIONE · ROTONDO» era l'esatta copia del suo pattern rotto) → vanno
  // allineati anche loro, altrimenti dal pannello si può riapplicare il guasto.
  rest('shift_cycle_templates', '?select=id,name,team_id,cycle_days,pattern_start,pattern'),
])

const pdfMonths = new Map()
for (const s of schedules ?? []) if (s.schedule?.v === 2) pdfMonths.set(s.month, s.schedule)
const months = [...pdfMonths.keys()].sort()
console.log(`Mesi PDF: ${months.join(', ')}  — anchor comune ${COMMON_ANCHOR} — modalità: ${APPLY ? 'APPLY (scrive)' : 'DRY-RUN (non scrive)'}`)

// sequenza teorico di una persona per giorno assoluto
function memberSeq(fullName, map = pdfMonths) {
  const seq = new Map()
  for (const month of map.keys()) {
    const data = map.get(month)
    const idx = data.names.findIndex(n => n.trim().toUpperCase() === fullName.trim().toUpperCase())
    if (idx < 0) continue
    const row = data.rows[idx]
    const code = i => data.codes[i ?? 0] ?? ''
    for (let d = 1; d <= data.days; d++) seq.set(dayKey(`${month}-${String(d).padStart(2, '0')}`), code(row?.t?.[d - 1]))
  }
  return seq
}

// periodo minimo con sequenza che si ripete (maggioranza per classe di resto)
function minimalPeriod(seq) {
  const keys = [...seq.keys()].sort((a, b) => a - b)
  if (keys.length < 28) return null
  const first = keys[0]
  const span = keys[keys.length - 1] - first + 1
  const days = [...seq.entries()].sort((a, b) => a[0] - b[0])
  for (let p = 14; p <= Math.min(168, span - 28); p++) {
    const tally = Array.from({ length: p }, () => new Map())
    for (const [k, raw] of days) {
      const t = norm(raw)
      if (!informative(t)) continue
      const m = tally[(k - first) % p]
      const cur = m.get(t)
      if (cur) cur.n++
      else m.set(t, { n: 1 })
    }
    if (tally.some(m => m.size === 0)) continue
    let agree = 0
    let sumTot = 0
    for (const m of tally) {
      let best = 0
      for (const { n } of m.values()) { sumTot += n; if (n > best) best = n }
      agree += best
    }
    if (sumTot > 0 && (sumTot - agree) / sumTot > 0.03) continue
    return { p }
  }
  return null
}

// pattern di lunghezza N con anchor COMUNE; le classi senza osservazione si
// riempono rimappando il pattern ancorato al primo giorno proprio della persona
function buildPattern(seq, N, anchorKey, ownFirstKey) {
  const tally = Array.from({ length: N }, () => new Map())
  for (const [k, raw] of [...seq.entries()].sort((a, b) => a[0] - b[0])) {
    const t = norm(raw)
    if (!informative(t)) continue
    const m = tally[((k - anchorKey) % N + N) % N]
    const cur = m.get(t)
    if (cur) { cur.n++; cur.last = k } else m.set(t, { n: 1, last: k })
  }
  const pick = m => {
    if (!m || m.size === 0) return ''
    let best = null
    for (const [t, { n, last }] of m) if (!best || n > best.n || (n === best.n && last > best.last)) best = { t, n, last }
    return best.t
  }
  // pattern ancorato al primo giorno PROPRIO (per il riempimento dei buchi)
  const ownTally = Array.from({ length: N }, () => new Map())
  for (const [k, raw] of [...seq.entries()].sort((a, b) => a[0] - b[0])) {
    const t = norm(raw)
    if (!informative(t)) continue
    const r = (k - ownFirstKey) % N
    const m = ownTally[r]
    const cur = m.get(t)
    if (cur) { cur.n++; cur.last = k } else m.set(t, { n: 1, last: k })
  }
  const shift = ((ownFirstKey - anchorKey) % N + N) % N
  const out = []
  let empty = 0
  for (let r = 0; r < N; r++) {
    let t = pick(tally[r])
    if (!t) { t = pick(ownTally[(r - shift + N) % N]); if (t) empty++ }
    if (!t) { empty++; t = '' }
    out.push(t)
  }
  return { pattern: out, empty }
}

// ─── rotazione della SQUADRA (griglia comune + fase) ─────────────────────────
// La rotazione non è del singolo: i compagni coprono le 4 sezioni sulla STESSA
// griglia, solo a una fase diversa (ROTONDO +3, D'AURIA +6, LUCIGNANO +9 rispetto
// a TURCO). Chi nella propria storia non ha PIÙ una rotazione (ROTONDO: da maggio
// il suo teorico è una serie di G, e i riposi che accompagnano quei G vincono la
// maggioranza per classe) non può dedurla da lì: la ricostruisce dai compagni.
//
// La regola, e perché è quella giusta:
//  - GRIGLIA: il periodo più corto (12 giorni) che spiega tutti i turni di
//    sezione del compagno che ne ha di più — è la rotazione della squadra;
//  - FASE del membro da ricostruire: la traslazione che spiega i suoi turni di
//    sezione SOPRAVVISSUTI (per ROTONDO 32/32: i giorni in cui il PDF lo
//    pianificava ancora a rotazione, prima dei G);
//  - su un giorno di LAVORO (griglia: turno di sezione) il token è la sezione;
//  - su un giorno di RIPOSO il tipo (RI/RC/RM/D) è una scelta di SQUADRA e si
//    vota tra i compagni rotanti: sono i loro riposi mensili e le disponibilità,
//    che cadono nello stesso giorno del ciclo per tutti. I giorni di riposo sono
//    sempre gli stessi indici (≡ 1 mod 3) qualunque sia la fase, perché i riposi
//    della griglia stanno a distanza 3.
// Chi gira già bene NON si tocca (i suoi riposi sono suoi); chi ha una storia
// troppo corta o fuori griglia resta com'è, con un avviso nel report.

const isSection = t => /^[MNP]\d/.test(t)

/** Periodo più corto che spiega TUTTI i turni di sezione del pattern (0 = nessuno). */
function gridPeriod(pattern, N) {
  for (let p = 7; p <= Math.floor(N / 2); p++) {
    const win = pattern.slice(0, p)
    if (win.filter(isSection).length < 2) continue
    let ok = true
    for (let i = 0; i < N && ok; i++) {
      if (isSection(pattern[i]) && pattern[i] !== pattern[i % p]) ok = false
    }
    if (ok) return p
  }
  return 0
}

/** Fase `s` che spiega più turni di sezione del pattern sulla griglia. */
function gridPhase(pattern, grid, N) {
  const p = grid.length
  let best = { s: -1, ok: 0, tot: 0 }
  for (let s = 0; s < p; s++) {
    let ok = 0, tot = 0
    for (let i = 0; i < N; i++) {
      if (!isSection(pattern[i])) continue
      tot++
      if (pattern[i] === grid[(i + s) % p]) ok++
    }
    if (ok > best.ok) best = { s, ok, tot }
  }
  return best
}

/**
 * Allinea i pattern dei membri di una SQUADRA alla griglia comune. Ritorna una
 * riga di report per membro. `nuove` è la mappa id → pattern appena derivato:
 * viene riscritta SOLO per i membri incoerenti (chi gira già bene non si tocca).
 */
function alignTeam(team, membri, N, nuove) {
  const ms = membri.map(x => x.m)
  const report = []
  const patternOf = m => nuove.get(m.id) ?? []
  const rotanti = ms.filter(m => patternOf(m).filter(isSection).length >= 2)
  if (rotanti.length < 2) return report
  // griglia: del membro con più turni di sezione che ha un periodo regolare
  const ref = rotanti
    .map(m => ({ m, p: gridPeriod(patternOf(m), N), n: patternOf(m).filter(isSection).length }))
    .filter(x => x.p > 0 && x.n >= 2 * x.p)
    .sort((a, b) => b.n - a.n)[0]
  if (!ref) return report
  const grid = patternOf(ref.m).slice(0, ref.p)

  // La fase di ciascun rotante è il modo in cui «legge» la griglia: il suo
  // canonico all'indice i è grid[(i + fase) % p]. Confrontare tutti sul canonico
  // del riferimento sarebbe sbagliato (i compagni sono sfasati).
  const fasi = new Map(rotanti.map(m => [m.id, gridPhase(patternOf(m), grid, N)]))
  const canonicoDi = (m, i) => grid[(i + (fasi.get(m.id)?.s ?? 0)) % grid.length]
  const inRiposo = (m, i) => !isSection(canonicoDi(m, i))

  // I giorni di RIPOSO sono di tutti (nessuno lavora) e la griglia li ripete ogni
  // 3 giorni: qualunque sia la fase, un giorno è di riposo o di lavoro per TUTTI.
  // Sui giorni di lavoro i token sono le SEZIONI (diverse per ognuno: non c'è
  // niente da votare). Sui riposi invece il tipo è una scelta di squadra (RM
  // mensile, D disponibilità) e si può votare: vale il token che i compagni
  // rotanti mostrano davvero in quel giorno del ciclo.
  const riposoSquadra = []
  for (let i = 0; i < N; i++) {
    const voti = new Map()
    for (const m of rotanti) {
      if (!inRiposo(m, i)) continue
      const t = patternOf(m)[i] ?? ''
      if (!t || isSection(t)) continue
      voti.set(t, (voti.get(t) ?? 0) + 1)
    }
    const [tok, n] = [...voti.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    if (tok && n >= 2) riposoSquadra[i] = tok
  }

  for (const m of ms) {
    const pat = patternOf(m)
    const sez = pat.filter(isSection).length
    const fase = fasi.get(m.id)
    if (!fase) { report.push(`${m.full_name.padEnd(18)} non ruota (nessun turno di sezione nel pattern)`); continue }
    const copertura = fase.tot ? fase.ok / fase.tot : 0
    const ricostruito = Array.from({ length: N }, (_, i) => {
      const canonico = grid[(i + fase.s) % grid.length]
      return isSection(canonico) ? canonico : riposoSquadra[i] ?? canonico
    })
    const attesi = ricostruito.filter(isSection).length
    if (copertura >= 0.9 && fase.tot >= 8 && sez >= 0.75 * attesi) {
      report.push(`${m.full_name.padEnd(18)} griglia +${String(fase.s).padStart(2)} (${fase.ok}/${fase.tot} sezioni, ${sez}/${attesi} turni) — già coerente, non si tocca`)
      continue
    }
    if (fase.s < 0 || fase.tot < 8 || copertura < 0.9) {
      report.push(`${m.full_name.padEnd(18)} storia NON ricostruibile (${sez} turni, ${fase.ok}/${fase.tot} in griglia) — pattern lasciato com'è`)
      continue
    }
    nuove.set(m.id, ricostruito)
    report.push(`${m.full_name.padEnd(18)} RICOSTRUITO dalla griglia +${fase.s}: ${sez} → ${attesi} turni di sezione, 0 G (${fase.ok}/${fase.tot} sezioni storiche confermate)`)
  }
  return report
}

const typeById = new Map((types ?? []).map(t => [t.id, t]))
const teamById = new Map((teams ?? []).map(t => [t.id, t]))

// ── 1) periodo modale per tipologia ──────────────────────────────────────────
const perType = new Map() // type_id → { N, members: [{m, seq}] }
for (const m of members ?? []) {
  if (!m.is_active) continue
  const team = teamById.get(m.team_id)
  const type = typeById.get(team?.shift_type_id)
  if (!type?.is_active) continue
  const seq = memberSeq(m.full_name)
  const entry = perType.get(type.id) ?? { type, N: 0, members: [] }
  entry.members.push({ m, seq })
  const found = minimalPeriod(seq)
  if (found) {
    entry.periods = entry.periods ?? new Map()
    entry.periods.set(found.p, (entry.periods.get(found.p) ?? 0) + 1)
  }
  perType.set(type.id, entry)
}
for (const entry of perType.values()) {
  if (!entry.periods) continue
  let bestP = 0, bestN = 0
  for (const [p, n] of entry.periods) if (n > bestN) { bestP = p; bestN = n }
  entry.N = bestP
}

// ── 2) anteprima / applicazione ──────────────────────────────────────────────
const backup = { taken_at: new Date().toISOString(), types: types ?? [], members: members ?? [], templates: templates ?? [] }
if (APPLY) {
  const bakPath = path.join('scripts', `backup-rotation-${Date.now()}.json`)
  fs.writeFileSync(bakPath, JSON.stringify(backup, null, 2))
  console.log(`Backup scritto: ${bakPath}`)
}

const changes = []
for (const { type, N, members: ms } of perType.values()) {
  if (!N) { console.log(`\n${type.name}: nessun periodo deducibile, salto`); continue }
  if (N !== type.cycle_days) changes.push({ kind: 'type', id: type.id, from: type.cycle_days, to: N, name: type.name })
  console.log(`\n== ${type.name}: cycle_days ${type.cycle_days} → ${N} — pattern_start → ${COMMON_ANCHOR} ==`)
  // 2a) pattern derivato dalla storia di ciascuno
  const nuove = new Map()
  const note = []
  for (const { m, seq } of ms) {
    if (seq.size >= 28) {
      const ownFirst = Math.min(...seq.keys())
      const { pattern, empty } = buildPattern(seq, N, dayKey(COMMON_ANCHOR), ownFirst)
      nuove.set(m.id, pattern)
      if (empty > 0) note.push(`  ${m.full_name}: ${empty}/${N} classi vuote (riempite se possibile)`)
    } else {
      // niente storia PDF: ripete il pattern esistente fino a riempire N
      const old = m.pattern ?? []
      nuove.set(m.id, Array.from({ length: N }, (_, i) => old[i % (old.length || 1)] ?? ''))
      note.push(`  ${m.full_name}: senza storia PDF — pattern esistente ripetuto (${old.length}→${N})`)
    }
  }
  // 2b) allineamento di squadra: chi non ha più una rotazione nella propria
  //     storia la ricostruisce dalla griglia dei compagni (vedi alignTeam).
  for (const team of (teams ?? []).filter(t => t.shift_type_id === type.id)) {
    const membri = ms.filter(x => x.m.team_id === team.id)
    const report = alignTeam(team, membri, N, nuove)
    if (report.length) console.log(`  ── squadra «${team.name}» ──\n    ${report.join('\n    ')}`)
  }
  // 2c) anteprima dei pattern finali
  for (const { m } of ms) {
    const newPattern = nuove.get(m.id)
    const diff = selezionato(m) && JSON.stringify(newPattern) !== JSON.stringify(m.pattern)
    if (diff) changes.push({ kind: 'member', id: m.id, name: m.full_name, len: newPattern.length })
    const sample = newPattern.slice(0, 6).join(' ')
    const stato = !selezionato(m) ? '(fuori da --only)' : diff ? '(CAMBIA)' : '(invariato)'
    console.log(`  ${m.full_name.padEnd(18)} pattern[${newPattern.length}] es: ${sample} ${stato}`)
    if (DUMP) console.log(`      ${JSON.stringify(newPattern)}`)
    if (APPLY && diff) {
      await patch('shift_team_members', `?id=eq.${m.id}`, { pattern: newPattern })
    }
  }
  // 2d) cicli di catalogo: quelli la cui copia è identica a un pattern appena
  //     corretto seguono il membro (stesso contenuto, stessa lunghezza, stesso
  //     ciclo/ancora; cambia solo il pattern).
  for (const { m } of ms) {
    if (!selezionato(m)) continue
    const nuovo = nuove.get(m.id)
    if (JSON.stringify(nuovo) === JSON.stringify(m.pattern)) continue
    const vecchio = JSON.stringify(m.pattern)
    for (const t of (templates ?? []).filter(t => t.team_id === m.team_id && JSON.stringify(t.pattern) === vecchio)) {
      console.log(`  ↳ ciclo di catalogo «${t.name}»: allineato al pattern corretto di ${m.full_name}`)
      if (APPLY) await patch('shift_cycle_templates', `?id=eq.${t.id}`, { pattern: nuovo })
    }
  }
  if (note.length) console.log(note.join('\n'))
  if (APPLY) {
    await patch('shift_types', `?id=eq.${type.id}`, { cycle_days: N, pattern_start: COMMON_ANCHOR })
  }
}

console.log(`\n── Riepilogo: ${changes.length} modifiche ${APPLY ? 'APPLICATE' : 'in anteprima (dry-run)'} ──`)
if (!APPLY) console.log('Rilancia con --apply per scrivere (prima viene salvato un backup JSON in scripts/).')
