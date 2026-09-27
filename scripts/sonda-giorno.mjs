// SONDA: CHE COSA SCRIVE LA BOARD SU UN GIORNO (27/09/2026).
//
//   node scripts/sonda-giorno.mjs 2026-09-26 [M|P|N]   un giorno: cosa c'è a schermo
//   node scripts/sonda-giorno.mjs 2026-09               un mese: solo le righe INVISIBILI
//
// Per ogni turno: i nomi REALI di ogni card (come li vede la piantina) e le
// righe/extra del confronto teorico≠reale per ogni chiave «SEZIONE|TURNO»,
// con il nome della card a cui finirebbero. Serve a controllare a mano che cosa
// la view admin mostra, senza aprire il browser.
import { caricaDati, turnoTeorico, sala } from './_sonda-dati.mjs'

const { theoRealSectionCompare, normName, surnameKey } = turnoTeorico
const { decodeSalaMonth, buildScheduleFromMonthData, isSalaMonthData } = sala

const GIORNO = process.argv[2]
const SOLO = process.argv[3]?.toUpperCase() ?? null
const MESE_INTERO = /^\d{4}-\d{2}$/.test(GIORNO ?? '')
if (!MESE_INTERO && !/^\d{4}-\d{2}-\d{2}$/.test(GIORNO ?? '')) {
  console.error('uso: node scripts/sonda-giorno.mjs 2026-09-26 [M|P|N] | node scripts/sonda-giorno.mjs 2026-09')
  process.exit(1)
}
const mese = GIORNO.slice(0, 7)
const daySingolo = MESE_INTERO ? 0 : Number(GIORNO.slice(8, 10))

const { tree, cards, dupCognomi, bareOwners, mesi } = await caricaDati()
const riga = mesi.find(m => m.month === mese)
if (!riga) {
  console.error(`${mese}: mese non caricato`)
  process.exit(1)
}
if (!isSalaMonthData(riga.schedule)) {
  console.error(`${mese}: mese in formato v1 (niente dati compatti) — la view teorico≠reale usa i codici del mese v2`)
  process.exit(1)
}
const schedule = buildScheduleFromMonthData(riga.schedule)
const persone = decodeSalaMonth(riga.schedule)
const titolo = new Map(cards.map(c => [c.key, c.title]))
const chiaviCard = new Set(cards.map(c => c.key))

/** Codici PDF del giorno + celle gialle, come li calcola desk-board. */
function contesto(day) {
  const realCodes = new Map()
  for (const p of persone) {
    const code = p.days[day - 1] ?? ''
    if (!code) continue
    const k = surnameKey(p.name)
    if (k && !realCodes.has(k)) realCodes.set(k, code)
    realCodes.set(normName(p.name), code)
  }
  const gialli = new Set(persone.filter(p => p.yellow.includes(day)).map(p => normName(p.name)))
  return { realCodes, gialli }
}

const giorni = MESE_INTERO
  ? Array.from({ length: persone[0]?.days.length ?? 31 }, (_, i) => i + 1)
  : [daySingolo]

// ─── MESE INTERO: le righe che nessuna card può mostrare ─────────────────────
if (MESE_INTERO) {
  let n = 0
  for (const day of giorni) {
    const { realCodes, gialli } = contesto(day)
    const cmp = theoRealSectionCompare(mese, day, tree, tree.adjustments, schedule[day], realCodes, bareOwners, dupCognomi, gialli)
    for (const [k, v] of cmp) {
      if (k.startsWith('@')) continue
      const sez = k.split('|')[0]
      if (chiaviCard.has(sez)) continue
      if (!v.rows.length && !v.extras.length) continue
      n++
      console.log(`${mese}-${String(day).padStart(2, '0')}  «${sez}» (nessuna card): ${v.rows.map(r => `riga ${r.name} teo=${r.theo} reale=${r.real}`).join(' ; ')}${v.extras.map(e => ` ; extra ${e.name} reale=${e.real} teo=${e.theo || '—'}`).join('')}`)
    }
  }
  console.log(n ? `\n${n} chiavi con scostamenti in sezioni SENZA card: quelle righe non si vedono da nessuna parte.` : '\nnessuno scostamento in sezioni senza card: tutte le righe hanno una card.')
  process.exit(0)
}

// ─── UN GIORNO ───────────────────────────────────────────────────────────────
const { realCodes, gialli } = contesto(daySingolo)
const cmp = theoRealSectionCompare(mese, daySingolo, tree, tree.adjustments, schedule[daySingolo], realCodes, bareOwners, dupCognomi, gialli)

console.log(`${GIORNO}  (gialli: ${[...gialli].join(', ') || 'nessuno'})`)
for (const turno of SOLO ? [SOLO] : ['M', 'P', 'N']) {
  console.log(`\n═══ TURNO ${turno} ═══`)
  for (const card of cards) {
    const sez = schedule[daySingolo]?.sections?.[card.key]?.[turno]
    const nomi = sez ? [...sez.surnames.T, ...sez.surnames.S, ...sez.surnames.noSlot] : []
    const c = cmp.get(`${card.key}|${turno}`)
    const righe = (c?.rows ?? []).map(r => `        riga  ${r.name}: teo=${r.theo} → REALE ${r.real}`)
    const extra = (c?.extras ?? []).map(e => `        extra ${e.name}: REALE ${e.real}${e.theo ? ` (teorico ${e.theo})` : ' (senza teorico)'}`)
    if (!nomi.length && !righe.length && !extra.length) continue
    console.log(`  ▸ ${card.title} [${card.key}]  reali: ${nomi.join(', ') || '—'}`)
    for (const l of [...righe, ...extra]) console.log(l)
  }
  const senzaCard = []
  for (const [k, v] of cmp) {
    if (k.startsWith('@') || !k.endsWith(`|${turno}`)) continue
    const sez = k.split('|')[0]
    if (chiaviCard.has(sez)) continue
    if (!v.rows.length && !v.extras.length) continue
    senzaCard.push(`  ⚠ «${sez}» (NESSUNA card: ${v.rows.length} righe, ${v.extras.length} extra) — ${v.rows.map(r => `${r.name}→${r.real}`).join(' ; ')}`)
  }
  for (const l of senzaCard) console.log(l)
}

// PERSONE SPOSTATE: il loro TEORICO è una sezione (di un altro turno o di
// un'altra sezione), quindi la riga «teo → reale» va sulla CARD DEL TEORICO e
// sulla card dove sono davanti non compare nulla (la posizione reale è già
// «consumata» da quella riga). È il caso Semola del 26/09: teorico P5, reale
// M6 → la riga si legge solo nel turno P, sulla card DCO 5°.
console.log(`\n═══ SPOSTATI (teorico in sezione diversa: la riga va sulla card del TEORICO) ═══`)
let nSpostati = 0
for (const turno of SOLO ? [SOLO] : ['M', 'P', 'N']) {
  for (const card of cards) {
    const sez = schedule[daySingolo]?.sections?.[card.key]?.[turno]
    if (!sez) continue
    const c = cmp.get(`${card.key}|${turno}`)
    for (const nome of [...sez.surnames.T, ...sez.surnames.S, ...sez.surnames.noSlot]) {
      if ((c?.extras ?? []).some(e => normName(e.name) === normName(nome))) continue // già scritto
      const k = surnameKey(nome)
      const rigaTeo = [...cmp.values()].flatMap(v => v.rows).find(r => surnameKey(r.name) === k)
      if (!rigaTeo) continue
      nSpostati++
      const sezTeo = rigaTeo.theo.replace(/^[MNP]/, '').replace(/[TS]$/, '')
      console.log(`  ${nome}: reale ${turno}${card.key} · teorico ${rigaTeo.theo} → la riga si legge su «${titolo.get(sezTeo) ?? sezTeo}», turno ${rigaTeo.theo[0]}`)
    }
  }
}
if (!nSpostati) console.log('  nessuno')
