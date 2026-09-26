// RICAVA I PATTERN DI OTTOBRE/NOVEMBRE 2026 — 26/09/2026.
//
// FONTE DEI PIANI: `teorici.xlsx` (file dell'utente), letto da
// scripts/estrai-template-xlsx.py → scripts/dati-template-ottobre.json.
// Il PDF di ottobre (MAIN) serve solo da VERIFICA: l'ancoraggio è già comune
// (pattern_start = 2026-03-01 su tutti i tipi) e la fase di ogni membro sta
// dentro il suo pattern.
//
// MODELLO «IN SECONDA» (letto dai template e confermato dal PDF)
//  - ogni squadra ruota su 84 giorni = 28 gruppi da 3 token
//    (turno P, turno M, marker di riposo);
//  - le sezioni seguono il ciclo 4,5,6,7,10 con UN solo salto di +3 (la
//    sezione avanza di 3 indici invece di 1): 27 passi + 3 = 30 ≡ 0 (mod 5),
//    così il ciclo chiude esattamente sui 28 gruppi;
//  - i 5 membri di una squadra hanno la STESSA sequenza di marker e la stessa
//    posizione dello salto: cambiano solo la fase di sezione (0..4);
//  - il CAPO squadra (ALBANO, DI MEO, LANGIONE) è su PDCIF/MDCIF e non ruota:
//    il suo pattern resta quello attuale.
//
// MODELLO «SCORTE DI RILIEVO»: ciclo di 252 giorni (9 settimane da 28), i 9
//  membri sono 9 slot distanti 7 giorni. `M*` è il turno J (→ `MJ`).
//
// USO
//   node scripts/ricava-pattern-ottobre.mjs            # solo report + piano
//   node scripts/ricava-pattern-ottobre.mjs --apply    # scrive su DEV
//   node scripts/ricava-pattern-ottobre.mjs --apply --dal=2026-11-01
import fs from 'node:fs'
import path from 'node:path'

const MESE = '2026-10'
const CICLO5 = ['4', '5', '6', '7', '10']
const MARKER = new Set(['D', 'RI', 'RC', 'RM'])
const APPLY = process.argv.includes('--apply')
const squadreBlocchi = { ALBANO: 'Squadra arancione', 'DI MEO': 'Squadra verde', LANGIONE: 'Squadra rosa' }
// fase di sezione dei membri che ruotano (dal PDF + le decisioni dell'utente)
const FASI = {
  'Squadra arancione': { 'CAIAZZO I.': 1, COSTANZO: 2, 'DI MICCO': 3, DONZELLI: 4, ABATE: 0 },
  'Squadra verde': { CETRANCOLO: 0, MAIO: 1, SICA: 2, COSENZA: 3, VACANTE: 4 },
  'Squadra rosa': { 'LONI A.': 0, ROTONDO: 1, "D'AURIA": 2, LUCIGNANO: 3, TURCO: 4 },
}
// spostamenti fra squadre (decisione dell'utente, 26/09/2026)
const SPOSTAMENTI = [
  { membro: 'DONZELLI', da: 'Maternità', a: 'Squadra arancione' },
  { membro: 'LONI A.', da: 'Rilievo D', a: 'Squadra rosa' },
]
const sezDi = t => t.replace(/^[MNP]/, '').replace(/T$/, '')

// ── env / connessioni ───────────────────────────────────────────────────────
let dir = process.cwd()
let env = null
for (;;) {
  const f = path.join(dir, '.env.local')
  if (fs.existsSync(f)) {
    env = {}
    for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    break
  }
  const su = path.dirname(dir)
  if (su === dir) break
  dir = su
}
if (!env?.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error('env mancanti in .env.local'); process.exit(1) }
const DEV = 'DEV'
const MAIN = 'zrbbzfingrdpdflkndgl'
const devRest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json())
const devPatch = (t, body) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}`, {
  method: 'PATCH',
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(body),
}).then(async r => { if (!r.ok) throw new Error(`PATCH ${t}: ${r.status} ${(await r.text()).slice(0, 300)}`); return r.json() })
const mainQuery = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${MAIN}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}
const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const gf = (a, b) => Math.round((pd(b) - pd(a)) / DAY)
const isoOf = (m, d) => `${m}-${String(d).padStart(2, '0')}`
const ruota = (p, o) => Array.from({ length: p.length }, (_, i) => p[(i + o) % p.length])

// ── dati ─────────────────────────────────────────────────────────────────────
const blocchi = JSON.parse(fs.readFileSync(path.join('scripts', 'dati-template-ottobre.json'), 'utf8'))
const [devTypes, devTeams, devMembers] = await Promise.all([
  devRest('shift_types', '?select=id,name,cycle_days,pattern_start'),
  devRest('shift_teams', '?select=id,shift_type_id,name,sort_order'),
  devRest('shift_team_members', '?select=id,team_id,full_name,pattern,sort_order,is_active'),
])
const [pdfRow] = await mainQuery(`select schedule, uploaded_at from sala_schedule where month='${MESE}'`)
const pdf = pdfRow.schedule
const pdfT = new Map()
pdf.names.forEach((n, i) => { const r = pdf.rows[i] ?? {}; pdfT.set(n.toUpperCase(), Array.from({ length: pdf.days }, (_, k) => pdf.codes[r.t?.[k] ?? 0] ?? '')) })
const typeById = new Map(devTypes.map(t => [t.id, t]))
const teamById = new Map(devTeams.map(t => [t.id, t]))
const info = m => {
  const t = teamById.get(m.team_id)
  const ty = typeById.get(t.shift_type_id)
  return { squadra: t.name, tipo: ty.name, anchor: ty.pattern_start, cycle: ty.cycle_days }
}
const teoricoDi = (pattern, anchor) => {
  const L = pattern.length
  return Array.from({ length: pdf.days }, (_, i) => pattern[(gf(anchor, isoOf(MESE, i + 1)) % L + L) % L] ?? '')
}
const confronta = (pattern, anchor, nomePdf) => {
  const riga = pdfT.get(nomePdf) ?? []
  const calc = teoricoDi(pattern, anchor)
  let ok = 0, cell = 0
  const diff = []
  riga.forEach((t, i) => {
    if (t === '') return
    cell++
    if (t === calc[i]) ok++
    else diff.push(`g${i + 1} pdf=${t} calc=${calc[i]}`)
  })
  return { ok, cell, diff, riga }
}
const nomePdf = m => m.full_name.toUpperCase().replace('NEVANO P.', 'NEVANO')

/** Allineamento sulla griglia a gruppi di 3: offset del marker e i gruppi. */
function griglia(token) {
  for (let off = 0; off < 3; off++) {
    const g = []
    let ok = true
    for (let i = off; i + 2 < token.length; i += 3) {
      if (!MARKER.has(token[i + 2])) { ok = false; break }
      g.push({ p: sezDi(token[i]), m: sezDi(token[i + 1]), mk: token[i + 2] })
    }
    if (ok && g.length >= 20) return { off, gruppi: g }
  }
  return null
}
const stampaGriglia = (nome, token) => {
  const gr = griglia(token)
  if (!gr) { console.log(`  ✗ ${nome}: ${token.length} token, griglia non riconosciuta`); return null }
  const sez = gr.gruppi.map(g => g.p)
  const salto = []
  for (let k = 1; k < sez.length; k++) {
    const atteso = CICLO5[(CICLO5.indexOf(sez[k - 1]) + 1) % 5]
    if (sez[k] !== atteso) salto.push(`g${k - 1}→g${k} (${sez[k - 1]}→${sez[k]}, ${((CICLO5.indexOf(sez[k]) - CICLO5.indexOf(sez[k - 1]) + 5) % 5) - 1 >= 0 ? '+' : ''}${((CICLO5.indexOf(sez[k]) - CICLO5.indexOf(sez[k - 1]) + 5) % 5) - 1})`)
  }
  const fase = CICLO5.indexOf(sez[0])
  console.log(`  ${nome}: ${token.length} token, griglia +${gr.off}, ${gr.gruppi.length} gruppi, fase ${fase}, salto: ${salto.length ? salto.join(' ') : '—'}`)
  return { gr, fase, salto }
}

const piano = { mese: MESE, generato: new Date().toISOString(), membri: [], spostamenti: SPOSTAMENTI, postiVacanti: [], note: [] }

// ══ 1. SQUADRE IN TERZA ═══════════════════════════════════════════════════
console.log('═══ 1. SQUADRE IN TERZA — P5T→PJ, M5T→MJ (+ 4 token corrotti) ═══')
{
  let ok = 0, cell = 0
  const scostamenti = []
  for (const m of devMembers.filter(x => info(x).tipo === 'Squadra in terza')) {
    const p = [...(m.pattern ?? [])]
    // Unico token corrotto da riparare: `M5T10` (PICCIRILLO, 6/10 = MJ nel
    // PDF). Sostituzione 1:1: NON si tocca la lunghezza, o la fase del
    // pattern si sposta e si romperebbe tutta la verifica.
    const riparati = []
    for (let i = 0; i < p.length; i++) if (p[i] === 'M5T10') { p[i] = 'M5T'; riparati.push(`${i}:M5T10→M5T`) }
    const nuovo = p.map(t => (t === 'P5T' ? 'PJ' : t === 'M5T' ? 'MJ' : t))
    const c = confronta(nuovo, info(m).anchor, m.full_name.toUpperCase())
    ok += c.ok; cell += c.cell
    if (c.diff.length) scostamenti.push(`  ${m.full_name}: ${c.diff.join(' | ')}`)
    piano.membri.push({ gruppo: 'terza', membro: m.full_name, squadra: info(m).squadra, id: m.id, anchor: info(m).anchor, periodo: nuovo.length, pattern: nuovo, riparazioni: riparati })
  }
  console.log(`  ${ok}/${cell} celle (${(100 * ok / cell).toFixed(1)}%)`)
  if (scostamenti.length) console.log(scostamenti.join('\n'))
  const rip = piano.membri.filter(m => m.riparazioni.length)
  if (rip.length) console.log(`  token riparati: ${rip.map(m => `${m.membro} [${m.riparazioni.join(', ')}]`).join(' · ')}`)
}

// ══ 2. SQUADRE IN SECONDA ══════════════════════════════════════════════════
// Il file dà 5 righe da 84 token per squadra: sono i 5 membri che RUOTANO,
//identificati dalla fase di sezione (0..4). La riga è scritta a partire da un
// confine di gruppo qualsiasi, quindi va RUOTATA: è il PDF di ottobre che
// dice di quanto (l'ancoraggio 2026-03-01 è comune e il pattern è 84 token).
console.log('\n═══ 2. SQUADRE IN SECONDA — rotazione di ogni riga calibrata sul PDF ═══')
const esitiSeconda = []
for (const [titolo, squadra] of Object.entries(squadreBlocchi)) {
  const blocco = blocchi.find(b => b.titolo === titolo)
  console.log(`
  ${squadra} (blocco «${titolo}»)`)
  const griglie = blocco.righe.map(r => stampaGriglia('', r))
  const fasiFile = griglie.map(x => x?.fase)
  console.log(`  fasi delle righe nel file: ${fasiFile.join(', ')}`)
  const usate = new Map()          // riga -> membro
  const rotazioni = []             // rotazioni trovate (una sola, comune)
  // Prima i membri verificabili sul PDF, poi quelli senza riscontro (ROTONDO
  // tutto G, posto vacante): prendono la riga rimasta.
  const prima = Object.keys(FASI[squadra]).filter(n => n !== 'VACANTE' && n !== 'ROTONDO')
  const poi = Object.keys(FASI[squadra]).filter(n => n === 'VACANTE' || n === 'ROTONDO')
  for (const nome of [...prima, ...poi]) {
    const m = devMembers.find(x => x.full_name === nome)
    if (nome !== 'VACANTE' && !m) { console.log(`    ${nome}: non trovato su dev`); continue }
    const soluzioni = []
    for (let i = 0; m && i < blocco.righe.length; i++) {
      if (usate.has(i)) continue
      for (let off = 0; off < 84; off++) {
        const cand = ruota(blocco.righe[i], off)
        const c = confronta(cand, info(m).anchor, m.full_name.toUpperCase())
        if (c.cell > 0 && c.diff.length === 0) soluzioni.push({ riga: i + 1, off, pattern: cand, celle: c.cell })
      }
    }
    if (soluzioni.length === 1) {
      const s0 = soluzioni[0]
      usate.set(s0.riga - 1, nome)
      rotazioni.push(s0.off)
      const spost = SPOSTAMENTI.find(x => x.membro === nome)
      console.log(`    ${nome.padEnd(17)} → riga ${s0.riga} ruotata di ${s0.off}  VERIFICATO ${s0.celle}/${s0.celle}${spost ? `  [sposta da ${spost.da}]` : ''}`)
      piano.membri.push({
        gruppo: 'seconda', membro: nome, squadra, id: m.id, anchor: info(m).anchor, periodo: 84,
        riga: s0.riga, rotazione: s0.off, spostaDa: spost?.da, verificato: true, pattern: s0.pattern,
      })
    } else {
      const rigaPdf = pdfT.get(nome) ?? []
      const occupa = rigaPdf.filter(t => t !== '' && t !== 'G').length
      const libere = blocco.righe.map((_, i) => i).filter(i => !usate.has(i))
      const off = rotazioni.length ? rotazioni[0] : 65
      const iRiga = libere[0]
      if (nome === 'VACANTE' || libere.length === 1) {
        const pattern = ruota(blocco.righe[iRiga], off)
        console.log(`    ${nome.padEnd(17)} → riga ${iRiga + 1} ruotata di ${off}  (nessun riscontro dal PDF: ${occupa ? 'celle non confrontabili' : 'assente'})`)
        if (nome === 'VACANTE') {
          // Il posto vacante è un TEMPLATE pronto: nessun membro lo occupa, ma
          // si conserva per intero (riga, rotazione e pattern) così chi entrerà
          // prende il turno giusto e le verifiche di copertura possono metterlo
          // a confronto come membro fantasma.
          piano.postiVacanti.push({
            squadra, blocco: titolo, riga: iRiga + 1, rotazione: off, periodo: 84,
            anchor: devTypes.find(t => t.name === 'Squadra in seconda')?.pattern_start ?? '2026-03-01',
            template: pattern,
          })
          piano.note.push(`Posto vacante ${squadra}: riga ${iRiga + 1} del blocco ${titolo} ruotata di ${off} — template pronto, da assegnare a chi entrerà`)
        }
        else piano.membri.push({
          gruppo: 'seconda', membro: nome, squadra, id: m.id, anchor: info(m).anchor, periodo: 84,
          riga: iRiga + 1, rotazione: off, verificato: false, note: 'PDF di ottobre tutto G: nessun riscontro possibile', pattern,
        })
        usate.set(iRiga, nome)
      } else {
        console.log(`    ${nome.padEnd(17)} → NESSUNA rotazione riproduce il PDF`)
        console.log(`        pdf : ${rigaPdf.join(' ')}`)
      }
    }
  }
  console.log(`  righe usate: ${[...usate.entries()].map(([i, n]) => `${i + 1}=${n}`).join(' ')}`)
}

// ══ 3. SCORTE DI RILIEVO ═════════════════════════════════════════════════
console.log('\n═══ 3. SCORTE DI RILIEVO — ciclo da 252 giorni, slot a 7 giorni ═══')
{
  const blocco = blocchi.find(b => b.titolo === 'SCORTE RILIEVO')
  const T252 = blocco.righe.flat().map(t => (t === 'M*' ? 'MJ' : t))
  console.log(`  template: ${T252.length} token · ${blocco.righe.length} righe da ${blocco.righe[0].length}`)
  const slots = [226, 233, 240, 247, 2, 9, 16, 23, 30]
  const candidati = ['BOCCHETTI', 'DE GIOVANNI', 'COCOZZA', 'CENTOMANI', 'CORBI', 'MUCCI', 'GRECO', 'LONI A.', 'NEVANO P.', 'MAROTTA', 'DONZELLI']
  const trovati = {}
  for (const nome of candidati) {
    const m = devMembers.find(x => x.full_name === nome)
    if (!m) continue
    const riga = pdfT.get(nomePdf(m))
    if (!riga) { console.log(`  ${nome.padEnd(12)} assente dal PDF di ottobre`); continue }
    const offs = []
    for (let o = 0; o < T252.length; o++) {
      const p = ruota(T252, o)
      if (riga.every((t, i) => t === '' || p[(gf(info(m).anchor, isoOf(MESE, i + 1)) % T252.length + T252.length) % T252.length] === t)) offs.push(o)
    }
    trovati[nome] = offs
    const inSquadra = info(m).squadra
    console.log(`  ${nome.padEnd(12)} ${inSquadra.padEnd(16)} rotazioni valide: ${offs.length ? offs.join(',') : 'NESSUNA'}`)
  }
  for (const nome of candidati) {
    const offs = trovati[nome]
    const m = offs?.length === 1 ? devMembers.find(x => x.full_name === nome) : null
    if (!m) continue
    piano.membri.push({
      gruppo: 'rilievo', membro: nome, squadra: info(m).squadra, id: m.id, anchor: info(m).anchor,
      periodo: T252.length, slot: offs[0], pattern: ruota(T252, offs[0]), verificato: true,
    })
  }
  const usati = new Set(Object.values(trovati).filter(v => v.length === 1).map(v => v[0]))
  console.log(`  slot liberi del ciclo: ${slots.filter(s => !usati.has(s)).join(', ') || 'nessuno'}`)
}

fs.writeFileSync(path.join('scripts', `piano-pattern-${MESE}.json`), JSON.stringify(piano, null, 2))
console.log(`\npiano: ${piano.membri.length} membri → scripts/piano-pattern-${MESE}.json`)
for (const n of piano.note) console.log(`  · ${n}`)

// ─── 4. APPLY: i cicli in vigore DA UNA DATA (migration 037) ────────────────
// I pattern non vengono sovrascritti: si aggiunge una riga di storico che vale
// dal `--dal` (default 1° ottobre 2026). Scrivere il nuovo ciclo nella colonna
// avrebbe riscritto anche luglio, agosto e settembre, che hanno i loro PDF
// corretti; con lo storico ogni mese viene calcolato con il ciclo che valeva.
const argAnnulla = process.argv.find(a => a.startsWith('--annulla='))
if (argAnnulla) {
  // ROLLBACK: toglie le righe di storico di quella data e riporta i membri
  // nelle squadre di prima, usando l'ultimo backup scritto dall'--apply.
  const data = argAnnulla.slice('--annulla='.length)
  const baks = fs.readdirSync('scripts').filter(f => /^backup-pattern-${data}-\d+\.json$/.test(f)).sort()
  if (!baks.length) { console.error(`nessun backup per il ${data}: non posso annullare`); process.exit(1) }
  const bak = JSON.parse(fs.readFileSync(path.join('scripts', baks.at(-1)), 'utf8'))
  const righe = await devRest('shift_member_patterns', `?from_date=eq.${data}&select=id,member_id`)
  for (const r of righe ?? []) {
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/shift_member_patterns?id=eq.${r.id}`, {
      method: 'DELETE', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    })
  }
  for (const m of bak.membri) {
    const attuale = devMembers.find(x => x.id === m.id)
    if (attuale && attuale.team_id !== m.team_id) await devPatch(`shift_team_members?id=eq.${m.id}`, { team_id: m.team_id })
  }
  console.log(`annullato il ${data}: tolte ${(righe ?? []).length} righe di storico, squadre riportate a prima (backup ${baks.at(-1)})`)
  process.exit(0)
}
if (!APPLY) {
  console.log('\nDRY-RUN: nessuna scrittura. Usa --apply per scrivere su dev.')
} else {
  const argDal = process.argv.find(a => a.startsWith('--dal='))
  const DAL = argDal ? argDal.slice('--dal='.length) : '2026-10-01'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DAL)) { console.error(`--dal non è una data: ${DAL}`); process.exit(1) }
  const NOTE = `ciclo dal ${DAL} (template dell'utente, verificato sul PDF di ottobre)`
  console.log(`\n═══ 4. APPLY su DEV — cicli in vigore dal ${DAL} ═══`)

  // backup: lo stato delle righe che si toccano, più le righe di storico
  // già presenti per quella data (così un rollback è un DELETE secco).
  const idPiano = piano.membri.map(p => p.id)
  const backup = {
    salvato: new Date().toISOString(),
    dal: DAL,
    membri: devMembers.filter(m => idPiano.includes(m.id) || (piano.spostamenti ?? []).some(s => s.membro === m.full_name))
      .map(m => ({ id: m.id, full_name: m.full_name, team_id: m.team_id, pattern: m.pattern })),
    storicoPreesistente: (await devRest('shift_member_patterns', `?from_date=eq.${DAL}&select=id,member_id,from_date`)) ?? [],
  }
  const bakPath = path.join('scripts', `backup-pattern-${DAL}-${Date.now()}.json`)
  fs.writeFileSync(bakPath, JSON.stringify(backup, null, 2))
  console.log(`  backup: ${bakPath} (${backup.membri.length} membri, ${backup.storicoPreesistente.length} righe di storico preesistenti)`)

  // 1. gli spostamenti di squadra (decisione dell'utente): valgono da subito,
  //    perché l'assegnazione a una squadra non ha una «data di inizio» — la
  //    persona da ottobre fa il turno della squadra nuova.
  for (const s of piano.spostamenti ?? []) {
    const m = devMembers.find(x => x.full_name === s.membro)
    const t = devTeams.find(x => x.name === s.a)
    if (!m || !t) { console.log(`  ⚠ spostamento ${s.membro}: non applicato`); continue }
    if (m.team_id === t.id) { console.log(`  ${s.membro}: già nella squadra ${s.a}`); continue }
    const [agg] = await devPatch(`shift_team_members?id=eq.${m.id}`, { team_id: t.id })
    console.log(`  ${s.membro}: ${s.da} → ${s.a}${agg ? '' : '  ⚠ non scritto'}`)
  }

  // 2. i cicli: una riga di storico per membro, valida dal giorno indicato
  let scritte = 0, fallite = 0
  for (const p of piano.membri) {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/shift_member_patterns`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ member_id: p.id, from_date: DAL, pattern: p.pattern, note: NOTE }),
    })
    if (r.ok) scritte++
    else { fallite++; console.log(`  ⚠ ${p.membro}: ${r.status} ${(await r.text()).slice(0, 200)}`) }
  }
  console.log(`  cicli scritti: ${scritte}/${piano.membri.length}${fallite ? `  (${fallite} falliti)` : ''}`)
  for (const v of piano.postiVacanti ?? []) {
    console.log(`  · posto vacante ${v.squadra}: template pronto (riga ${v.riga}, ${v.periodo} token) — nessun membro assegnato`)
  }
  console.log(`\n  rollback: node scripts/ricava-pattern-ottobre.mjs --annulla=${DAL}  (elimina le righe di storico di quella data e riporta le squadre)`)
}
