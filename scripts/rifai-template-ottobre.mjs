// I TEMPLATE DI TURNO RIFATI DA ZERO SULL'ASSET DI OTTOBRE 2026 (27/09/2026).
//
// I 82 template di `shift_cycle_templates` erano uno per persona, con nome
// «SQUADRA-CAPO · NOME», e contenevano l'assetto VECCOLO: applicarne uno oggi
// avrebbe rimesso il ciclo di settembre da domani in poi. Erano quindi una
// trappola, non un catalogo.
//
// Qui vengono ricostruiti sull'assetto in vigore dal 1° ottobre 2026 (la riga
// di storico dei cicli) e rinominati per SLOT, cioè per la posizione che la
// persona ricopre, con il nome del dipendente solo come riferimento.
//
// Lo slot è diverso per gruppo, perché la struttura è diversa:
//  - rilievo: lo SFAALSAMENTO nel ciclo da 252 (2, 9, 16, 23, 30, 226, 233,
//    240, 247): nove numeri per nove persone, ed è l'unico slot che esiste in
//    modo naturale. Lo slot può cambiare nel tempo (COCOZZA 37 → 226).
//  - squadre in seconda: la RIGA, cioè la fase sulla griglia; i cinque membri
//    coprono le stesse sezioni in ordine diverso.
//  - terza: NON c'è una ruota comune (le 36 persone che lavorano hanno 52–53
//    turni di sezione e 36 sequenze diverse), quindi lo slot è una
//    numerazione progressiva. Numerazione e ordine vengono dalle RIGHE DEL PDF,
//    dall'alto verso il basso, come chiesto: è l'ordine in cui l'ufficio li
//    vede. Chi non è nel PDF cade in coda, nell'ordine del pannello.
//  - caposquadra e posti fissi: nome dedicato, non ruotano.
//  - posto vacante: entra come template, così è pronto da assegnare.
//
//   node scripts/rifai-template-ottobre.mjs            # dry-run
//   node scripts/rifai-template-ottobre.mjs --apply
//   node scripts/rifai-template-ottobre.mjs --annulla
import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')
const ANNULLA = process.argv.includes('--annulla')
const ASSET = '2026-10-01'
const MAIN = 'zrbbzfingrdpdflkndgl'
const PDF_MESE = '2026-10'
const NOTE = 'Asset ottobre 2026 (dal 1° ottobre) ricostruito il 27/09/2026: nome per slot, la persona è solo un riferimento.'

let dir = process.cwd()
let env = null
for (;;) {
  const f = path.join(dir, '.env.local')
  if (fs.existsSync(f)) {
    env = {}
    for (const r of fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    break
  }
  const su = path.dirname(dir)
  if (su === dir) break
  dir = su
}
if (!env?.NEXT_PUBLIC_SUPABASE_URL) throw new Error('.env.local non trovata')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const devRest = (t, s) => fetch(`${url}/rest/v1/${t}${s}`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
}).then(async r => {
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error(`${t}: ${JSON.stringify(j).slice(0, 200)}`)
  return j
})
const devPatch = (t, q, body) => fetch(`${url}/rest/v1/${t}${q}`, {
  method: 'PATCH',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify(body),
}).then(async r => { if (!r.ok) throw new Error(`PATCH ${t}: ${r.status} ${(await r.text()).slice(0, 200)}`); return true })
const devPost = (t, body, prefer = 'return=minimal') => fetch(`${url}/rest/v1/${t}`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: prefer },
  body: JSON.stringify(body),
}).then(async r => {
  if (!r.ok) throw new Error(`POST ${t}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  // con return=minimal il corpo è vuoto: va letto solo se c'è qualcosa
  const testo = await r.text()
  return testo ? JSON.parse(testo) : null
})
const devDelete = (t, q) => fetch(`${url}/rest/v1/${t}${q}`, {
  method: 'DELETE',
  headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
}).then(async r => { if (!r.ok) throw new Error(`DELETE ${t}: ${r.status} ${(await r.text()).slice(0, 200)}`); return true })
const mainQuery = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${MAIN}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

// ── rollback ──────────────────────────────────────────────────────────────────
if (ANNULLA) {
  const file = fs.readdirSync('scripts').filter(f => f.startsWith('backup-template-')).sort().pop()
  if (!file) throw new Error('nessun backup in scripts/backup-template-*.json')
  const bak = JSON.parse(fs.readFileSync(path.join('scripts', file), 'utf8'))
  console.log(`rollback da ${file}: ripristino i ${bak.template.length} template di prima`)
  for (const t of bak.template) {
    await devPost('shift_cycle_templates', {
      id: t.id, shift_type_id: t.shift_type_id, team_id: t.team_id, name: t.name,
      description: t.description, pattern: t.pattern, cycle_days: t.cycle_days,
      pattern_start: t.pattern_start, is_builtin: t.is_builtin,
    })
  }
  console.log('fatto')
  process.exit(0)
}

const [tipi, squadre, membri, storico, template] = await Promise.all([
  devRest('shift_types', '?select=id,name,cycle_days,pattern_start&order=sort_order'),
  devRest('shift_teams', '?select=id,name,shift_type_id,sort_order&order=sort_order'),
  devRest('shift_team_members', '?select=id,full_name,team_id,sort_order,is_lead,pattern'),
  devRest('shift_member_patterns', `?select=member_id,from_date,pattern&from_date=eq.${ASSET}`),
  devRest('shift_cycle_templates', '?select=*&order=name'),
])
const tipoDi = new Map(squadre.map(s => [s.id, tipi.find(t => t.id === s.shift_type_id)]))
const cicloDi = new Map(storico.map(s => [s.member_id, (s.pattern ?? []).map(String)]))

const isSezione = t => /^[MNP]\d/.test(t ?? '')
const sezDi = t => t.replace(/^[MNP]/, '').replace(/[TS]$/, '')
const sezioni = p => p.map(sezDi).filter(x => /^\d/.test(x))
const turniDi = p => [...new Set(p.filter(isSezione).map(t => t[0]))].sort().join('')
const postDi = p => [...new Set(p.filter(t => !isSezione(t) && !['RC', 'RI', 'RM', 'D', 'G', ''].includes(t)))]
const riposa = p => p.every(t => !isSezione(t))
const ruota = (p, k) => p.map((_, i) => p[(i + k) % p.length])
const scarti = (a, b) => a.reduce((n, t, i) => n + (t === b[i] ? 0 : 1), 0)

/** Di quanto una persona si discosta dalla fase attesa del suo terzetto. */
function faseDi(ref, p) {
  if (ref.length !== p.length) return null
  for (const k of [0, 28, 56]) {
    if (k >= p.length) continue
    const d = scarti(ruota(ref, k), p)
    if (d <= TOLLERANZA) return { fase: k, scarti: d }
  }
  return null
}
// ESPOSITO AL. è la fase 56 del suo terzetto ma con un `D` il 22/03 dove gli
// altri due hanno M8: una giornata sua, non un refuso (verificato con
// `verifica-terzetti-ordine.mjs`). Tollero 2 token per non scartarlo dal
// terzetto, ma il nome dice che è la fase 56 e la descrizione porta il conto.
const TOLLERANZA = 2

// L'ordine delle righe del PDF: è l'ordine in cui l'ufficio vede le persone.
const righePdf = await mainQuery(`select schedule from sala_schedule where month = '${PDF_MESE}' order by uploaded_at desc limit 1`)
const nomiPdf = (righePdf?.[0]?.schedule?.names ?? []).map(n => String(n).toUpperCase())
const ordinePdf = new Map(nomiPdf.map((n, i) => [n, i]))
const chiave = nome => {
  const U = nome.toUpperCase()
  if (ordinePdf.has(U)) return U
  const senza = U.replace(/ [A-Z]\.?$/, '')
  if (ordinePdf.has(senza)) return senza
  return U
}
/** Posizione della riga nel PDF; chi non c'è va in coda, nell'ordine del pannello. */
const ordinePdfIdx = nome => {
  const k = chiave(nome)
  return ordinePdf.has(k) ? ordinePdf.get(k) : 100000
}
console.log(`PDF di ${PDF_MESE}: ${nomiPdf.length} righe, ordine di lettura preso da lì\n`)

// Chi subentra a chi. Non sono una regola, sono i fatti di organico: dal
// 1°October 2026 COPPOLA prende il posto di CASTELLONE in ASTER, quindi il
// template di quel ciclo è di COPPOLA anche se il ciclo è quello che oggi è
// ancora intestato a CASTELLONE (che sta nei PDF fino a settembre: riga 74,
// e non è più in quello di ottobre). COPPOLA compare già nel PDF di settembre
// (riga 95) e in quello di ottobre (riga 76), ma non ha ancora un membro in dev.
const SOSTITUZIONI = {
  CASTELLONE: { squadra: 'ASTER', dal: '2026-10-01', con: 'COPPOLA' },
}
const subentrato = m => {
  const s = SOSTITUZIONI[m.full_name]
  if (!s) return null
  if (s.squadra && !/ASTER/i.test(s.squadra)) return null
  return s
}

// Fatti che il nome non dice ma che spiegano perché un ciclo sembra strano.
const NOTE_PERSONA = {
  'ESPOSITO AL.': 'Ingresso ufficiale in squadra dal 1°April 2026: il ciclo vale anche per marzo, ma quei turni sono provvisori — il PDF di aprile e maggio non lo ricostruisce (1/30 e 16/31, e nessuna delle 28 fasi del terzetto li riproduce). Da giugno il ciclo combacia. Non è un refuso da correggere.',
}

// ── lo slot di ciascuno ───────────────────────────────────────────────────────
// Rilievo: lo sfalsamento nel ciclo da 252. Lo ricavo riallineando il ciclo
// della persona al ciclo generico del template, così non lo prendo a mano.
const blocchi = JSON.parse(fs.readFileSync(path.join('scripts', 'dati-template-ottobre.json'), 'utf8'))
const grezzo = blocchi.find(b => b.titolo === 'SCORTE RILIEVO').righe.flat()
const T252 = grezzo.map(t => (t.includes('*') ? t.replace('*', 'J') : t))
const slotDiPattern = p => {
  for (let k = 0; k < T252.length; k++) {
    const ruotato = Array.from({ length: T252.length }, (_, i) => T252[(i + k) % T252.length])
    if (ruotato.length === p.length && ruotato.every((t, i) => t === p[i])) return k
  }
  return null
}

const perSquadra = new Map()
for (const m of membri) {
  const p = cicloDi.get(m.id) ?? (m.pattern ?? []).map(String)
  if (!p.length) continue
  if (!perSquadra.has(m.team_id)) perSquadra.set(m.team_id, [])
  perSquadra.get(m.team_id).push({ m, p })
}

// ── i terzetti della terza: chi è nella stessa fase di chi ───────────────────
// membri della squadra in terza → { id: { terzetto, fase, scarti } }
const terzettoDi = new Map()
for (const sq of squadre) {
  if (tipoDi.get(sq.id)?.name !== 'Squadra in terza') continue
  const lista = (perSquadra.get(sq.id) ?? []).filter(x => !riposa(x.p))
  const ordinePdf = x => ordinePdfIdx(x.m.full_name)
  const gruppi = []
  const presi = new Set()
  for (let i = 0; i < lista.length; i++) {
    if (presi.has(i)) continue
    const ref = lista[i]
    const f = faseDi(ref.p, ref.p) // sé stesso è la fase 0
    const gruppo = [{ i, fase: 0, scarti: 0 }]
    presi.add(i)
    for (let j = i + 1; j < lista.length; j++) {
      if (presi.has(j)) continue
      const g = faseDi(ref.p, lista[j].p)
      if (g) { gruppo.push({ i: j, fase: g.fase, scarti: g.scarti }); presi.add(j) }
    }
    gruppi.push(gruppo)
  }
  gruppi.sort((a, b) => ordinePdf(lista[a[0].i]) - ordinePdf(lista[b[0].i]))
  gruppi.forEach((gruppo, k) => {
    for (const { i, fase, scarti: sc } of gruppo) {
      terzettoDi.set(lista[i].m.id, { terzetto: k + 1, fase: fase / 28, scarti: sc })
    }
  })
  const tagli = gruppi.map((g, k) => `  terzetto ${k + 1}: ${g.map(x => `${lista[x.i].m.full_name} (fase ${x.fase / 28 + 1}${x.scarti ? `, ${x.scarti} token di scarto` : ''})`).join(' · ')}`)
  console.log(`\n${sq.name}: ${lista.length} che ruotano, ${gruppi.length} terzetti`)
  for (const t of tagli) console.log(t)
}

const nuovi = []
const problemi = []
for (const sq of squadre) {
  const tipo = tipoDi.get(sq.id)
  const lista = (perSquadra.get(sq.id) ?? []).sort((a, b) => {
    const ka = ordinePdf.get(chiave(a.m.full_name)) ?? 10000 + a.m.sort_order
    const kb = ordinePdf.get(chiave(b.m.full_name)) ?? 10000 + b.m.sort_order
    return ka - kb
  })
  if (!lista.length) continue
  const nelPdf = lista.filter(x => {
    const sub = subentrato(x.m)
    const n = sub ? sub.con : x.m.full_name
    return ordinePdf.has(chiave(n))
  }).length
  const ruotano = lista.filter(x => !riposa(x.p))
  const base = {
    shift_type_id: sq.shift_type_id,
    team_id: sq.id,
    cycle_days: 0,
    pattern_start: tipo?.pattern_start ?? '2026-03-01',
    is_builtin: true,
  }

  for (const { m, p } of lista) {
    const lung = p.length
    let slot
    let descrizione
    const sub = subentrato(m)
    const persona = sub ? sub.con : m.full_name
    const post = postDi(p).slice(0, 2).sort()
    const ordine = lista.findIndex(x => x.m.id === m.id) + 1
    // Il nome porta anche la RIGA DEL PDF, perché il bisogno operativo è
    // trovare il template partendo da una riga del PDF. La riga è cercata sul
    // nome di CHI OCCUPA lo slot (per un subentro è il nuovo arrivato, non chi
    // è uscito) ed è quella del mese di riferimento: va ricalcolata se il PDF
    // viene ricaricato con un ordine diverso, perché fra maggio e giugno
    // ESPOSITO AL. passa dalla riga 67 alla 47 senza che nessuno abbia cambiato
    // squadra.
    const k = ordinePdf.has(chiave(persona)) ? chiave(persona) : chiave(m.full_name)
    const riga = ordinePdf.has(k) ? ` · PDF ${ordinePdf.get(k) + 1} ${PDF_MESE}` : ''
    if (tipo?.name === 'Squadra in terza' && !riposa(p)) {
      // Le 9 persone che ruotano sono TRE terzetti: dentro un terzetto i tre
      // hanno lo stesso identico ciclo con la fase sfalsata di 28 e 56 giorni,
      // quindi la fase è la loro postizione e l'uno con la stessa fase fa gli
      // stessi turni (è lui che si mette in sostituzione). I tre terzetti hanno
      // invece sequenze diverse fra loro: il numero del terzetto è una
      // convenzione e prende la posizione della prima persona che compare
      // nelle righe del PDF, dall'alto verso il basso.
      const g = terzettoDi.get(m.id)
      if (!g) { problemi.push(`${m.full_name}: non sta in nessun terzetto (fasi 0/28/56)`); continue }
      slot = `terzetto ${g.terzetto} fase ${g.fase + 1}`
      const scarto = g.scarti ? ` ATTENZIONE: ${g.scarti} token diverso/i dagli altri del terzetto (turni suoi, non un refuso).` : ''
      descrizione = `Terzetto ${g.terzetto} della squadra, fase ${g.fase + 1} (ciclo ruotato di ${g.fase} giorni).${scarto} ${NOTE}`
    } else if (/^Rilievo [A-D]$/.test(sq.name)) {
      const n = slotDiPattern(p)
      if (n === null) problemi.push(`${m.full_name}: il suo ciclo da ${lung} non è una rotazione del template del rilievo`)
      slot = `slot ${n ?? '?'}`
      descrizione = `Super-ciclo da 252, slot ${n ?? '?'}: la posizione nel ciclo, ed è quella che lo tiene in un posto diverso dagli altri otto. ${NOTE}`
    } else if (!riposa(p) && ['Squadra arancione', 'Squadra verde', 'Squadra rosa'].includes(sq.name)) {
      const k2 = ruotano.findIndex(x => x.m.id === m.id) + 1
      const prima = sezioni(p)[0]
      slot = `riga ${k2}`
      descrizione = `Riga ${k2} della griglia (dal PDF, dall'alto verso il basso), parte dalla sezione ${prima}. ${NOTE}`
    } else if (post.length) {
      slot = `post ${post.join('/')}`
      descrizione = `Posto fisso, non ruota. ${NOTE}`
    } else {
      slot = `slot ${ordine}`
      descrizione = `Posto ${ordine} della squadra nell'ordine del PDF. ${NOTE}`
    }
    const nome = `${sq.name} · ${slot}${riga} (${persona})`
    if (sub) {
      descrizione = `Dal ${sub.dal} al posto di ${m.full_name}, che resta nei PDF fino a settembre. ${descrizione}`
    }
    if (NOTE_PERSONA[m.full_name]) descrizione = `${NOTE_PERSONA[m.full_name]} ${descrizione}`
    nuovi.push({ ...base, name: nome, description: descrizione, pattern: p, cycle_days: lung })
  }
  if (nelPdf < lista.length) {
    const fuori = lista.filter(x => {
      const sub = subentrato(x.m)
      const n = sub ? sub.con : x.m.full_name
      return !ordinePdf.has(chiave(n))
    }).map(x => x.m.full_name)
    problemi.push(`${sq.name}: non sono nel PDF di ${PDF_MESE} → ${fuori.join(', ')} (numerati in coda, nell'ordine del pannello)`)
  }
}

// Il posto vacante della verde: il template è salvato nel piano di ottobre.
const piano = JSON.parse(fs.readFileSync(path.join('scripts', 'piano-pattern-2026-10.json'), 'utf8'))
const vacante = (piano.postiVacanti ?? []).find(v => /verde/i.test(v.squadra ?? ''))
if (vacante) {
  const sqVerde = squadre.find(s => s.name === vacante.squadra)
  const p = (vacante.template ?? []).map(String)
  if (sqVerde && p.length) {
    const k = (perSquadra.get(sqVerde.id) ?? []).filter(x => !riposa(x.p)).length
    nuovi.push({
      shift_type_id: sqVerde.shift_type_id,
      team_id: sqVerde.id,
      name: `${sqVerde.name} · riga ${k + 1} (vacante)`,
      description: `Posto vacante: la riga ${k + 1} della griglia è pronta (ciclo ruotato di ${vacante.rotazione}) ma nessuno la occupa. ${NOTE}`,
      pattern: p,
      cycle_days: p.length,
      pattern_start: tipoDi.get(sqVerde.id)?.pattern_start ?? '2026-03-01',
      is_builtin: true,
    })
  }
}

console.log(`template da scrivere: ${nuovi.length} (ora ne sono ${template.length})`)
const duplicati = nuovi.map(n => n.name).filter((n, i, a) => a.indexOf(n) !== i)
if (duplicati.length) console.log(`  ATTENZIONE nomi duplicati: ${[...new Set(duplicati)].join(', ')}`)
if (problemi.length) {
  console.log('\nda controllare:')
  for (const x of problemi) console.log(`  ${x}`)
}

console.log('\n  nome nuovo                                        → nome vecchio')
const vecchioDi = (persona, ancheSubentrato) => {
  const cand = [persona.toUpperCase(), persona.toUpperCase().replace(/ [A-Z]\.?$/, '')]
  if (ancheSubentrato) cand.push(ancheSubentrato.toUpperCase())
  return template.find(t => {
    const n = String(t.name).toUpperCase()
    // i nomi nuovi chiudono con «(PERSONA)», quelli vecchi col nome scoperto
    return cand.some(c => n.endsWith(c) || n.endsWith(`${c})`))
  })
}
const mappa = []
for (const n of nuovi) {
  const persona = (n.name.match(/\(([^)]+)\)$/) ?? [])[1] ?? ''
  const sostituto = Object.entries(SOSTITUZIONI).find(([, s]) => s.con === persona)
  const vecchio = persona ? vecchioDi(persona, sostituto ? sostituto[0] : null) : null
  const uguale = vecchio && JSON.stringify(vecchio.pattern.map(String)) === JSON.stringify(n.pattern) ? ' · contenuto identico' : ''
  console.log(`  ${n.name.padEnd(50)} → ${vecchio ? vecchio.name : '(nuovo)'}${uguale}`)
  mappa.push({ nuovo: n, vecchio: vecchio ?? null })
}
const coperti = new Set(mappa.filter(x => x.vecchio).map(x => x.vecchio.id))
const daEliminare = template.filter(t => !coperti.has(t.id))
if (daEliminare.length) {
  console.log(`\n  template vecchi senza una persona corrispondente: ${daEliminare.length}`)
  for (const t of daEliminare) console.log(`    ${t.name} (${t.pattern?.length ?? 0} token)`)
}

if (!APPLY) {
  console.log('\nDRY-RUN: niente scritto. Rilancia con --apply (backup automatico).')
  process.exit(0)
}

const bakPath = path.join('scripts', `backup-template-${Date.now()}.json`)
fs.writeFileSync(bakPath, JSON.stringify({ salvato: new Date().toISOString(), template }, null, 2))
console.log(`\nbackup: ${bakPath}`)
for (const t of daEliminare) {
  await devDelete('shift_cycle_templates', `?id=eq.${t.id}`)
  console.log(`  eliminato: ${t.name}`)
}
for (const { nuovo, vecchio } of mappa) {
  if (vecchio) {
    await devPatch('shift_cycle_templates', `?id=eq.${vecchio.id}`, {
      name: nuovo.name, description: nuovo.description, pattern: nuovo.pattern,
      cycle_days: nuovo.cycle_days, pattern_start: nuovo.pattern_start,
      shift_type_id: nuovo.shift_type_id, team_id: nuovo.team_id,
    })
    console.log(`  aggiornato: ${vecchio.name} → ${nuovo.name}`)
  } else {
    await devPost('shift_cycle_templates', nuovo)
    console.log(`  creato: ${nuovo.name}`)
  }
}
console.log(`\nrollback: node scripts/rifai-template-ottobre.mjs --annulla`)
