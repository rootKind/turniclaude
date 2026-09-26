// Registro centralizzato di TUTTI i messaggi push dell'app (pannello debug
// notifiche, richiesta 14/09/2026): l'admin li vede, li modifica e li testa
// dal dialog «debug notifiche». Ogni messaggio ha una chiave stabile, il
// contesto variabile con cui viene generato e i valori REALI letti dal codice
// — il pannello mostra l'esempio attuale, non testo inventato.
//
// Sistema di variabili: i route dei flussi reali risolvono il testo con
// resolveMessage (override admin → default) e popolano le variabili per OGNI
// destinatario con pushTemplateToUsers (lib/push/send-with-template.ts); le
// variabili senza contesto restano letterali (debug-friendly).
import type { NotifType, VacationPeriod } from '@/types/database'

// I tipi di notifica sono definiti in UN posto solo (types/database.ts,
// NOTIF_TYPES) perché li condivide con la bacheca /notifiche: qui si
// ri-esportano per chi importa il tipo da questo modulo.
export type { NotifType }

/**
 * Variabili disponibili nei template admin, con descrizione e valore d'esempio.
 *
 * CONVENZIONE DEI VALORI (17/09/2026) — `sample` è «nudo»: niente spazio
 * iniziale, niente parentesi. Parentesi e separatori li mette il TEMPLATE (es.
 * `{periodo} ({anno})`). Così l'anteprima del pannello debug — che rende il
 * testo con QUESTI valori d'esempio — è carattere per carattere il messaggio che
 * l'utente riceve davvero, e basta un'occhiata per accorgersi di un testo che
 * non sta in piedi: era il caso di «{periodo}{anno}», che in anteprima leggeva
 * «16–30 Giu2026» perché lo spazio arrivava dal flusso, non dal testo.
 */
interface TemplateVar {
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
  { name: 'periodo_effettivo', description: 'Periodo ferie del destinatario nell’anno richiesto (variante compatibile)', sample: '16–31 Lug' },
  { name: 'motivo', description: 'Motivo testuale di un rifiuto (facoltativo)', sample: 'per: copertura già assicurata' },
  { name: 'turno_effettivo', description: 'Turno realmente trovato nel calendario (pulizia cambi)', sample: 'Pomeriggio' },
  { name: 'giorno_fuori_sala', description: 'Perché quel giorno non è in sala: assenza o attività senza sezione (pulizia cambi)', sample: 'Ferie' },
  { name: 'codice_giorno', description: 'Codice del PDF di quel giorno (pulizia cambi)', sample: 'F.E.' },
  { name: 'dettaglio', description: 'Spiegazione specifica del messaggio (pulizia cambi)', sample: 'nel turno caricato risulti già in Pomeriggio' },
  { name: 'extra', description: 'Aggiunta testuale facoltativa (es. «e altre 2 richieste»)', sample: '(e altre 2 richieste)' },
  { name: 'versione', description: 'Numero della nuova versione del changelog', sample: '5' },
]

/** Sostituisce {var} con i valori del contesto; le sconosciute restano invariate. */
export function renderNotifTemplate(template: string, vars?: Record<string, string | null | undefined>): string {
  if (!vars) return template
  return template.replace(/\{([a-z_]+)\}/g, (m, key: string) => {
    const v = vars[key]
    return v === undefined || v === null || v === '' ? m : v
  })
}

/**
 * Rendering per i FLUSSI REALI: come renderNotifTemplate ma le variabili non
 * risolte vengono RIMOSSE (con pulizia degli spazi) — all'utente finale un
 * placeholder visibile sarebbe un bug, diversamente dal pannello di debug che
 * usa renderNotifTemplate per tenerli visibili.
 */
export function renderFlowTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  return renderNotifTemplate(template, vars)
    .replace(/\s*\{[a-z_]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
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
  // Variante FILTRATA (richiesta 25/09/2026): chi ha «Solo se posso coprirlo»
  // (notify_shift_filter) riceve il nuovo turno solo se il SUO turno del giorno
  // offerto è fra i turni cercati — e il messaggio lo DICE, col turno effettivo.
  // Prima il filtro agiva ma il testo restava quello generico: chi lo riceveva
  // non sapeva perché, né vedeva il proprio turno. È la variante che vive SOLO
  // qui (l'interesse non ha una variante compatibile: vedi la nota più sotto).
  {
    key: 'new_shift.compatible.title', title: 'Nuovo turno che puoi coprire',
    body: '{cognome_attore} cede {turno} il {data}: quel giorno sei in {turno_effettivo}, uno dei turni che cerca ({turno_cercati})',
    label: 'Nuovo turno compatibile col tuo turno', type: 'new_shift', source: 'Pubblica cambio (dashboard)',
    context: 'Ai dipendenti con «Solo se posso coprirlo» attivo, quando il LORO turno del giorno offerto è fra i turni cercati',
  },
  {
    key: 'interest.title', title: 'Nuovo interesse al tuo turno',
    // «cerca» senza soggetto si leggeva come se fosse l'INTERESSATO a cercare i
    // turni: li cerca invece il destinatario, con la sua stessa richiesta (nel
    // modello chi prende il tuo turno te ne dà uno che avevi chiesto).
    body: '{cognome_attore} è interessato al tuo {turno} del {data} (tu cerchi {turno_cercati})',
    label: 'Interesse al tuo turno', type: 'interest', source: 'Pulsante «Mi interessa»',
    context: 'Al creatore della richiesta di cambio',
  },
  {
    key: 'interest.fallback.title', title: 'Nuovo interesse al tuo turno',
    body: '{cognome_attore} è interessato al tuo cambio',
    label: 'Interesse (senza dettagli)', type: 'interest', source: 'Pulsante «Mi interessa»',
    context: 'Quando data/turni non sono noti',
  },
  // NESSUN messaggio «compatibile» per l'INTERESSE (rimosso il 25/09/2026): chi si
  // interessa alla mia proposta mi dà uno dei turni che avevo chiesto, quindi la
  // compatibilità è implicita nel gesto — non c'è niente da filtrare né da spiegare.
  // Il filtro «solo se posso coprirlo» (notify_shift_filter) vive solo sui NUOVI
  // turni, dove invece spiega perché la notifica è arrivata (new_shift.compatible).
  {
    key: 'pending.title', title: 'Cambio in attesa di conferma',
    body: 'Il cambio {turno} del {data} con {cognome_attore} non può essere ancora accettato perché ci sono scorte disponibili',
    label: 'Cambio in attesa (scorte)', type: 'shift_outcome', source: 'Conferma manager con scorte',
    context: 'A creatore e vincitore del cambio',
  },
  {
    key: 'approved.creator.title', title: 'Cambio turno approvato',
    body: 'Il turnista ha approvato la tua richiesta di cambio {turno} del {data} con {cognome_attore}',
    label: 'Cambio approvato → richiedente', type: 'shift_outcome', source: 'Conferma manager',
    context: 'A chi aveva ceduto il turno',
  },
  {
    key: 'approved.winner.title', title: 'Cambio turno approvato',
    body: 'Il turnista ha approvato il cambio {turno} del {data} con {cognome_attore}',
    label: 'Cambio approvato → vincitore', type: 'shift_outcome', source: 'Conferma manager',
    context: 'A chi aveva manifestato interesse',
  },
  {
    key: 'others.title', title: 'Cambio turno assegnato ad altri',
    body: 'Il tuo interesse è stato superato: è stato fatto il cambio con altri interessati.',
    label: 'Interesse superato', type: 'shift_outcome', source: 'Conferma manager',
    context: 'Agli altri interessati non vincitori',
  },
  {
    key: 'rejected.title', title: 'Richiesta di cambio cancellata',
    body: 'Il turnista ha cancellato la tua richiesta di cambio {turno} del {data} {motivo}',
    label: 'Richiesta cancellata dal turnista', type: 'shift_outcome', source: 'Rifiuto manager',
    context: 'Al creatore della richiesta; {motivo} se indicato',
  },
  {
    key: 'cleanup.done.title', title: 'Cambio turno già registrato',
    body: 'La richiesta di cambio del {data} ({turno} → {turno_cercati}) è stata eliminata: {dettaglio} {extra}',
    label: 'Pulizia: già registrato', type: 'cleanup', source: 'Pulizia cambi (admin)',
    context: 'Al richiedente, quando il cambio è già nei turni caricati ({dettaglio} spiega il caso)',
  },
  // Varianti «FUORI SALA» (richiesta 26/09/2026): la richiesta sparisce perché
  // quel giorno la persona è assente (A, F.E., VS…) o in un'attività senza
  // sezione (trasferta, corso, istruttore) — NON perché il cambio è avvenuto.
  // Testo proprio, così in bacheca non si confonde con «già registrato», e
  // l'admin lo rivede/modifica dal pannello debug.
  {
    key: 'cleanup.fuori_sala.title', title: 'Cambio turno eliminato: non sei in sala',
    body: 'La richiesta di cambio del {data} ({turno} → {turno_cercati}) è stata eliminata: quel giorno risulti in {giorno_fuori_sala} ({codice_giorno}), quindi non sei in sala. {extra}',
    label: 'Pulizia: fuori sala (assenza/attività)', type: 'cleanup', source: 'Pulizia cambi (admin)',
    context: 'Al richiedente, quando quel giorno è assente o in un’attività senza sezione ({giorno_fuori_sala} + {codice_giorno})',
  },
  {
    key: 'cleanup.fuori_sala.gone.title', title: 'Cambio turno non più disponibile',
    body: 'La richiesta di cambio {turno} → {turno_cercati} del {data} di {cognome_attore} è stata eliminata: quel giorno {cognome_attore} risulta in {giorno_fuori_sala} ({codice_giorno}), quindi non è in sala.',
    label: 'Pulizia: fuori sala → interessati', type: 'cleanup', source: 'Pulizia cambi (admin)',
    context: 'Agli interessati: il turno non è più disponibile perché il richiedente quel giorno non è in sala',
  },
  {
    key: 'cleanup.partner.title', title: 'Cambio turno completato',
    body: 'Il cambio del {data} con {cognome_attore} è andato a buon fine: risulti in {turno}.',
    label: 'Pulizia: cambio completato', type: 'cleanup', source: 'Pulizia cambi (admin)',
    context: 'All’ex partner del cambio',
  },
  {
    key: 'cleanup.gone.title', title: 'Cambio turno non più disponibile',
    body: 'La richiesta di cambio {turno} → {turno_cercati} del {data} di {cognome_attore} è stata eliminata: il turno non è più disponibile.',
    label: 'Pulizia: non più disponibile', type: 'cleanup', source: 'Pulizia cambi (admin)',
    context: 'Agli interessati non partner',
  },
  // ── Ferie (app/api/push/notify + vacanze) ────────────────────────────────
  {
    key: 'vacation_interest.title', title: 'Qualcuno è interessato al tuo cambio ferie',
    body: '{cognome_attore} è interessato al tuo {periodo} {anno}',
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
    body: '{cognome_attore} offre {periodo} {anno} in cambio di {periodo_cercati}',
    label: 'Nuovo cambio ferie', type: 'new_vacation', source: 'Pubblica cambio ferie',
    context: 'A tutti della stessa categoria con notifiche attive',
  },
  // Variante FILTRATA (richiesta 26/09/2026): chi ha «Solo se compatibile col mio
  // periodo» (notify_vacation_filter) riceve il nuovo cambio ferie solo se il SUO
  // periodo dell'anno richiesto (override admin compresi) è fra quelli che la
  // richiesta cerca — e il messaggio lo DICE, col periodo effettivo. È lo specchio
  // di new_shift.compatible.title sui cambi turno.
  {
    key: 'new_vacation.compatible.title', title: 'Nuovo cambio ferie compatibile col tuo periodo',
    body: '{cognome_attore} offre {periodo} ({anno}) e cerca {periodo_cercati}: tu sei in {periodo_effettivo}, uno dei periodi che cerca',
    label: 'Nuovo cambio ferie compatibile col tuo periodo', type: 'new_vacation', source: 'Pubblica cambio ferie',
    context: 'Ai dipendenti con «Solo se compatibile col mio periodo» attivo, quando il LORO periodo dell’anno richiesto è fra quelli cercati',
  },
  {
    key: 'vacation_chain_ready.title', title: 'Nuova catena ferie disponibile',
    body: '{cognome_attore} ha inserito una richiesta che completa una catena con la tua richiesta ({anno})',
    label: 'Catena ferie completata', type: 'new_vacation', source: 'Catena ferie',
    context: 'A chi la nuova richiesta completa la catena',
  },
  // ── Ferie: decisione del manager (16/09/2026) — gemelli dei cambi turno ──
  // Erano testo hardcoded nel route: stessi casi dei cambi turno lato manager,
  // ma invisibili al pannello. Ora hanno chiave, label, source e contesto.
  // Le parentesi dell'anno sono NEL TESTO («{periodo} ({anno})»): i route
  // passano l'anno nudo, così l'anteprima del pannello e il messaggio inviato
  // coincidono (prima il flusso passava « (2026)» e l'anteprima leggeva
  // «16–30 Giu 2026»: due testi diversi per lo stesso messaggio).
  {
    key: 'vacation_pending.title', title: 'Cambio ferie in attesa di conferma',
    body: 'Il cambio {periodo} ({anno}) con {cognome_attore} non può essere ancora accettato perché ci sono scorte disponibili',
    label: 'Cambio ferie in attesa (scorte)', type: 'vacation_outcome', source: 'Conferma manager ferie',
    context: 'A creatore e vincitore del cambio ferie',
  },
  {
    key: 'vacation_approved.creator.title', title: 'Cambio ferie approvato',
    body: 'Il turnista ha approvato la tua richiesta di cambio ferie {periodo} ({anno}) con {cognome_attore}',
    label: 'Cambio ferie approvato → richiedente', type: 'vacation_outcome', source: 'Conferma manager ferie',
    context: 'A chi aveva offerto il periodo',
  },
  {
    key: 'vacation_approved.winner.title', title: 'Cambio ferie approvato',
    body: 'Il turnista ha approvato il cambio ferie {periodo} ({anno}) con {cognome_attore}',
    label: 'Cambio ferie approvato → vincitore', type: 'vacation_outcome', source: 'Conferma manager ferie',
    context: 'A chi ha preso il periodo',
  },
  {
    key: 'vacation_rejected.title', title: 'Richiesta di cambio ferie cancellata',
    body: 'Il turnista ha cancellato la tua richiesta di cambio ferie {periodo} ({anno}) {motivo}',
    label: 'Cambio ferie cancellato dal turnista', type: 'vacation_outcome', source: 'Rifiuto manager ferie',
    context: 'Al creatore della richiesta; {motivo} se indicato',
  },
  {
    key: 'vacation_others.title', title: 'Cambio ferie assegnato ad altri',
    body: 'Il tuo interesse è stato superato: è stato fatto il cambio con altri interessati.',
    label: 'Cambio ferie assegnato ad altri', type: 'vacation_outcome', source: 'Conferma manager ferie',
    context: 'Agli altri interessati non vincitori',
  },
  // ── Changelog (app/api/admin/changelog) ──────────────────────────────────
  // Parte quando l'admin crea una NUOVA versione: tutti con le notifiche
  // attive ricevono l'avviso «novità», il popup completo arriva all'avvio dell'app.
  {
    key: 'changelog_new.title', title: 'Novità nell\'app',
    body: 'Pubblicata la versione {versione} del changelog: guarda cosa è cambiato.',
    // Tipo PROPRIO, non 'system': in bacheca le novità dell'app hanno una
    // sezione loro («Novità dell'app»), così non si confondono con gli avvisi
    // admin. Il valore deve esistere in NOTIF_TYPES (lo verifica
    // scripts/check-notif-templates.mjs).
    label: 'Nuova versione del changelog', type: 'changelog_new', source: 'Changelog (admin)',
    context: 'A tutti con le notifiche attive, alla creazione di una nuova versione',
  },
]

export const NOTIF_TEMPLATE_BY_KEY: Map<string, NotifTemplateDef> = new Map(NOTIF_TEMPLATES.map(t => [t.key, t]))

/** Variabili sensate per ogni messaggio (per i chip «inserisci variabile»). */
export function varsForTemplate(def: NotifTemplateDef): TemplateVar[] {
  const present = new Set(extractTemplateVars(`${def.title} ${def.body}`))
  const explicit = NOTIF_VARS.filter(v => present.has(v.name))
  const common: TemplateVar[] = []
  const wants = (n: string) => !present.has(n) && !common.some(c => c.name === n)
  // I messaggi ferie usano {periodo}/{periodo_cercati}/{anno}; gli altri il
  // vocabolario dei cambi turno ({turno}/{data}/{turno_cercati}).
  const isVacation = def.type === 'new_vacation' || def.type === 'vacation_interest'
    || extractTemplateVars(`${def.title} ${def.body}`).some(v => v === 'periodo' || v === 'periodo_cercati')
  if (!isVacation) {
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

/**
 * Testo di UN messaggio del registry: override admin se presente, altrimenti
 * default del codice. È la funzione che i flussi reali usano per ogni invio.
 */
export function resolveMessage(
  overrides: NotifOverrides | null | undefined,
  key: string,
): { title: string; body: string } {
  const def = NOTIF_TEMPLATE_BY_KEY.get(key)
  const o = overrides?.[key]
  return { title: o?.title ?? def?.title ?? key, body: o?.body ?? def?.body ?? '' }
}

/** Applica gli override ai template predefiniti. */
export function resolveTemplates(overrides?: NotifOverrides | null): NotifTemplateDef[] {
  if (!overrides) return NOTIF_TEMPLATES
  return NOTIF_TEMPLATES.map(t => {
    const o = overrides[t.key]
    return o ? { ...t, title: o.title, body: o.body } : t
  })
}

/**
 * Quanti messaggi si discostano dai testi predefiniti (intestazione del pannello).
 * Gli override in app_settings sono UNO per template (con {title, body} dentro):
 * contare le chiavi grezze, o peggio la loro metà, dà un numero sbagliato — qui
 * si contano i template che differiscono davvero dal default.
 */
export function countModifiedTemplates(
  templates: readonly NotifTemplateDef[],
  defaults: readonly NotifTemplateDef[],
): number {
  const defByKey = new Map(defaults.map(d => [d.key, d]))
  return templates.filter(t => {
    const d = defByKey.get(t.key)
    return !!d && (d.title !== t.title || d.body !== t.body)
  }).length
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
    // Anno NUDO (17/09/2026): le parentesi le mette il template, così
    // l'anteprima del pannello rende lo stesso testo che viene inviato.
    anno: input.year ? String(input.year) : '',
  }
}
