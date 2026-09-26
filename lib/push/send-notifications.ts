// Motore di invio del pannello debug notifiche (14/09/2026): risolve i
// destinatari (globale, gruppo, singolo), popola le variabili {nome}… per
// OGNI destinatario e invia con pushToUser (service role). Ritorna un esito
// per destinatario — delivered/partial/skipped/failed — che il pannello
// mostra come report. «Skipped» = nessuna subscription push attiva.
import { createAdminSupabase } from '@/lib/supabase/admin'
import { pushToUser } from '@/lib/push/send-to-user'
import { renderNotifTemplate } from '@/lib/notification-templates'

export interface SendTarget {
  id: string
  nome: string | null
  cognome: string | null
}

export interface SendOutcome {
  userId: string
  /** per chi guarda il report: «Rossi Mario» */
  label: string
  status: 'delivered' | 'partial' | 'skipped' | 'failed'
  /** subscription raggiunte / totali */
  sent: number
  total: number
  /** titolo/testo effettivamente inviati a QUESTO destinatario */
  title: string
  body: string
  error?: string
}

export interface AdminSendRequest {
  title: string
  body: string
  /** 'system' qualunque messaggio manuale; i template noti portano il loro type. */
  type?: string
  /** null/omesso = tutti gli utenti con account. */
  targetIds?: string[] | null
  /** 'all' | 'secondary' | 'primary' — filtro comodo per il pannello. */
  audience?: 'all' | 'secondary' | 'primary' | 'custom'
  /** Contesto variabile opzionale (antemprima/invio con attore e turno fissi). */
  varContext?: Record<string, string | null | undefined>
}

/** Etichetta breve «Cognome Nome» (convenzione dei testi dell'app). */
function labelOf(t: { nome: string | null; cognome: string | null }): string {
  return [t.cognome, t.nome].filter(Boolean).join(' ') || '(senza nome)'
}

/**
 * Risolve la lista destinatari per il pannello: tutti, per gruppo o la lista
 * esplicita di id (selezionati nella UI). Non filtra per preferenze di
 * notifica: qui l'admin DECIDE esplicitamente chi riceve il messaggio.
 */
export async function resolveAdminTargets(
  audience: 'all' | 'secondary' | 'primary' | 'custom',
  targetIds?: string[] | null,
): Promise<SendTarget[]> {
  const admin = createAdminSupabase()
  if (audience === 'custom' && targetIds?.length) {
    const { data } = await admin
      .from('users')
      .select('id, nome, cognome')
      .in('id', targetIds)
    return (data ?? []) as SendTarget[]
  }
  let q = admin.from('users').select('id, nome, cognome')
  if (audience === 'secondary') q = q.eq('is_secondary', true)
  if (audience === 'primary') q = q.eq('is_secondary', false)
  const { data } = await q.order('cognome')
  return (data ?? []) as SendTarget[]
}

/**
 * Invia un messaggio del pannello: per ogni destinatario costruisce il
 * contesto ({nome}, {cognome} personali; il resto da varContext) e invia.
 * Un errore su un utente non blocca gli altri.
 */
export async function sendAdminNotification(req: AdminSendRequest): Promise<SendOutcome[]> {
  const targets = await resolveAdminTargets(req.audience ?? 'all', req.targetIds ?? null)
  const type = req.type ?? 'system'

  const outcomes = await Promise.all(
    targets.map(async (t): Promise<SendOutcome> => {
      // Contesto del destinatario ({nome}, {cognome}) + passthrough dei valori
      // digitati dall'admin ({turno}, {data}…): niente formattazioni nascoste,
      // nel pannello di debug il testo entra come è.
      const vars: Record<string, string> = {
        nome: t.nome ?? '',
        cognome: t.cognome ?? '',
        ...(req.varContext ?? {}),
      }
      const title = renderNotifTemplate(req.title, vars)
      const body = renderNotifTemplate(req.body, vars)
      try {
        const sent = await pushToUser(t.id, { title, body, type })
        return {
          userId: t.id,
          label: labelOf(t),
          status: sent === 0 ? 'skipped' : 'delivered',
          sent,
          total: sent,
          title,
          body,
        }
      } catch (err) {
        return {
          userId: t.id,
          label: labelOf(t),
          status: 'failed',
          sent: 0,
          total: 0,
          title,
          body,
          error: (err as Error)?.message ?? 'Errore invio',
        }
      }
    }),
  )
  return outcomes
}

