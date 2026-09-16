// Contratto del registro template notifiche (pannello debug, 14/09/2026).
// Verifica: chiavi uniche, override applicati/ripristinati, sostituzione
// variabili ({nome}…), non risolte lasciate letterali, variabili suggerite
// per tipo messaggio, contesto dal profilo destinatario.
//
// Dal 16/09/2026 verifica anche il LEGAME registry ↔ route: ogni chiave usata
// dai route esiste nel registro, ogni voce del registro è usata da un route, e
// i route che usano i template non scrivono titoli hardcoded (era il caso dei
// messaggi ferie lato manager, invisibili al pannello).
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'notif-tpl-'))
try {
  const transpile = src =>
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText

  // il modulo dipende solo dai tipi di @/types/database: stub vuoto
  const tpl = transpile(readFileSync('lib/notification-templates.ts', 'utf8'))
    .replaceAll('@/types/database', './types-stub.js')

  writeFileSync(join(dir, 'types-stub.js'), 'module.exports = {}\n')
  writeFileSync(join(dir, 'notification-templates.js'), tpl)

  const { NOTIF_TEMPLATES, NOTIF_TEMPLATE_BY_KEY, renderNotifTemplate, renderFlowTemplate, extractTemplateVars, varsForTemplate, resolveTemplates, resolveMessage, countModifiedTemplates, buildTemplateVars, NOTIF_VARS } =
    await import(pathToFileURL(join(dir, 'notification-templates.js')).href)

  // ── registry coerente ────────────────────────────────────────────────────────
  assert.ok(NOTIF_TEMPLATES.length >= 21, `ci sono tutti i messaggi (${NOTIF_TEMPLATES.length})`)
  assert.equal(NOTIF_TEMPLATE_BY_KEY.size, NOTIF_TEMPLATES.length, 'chiavi template uniche')
  const keys = new Set(NOTIF_TEMPLATES.map(t => t.key))
  assert.ok(keys.has('new_shift.title') && keys.has('vacation_chain_ready.title'), 'chiavi attese presenti')
  for (const k of [
    'vacation_pending.title', 'vacation_approved.creator.title', 'vacation_approved.winner.title',
    'vacation_rejected.title', 'vacation_others.title',
  ]) assert.ok(keys.has(k), `${k}: ferie lato manager nel registro`)
  for (const t of NOTIF_TEMPLATES) {
    assert.ok(t.title && t.body && t.label && t.source, `${t.key} completo`)
    // ogni variabile usata nei testi deve essere documentata in NOTIF_VARS
    for (const v of extractTemplateVars(`${t.title} ${t.body}`)) {
      assert.ok(NOTIF_VARS.some(d => d.name === v), `${t.key}: {${v}} documentata`)
    }
  }

  // ── rendering variabili ──────────────────────────────────────────────────────
  assert.equal(
    renderNotifTemplate('{cognome_attore} cede {turno} il {data}, cerca {turno_cercati}', {
      cognome_attore: 'Rossi', turno: 'Mattina', data: '15/05', turno_cercati: 'Pomeriggio/Notte',
    }),
    'Rossi cede Mattina il 15/05, cerca Pomeriggio/Notte',
    'sostituzione base',
  )
  assert.equal(
    renderNotifTemplate('Ciao {nome} {cognome}', { nome: 'Mario' }),
    'Ciao Mario {cognome}',
    'variabile mancante resta letterale',
  )
  assert.equal(renderNotifTemplate('Nessuna variabile', { nome: 'X' }), 'Nessuna variabile', 'testo senza variabili')
  assert.equal(renderNotifTemplate('Vuoto: {} {nome}', { nome: 'A' }), 'Vuoto: {} A', 'token vuoto {} intatto, {nome} sostituita')
  assert.equal(extractTemplateVars('{a} {b} {a}').length, 2, 'extract deduplica')

  // ── rendering flussi reali (variabili non risolte RIMOSE) ────────────────────
  assert.equal(
    renderFlowTemplate('Il cambio {turno} del {data} con {cognome_attore} non può essere accettato', {
      turno: 'Mattina', data: '15/05', cognome_attore: '',
    }),
    'Il cambio Mattina del 15/05 con non può essere accettato',
    'variabile vuota rimossa dal testo di flusso',
  )
  assert.equal(
    renderFlowTemplate('Il turnista ha cancellato la tua richiesta di cambio {turno} del {data} {motivo}', {
      turno: 'Notte', data: '02/06', motivo: '',
    }),
    'Il turnista ha cancellato la tua richiesta di cambio Notte del 02/06',
    '{motivo} assente: nessun doppio spazio/trailing',
  )
  assert.equal(
    renderFlowTemplate('La richiesta del {data} è stata eliminata: {dettaglio}{extra}', {
      data: '15/05', dettaglio: 'nel turno caricato risulti già in Pomeriggio', extra: ' (e altre 2 richieste)',
    }),
    'La richiesta del 15/05 è stata eliminata: nel turno caricato risulti già in Pomeriggio (e altre 2 richieste)',
    'dettaglio+extra compongono il caso completo',
  )

  // ── ferie lato manager: testo IDENTICO a quello hardcoded di prima ──────────
  // Prova di non-regressione: il testo che il route costruiva a mano, ora
  // passando dal registro con le stesse variabili, esce carattere per carattere.
  const vacationCases = [
    ['vacation_pending.title', { periodo: '16–30 Giu', anno: ' (2026)', cognome_attore: 'Rossi Mario' },
      'Il cambio 16–30 Giu (2026) con Rossi Mario non può essere ancora accettato perché ci sono scorte disponibili'],
    ['vacation_approved.creator.title', { periodo: '16–30 Giu', anno: ' (2026)', cognome_attore: 'Bianchi Laura' },
      'Il turnista ha approvato la tua richiesta di cambio ferie 16–30 Giu (2026) con Bianchi Laura'],
    ['vacation_approved.winner.title', { periodo: '16–30 Giu', anno: ' (2026)', cognome_attore: 'Rossi Mario' },
      'Il turnista ha approvato il cambio ferie 16–30 Giu (2026) con Rossi Mario'],
    ['vacation_rejected.title', { periodo: '16–30 Giu', anno: ' (2026)', motivo: '' },
      'Il turnista ha cancellato la tua richiesta di cambio ferie 16–30 Giu (2026)'],
    ['vacation_rejected.title', { periodo: '16–30 Giu', anno: ' (2026)', motivo: ' per: copertura già assicurata' },
      'Il turnista ha cancellato la tua richiesta di cambio ferie 16–30 Giu (2026) per: copertura già assicurata'],
    ['vacation_others.title', {},
      'Il tuo interesse è stato superato: è stato fatto il cambio con altri interessati.'],
  ]
  for (const [key, vars, expected] of vacationCases) {
    const { body } = resolveMessage({}, key)
    assert.equal(renderFlowTemplate(body, vars), expected, `${key}: testo invariato dopo il passaggio al registro`)
  }
  assert.equal(resolveMessage({}, 'vacation_pending.title').title, 'Cambio ferie in attesa di conferma', 'titolo invariato')
  assert.equal(resolveMessage({}, 'vacation_rejected.title').title, 'Richiesta di cambio ferie cancellata', 'titolo invariato')
  // una data assente (route legacy) non deve lasciare un doppio spazio
  assert.equal(
    renderFlowTemplate(resolveMessage({}, 'vacation_approved.creator.title').body, { periodo: 'Lug', anno: '', cognome_attore: 'Rossi Mario' }),
    'Il turnista ha approvato la tua richiesta di cambio ferie Lug con Rossi Mario',
    'anno assente: nessun doppio spazio',
  )

  // ── legame registry ↔ route ──────────────────────────────────────────────────
  const routeFiles = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.ts')) routeFiles.push(p)
    }
  }
  walk('app')
  const used = new Set()
  for (const f of routeFiles) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/messageFor\(\s*[A-Za-z_$][\w$]*\s*,\s*'([^']+)'/g)) {
      assert.ok(NOTIF_TEMPLATE_BY_KEY.has(m[1]), `${f}: «${m[1]}» esiste nel registro`)
      used.add(m[1])
    }
    // Chi usa il registro non deve avere titoli scritti a mano: è il modo in cui
    // un messaggio resta invisibile al pannello (bug dei 4 messaggi ferie).
    if (src.includes("@/lib/push/send-with-template")) {
      assert.ok(!/title:\s*'/.test(src), `${f}: nessun titolo hardcoded (usa il registro)`)
    }
  }
  const unused = [...keys].filter(k => !used.has(k))
  assert.ok(used.size >= 21, `i route usano il registro (${used.size} chiavi)`)
  assert.deepEqual(unused, [], 'ogni messaggio del registro è usato da un route')

  // ── override ─────────────────────────────────────────────────────────────────
  const ovr = { 'pending.title': { title: 'ATTESA', body: 'Scorte per {turno} del {data}' } }
  const resolved = resolveTemplates(ovr)
  const pend = resolved.find(t => t.key === 'pending.title')
  assert.equal(pend.title, 'ATTESA', 'override applicato al title')
  assert.equal(pend.body, 'Scorte per {turno} del {data}', 'override applicato al body')
  const untouched = resolved.find(t => t.key === 'interest.title')
  const defInterest = NOTIF_TEMPLATES.find(t => t.key === 'interest.title')
  assert.equal(untouched.title, defInterest.title, 'gli altri restano default')
  assert.deepEqual(resolveTemplates(null), NOTIF_TEMPLATES, 'null = default')

  // ── resolveMessage (override → default) ────────────────────────────────────
  assert.equal(resolveMessage(ovr, 'pending.title').title, 'ATTESA', 'resolveMessage: override vince')
  assert.equal(resolveMessage({}, 'interest.title').title, defInterest.title, 'resolveMessage: default senza override')

  // ── conteggio «modificati» del pannello ──────────────────────────────────────
  // Il bug era `Object.keys(overrides).length / 2`: un solo testo modificato
  // valeva «0.5 modificati». Una chiave = un messaggio.
  assert.equal(countModifiedTemplates(NOTIF_TEMPLATES, NOTIF_TEMPLATES), 0, 'nessun override → 0 modificati')
  assert.equal(countModifiedTemplates(resolveTemplates(ovr), NOTIF_TEMPLATES), 1, 'un override → 1 modificato')
  const twoOvr = { ...ovr, 'interest.title': { title: defInterest.title, body: 'Altro testo' } }
  assert.equal(countModifiedTemplates(resolveTemplates(twoOvr), NOTIF_TEMPLATES), 2, 'due override → 2 modificati')
  // override identico al default (eredità di un salvataggio vecchio) non conta
  assert.equal(
    countModifiedTemplates(
      resolveTemplates({ 'interest.title': { title: defInterest.title, body: defInterest.body } }),
      NOTIF_TEMPLATES,
    ),
    0,
    'override uguale al default non conta',
  )

  // ── variabili suggerite per tipo ─────────────────────────────────────────────
  const shiftVars = varsForTemplate(NOTIF_TEMPLATE_BY_KEY.get('new_shift.title'))
  assert.ok(shiftVars.some(v => v.name === 'data'), 'new_shift suggerisce {data}')
  const vacVars = varsForTemplate(NOTIF_TEMPLATE_BY_KEY.get('new_vacation.title'))
  assert.ok(vacVars.some(v => v.name === 'periodo'), 'new_vacation suggerisce {periodo}')
  // I messaggi ferie lato manager hanno type 'system' ma vocabolario ferie:
  // le variabili suggerite devono essere {periodo}/{anno}, non {turno}/{data}.
  const mngVars = varsForTemplate(NOTIF_TEMPLATE_BY_KEY.get('vacation_pending.title'))
  assert.ok(mngVars.some(v => v.name === 'periodo'), 'ferie manager: suggerisce {periodo}')
  assert.ok(mngVars.some(v => v.name === 'anno'), 'ferie manager: suggerisce {anno}')
  assert.ok(!mngVars.some(v => v.name === 'turno'), 'ferie manager: NON suggerisce {turno}')
  assert.ok(!mngVars.some(v => v.name === 'data'), 'ferie manager: NON suggerisce {data}')

  // ── contesto dal destinatario ────────────────────────────────────────────────
  const ctx = buildTemplateVars({
    recipient: { nome: 'Laura', cognome: 'Bianchi' },
    actorName: 'Rossi Mario',
    offeredShift: 'Mattina',
    dateISO: '15/05',
  })
  assert.equal(ctx.nome, 'Laura')
  assert.equal(ctx.cognome_attore, 'Rossi', 'attore: primo token = cognome (convenzione testi app)')
  assert.equal(ctx.nome_attore, 'Mario')
  const rendered = renderNotifTemplate('{cognome_attore} è interessato al tuo {turno} del {data}', ctx)
  assert.equal(rendered, 'Rossi è interessato al tuo Mattina del 15/05', 'flusso completo attore→destinatario')

  console.log('OK — registry, override, variabili, contesto destinatario e suggerimenti coerenti')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
