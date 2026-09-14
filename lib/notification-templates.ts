// Registro centralizzato di TUTTI i messaggi push dell'app (pannello debug
// notifiche, richiesta 14/09/2026): l'admin li vede, li modifica e li testa
// dal dialog «debug notifiche». Ogni messaggio ha una chiave stabile, il
// contesto variabile con cui viene generato e i valori REALI letti dal codice
// — il pannello mostra l'esempio attuale, non testo inventato.
//
// Sistema di variabili: nei template admin si può scrivere {nome}, {cognome},
// {turno}, {data}… — vengono sostituiti con i dati del destinatario al momento
// dell'invio (solo per l'invio di prova con destinatari selezionati; un invio
// senza contesto lascia il testo com'è, segnalando le variabili non risolte).
import type { VacationPeriod } from '@/types/database'

export type NotifType = 'system' | 'interest' | 'new_shift' | 'vacation_interest' | 'new_vacation'

/** Variabili disponibili nei template admin, con descrizione e valore d'esempio. */
export interface TemplateVar {
  name: string
  description: string
  sample: string
}

/** Variabili d'ambito: destinatario, attore, turno, ferie. */
export const NOTIF_VARS: TemplateVar[] = [
  { name: 'nome', description: 'Nome del destinatario', sample: 'Mario' },
  { name: 'cognome', description: 'Cognome del destinatario', sample: 'Rossi' },
  { name: 'nome_attore', description: 'Nome dell’altro dipendente coinvolto (chi cede/richiede)', sample: 'Laura' },
  { name: 'cognome_attore', description: 'Cognome dell’altro dipendente coinvolto', sample: 'Bianchi' },
  { name: 'turno', description: 'Turno offerto o di pertinenza (Mattina/Pomeriggio/Notte/…)', sample: 'Mattina' },
  { name: 'turno_cercati', description: 'Turni cercati, separati da «/»', sample: 'Pomeriggio/Notte' },
  { name: 'data', description: 'Data del turno in formato corto gg/mm', sample: '15/05' },
  { name: 'periodo', description: 'Periodo ferie offerto', sample: '16–30 Giu' },
  { name: 'periodo_cercati', description: 'Periodi ferie cercati', sample: '01–15 Lug, 16–31 Lug' },
  { name: 'anno', description: 'Anno delle ferie', sample: '2026' },
]

/** Sostituisce {var} con i valori del contesto; le sconosciute restano invariate. */
export function renderNotifTemplate(template: string, vars?: Record<string, string | null | undefined>): string {
  if (!vars) return template
  return template.replace(/\{([a-z_]+)\}/g, (m, key: string) => {
    const v = vars[key]
    return v === undefined || v === null || v === '' ? m : v
  })
}

/** Elenco delle variabili PRESENTI in un testo (anche non risolte). */
export function extractTemplateVars(template: string): string[] {
  const out = new Set<string>()
  for (const m of template.matchAll(/\{([a-z_]+)\}/g)) out.add(m[1])
  return [...out]
}

/** Un messaggio push noto all'app. */
export interface NotifTemplateDef {
  /** Chiave stabile (salvata negli override in app_settings). */
  key: string
  title: string
  body: string
  /** Etichetta per il pannello admin. */
  label: string
  type: NotifType
  /** Dove viene generato (per orientarsi nel pannello). */
  source: string
  /** Dato tecnico opzionale allegato al payload push. */
  context: string
}

/**
 * Valori CORRENTI hardcoded nei flussi dell'app (riprezzo esatto dai route):
 * la modifica qui in pannello genera un override (app_settings), finché non
 * si torna ai valori predefiniti.
 */
export const NOTIF_TEMPLATES: NotifTemplateDef[] = [
  // ── Cambi turno (app/api/push/notify + manager + shift-cleanup) ──────────
  {
    key: 'new_shift.title', title: 'Nuovo turno disponibile',
    body: '{cognome_attore} cede {turno} il {data}, cerca {turno_cercati}',
    label: 'Nuovo turno pubblicato', type: 'new_shift', source: 'Pubblica cambio (dashboard)',
    context: 'A tutti i dipendenti che possono vedere il nuovo cambio',
  },
  {
    key: 'new_shift.fallback.title', title: 'Nuovo turno disponibile',
    body: '{cognome_attore} ha pubblicato un nuovo cambio turno',
    label: 'Nuovo turno (senza data)', type: 'new_shift', source: 'Pubblica cambio (dashboard)',
    context: 'Quando la data del turno non è nota',
  },
  {
    key: 'interest.title', title: 'Nuovo interesse al tuo turno',
    body: '{cognome_attore} è interessato al tuo {turno} del {data} (cerca {turno_cercati})',
    label: 'Interesse al tuo turno', type: 'interest', source: 'Pulsante «Mi interessa»',
    context: 'Al creatore della richiesta di cambio',
  },
  {
    key: 'interest.fallback.title', title: 'Nuovo interesse al tuo turno',
    body: '{cognome_attore} è interessato al tuo cambio',
    label: 'Interesse (senza dettagli)', type: 'interest', source: 'Pulsante «Mi interessa»',
    context: 'Quando data/turni non sono noti',
  },
  {
    key: 'pending.title', title: 'Cambio in attesa di conferma',
    body: 'Il cambio {turno} del {data} con {cognome_attore} non può essere ancora accettato perché ci sono scorte disponibili',
    label: 'Cambio in attesa (scorte)', type: 'system', source: 'Conferma manager con scorte',
    context: 'A creatore e vincitore del cambio',
  },
  {
    key: 'approved.creator.title', title: 'Cambio turno approvato',
    body: 'Il turnista ha approvato la tua richiesta di cambio {turno} del {data} con {cognome_attore}',
    label: 'Cambio approvato → richiedente', type: 'system', source: 'Conferma manager',
    context: 'A chi aveva ceduto il turno',
  },
  {
    key: 'approved.winner.title', title: 'Cambio turno approvato',
    body: 'Il turnista ha approvato il cambio {turno} del {data} con {cognome_attore}',
    label: 'Cambio approvato → vincitore', type: 'system', source: 'Conferma manager',
    context: 'A chi aveva manifestato interesse',
  },
  {
    key: 'others.title', title: 'Cambio turno assegnato ad altri',
    body: 'Il tuo interesse è stato superato: è stato fatto il cambio con altri interessati.',
    label: 'Interesse superato', type: 'system', source: 'Conferma manager',
    context: 'Agli altri interessati non vincitori',
  },
  {
    key: 'rejected.title', title: 'Richiesta di cambio cancellata',
    body: 'Il turnista ha cancellato la tua richiesta di cambio {turno} del {data}',
    label: 'Richiesta cancellata dal turnista', type: 'system', source: 'Rifiuto manager',
    context: 'Al creatore della richiesta',
  },
  {
    key: 'cleanup.done.title', title: 'Cambio turno già registrato',
    body: 'La richiesta di cambio del {data} ({turno} → {turno_cercati}) è stata eliminata: risulti già coperto da scorte o dal turno caricato',
    label: 'Pulizia: già registrato', type: 'system', source: 'Pulizia cambi (admin)',
    context: 'Al richiedente, quando il cambio è già nei turni caricati',
  },
  {
    key: 'cleanup.partner.title', title: 'Cambio turno completato',
    body: 'Il cambio del {data} con {cognome_attore} è andato a buon fine: risulti in {turno}.',
    label: 'Pulizia: cambio completato', type: 'system', source: 'Pulizia cambi (admin)',
    context: 'All’ex partner del cambio',
  },
  {
    key: 'cleanup.gone.title', title: 'Cambio turno non più disponibile',
    body: 'La richiesta di cambio {turno} → {turno_cercati} del {data} di {cognome_attore} è stata eliminata: il turno non è più disponibile.',
    label: 'Pulizia: non più disponibile', type: 'system', source: 'Pulizia cambi (admin)',
    context: 'Agli interessati non partner',
  },
  // ── Ferie (app/api/push/notify + vacanze) ────────────────────────────────
  {
    key: 'vacation_interest.title', title: 'Qualcuno è interessato al tuo cambio ferie',
    body: '{cognome_attore} è interessato al tuo {periodo}{anno}',
    label: 'Interesse cambio ferie', type: 'vacation_interest', source: 'Interesse su ferie',
    context: 'Al creatore della richiesta ferie',
  },
  {
    key: 'vacation_chain.title', title: 'Interesse alla tua richiesta ferie (catena)',
    body: '{cognome_attore} è interessato al tuo {periodo} {anno} come parte di una catena',
    label: 'Interesse ferie (catena)', type: 'vacation_interest', source: 'Catena ferie',
    context: 'Agli owner di una catena completata',
  },
  {
    key: 'new_vacation.title', title: 'Nuovo cambio ferie disponibile',
    body: '{cognome_attore} offre {periodo} in cambio di {periodo_cercati}{anno}',
    label: 'Nuovo cambio ferie', type: 'new_vacation', source: 'Pubblica cambio ferie',
    context: 'A tutti della stessa categoria con notifiche attive',
  },
  {
    key: 'vacation_chain_ready.title', title: 'Nuova catena ferie disponibile',
    body: '{cognome_attore} ha inserito una richiesta che completa una catena con la tua ({anno})',
    label: 'Catena ferie completata', type: 'new_vacation', source: 'Catena ferie',
    context: 'A chi la nuova richiesta completa la catena',
  },
]

export const NOTIF_TEMPLATE_BY_KEY: Map<string, NotifTemplateDef> = new Map(NOTIF_TEMPLATES.map(t => [t.key, t]))

/** Variabili sensate per ogni messaggio (per i chip «inserisci variabile»). */
export function varsForTemplate(def: NotifTemplateDef): TemplateVar[] {
  const present = new Set(extractTemplateVars(`${def.title} ${def.body}`))
  const explicit = NOTIF_VARS.filter(v => present.has(v.name))
  const common: TemplateVar[] = []
  const wants = (n: string) => !present.has(n) && !common.some(c => c.name === n)
  if (def.type !== 'new_vacation' && def.type !== 'vacation_interest') {
    if (wants('cognome_attore')) common.push(NOTIF_VARS.find(v => v.name === 'cognome_attore')!)
    if (wants('turno')) common.push(NOTIF_VARS.find(v => v.name === 'turno')!)
    if (wants('data')) common.push(NOTIF_VARS.find(v => v.name === 'data')!)
    if (wants('turno_cercati')) common.push(NOTIF_VARS.find(v => v.name === 'turno_cercati')!)
  } else {
    if (wants('cognome_attore')) common.push(NOTIF_VARS.find(v => v.name === 'cognome_attore')!)
    if (wants('periodo')) common.push(NOTIF_VARS.find(v => v.name === 'periodo')!)
    if (wants('periodo_cercati')) common.push(NOTIF_VARS.find(v => v.name === 'periodo_cercati')!)
    if (wants('anno')) common.push(NOTIF_VARS.find(v => v.name === 'anno')!)
  }
  return [...explicit, ...common]
}

/** Override memorizzati in app_settings (chiave → {title, body}). */
export type NotifOverrides = Record<string, { title: string; body: string }>

/** Applica gli override ai template predefiniti. */
export function resolveTemplates(overrides?: NotifOverrides | null): NotifTemplateDef[] {
  if (!overrides) return NOTIF_TEMPLATES
  return NOTIF_TEMPLATES.map(t => {
    const o = overrides[t.key]
    return o ? { ...t, title: o.title, body: o.body } : t
  })
}

/**
 * Contesto variabile dal profilo del destinatario e dai parametri del flusso:
 * è la FUNZIONE che i route useranno per popolare {nome}, {turno}… I valori
 * mancanti restano come placeholder visibile (debug-friendly).
 */
export function buildTemplateVars(input: {
  recipient?: { nome?: string | null; cognome?: string | null } | null
  actorName?: string | null
  offeredShift?: string | null
  requestedShifts?: readonly string[] | null
  dateISO?: string | null
  offeredPeriod?: VacationPeriod | string | number | null
  offeredLabel?: string | null
  targetLabels?: readonly string[] | null
  year?: number | null
}): Record<string, string> {
  const actorParts = (input.actorName ?? '').trim().split(/\s+/)
  const actorCognome = actorParts[0] ?? ''
  const actorNome = actorParts.slice(1).join(' ')
  return {
    nome: input.recipient?.nome ?? '',
    cognome: input.recipient?.cognome ?? '',
    // Convenzione dei messaggi esistenti: «Cognome Nome» → primo token = cognome
    cognome_attore: actorCognome,
    nome_attore: actorNome,
    turno: input.offeredShift ?? '',
    turno_cercati: (input.requestedShifts ?? []).join('/'),
    data: input.dateISO ?? '',
    periodo: input.offeredLabel ?? '',
    periodo_cercati: (input.targetLabels ?? []).join(', '),
    anno: input.year ? ` ${input.year}` : '',
  }
}
