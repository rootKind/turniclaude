import { adminClient } from './supabase-admin'
import { isShiftCode } from '../lib/shift-tokens'

/**
 * DOVE SONO LE CELLE GIALLE DEL MESE CARICATO.
 *
 * I test dei gialli (chip-gialle.spec.ts, dipendente.spec.ts) hanno bisogno di un
 * giorno RICCO di celle gialle per non passare a vuoto. Il giorno scritto a mano
 * invecchia: il mese si ricarica (16/09/2026 il PDF di settembre è stato
 * risostituito e il 23/9 è passato da ~30 chip a 1), e la prova diventa rossa per
 * un motivo che non c'entra col codice — cioè il giorno è cambiato nel DATO.
 *
 * Qui si legge `sala_schedule` (service-role da `.env.local`, come
 * tests/supabase-admin.ts) e si ORDINANO i giorni del mese per numero di celle
 * gialle: i test prendono i primi e restano validi a ogni ricarica. Se le chiavi
 * non ci sono la lista è vuota e il test si SALTA, invece di fallire.
 */
export interface YellowDay {
  /** Giorno del mese (1-31). */
  day: number
  /** Celle gialle di quel giorno (una per persona marcata). */
  celle: number
}

/** I giorni del mese con almeno una cella gialla, dal più ricco al più povero. */
export async function giorniGialli(month: string): Promise<YellowDay[]> {
  const sb = adminClient()
  if (!sb) return []
  const { data, error } = await sb.from('sala_schedule').select('month, schedule').eq('month', month).maybeSingle()
  if (error || !data) return []
  const rows = (data.schedule as { rows?: Array<{ y?: number[] }> } | null)?.rows ?? []
  const perGiorno = new Map<number, number>()
  for (const r of rows) for (const d of r.y ?? []) perGiorno.set(d, (perGiorno.get(d) ?? 0) + 1)
  return [...perGiorno.entries()]
    .map(([day, celle]) => ({ day, celle }))
    .sort((a, b) => b.celle - a.celle || a.day - b.day)
}

/**
 * I giorni in cui le PERSONE stanno su una CARD.
 *
 * I test «come la vede il dipendente» (evidenzia della card, nome in grassetto)
 * puntavano a un giorno scritto a mano che aveva i candidati a bordo; il 16/09
 * il PDF di settembre è stato ricaricato e i candidati quel giorno stavano nei
 * Corsi, fuori dalle card — la prova diventava rossa per il dato. Qui si legge
 * il mese da `sala_schedule` e si restituiscono, per ogni cognome richiesto, i
 * giorni in cui la persona ha un TURNO DI SEZIONE (token tipo «M7», «PDCP») o
 * una CELLA GIALLA (la chip sta su una card): sono i giorni in cui la board la
 * nomina e i test hanno sostanza.
 */
export async function giorniSuCard(month: string, cognomi: string[]): Promise<Map<string, number[]>> {
  const sb = adminClient()
  const out = new Map<string, number[]>(cognomi.map(c => [c, []]))
  if (!sb) return out
  const { data, error } = await sb.from('sala_schedule').select('month, schedule').eq('month', month).maybeSingle()
  if (error || !data) return out
  const sched = data.schedule as {
    days?: number
    names?: string[]
    codes?: string[]
    rows?: Array<{ d?: number[]; y?: number[] }>
  }
  const code = (i: number | undefined): string => sched.codes?.[i ?? 0] ?? ''
  for (let r = 0; r < (sched.names?.length ?? 0); r++) {
    const nome = String(sched.names?.[r] ?? '').toUpperCase()
    for (const voluto of cognomi) {
      if (!nome.includes(voluto.toUpperCase())) continue
      const row = sched.rows?.[r]
      const tokens = row?.d ?? []
      const giorni: number[] = []
      for (let d = 0; d < (sched.days ?? tokens.length); d++) {
        const token = code(tokens[d])
        // Sulla card: turno di sezione (isShiftCode esclude i nudi M/P/N, che
        // finiscono nelle Trasferte) oppure cella gialla (chip su card).
        if (isShiftCode(token) || (row?.y ?? []).includes(d + 1)) giorni.push(d + 1)
      }
      out.set(voluto, giorni)
    }
  }
  return out
}
