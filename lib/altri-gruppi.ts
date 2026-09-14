// Raggruppamento delle «Altri presenti» per tipologia (richiesta 22/09/2026).
//
// TASSONOMIA DECISA CON L'UTENTE (catalogo reale del DB, 7 mesi):
//  - Corsi SP        → Sp* (SpN Napoli, SPCA Cancello, SPN, SPSA, Sp@ e-learning)
//                      e SPW (corso webinar)
//  - Istruttori SP   → ISp* (ISpN, ISpC, ISpW: istruttore del corso)
//  - Trasferte       → Trasf, Dis* (DisNa/DisCas/DisSal = trasferta sede),
//                      NDis* (trasferta con turno: NDisNa = notte a Napoli) e
//                      le M/N/P NUDE (senza sezione: Spagnulo = trasferta Napoli)
//  - Tutor           → *TUTOR (MTUTOR, PTUTOR, GTUTOR — di tutta la famiglia G
//                      l'utente ha approvato SOLO GTUTOR)
//  - Altro           → qualsiasi altro token presenza senza sezione (difesa a
//                      futuro: se il PDF introdurrà codici nuovi finiscono qui,
//                      visibili invece che perduti)
//
// Restano INVISIBILI come deciso: G, GIAP, GRicTir, GRICTIR (guardie, non
// approvate), Na, TIR, 12.14, MSb/PSb/GSb, MSp@/GSp@/PSp@ (turni con sezione
// in maiuscole miste → ora vanno in COLONNA grazie al parser allargato, non
// tra le altre presenti).
//
// COLORI (richiesta 23/09/2026): ogni gruppo ha una tinta dedicata, definita
// in app/globals.css per tema chiaro e scuro, così le righe sono distinguibili
// a colpo d'occhio.
import type { DaySchedule } from '@/types/database'

export interface AltriGruppo {
  key: 'corsi' | 'istruttori' | 'trasferte' | 'tutor' | 'altro'
  label: string
  names: string[]
  /** Classe CSS della pill del gruppo (tinta dedicata, see ALTRI_COLORS). */
  colorClass: string
}

/** Classifica un token presenza-senza-sezione nel suo gruppo. */
export function classifyAltriToken(token: string): AltriGruppo['key'] {
  const t = (token ?? '').trim()
  if (/^(?:[MNP]|G)?TUTOR$/i.test(t)) return 'tutor'
  if (/^Trasf$/i.test(t) || /^N?Dis[A-Za-z]/i.test(t)) return 'trasferte'
  // SPW = corso webinar (utente 22/09): la famiglia Sp* lo copre già → corsi.
  if (/^Sp[A-Za-z@]/i.test(t)) return 'corsi'
  if (/^ISp[A-Za-z]/i.test(t)) return 'istruttori'
  if (/^[MNP]$/.test(t)) return 'trasferte' // turno nudo = Spagnulo → trasferta (utente 22/09)
  return 'altro'
}

// Compat: nome usato dai test contrattuali prima del rename (23/09/2026).
export const classificaAltriToken = classifyAltriToken

const LABELS: Record<AltriGruppo['key'], string> = {
  corsi: 'Corsi SP',
  istruttori: 'Istruttori SP',
  trasferte: 'Trasferte',
  tutor: 'Tutor',
  altro: 'Altre attività',
}

/** Ordine di esposizione sulla board. */
const ORDER: AltriGruppo['key'][] = ['trasferte', 'corsi', 'istruttori', 'tutor', 'altro']

/** Tinta dedicata di ogni gruppo: classe pill definita in app/globals.css
 *  (variabili --altri-pill-*-bg/text per tema chiaro e scuro). */
export const ALTRI_COLORS: Record<AltriGruppo['key'], string> = {
  trasferte: 'altri-pill-trasferte',
  corsi: 'altri-pill-corsi',
  istruttori: 'altri-pill-istruttori',
  tutor: 'altri-pill-tutor',
  altro: 'altri-pill-altro',
}

/**
 * Raggruppa le altre presenti del giorno. Preferisce i token espliciti
 * (`altriPresentiTokens`, ricostruiti dal v2 o dal parser); se assenti
 * (mesi v1 storici) riclassifica dal solo nome via `tokenByName`.
 */
export function groupAltriPresenti(
  day: Pick<DaySchedule, 'altriPresenti' | 'altriPresentiTokens'>,
  tokenByName?: Map<string, string>,
): AltriGruppo[] {
  const acc = new Map<AltriGruppo['key'], string[]>()
  const push = (key: AltriGruppo['key'], name: string) => {
    if (!acc.has(key)) acc.set(key, [])
    const arr = acc.get(key)!
    if (!arr.includes(name)) arr.push(name)
  }

  if (day.altriPresentiTokens?.length) {
    for (const { name, token } of day.altriPresentiTokens) push(classifyAltriToken(token), name)
  } else {
    for (const name of day.altriPresenti) {
      const token = tokenByName?.get(name)
      push(token ? classifyAltriToken(token) : 'altro', name)
    }
  }

  return ORDER.filter(k => acc.has(k)).map(k => ({
    key: k,
    label: LABELS[k],
    names: acc.get(k)!,
    colorClass: ALTRI_COLORS[k],
  }))
}
