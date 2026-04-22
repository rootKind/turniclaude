import type { VacationPeriod } from '@/types/database'

export const ROTATION_SEQ: VacationPeriod[] = [1, 3, 5, 6, 4, 2]

export interface VacationPeriodMeta {
  label: string
  start: string   // MM-DD
  end: string     // MM-DD
}

export const VACATION_PERIOD_LABELS: Record<VacationPeriod, VacationPeriodMeta> = {
  1: { label: '16–30 Giugno',      start: '06-16', end: '06-30' },
  2: { label: '01–15 Luglio',      start: '07-01', end: '07-15' },
  3: { label: '16–31 Luglio',      start: '07-16', end: '07-31' },
  4: { label: '01–15 Agosto',      start: '08-01', end: '08-15' },
  5: { label: '16–31 Agosto',      start: '08-16', end: '08-31' },
  6: { label: '01–15 Settembre',   start: '09-01', end: '09-15' },
}

/**
 * Calcola il periodo ferie di un utente per un dato anno,
 * partendo dal suo base_period (2026) e applicando la rotazione ciclica.
 */
export function getVacationPeriodForYear(
  basePeriod: VacationPeriod,
  year: number,
): VacationPeriod {
  const baseIdx = ROTATION_SEQ.indexOf(basePeriod)
  const offset  = ((year - 2026) % 6 + 6) % 6
  const targetIdx = (baseIdx + offset) % 6
  return ROTATION_SEQ[targetIdx]
}

/** Periodo effettivo: usa override per l'anno se presente, altrimenti rotazione base. */
export function getEffectivePeriodForYear(
  basePeriod: VacationPeriod,
  year: number,
  overrides: Map<string, VacationPeriod>,
  userId: string,
): VacationPeriod {
  return overrides.get(userId) ?? getVacationPeriodForYear(basePeriod, year)
}

/** Inverso: dato il periodo target in un anno, restituisce il base_period necessario. */
export function getBasePeriodForYear(
  targetPeriod: VacationPeriod,
  year: number,
): VacationPeriod {
  const offset    = ((year - 2026) % 6 + 6) % 6
  const targetIdx = ROTATION_SEQ.indexOf(targetPeriod)
  const baseIdx   = (targetIdx - offset + 6) % 6
  return ROTATION_SEQ[baseIdx]
}
