// LA STRUTTURA DELLA TERZA: è una ruota comune di sezioni con 9 fasi diverse?
// Ogni membro cambia sezione ogni 3 turni (P, M, N della stessa sezione), e i
// 56 turni di sezione sono due giri di una sequenza di 28. Se tutti i 36
// membri che lavorano fossero la STESSA sequenza ruotata, lo «slot» di ciascuno
// è la fase: e il nome del template può dirlo.
import fs from 'node:fs'
import path from 'node:path'

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
const devRest = (t, s) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${t}${s}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
}).then(r => r.json())

const squadre = await devRest('shift_teams', '?select=id,name&order=sort_order')
const membri = await devRest('shift_team_members', '?select=id,full_name,team_id,sort_order,is_lead,pattern')
const storico = await devRest('shift_member_patterns', '?select=member_id,from_date,pattern&order=from_date')
const sqDi = new Map(squadre.map(s => [s.id, s.name]))
const ciclo = new Map()
for (const s of storico) if (String(s.from_date).slice(0, 10) === '2026-10-01') ciclo.set(s.member_id, (s.pattern ?? []).map(String))

const sez = t => (/^[MNP]\d/.test(t ?? '') ? t.replace(/[TS]$/, '').slice(1) : null)
const sezioni = p => p.map(sez).filter(Boolean)

const lavorano = membri
  .filter(m => /^Squadra [A-D]$/.test(sqDi.get(m.team_id) ?? ''))
  .map(m => ({ m, sezioni: sezioni(ciclo.get(m.id) ?? m.pattern ?? []) }))
  .filter(x => x.sezioni.length > 0)

// ogni membro: 56 turni di sezione = 2 giri di 28
for (const { m, sezioni: s } of lavorano) {
  if (s.length !== 56) console.log(`  ${m.full_name}: ${s.length} turni di sezione (attesi 56)`)
}
// la sequenza di 28 sezioni di ogni membro
const seq28 = new Map()
for (const { m, sezioni: s } of lavorano) {
  const seq = s.slice(0, 28)
  const chiave = seq.join(' ')
  if (!seq28.has(chiave)) seq28.set(chiave, [])
  seq28.get(chiave).push(m.full_name)
}
console.log(`sequenze di 28 sezioni distinte fra i ${lavorano.length} che lavorano: ${seq28.size}`)

// sono tutte ruote della stessa? cerco, per ogni membro, la fase sulla sequenza
// di un altro membro della stessa squadra
const perSq = new Map()
for (const x of lavorano) {
  const k = sqDi.get(x.m.team_id)
  if (!perSq.has(k)) perSq.set(k, [])
  perSq.get(k).push(x)
}
for (const [sq, lista] of perSq) {
  const seqs = lista.map(x => x.sezioni.slice(0, 28).join(' '))
  const uniche = [...new Set(seqs)]
  console.log(`\n  ${sq}: ${lista.length} membri, ${uniche.length} sequenze distinte`)
  if (uniche.length === 1) {
    console.log('    → tutti la stessa sequenza: le differenze sono solo di fase')
    // la fase: quante posizioni di rotazione servono per allineare alla ruota
    const base = uniche[0].split(' ')
    const fasi = lista.map(x => {
      const s = x.sezioni.slice(0, 28)
      for (let k = 0; k < 28; k++) {
        if (s.every((v, i) => v === base[(i + k) % 28])) return k
      }
      return null
    })
    for (let i = 0; i < lista.length; i++) {
      console.log(`      ${String(fasi[i]).padStart(2)}  ${lista[i].m.full_name.padEnd(15)} parte da ${lista[i].sezioni[0]}`)
    }
    console.log(`    fasi distinte: ${new Set(fasi).size} su ${fasi.length}`)
  } else {
    // prova con la ruota di 84 (non 28): magari il ciclo non si ripete su 28
    const seq84 = [...new Set(lista.map(x => x.sezioni.join(' ')))]
    console.log(`    → sequenze diverse: ${seq84.length} (su 84 token)`)
    const fasi = lista.map(x => {
      const s = x.sezioni
      const ref = seq84[0].split(' ')
      for (let k = 0; k < ref.length; k++) {
        if (ref.length === s.length && s.every((v, i) => v === ref[(i + k) % ref.length])) return k
      }
      return null
    })
    for (let i = 0; i < lista.length; i++) {
      console.log(`      fase ${String(fasi[i]).padStart(3)}  ${lista[i].m.full_name.padEnd(15)} parte da ${lista[i].sezioni[0]}`)
    }
    console.log(`    fasi distinte: ${new Set(fasi).size} su ${fasi.length}`)
  }
}
