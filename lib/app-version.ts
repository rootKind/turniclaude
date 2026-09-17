/**
 * LA VERSIONE CHE SI LEGGE IN IMPOSTAZIONI (richiesta 18/09/2026).
 *
 * Prima era una riga scritta a mano — «v1.226 · 6eb0c28 — ultimo aggiornamento:
 * 26/08/2026 13:10» — e invecchiava in silenzio: il commit e la data restavano
 * quelli dell'ultima volta che qualcuno si era ricordato di aggiornarli.
 *
 * Ora la riga è `V5 · <commit> · ultimo aggiornamento: <data e ora>`, dove commit
 * e data vengono dalla BUILD (next.config.ts li cotti nelle env `NEXT_PUBLIC_*`:
 * Vercel conosce il commit del deploy e il momento in cui compila, quindi su
 * entrambi i deploy — dev e master — la riga dice la verità da sola).
 *
 * Il fallback serve a chi compila in locale (dove non c'è nessun deploy di
 * Vercel): meglio un valore scritto a mano che una riga vuota.
 */

/** La versione dell'app: si alza a mano quando si prepara una release. */
export const APP_VERSION = 'V5'

/**
 * Il fallback è la RELEASE PRECEDENTE (l'ultima che è stata su master):
 * `6eb0c28` del 26/08/2026. Se in una build locale si legge questo, vuol dire
 * che non c'erano le env di Vercel — e dire «v5, ma a partire dalla release di
 * agosto» è più onesto che inventare un commit.
 */
export const APP_COMMIT_FALLBACK = '6eb0c28'

/** Il momento della release di riferimento, in `gg/mm/aaaa hh:mm` (ora di Roma). */
export const APP_TIME_FALLBACK = '26/08/2026 13:10'

/** Il commit del deploy, breve, come si scrive in una riga di versione. */
export function commitBreve(sha: string | undefined, fallback: string): string {
  const pulito = (sha ?? '').trim()
  return pulito ? pulito.slice(0, 7) : fallback
}

/**
 * `gg/mm/aaaa hh:mm` nell'ora di Roma. L'ora è quella italiana perché è quella
 * che legge chi usa l'app (i deploy di Vercel arrivano in ISO/UTC), e il fuso è
 * dichiarato invece di essere quello del dispositivo: la riga dice quando è stato
 * pubblicato l'aggiornamento, non che ore sono da chi guarda.
 */
export function dataItaliana(iso: string | undefined, fallback: string): string {
  const grezzo = (iso ?? '').trim()
  if (!grezzo) return fallback
  const d = new Date(grezzo)
  if (Number.isNaN(d.getTime())) return fallback
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const q = (t: string) => parti.find(p => p.type === t)?.value ?? ''
  return `${q('day')}/${q('month')}/${q('year')} ${q('hour')}:${q('minute')}`
}

/**
 * La riga intera: `V5 · a1b2c3d · ultimo aggiornamento: 18/09/2026 14:30`.
 * Commit e data arrivano da `next.config.ts` (build Vercel); in locale si usa il
 * fallback scritto qui sopra.
 */
export function versioneTesto(): string {
  const commit = commitBreve(process.env.NEXT_PUBLIC_APP_COMMIT, APP_COMMIT_FALLBACK)
  const quando = dataItaliana(process.env.NEXT_PUBLIC_APP_BUILD_TIME, APP_TIME_FALLBACK)
  return `${APP_VERSION} · ${commit} · ultimo aggiornamento: ${quando}`
}
