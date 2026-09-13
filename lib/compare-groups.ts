// Struttura del selettore «Confronta» di /tuoturno e dell'editor di massa admin
// (13/09/2026): DUE GRUPPI di primo livello — «Noni» e «DCO» (tutti gli altri) —
// e dentro il gruppo DCO una SEZIONE PER SQUADRA dei turni teorici, nell'ordine:
//   in terza (D'ELIA-PASSANNANTI, DI MONDA-ROMANO N., …) → in seconda →
//   scorte rilievo (SENATORE-BARRA + mini-squadre A/B/C/D) → scorte semplici
//   (Semplici A/B/C/D) → varianti → altre squadre (RIC/ASTER) → senza squadra.
import type { ShiftTeamTree } from '@/types/database'

export interface CompareGroupUser {
  id: string
  cognome: string | null
  nome: string | null
  teamLabel: string | null // etichetta della squadra dei turni teorici (per il sottotitolo)
}

export interface CompareSection {
  key: string       // chiave stabile per React
  label: string     // «D'ELIA-PASSANNANTI», «Semplici A», «Senza squadra»…
  users: CompareGroupUser[]
}

export interface CompareGroup {
  key: 'noni' | 'dco'
  label: string
  sections: CompareSection[]
}

/** Nome visualizzato di una squadra: capisquadra uniti da '-', altrimenti nome senza «Squadra». */
function teamLabel(members: Array<{ full_name: string; is_lead: boolean }>, teamName: string): string {
  const leads = members.filter(m => m.is_lead).map(m => m.full_name)
  if (leads.length) return leads.join('-')
  return teamName.replace(/^Squadra\s+/i, '')
}

/** matcha un utente (cognome + prefisso nome) sul full_name del PDF. */
function memberForUser(
  user: { cognome: string | null; nome: string | null },
  members: Array<{ full_name: string; is_lead: boolean }>,
): { full_name: string; is_lead: boolean } | null {
  const cognome = (user.cognome ?? '').trim().toLowerCase()
  if (!cognome) return null
  const nome = (user.nome ?? '').trim().toLowerCase()
  for (const m of members) {
    const fn = m.full_name.trim().toLowerCase()
    if (fn === cognome) return m
    // «COGNOME I.» → cognome + prefisso nome (omonimi)
    const prefixed = fn.match(/^(.*)\s+([a-z]+)\.$/)
    if (prefixed && prefixed[1] === cognome && nome && nome.startsWith(prefixed[2])) return m
  }
  return null
}

/** Forma minima dell'utente usata dal builder (sottoinsieme di UserProfile). */
export interface CompareUserInput {
  id: string
  cognome: string | null
  nome: string | null
  is_secondary?: boolean | null
  show_in_compare?: boolean | null
}

export function buildCompareGroups(
  users: CompareUserInput[],
  tree: ShiftTeamTree | null,
): CompareGroup[] {
  // ── squadre dei turni teorici, in ordine di tipo e sort_order ───────────────
  type TeamEntry = {
    rank: number        // ordine globale: terza(0..) < seconda(100..) < scorte(200..) < resto(900..)
    label: string
    members: Array<{ full_name: string; is_lead: boolean }>
  }
  const teams: TeamEntry[] = []

  for (const type of tree?.types ?? []) {
    if (!type.is_active) continue
    const isTerza = /terza/i.test(type.name)
    const isSeconda = /seconda/i.test(type.name)
    const isScorte = /scorte/i.test(type.name)
    for (const team of type.teams) {
      const members = [...team.members]
        .filter(m => m.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(m => ({ full_name: m.full_name, is_lead: m.is_lead }))
      if (!members.length) continue
      let rank: number
      if (isTerza) rank = 0 * 1000 + team.sort_order
      else if (isSeconda) rank = 1 * 1000 + team.sort_order
      else if (isScorte) {
        // scorte: rilievo (capisquadra + mini-squadre) < semplici (A-D) < maternità
        let tier = 2
        if (/rilievo/i.test(team.name)) tier = 2
        else if (/semplici/i.test(team.name)) tier = 3
        else if (/varianti|maternit/i.test(team.name)) tier = 4
        rank = 2 * 1000 + tier * 100 + team.sort_order
      } else {
        // altre squadre attive (RIC/ASTER): dopo tutte le scorte
        rank = 3 * 1000 + team.sort_order
      }
      teams.push({ rank, label: teamLabel(members, team.name), members })
    }
  }
  teams.sort((a, b) => a.rank - b.rank)

  // assegna ogni utente alla PRIMA squadra che lo contiene
  const sectionOf = new Map<string, string>() // user_id → team label
  const userRank = new Map<string, number>()  // user_id → posizione globale (per l'ordine)
  teams.forEach((team, ti) => {
    team.members.forEach((m, mi) => {
      const u = users.find(x => memberForUser(x, [m]))
      if (u && !sectionOf.has(u.id)) {
        sectionOf.set(u.id, team.label)
        userRank.set(u.id, ti * 100 + mi)
      }
    })
  })

  const visible = users.filter(u => u.show_in_compare !== false)
  const byCognome = (a: CompareUserInput, b: CompareUserInput) => (a.cognome ?? '').localeCompare(b.cognome ?? '')

  const toUser = (u: CompareUserInput): CompareGroupUser => ({
    id: u.id,
    cognome: u.cognome,
    nome: u.nome,
    teamLabel: sectionOf.get(u.id) ?? null,
  })

  // ── gruppo DCO: una sezione per squadra + coda «Senza squadra» ──────────────
  const dco = visible.filter(u => !u.is_secondary)
  const dcoAssigned = dco.filter(u => sectionOf.has(u.id))
  const dcoRest = dco.filter(u => !sectionOf.has(u.id)).sort(byCognome)

  const sections: CompareSection[] = []
  const seen = new Set<string>()
  for (const u of [...dcoAssigned].sort((a, b) => (userRank.get(a.id) ?? 9e9) - (userRank.get(b.id) ?? 9e9))) {
    const label = sectionOf.get(u.id)!
    if (seen.has(label)) continue
    seen.add(label)
    sections.push({
      key: label,
      label,
      users: dcoAssigned.filter(x => sectionOf.get(x.id) === label).sort((a, b) => (userRank.get(a.id) ?? 0) - (userRank.get(b.id) ?? 0)).map(toUser),
    })
  }
  if (dcoRest.length) {
    sections.push({ key: 'senza-squadra', label: 'Senza squadra', users: dcoRest.map(toUser) })
  }

  // ── gruppo Noni: sezione unica, ordine alfabetico ───────────────────────────
  const noni = visible.filter(u => u.is_secondary).sort(byCognome)

  const groups: CompareGroup[] = []
  if (noni.length) {
    groups.push({ key: 'noni', label: 'Noni', sections: [{ key: 'noni-all', label: '', users: noni.map(toUser) }] })
  }
  if (dco.length) {
    groups.push({ key: 'dco', label: 'DCO', sections })
  }
  return groups
}
