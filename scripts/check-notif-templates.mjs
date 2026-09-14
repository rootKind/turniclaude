// Contratto del registro template notifiche (pannello debug, 14/09/2026).
// Verifica: chiavi uniche, override applicati/ripristinati, sostituzione
// variabili ({nome}…), non risolte lasciate letterali, variabili suggerite
// per tipo messaggio, contesto dal profilo destinatario.
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
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

  const { NOTIF_TEMPLATES, NOTIF_TEMPLATE_BY_KEY, renderNotifTemplate, renderFlowTemplate, extractTemplateVars, varsForTemplate, resolveTemplates, resolveMessage, buildTemplateVars, NOTIF_VARS } =
    await import(pathToFileURL(join(dir, 'notification-templates.js')).href)

  // ── registry coerente ────────────────────────────────────────────────────────
  assert.ok(NOTIF_TEMPLATES.length >= 14, `ci sono tutti i messaggi (${NOTIF_TEMPLATES.length})`)
  assert.equal(NOTIF_TEMPLATE_BY_KEY.size, NOTIF_TEMPLATES.length, 'chiavi template uniche')
  const keys = new Set(NOTIF_TEMPLATES.map(t => t.key))
  assert.ok(keys.has('new_shift.title') && keys.has('vacation_chain_ready.title'), 'chiavi attese presenti')
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

  // ── variabili suggerite per tipo ─────────────────────────────────────────────
  const shiftVars = varsForTemplate(NOTIF_TEMPLATE_BY_KEY.get('new_shift.title'))
  assert.ok(shiftVars.some(v => v.name === 'data'), 'new_shift suggerisce {data}')
  const vacVars = varsForTemplate(NOTIF_TEMPLATE_BY_KEY.get('new_vacation.title'))
  assert.ok(vacVars.some(v => v.name === 'periodo'), 'new_vacation suggerisce {periodo}')

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
