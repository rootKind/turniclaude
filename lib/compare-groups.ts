// Raggruppamento e ordinamento dei dipendenti per il selettore «Confronta» di
// /tuoturno (13/09/2026): due gruppi — Noni (is_secondary) e «DCO, RIC, ASTER,
// IAP» (tutti gli altri) — ordinati per squadre dei turni teorici:
//   1. Squadra in terza (le squadre con i capisquadra come nome visualizzato)
//   2. Squadra in seconda
//   3. Scorte → rilievo (capisquadra + mini-squadre A/B/C/D)
//   4. Scorte semplici → fasi + varianti
//   5. Resto (senza squadra nei turni teorici: RIC/LANGIONE, ASTER, IAP, manager…)
// Dentro ogni squadra l'ordine segue sort_order dei membri; le squadre stesse
// seguono sort_order della tipologia. Chi non matcha alcun nome PDF resta in coda.
import type { ShiftTeamTree } from '@/types/database'

export interface CompareGroupUser {
  id: string
  cognome: string | null
  nome: string | null
  teamLabel: string | null // etichetta della squadra dei turni teorici (per il sottotitolo)
}

export interface CompareGroup {
  key: 'noni' | 'dco'
  label: string
  users: CompareGroupUser[]
}

/** Nome visualizzato di una squadra: capisquadra uniti da '-', altrimenti nome senza «Squadra». */
function teamLabel(members: Array<{ full_name: string; is_lead: boolean }>, teamName: string): string {
  const leads = members.filter(m => m.is_lead).map(m => m.full_name)
  if (leads.length) return leads.join('-')
  return teamName.replace(/^Squadra\s+/i, '')
}

/**
 * matcha un utente (cognome + prefisso nome) sul full_name del PDF.
 * Regole: full = cognome («MININO»), oppure «COGNOME Iniz.» (prefisso del nome,
 * per gli omonimi: «DI MONDA F.»). Restituisce il primo match.
 */
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
    // «COGNOME I.» → cognome + prefisso nome
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
  // indice per (tipologia, squadra) → membri ordinati
  const teamsIndex: Array<{
    typeRank: number // 0 = in terza, 1 = in seconda, 2 = scorte rilievo, 3 = scorte semplici, 4 = resto
    teamRank: number
    label: string
    members: Array<{ full_name: string; is_lead: boolean }>
  }> = []

  for (const type of tree?.types ?? []) {
    if (!type.is_active) continue
    const name = type.name
    const isTerza = /terza/i.test(name)
    const isSeconda = /seconda/i.test(name)
    const isScorte = /scorte/i.test(name)
    if (!isTerza && !isSeconda && !isScorte) continue // RIC/ASTER/IAP → resto
    for (const team of type.teams) {
      const members = [...team.members]
        .filter(m => m.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(m => ({ full_name: m.full_name, is_lead: m.is_lead }))
      const label = teamLabel(members, team.name)
      let typeRank: number
      let teamRankBase: number
      if (isTerza) { typeRank = 0; teamRankBase = team.sort_order }
      else if (isSeconda) { typeRank = 1; teamRankBase = team.sort_order }
      else {
        // scorte: rilievo (capisquadra + mini-squadre) = rank 2, semplici (fasi+varianti) = rank 3
        const isRilievo = /rilievo/i.test(team.name)
        typeRank = isRilievo ? 2 : 3
        teamRankBase = team.sort_order
      }
      teamsIndex.push({ typeRank, teamRank: teamRankBase, label, members })
    }
  }

  // ordine globale delle squadre: tipologia, poi sort_order interno
  teamsIndex.sort((a, b) => a.typeRank - b.typeRank || a.teamRank - b.teamRank)

  // match: user → [typeRank, teamRank, posizione nel roster] per ordinare
  const rankOf = new Map<string, { g: number; t: number; p: number; label: string }>()
  teamsIndex.forEach((team, gi) => {
    team.members.forEach((m, pi) => {
      const u = users.find(x => memberForUser(x, [m]))
      if (u && !rankOf.has(u.id)) {
        rankOf.set(u.id, { g: gi, t: team.teamRank, p: pi, label: team.label })
      }
    })
  })

  const teamLabelOf = (u: { id: string }) => rankOf.get(u.id)?.label ?? null

  const sortByTeam = (a: CompareUserInput, b: CompareUserInput) => {
    const ra = rankOf.get(a.id)
    const rb = rankOf.get(b.id)
    if (ra && rb) {
      if (ra.g !== rb.g) return ra.g - rb.g
      if (ra.t !== rb.t) return ra.t - rb.t
      if (ra.p !== rb.p) return ra.p - rb.p
    }
    if (ra) return -1
    if (rb) return 1
    return (a.cognome ?? '').localeCompare(b.cognome ?? '')
  }

  const visible = users.filter(u => u.show_in_compare !== false)
  const noni = visible.filter(u => u.is_secondary).sort(sortByTeam)
  const dco = visible.filter(u => !u.is_secondary).sort(sortByTeam)

  const out: CompareGroup[] = []
  if (noni.length) out.push({ key: 'noni', label: 'Noni', users: noni.map(u => ({ id: u.id, cognome: u.cognome, nome: u.nome, teamLabel: teamLabelOf(u) })) })
  if (dco.length) out.push({ key: 'dco', label: 'DCO, RIC, ASTER, IAP', users: dco.map(u => ({ id: u.id, cognome: u.cognome, nome: u.nome, teamLabel: teamLabelOf(u) })) })
  return out
}
