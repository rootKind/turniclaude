// Invio con template (14/09/2026): i flussi reali dell'app leggono gli
// override admin (app_settings.notif_template_overrides) e sostituiscono le
// variabili {nome}, {cognome_attore}, {turno}… per OGNI destinatario prima di
// inviare con pushToUser. Il fallimento su un utente non blocca gli altri.
import { createAdminSupabase } from '@/lib/supabase/admin'
import { fetchNotifOverrides } from '@/lib/queries/app-settings'
import { resolveMessage, renderFlowTemplate, type NotifOverrides } from '@/lib/notification-templates'
import { pushToUser } from '@/lib/push/send-to-user'

/** Override caricati una volta per richiesta (mai per destinatario). */
export async function loadNotifOverrides(): Promise<NotifOverrides> {
  const admin = createAdminSupabase()
  return fetchNotifOverrides(admin)
}

/** Contesto variabile condiviso da tutti i destinatari di un invio. */
export type TemplateCtx = Record<string, string | null | undefined>

/**
 * Invia il messaggio `key` del registry a un utente: risolve il testo
 * (override → default), aggiunge nome/cognome del destinatario al contesto,
 * sostituisce le variabili e invia. `ctxExtra` porta i valori del flusso
 * (attore, turno, data…). Ritorna il numero di push inviate (0 = nessuna
 * subscription).
 */
export async function pushTemplateToUser(
  overrides: NotifOverrides,
  key: string,
  userId: string,
  ctxExtra?: TemplateCtx,
  recipient?: { nome?: string | null; cognome?: string | null } | null,
  payload?: Record<string, unknown>,
): Promise<number> {
  const { title, body } = resolveMessage(overrides, key)
  const vars: Record<string, string> = {
    nome: recipient?.nome ?? '',
    cognome: recipient?.cognome ?? '',
    ...(ctxExtra ?? {}),
  }
  const renderedTitle = renderFlowTemplate(title, vars)
  const renderedBody = renderFlowTemplate(body, vars)
  try {
    return await pushToUser(userId, {
      title: renderedTitle,
      body: renderedBody,
      ...(payload ?? {}),
    })
  } catch {
    return 0
  }
}

/** Come pushTemplateToUser ma su una lista: mai lancia, aggrega i risultati. */
export async function pushTemplateToUsers(
  overrides: NotifOverrides,
  key: string,
  userIds: string[],
  ctx: TemplateCtx | (() => TemplateCtx),
  recipients?: Map<string, { nome?: string | null; cognome?: string | null }>,
  payload?: Record<string, unknown>,
): Promise<number> {
  const results = await Promise.allSettled(
    userIds.map(id =>
      pushTemplateToUser(overrides, key, id, typeof ctx === 'function' ? ctx() : ctx, recipients?.get(id) ?? null, payload),
    ),
  )
  return results.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value : 0), 0)
}

/** Risolve il testo di un messaggio SENZA inviare (per casi speciali). */
export function messageFor(
  overrides: NotifOverrides,
  key: string,
  vars: Record<string, string | null | undefined>,
): { title: string; body: string } {
  const { title, body } = resolveMessage(overrides, key)
  return { title: renderFlowTemplate(title, vars), body: renderFlowTemplate(body, vars) }
}
