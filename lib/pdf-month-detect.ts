// Rilevamento MESE e ANNO dal contenuto del PDF dei turni (richiesta 19/09/2026
// per l'upload multiplo): l'admin seleziona N PDF, il server legge il testo di
// OGNI pagina e deduce mese+anno — niente più scelta manuale in un menù.
//
// I PDF dei turni scrivono l'intestazione in forme diverse («Settembre 2026»,
// «SETTEMBRE 2026», «Turni Settembre 2026», «2026-09», «09/2026», «09-2026»…).
// Il rilevamento è a PUNTI: ogni pagina produce i propri candidati e alla fine
// vince il punteggio più alto (confidenza 0..1). Nei dubbi l'admin può
// correggere il mese nel dialog di riepilogo prima di confermare.
//
// FALSI POSITIVI (lezione dai test): i cognomi dei dipendenti possono
// CONTENERE radici di mese («MARZANO», «MAGGIO» come cognome, «DI MAGGIO»…).
// Difese: (1) match SOLO su forme ESATTE — nome completo o abbreviazione
// standard a 3 lettere — con confini di parola: «MARZANO» non contiene né
// «marzo» né «mar» come parola intera; (2) un candidato basato sul NOME del
// mese senza anno nella STESSA riga vale pochissimo (0.5): le intestazioni
// vere riportano sempre sia il mese che l'anno.
export const MONTH_NAMES_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
] as const

/** Forme riconosciute per mese: nome completo + abbreviazione italiana a 3 lettere. */
const MONTH_VARIANTS: string[][] = MONTH_NAMES_IT.map(name => [name, name.slice(0, 3)])

/** Rilevamento per un file: mese/anno in forma YYYY-MM + confidenza. */
export interface DetectedMonth {
  /** 'YYYY-MM' o null se il testo non contiene segnali sufficienti. */
  month: string | null
  /** 0..1: 1 = anno+mese espliciti coerenti e ripetuti; più è basso, più vale la conferma umana. */
  confidence: number
}

/** Pull per-candidato con punteggio (solo interno + test). */
interface Candidate {
  month: number // 1..12
  year: number | null
  score: number
}

const YEAR_RE = /\b(20\d{2})\b/

/**
 * Estrae i candidati mese/anno da una riga di testo del PDF.
 * Riconosce: «settembre 2026» / «2026 settembre» (parola intera), «2026-09»,
 * «09/2026», «09-2026». I nomi di mese SENZA anno nella riga producono solo
 * un debole segnale (le intestazioni vere hanno sempre anche l'anno).
 */
export function candidatesFromLine(line: string): Candidate[] {
  const out: Candidate[] = []
  const lower = line.toLowerCase()
  // accenti e/o apostrofi tipici delle intestazioni («Settembre», «Luglio»…)
  const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const yearMatch = normalized.match(YEAR_RE)
  const year = yearMatch ? parseInt(yearMatch[1]) : null

  // ── forma «mese anno» / «anno mese»: forme ESATTE con confini di parola ───
  for (let m = 0; m < 12; m++) {
    const hit = MONTH_VARIANTS[m].some(v => new RegExp(`\\b${v}\\b`, 'i').test(normalized))
    if (!hit) continue
    if (year !== null) {
      out.push({ month: m + 1, year, score: 3 })
    } else {
      // nome del mese da solo: segnale debole (una riga qualsiasi con
      // «maggio» — anche un cognome parola intera come MAGGIO — varrebbe
      // altrimenti troppo)
      out.push({ month: m + 1, year: null, score: 0.5 })
    }
  }

  // ── forme numeriche «2026-09» / «09/2026» / «09-2026» ───────────────────
  const iso = normalized.match(/\b(20\d{2})[-/ \.]([01]?\d)\b/)
  if (iso && +iso[2] >= 1 && +iso[2] <= 12) {
    out.push({ month: +iso[2], year: +iso[1], score: 2.5 })
  }
  const eu = normalized.match(/\b([01]?\d)[-\/ \.](20\d{2})\b/)
  if (eu && +eu[1] >= 1 && +eu[1] <= 12) {
    out.push({ month: +eu[1], year: +eu[2], score: 2.5 })
  }

  return out
}

/**
 * Mese/anno da TUTTO il testo del PDF (tutte le pagine concatenate).
 * best = punteggio più alto; parimerito → null (ambiguo, chiede conferma).
 * I candidati senza anno entrano con l'ANNO CORRENTE e peso ridotto: bastano
 * per suggerire, non per decidere da soli (l'admin corregge nel riepilogo).
 */
export function detectMonthFromText(text: string, now = new Date()): DetectedMonth {
  const acc = new Map<string, number>() // 'YYYY-MM' → punteggio totale
  const noYear = new Map<number, number>() // mese → punteggio senza anno
  for (const raw of text.split(/\r?\n/)) {
    for (const c of candidatesFromLine(raw)) {
      if (c.year !== null) {
        const key = `${c.year}-${String(c.month).padStart(2, '0')}`
        acc.set(key, (acc.get(key) ?? 0) + c.score)
      } else {
        noYear.set(c.month, (noYear.get(c.month) ?? 0) + c.score)
      }
    }
  }
  // Le voci senza anno entrano nell'accusolo con l'anno corrente (peso ridotto).
  for (const [m, s] of noYear) {
    const key = `${now.getFullYear()}-${String(m).padStart(2, '0')}`
    acc.set(key, (acc.get(key) ?? 0) + s * 0.5)
  }

  if (acc.size === 0) return { month: null, confidence: 0 }

  const sorted = [...acc.entries()].sort((a, b) => b[1] - a[1])
  const [bestKey, bestScore] = sorted[0]
  const second = sorted[1]?.[1] ?? 0
  // Ambiguo: primo e secondo quasi appaiati → nessuna decisione automatica.
  if (second >= bestScore * 0.85) return { month: null, confidence: Math.min(1, bestScore / 3) * 0.4 }

  const confidence = Math.min(1, bestScore / 3)
  return { month: bestKey, confidence }
}
