// IL SUBENTRO IN ASTER: COPPOLA AL POSTO DI CASTELLONE (27/09/2026)
//
// Nei PDF CASTELLONE sta fino a settembre (riga 74) e da ottobre c'è COPPOLA
// (riga 76), che però non ha un membro in dev. L'utente non vuole un account
// (non ce l'ha nemmeno CASTELLONE: un membro è un nominativo in squadra, non un
// utente) e gli basta che il turno teorico di COPPOLA compaia in /turnisala,
// insieme al reale quando arriveranno i PDF.
//
// Il modello ha un solo modo per dire «questa persona non è in squadra»:
// un CICLO VUOTO (`tokenForMember` restituisce '' e il mese teorico la salta,
// vedi `lib/turni-teorici.ts`). Quindi:
//  - CASTELLONE: riga di storico dal 2026-10-01 con ciclo vuoto → esce.
//  - COPPOLA: membro nuovo in ASTER con colonna VUOTA e riga di storico dal
//    2026-09-01 con il SUO ciclo → entra.
//
// Il ciclo di COPPOLA NON è quello di CASTELLONE, e la verifica lo dice: la sua
// riga nei PDF è «RC RI» una volta a testa ogni sei giorni (periodo 7), e nessuna
// delle 84 fasi del ciclo di CASTELLONE la riproduce (la migliore fa 4 celle su
// 9). Qui il ciclo è derivato dai PDF di settembre e ottobre e verificato su
// entrambi prima di scrivere: 30/30 e 31/31. La sua riga compare nel PDF da
// SETTEMBRE, quindi il suo ciclo parte da allora e non dal 1°October.
//
//   node scripts/subentro-coppola-aster.mjs            # dry-run
//   node scripts/subentro-coppola-aster.mjs --apply
//   node scripts/subentro-coppola-aster.mjs --annulla
//
//   node scripts/subentro-coppola-aster.mjs            # dry-run
//   node scripts/subentro-coppola-aster.mjs --apply
//   node scripts/subentro-coppola-aster.mjs --annulla
import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')
const ANNULLA = process.argv.includes('--annulla')
const DAL = '2026-10-01'
const DAL_ENTRANTE = '2026-09-01'
const USCENTE = 'CASTELLONE'
const ENTRANTE = 'COPPOLA'
const SQUADRA = 'ASTER'
const MESI_RIF = ['2026-09', '2026-10']
const MAIN = 'zrbbzfingrdpdflkndgl'
const ANCHOR = '2026-03-01'
const DAY = 86400000
const pd = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const gg = (a, b) => Math.round((pd(b) - pd(a)) / DAY)

const mainQuery = async sql => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${MAIN}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`Management API ${r.status}: ${t.slice(0, 200)}`)
  return JSON.parse(t)
}

/** Il ciclo di COPPOLA dai PDF: il periodo più corto che spiega TUTTE le celle
 *  (piene e vuote) di tutti i mesi di riferimento, con la sequenza ricostruita. */
async function cicloDaiPdf(nome) {
  const perMese = new Map()
  for (const mese of MESI_RIF) {
    const s = (await mainQuery(`select schedule from sala_schedule where month='${mese}' order by uploaded_at desc limit 1`))[0]?.schedule
    if (!s?.names) continue
    const i = s.names.findIndex(n => String(n).toUpperCase() === nome)
    if (i < 0) continue
    const row = s.rows[i] ?? {}
    perMese.set(mese, Array.from({ length: s.days }, (_, k) => s.codes[row.t?.[k] ?? 0] ?? ''))
  }
  if (!perMese.size) return null
  const idxDi = (mese, giorno, periodo) =>
    ((gg(ANCHOR, `${mese}-${String(giorno).padStart(2, '0')}`) % periodo) + periodo) % periodo
  for (let periodo = 1; periodo <= 84; periodo++) {
    const seq = new Array(periodo).fill('')
    let va = true
    for (const [mese, turni] of perMese) {
      for (let k = 0; k < turni.length && va; k++) {
        if (!turni[k]) continue
        const idx = idxDi(mese, k + 1, periodo)
        if (seq[idx] === '') seq[idx] = turni[k]
        else if (seq[idx] !== turni[k]) va = false
      }
    }
    if (!va || !seq.some(Boolean)) continue
    const spiegaTutto = [...perMese].every(([mese, turni]) =>
      turni.every((t, k) => seq[idxDi(mese, k + 1, periodo)] === t))
    if (spiegaTutto) return { periodo, seq, perMese }
  }
  return null
}

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
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const rest = (t, s) => fetch(`${url}/rest/v1/${t}${s}`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
}).then(async r => {
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error(`${t}: ${JSON.stringify(j).slice(0, 200)}`)
  return j
})
const patch = (t, q, body) => fetch(`${url}/rest/v1/${t}${q}`, {
  method: 'PATCH',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify(body),
}).then(async r => { if (!r.ok) throw new Error(`PATCH ${t}: ${r.status} ${(await r.text()).slice(0, 200)}`); return true })
const post = (t, body, prefer = 'return=representation') => fetch(`${url}/rest/v1/${t}`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: prefer },
  body: JSON.stringify(body),
}).then(async r => {
  const t = await r.text()
  if (!r.ok) throw new Error(`POST ${t}: ${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
})

if (ANNULLA) {
  const file = fs.readdirSync('scripts').filter(f => f.startsWith('backup-subentro-')).sort().pop()
  if (!file) throw new Error('nessun backup in scripts/backup-subentro-*.json')
  const bak = JSON.parse(fs.readFileSync(path.join('scripts', file), 'utf8'))
  console.log(`rollback da ${file}`)
  if (bak.uscente.riga) {
    await patch('shift_member_patterns', `?member_id=eq.${bak.uscente.id}&from_date=eq.${DAL}`, { pattern: bak.uscente.riga })
    console.log(`  ${USCENTE}: riga del ${DAL} rimossa (torna in squadra da quel giorno)`)
  }
  if (bak.entrante) {
    await fetch(`${url}/rest/v1/shift_member_patterns?member_id=eq.${bak.entrante.id}`, {
      method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
    })
    await patch('shift_team_members', `?id=eq.${bak.entrante.id}`, { is_active: false })
    console.log(`  ${ENTRANTE}: membro disattivato e storico rimosso (era in squadra solo dal ${DAL})`)
  }
  process.exit(0)
}

const squadre = await rest('shift_teams', '?select=id,name,shift_type_id,sort_order&order=sort_order')
const sq = squadre.find(s => s.name === SQUADRA)
if (!sq) throw new Error(`squadra ${SQUADRA} non trovata`)
const membri = await rest('shift_team_members', '?select=id,full_name,team_id,sort_order,is_active,user_id,pattern&order=sort_order')
const storico = await rest('shift_member_patterns', '?select=id,member_id,from_date,pattern')
const uscente = membri.find(m => m.full_name === USCENTE)
if (!uscente) throw new Error(`${USCENTE} non è un membro`)
const entranteGia = membri.find(m => m.full_name === ENTRANTE)

const righeUscente = storico.filter(s => s.member_id === uscente.id).sort((a, b) => a.from_date.localeCompare(b.from_date))
const cicloPrimaDelDao = righeUscente.filter(s => s.from_date <= '2026-09-30').pop()
if (!cicloPrimaDelDao) throw new Error(`${USCENTE} non ha nessun ciclo prima del 1°October`)

// Il ciclo di COPPOLA viene dai PDF, non da CASTELLONE: sono due asset diversi.
const derivato = await cicloDaiPdf(ENTRANTE)
if (!derivato) throw new Error(`non sono riuscito a ricavare un ciclo per ${ENTRANTE} dai PDF di ${MESI_RIF.join(' e ')}`)
const cicloEntrante = derivato.seq.map(String)
const righeEntrante = entranteGia ? storico.filter(s => s.member_id === entranteGia.id) : []
const giaUscente = righeUscente.find(s => s.from_date === DAL)

console.log(`${SQUADRA}:`)
console.log(`  ${USCENTE}: ${uscente.user_id ? 'collegato a un utente' : 'senza utente (come gli altri non utenti)'}, ${righeUscente.length} righe di storico`)
console.log(`    ultimo ciclo prima del 1°October: ${cicloPrimaDelDao.pattern.length} token (dal ${cicloPrimaDelDao.from_date})`)
console.log(`    riga del ${DAL}: ${giaUscente ? `${giaUscente.pattern.length} token` : 'non c\'è ancora'}`)
console.log(`  ${ENTRANTE}: ${entranteGia ? `già membro (attivo: ${entranteGia.is_active})` : 'non è ancora un membro'}`)
console.log(`    ciclo derivato dai PDF: periodo ${derivato.periodo} giorni · ${cicloEntrante.map(x => x || '·').join(' ')}`)
for (const [mese, turni] of derivato.perMese) {
  const piene = turni.filter(Boolean).length
  const idx = d => ((gg(ANCHOR, d) % derivato.periodo) + derivato.periodo) % derivato.periodo
  let ok = 0
  for (let k = 0; k < turni.length; k++) if (cicloEntrante[idx(`${mese}-${String(k + 1).padStart(2, '0')}`)] === turni[k]) ok++
  console.log(`    ${mese}: ${ok}/${turni.length} combaciano (${piene} celle piene nel PDF)`)
}
const righeSbagliate = righeEntrante.filter(s => {
  const attuale = (s.pattern ?? []).map(String)
  return attuale.length !== cicloEntrante.length || attuale.some((t, i) => t !== cicloEntrante[i])
})
if (righeSbagliate.length) {
  console.log(`    righe da correggere: ${righeSbagliate.map(s => `${s.from_date} (${s.pattern.length} token)`).join(', ')}`)
}

if (giaUscente && giaUscente.pattern.length === 0) {
  console.log(`\n${USCENTE} è già uscito dal ${DAL}: niente da fare lato suo`)
} else {
  console.log(`\n${USCENTE}: aggiungo la riga del ${DAL} con ciclo VUOTO → da quel giorno non ha più turni in nessun mese teorico`)
}
if (entranteGia && entranteGia.is_active) {
  console.log(`${ENTRANTE}: è già un membro attivo; correggo le sue righe di storico (derivate dai PDF)`)
} else {
  console.log(`${ENTRANTE}: lo creo in ${SQUADRA} con la colonna VUOTA e la riga del ${DAL_ENTRANTE} col suo ciclo dai PDF`)
}
if (!APPLY) {
  console.log('\nDRY-RUN: niente scritto. Rilancia con --apply (backup automatico).')
  process.exit(0)
}

const bakPath = path.join('scripts', `backup-subentro-${Date.now()}.json`)
fs.writeFileSync(bakPath, JSON.stringify({
  salvato: new Date().toISOString(),
  uscente: { id: uscente.id, full_name: USCENTE, team_id: uscente.team_id, riga: giaUscente ? giaUscente.pattern.map(String) : null },
  entrante: entranteGia ? { id: entranteGia.id, full_name: ENTRANTE } : null,
}, null, 2))
console.log(`\nbackup: ${bakPath}`)

if (!giaUscente || giaUscente.pattern.length > 0) {
  await post('shift_member_patterns', {
    member_id: uscente.id,
    from_date: DAL,
    pattern: [],
    note: `Uscita dalla squadra dal ${DAL}: ciclo vuoto = non è più in turno. Al posto suo ${ENTRANTE}.`,
  }, 'return=minimal')
  console.log(`  scritto: ${USCENTE} esce dal ${DAL}`)
}

let idEntrante = entranteGia?.id
if (!entranteGia) {
  const ordine = Math.max(0, ...membri.filter(m => m.team_id === sq.id).map(m => m.sort_order ?? 0)) + 1
  const [inserito] = await post('shift_team_members', {
    team_id: sq.id,
    full_name: ENTRANTE,
    pattern: [],
    sort_order: ordine,
    is_active: true,
    is_lead: false,
    user_id: null,
  }, 'return=representation')
  idEntrante = inserito.id
  console.log(`  scritto: ${ENTRANTE} è un membro di ${SQUADRA} senza utente, con la colonna VUOTA (non è in squadra fino al ${DAL_ENTRANTE})`)
} else {
  await patch('shift_team_members', `?id=eq.${entranteGia.id}`, { is_active: true })
  if ((entranteGia.pattern ?? []).length) {
    await patch('shift_team_members', `?id=eq.${entranteGia.id}`, { pattern: [] })
    console.log(`  scritto: ${ENTRANTE} ha la colonna VUOTA (prima valeva per tutto, da marzo)`)
  }
}

// La riga col suo ciclo. Se ci sono righe con altro contenuto (per esempio un
// primo tentativo col ciclo di CASTELLONE) vengono rimosse: la data giusta è
// quella da cui la sua riga compare nei PDF, non quella del subentro.
for (const s of righeEntrante) {
  if (s.from_date === DAL_ENTRANTE) continue
  const attuale = (s.pattern ?? []).map(String)
  if (attuale.length === cicloEntrante.length && attuale.every((t, i) => t === cicloEntrante[i])) continue
  await fetch(`${url}/rest/v1/shift_member_patterns?id=eq.${s.id}`, {
    method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
  })
  console.log(`  scritto: rimossa la riga del ${s.from_date} di ${ENTRANTE} (era un tentativo, non un asset)`)
}
await post('shift_member_patterns', {
  member_id: idEntrante,
  from_date: DAL_ENTRANTE,
  pattern: cicloEntrante,
  note: `Ciclo derivato dai PDF di ${MESI_RIF.join(' e ')}: periodo ${derivato.periodo} giorni, ${cicloEntrante.filter(Boolean).length} turni su ${derivato.periodo}. La sua riga compare nei PDF da settembre.`,
}, 'return=minimal')
console.log(`  scritto: ${ENTRANTE} ha il suo ciclo dal ${DAL_ENTRANTE} (${derivato.periodo} giorni: ${cicloEntrante.map(x => x || '·').join(' ')})`)
console.log(`\nrollback: node scripts/subentro-coppola-aster.mjs --annulla`)
