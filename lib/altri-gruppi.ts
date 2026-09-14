// Raggruppamento delle «Altri presenti» per tipologia (richiesta 22/09/2026).
//
// TASSONOMIA (aggiornata 24/09/2026 — richiesta colori chip):
//  - Trasferte   → Trasf, Dis* (DisNa/DisCas/DisSal = trasferta sede),
//                  NDis* (trasferta con turno: NDisNa = notte a Napoli) e
//                  le M/N/P NUDE (senza sezione: Spagnulo = trasferta Napoli)
//                  → COLORE CHIP POMERIGGIO
//  - Corsi       → Sp* (SpN Napoli, SPCA Cancello, SPN, SPSA, Sp@ e-learning)
//                  e SPW (corso webinar) → COLORE CARD VERDI di /tuoturno
//                  (variabili --cell-duty, come .pill-g)
//  - Istruttori  → ISp* (ISpN, ISpC, ISpW) + famiglia *TUTOR (MTUTOR, PTUTOR,
//                  GTUTOR: fusione richiesta 24/09) → COLORE CHIP NOTTE
//  - Altro       → qualsiasi altro token presenza senza sezione (difesa a
//                  futuro + mesi v1 storici) → COLORE CHIP MATTINA
//
// GLI ASSENTI (A/AG7/F.E./VS/RI/RC/RM…) NON passano da qui: blocco «Assenti»
// separato in desk-board (assentiPerTurno), tinta rossa --cell-abs.
//
// Restano INVISIBILI come deciso: G, GIAP, GRicTir, GRICTIR (guardie, non
// approvate), Na, TIR, 12.14, MSb/PSb/GSb, MSp@/GSp@/PSp@ (turni con sezione
// in maiuscole miste → ora vanno in COLONNA grazie al parser allargato, non
// tra le altre presenti).
//
// COLORI (richiesta 24/09/2026): le classi .altri-pill-* (globals.css) sono
// ripuntate SULLE VARIABILI delle chip di /turnisala e della card verde di
// /tuoturno — così tema chiaro e scuro seguono automaticamente le stesse
// tinte delle chip/celle, senza duplicare i valori.
import type { DaySchedule } from '@/types/database'

export interface AltriGruppo {
  key: 'corsi' | 'istruttori' | 'trasferte' | 'altro'
  label: string
  /** Persone del gruppo, con il codice PDF che le colloca qui ('' se non noto, mesi v1). */
  entries: Array<{ name: string; code: string }>
  /** Classe CSS della pill del gruppo (tinta dedicata, see ALTRI_COLORS). */
  colorClass: string
}

/** Classifica un token presenza-senza-sezione nel suo gruppo. */
export function classifyAltriToken(token: string): AltriGruppo['key'] {
  const t = (token ?? '').trim()
  if (/^(?:[MNP]|G)?TUTOR$/i.test(t)) return 'istruttori' // fusione Tutor→Istruttori (24/09)
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
  corsi: 'Corsi',
  istruttori: 'Istruttori',
  trasferte: 'Trasferte',
  altro: 'Altre attività',
}

/** Ordine di esposizione sulla board. */
const ORDER: AltriGruppo['key'][] = ['trasferte', 'corsi', 'istruttori', 'altro']

/** Tinta dedicata di ogni gruppo: classe pill definita in app/globals.css
 *  (variabili --altri-pill-*-bg/text → chip P/M/N e card verdi di /tuoturno,
 *  per tema chiaro e scuro). */
export const ALTRI_COLORS: Record<AltriGruppo['key'], string> = {
  trasferte: 'altri-pill-trasferte',
  corsi: 'altri-pill-corsi',
  istruttori: 'altri-pill-istruttori',
  altro: 'altri-pill-altro',
}

/**
 * Raggruppa le altre presenti del giorno. Preferisce i token espliciti
 * (`altriPresentiTokens`, ricostruiti dal v2 o dal parser — il codice PDF
 * finisce nella entry); se assenti (mesi v1 storici) riclassifica dal solo
 * nome via `tokenByName`, altrimenti entry senza codice.
 */
export function groupAltriPresenti(
  day: Pick<DaySchedule, 'altriPresenti' | 'altriPresentiTokens'>,
  tokenByName?: Map<string, string>,
): AltriGruppo[] {
  const acc = new Map<AltriGruppo['key'], Array<{ name: string; code: string }>>()
  const push = (key: AltriGruppo['key'], name: string, code: string) => {
    if (!acc.has(key)) acc.set(key, [])
    const arr = acc.get(key)!
    if (!arr.some(e => e.name === name)) arr.push({ name, code })
  }

  if (day.altriPresentiTokens?.length) {
    for (const { name, token } of day.altriPresentiTokens) push(classifyAltriToken(token), name, token)
  } else {
    for (const name of day.altriPresenti) {
      const token = tokenByName?.get(name)
      push(token ? classifyAltriToken(token) : 'altro', name, token ?? '')
    }
  }

  return ORDER.filter(k => acc.has(k)).map(k => ({
    key: k,
    label: LABELS[k],
    entries: acc.get(k)!,
    colorClass: ALTRI_COLORS[k],
  }))
}
