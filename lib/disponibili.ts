// DISPONIBILI «D» (richiesta 25/09/2026): il PDF (e i pattern teorici delle
// squadre) marcano con il turno D i dipendenti a disposizione per coperture.
// Il conteggio tiene conto SOLO dei gruppi che l'utente ha elencato:
//   • Noni (profili is_secondary: fuori dall'albero squadre)
//   • Squadra in terza (Squadre A–D)
//   • Squadra in seconda (arancione/verde/rosa)
//   • Scorte di rilievo (Squadra rilievo + Rilievo A–D)
//   • Scorte semplici (Semplici A–D)
// ESCLUSI di proposito: chi non appartiene a nessuna squadra contata
// (manager, RIC/ASTER, …) e la squadra «Maternità» (ex varianti).
//
// Il riconoscimento è PER COGNOME+NOME (match identico a quello delle card di
// /turnisala: `personNameMatches`/`matchesCognome`), perché i membri dell'albero
// sono legati alle persone del PDF per nome (nello storico user_id è quasi
// sempre assente). La Maternità si esclude con la STESSA regola del rank di
// buildCompareGroups (lib/compare-groups.ts): nel tipo «Scorte», la squadra
// /varianti|maternit/i non entra.

import type { ShiftTeamTree, UserProfile } from '@/types/database'
import type { MonthPersonShifts } from '@/lib/sala-month'
import { tokenForMember } from '@/lib/turni-teorici'

/** Quale conteggio D mostrare: tutti, solo DCO (senza noni) o solo noni. */
export type DisponibiliScope = 'tutti' | 'dco' | 'noni'

export interface DisponibiliDelGiorno {
  /** Nomi canonici del PDF conteggiati come disponibili quel giorno. */
  nomi: string[]
  /** Quanti sono (== nomi.length, comodo per i badge). */
  count: number
}

/** Profilo minimo usato per i noni e per i match di nome. */
export type UtenteRef = Pick<UserProfile, 'cognome' | 'nome' | 'is_secondary'> & { id?: string; is_manager?: boolean }

/** Token normalizzato di un nome («DE GIOVANNI  Luigi» → ['de','giovanni','luigi']). */
function tokens(s: string): string[] {
  return s.toLowerCase().trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
}

/**
 * CONFRONTO A TOKEN fra il nome del PDF e il nome di riferimento (membro
 * dell'albero o profilo utente): il PDF scrive «ROSSI», «ROSSI M.» o
 * «ROSSI MARIO» per il membro «ROSSI MARIO»; i cognomi possono essere
 * multi-token («DE GIOVANNI LUIGI»). Regola: i token del PDF sono un PREFISSO
 * dei token del riferimento, a parità di posizione, con l'ultimo che può
 * essere una sola INIZIALE («m.» o «m» → comincia per m). Gli altri matcher
 * dell'app (personNameMatches/matchesCognome) non coprono il caso full_name
 * completo ↔ full_name completo, che qui è la norma.
 */
export function nomeCoincide(pdfName: string, riferimento: string): boolean {
  const pdf = tokens(pdfName)
  const ref = tokens(riferimento)
  if (!pdf.length || !ref.length || pdf.length > ref.length) return false
  return pdf.every((tok, i) => {
    const m = ref[i]
    if (tok === m) return true
    if (/^[a-z]\.?$/.test(tok)) return m.startsWith(tok[0])
    return false
  })
}

/**
 * Le squadre CONTATE nel D, derivate dall'albero: ogni membro attivo porta la
 * propria squadra; chi sta in «Maternità» o in RIC/ASTER, o non sta in nessuna
 * squadra contata, NON entra nel conteggio.
 */
export function squadreContate(tree: ShiftTeamTree | null | undefined): Array<{ label: string; membri: string[] }> {
  const out: Array<{ label: string; membri: string[] }> = []
  for (const type of tree?.types ?? []) {
    if (!type.is_active) continue
    const nomeTipo = type.name.toLowerCase()
    const isTerza = nomeTipo.includes('terza')
    const isSeconda = nomeTipo.includes('seconda')
    const isScorte = nomeTipo.includes('scorte')
    if (!isTerza && !isSeconda && !isScorte) continue // RIC/ASTER e altri fuori
    for (const team of type.teams) {
      // Maternità (ex varianti) fuori dal conteggio, stessa regola dei gruppi confronto.
      if (isScorte && /varianti|maternit/i.test(team.name)) continue
      out.push({
        label: team.name,
        membri: team.members.filter(m => m.is_active).map(m => m.full_name),
      })
    }
  }
  return out
}

/**
 * Chi ha turno D in un giorno, tra le persone dei gruppi CONTATI.
 *
 * `scope`:
 *  - 'tutti': terza + seconda + scorte (rilievo+semplici) + noni;
 *  - 'dco': le stesse squadre, SENZA i noni (dashboard dei DCO);
 *  - 'noni': SOLO i noni (dashboard dei noni).
 *
 * Funziona su qualsiasi sorgente `people` (decodeSalaMonth dei mesi REALI e
 * generateTheoreticalMonth per i teorici: i pattern squadra contengono già il
 * token D). `users` servono per i NONI (profili is_secondary).
 */
export function disponibiliDelGiorno(
  people: MonthPersonShifts[],
  day: number,
  tree: ShiftTeamTree | null | undefined,
  users: UtenteRef[],
  scope: DisponibiliScope,
): DisponibiliDelGiorno {
  const squadre = squadreContate(tree)

  const èNono = (name: string): boolean =>
    scope !== 'dco' && users.some(u =>
      u.is_secondary
      && !!u.cognome
      && nomeCoincide(name, `${u.cognome} ${u.nome ?? ''}`))

  const inSquadraContata = (name: string): boolean =>
    squadre.some(s => s.membri.some(full => nomeCoincide(name, full)))

  const nomi: string[] = []
  for (const p of people) {
    const token = (p.days[day - 1] ?? '').trim()
    if (token.toUpperCase() !== 'D') continue
    // scope 'noni': SOLO i noni (le squadre non contano in quella vista);
    // scope 'dco': solo squadre (i noni sono esclusi da èNono);
    // scope 'tutti': squadre + noni.
    const nono = èNono(p.name)
    if (scope === 'noni') { if (nono) nomi.push(p.name); continue }
    if (nono || inSquadraContata(p.name)) nomi.push(p.name)
  }
  return { nomi, count: nomi.length }
}

/** Solo il numero: comodo per i badge delle card cambio. */
export function conteggioDisponibili(
  people: MonthPersonShifts[],
  day: number,
  tree: ShiftTeamTree | null | undefined,
  users: UtenteRef[],
  scope: DisponibiliScope,
): number {
  return disponibiliDelGiorno(people, day, tree, users, scope).count
}

/**
 * Conteggio D per i mesi SENZA PDF, dal TEORICO dell'albero (richiesta
 * 25/09/2026: «usa i pattern che contengono le D» — verificato sul DB: terza,
 * seconda e scorte hanno D nei pattern). Nota: `applyTokenToDay` scarta il
 * token D (né sezione né altro-presente), quindi NON si può leggere dallo
 * schedule espanso: va interrogato `tokenForMember` per membro delle squadre
 * contate. I NONI non sono nell'albero (gruppo per profilo) → teorico = 0.
 */
export function conteggioDisponibiliTeorico(
  tree: ShiftTeamTree | null | undefined,
  month: string,
  day: number,
  scope: DisponibiliScope = 'dco',
): number {
  if (!tree || scope === 'noni') return 0
  const dateISO = `${month}-${String(day).padStart(2, '0')}`
  let n = 0
  for (const type of tree.types ?? []) {
    if (!type.is_active) continue
    const nomeTipo = type.name.toLowerCase()
    if (!nomeTipo.includes('terza') && !nomeTipo.includes('seconda') && !nomeTipo.includes('scorte')) continue
    for (const team of type.teams) {
      if (/varianti|maternit/i.test(team.name)) continue
      for (const m of team.members) {
        if (!m.is_active) continue
        if (tokenForMember(type, m, team.id, tree.adjustments, dateISO).trim().toUpperCase() === 'D') n++
      }
    }
  }
  return n
}

/**
 * Forma AltriGruppo del sottogruppo «Disponibili» (board /turnisala, sotto le
 * sezioni): colori e label come gli altri gruppi «altri presenti».
 */
export const DISPONIBILI_LABEL = 'Disponibili'
export const DISPONIBILI_COLOR_CLASS = 'altri-pill-altro'
