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

  // Valori d'esempio come li usa il pannello debug (TemplateEditor.sampleVars).
  const samples = Object.fromEntries(NOTIF_VARS.map(v => [v.name, v.sample]))

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
  // Dal 17/09/2026 i route passano l'anno e il motivo NUDI (le parentesi e lo
  // spazio li mette il template): il testo inviato deve restare questo.
  const vacationCases = [
    ['vacation_pending.title', { periodo: '16–30 Giu', anno: '2026', cognome_attore: 'Rossi Mario' },
      'Il cambio 16–30 Giu (2026) con Rossi Mario non può essere ancora accettato perché ci sono scorte disponibili'],
    ['vacation_approved.creator.title', { periodo: '16–30 Giu', anno: '2026', cognome_attore: 'Bianchi Laura' },
      'Il turnista ha approvato la tua richiesta di cambio ferie 16–30 Giu (2026) con Bianchi Laura'],
    ['vacation_approved.winner.title', { periodo: '16–30 Giu', anno: '2026', cognome_attore: 'Rossi Mario' },
      'Il turnista ha approvato il cambio ferie 16–30 Giu (2026) con Rossi Mario'],
    ['vacation_rejected.title', { periodo: '16–30 Giu', anno: '2026', motivo: '' },
      'Il turnista ha cancellato la tua richiesta di cambio ferie 16–30 Giu (2026)'],
    ['vacation_rejected.title', { periodo: '16–30 Giu', anno: '2026', motivo: 'per: copertura già assicurata' },
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
  // Un valore assente non deve lasciare residui: il valore vuoto viene tolto col
  // suo spazio (renderFlowTemplate), quindi il testo resta pulito. Nei messaggi
  // dove l'anno è fra parentesi (lato manager) il flusso lo prende dalla colonna
  // NOT NULL `vacation_requests.year`, quindi non può mancare; la prova qui è
  // sulla famiglia che lo scrive nudo.
  assert.equal(
    renderFlowTemplate(resolveMessage({}, 'vacation_interest.title').body, { periodo: 'Lug', anno: '', cognome_attore: 'Rossi Mario' }),
    'Rossi Mario è interessato al tuo Lug',
    'anno assente: nessun doppio spazio',
  )
  assert.equal(
    renderFlowTemplate(resolveMessage({}, 'vacation_approved.creator.title').body, { periodo: 'Lug', anno: '2026', cognome_attore: 'Rossi Mario' }),
    'Il turnista ha approvato la tua richiesta di cambio ferie Lug (2026) con Rossi Mario',
    'anno presente: fra parentesi, come nel testo inviato'
  )
  // La prova dell'anteprima → invio: lo stesso testo con gli stessi valori, sia
  // dal pannello (renderNotifTemplate, senza compressione) sia dal flusso
  // (renderFlowTemplate). Con i valori nudi devono uscire identici: è la
  // garanzia che l'esempio del pannello non racconti un altro messaggio.
  for (const t of NOTIF_TEMPLATES) {
    const pannello = renderNotifTemplate(t.body, samples)
    const flusso = renderFlowTemplate(t.body, samples)
    assert.equal(pannello, flusso, `${t.key}: anteprima del pannello e testo inviato devono coincidere`)
  }

  // ── ANTEPRIMA DEL PANNELLO: ogni esempio deve leggersi come un messaggio ─────
  // Il pannello debug (components/admin/notification-debug-dialog.tsx) rende il
  // testo con i valori d'esempio di NOTIF_VARS: quello che si vede lì è ciò che
  // l'utente riceverebbe con gli stessi valori. Qui si controlla che nessun
  // esempio sia rotto — è il difetto segnalato il 17/09/2026: «Bianchi è
  // interessato al tuo Mattina del 15/05 (cerca Pomeriggio/Notte)», dove «cerca»
  // senza soggetto si leggeva come se a cercare fosse l'interessato.
  // I valori d'esempio sono NUDI: niente spazio iniziale (lo spazio lo mette il
  // template, altrimenti l'anteprima mostra un doppio spazio che l'invio reale
  // invece comprime — due testi diversi per lo stesso messaggio).
  for (const v of NOTIF_VARS) {
    assert.equal(v.sample, v.sample.trim(), `{${v.name}}: il valore d'esempio non inizia/finisce con uno spazio`)
  }
  // Un testo d'esempio «rotto»: spazio doppio o ai bordi, oppure due cose
  // attaccate che dovrebbero stare separate (lettera+numero, parentesi+parola).
  const appiccicate = [
    [/[a-zà-ù]\d/i, 'lettera attaccata a un numero'],
    [/\d[a-zà-ù]/i, 'numero attaccato a una lettera'],
    [/[a-zà-ù]\(/i, 'lettera attaccata a una parentesi'],
    [/\)[a-zà-ù]/i, 'parentesi attaccata a una lettera'],
  ]
  const rotto = (testo, dove) => {
    if (/(^|\s)\s/.test(testo) || testo !== testo.trim()) return dove + ': spazio doppio o ai bordi («' + testo + '»)'
    for (const [re, che] of appiccicate) {
      const m = testo.match(new RegExp('\\S*' + re.source + '\\S*', re.flags))
      if (m) return dove + ': ' + che + ' («' + m[0] + '»)'
    }
    return null
  }
  for (const t of NOTIF_TEMPLATES) {
    const preview = `${renderNotifTemplate(t.title, samples)} — ${renderNotifTemplate(t.body, samples)}`
    const restano = extractTemplateVars(preview)
    assert.deepEqual(restano, [], `${t.key}: nell'anteprima nessun segnaposto senza valore (${restano.join(' ')})`)
    assert.equal(rotto(preview, t.key), null, `anteprima illeggibile in ${t.key}`)
  }

  // L'attribuzione della ricerca nei messaggi d'interesse: {turno_cercati} sono
  // i turni che cerca LA RICHIESTA DEL DESTINATARIO (chi prende il tuo turno te
  // ne dà uno che avevi chiesto tu). Un «cerca …» senza soggetto si leggeva come
  // se a cercare fosse l'interessato: è la segnalazione del 17/09/2026.
  for (const key of ['interest.title', 'interest.compatible.title']) {
    const testo = renderNotifTemplate(resolveMessage({}, key).body, samples)
    assert.ok(
      !/\(?cerca [A-Za-z]/.test(testo),
      key + ': i turni cercati sono del DESTINATARIO, il verbo deve avere il soggetto («' + testo + '»)',
    )
    assert.ok(/tu cerchi|che cercavi/.test(testo), key + ': dice di chi sono i turni cercati («' + testo + '»)')
  }

  // ── variabili FACOLTATIVE vuote: il testo inviato non deve avere residui ─────
  // È il caso reale: il manager rifiuta senza scrivere il motivo, la pulizia non
  // ha altre richieste da elencare. (L'anno non è in questo elenco: dove compare
  // fra parentesi arriva sempre — colonna NOT NULL o anno validato dal route — e
  // dove è nudo viene tolto col suo spazio.)
  for (const t of NOTIF_TEMPLATES) {
    const vuote = { ...samples }
    for (const nome of ['motivo', 'extra']) vuote[nome] = ''
    const reso = renderFlowTemplate(t.body, vuote)
    // Residui tipici di una variabile tolta male: parentesi vuote, spazio doppio
    // o spazio prima di un segno di punteggiatura.
    assert.ok(!/\(\)|\s{2,}|\s+[.,;:!?)«»]/.test(reso), t.key + ': variabili facoltative vuote, il testo inviato ha residui («' + reso + '»)')
    assert.equal(reso, reso.trim(), `${t.key}: con le variabili facoltative vuote resta uno spazio ai bordi`)
  }

  // ── chi passa i valori: niente spazio/parentesi nelle MANI DEL FLUSSO ────────
  // Le variabili che seguono {periodo}/{data}/{turno} devono arrivare nude dal
  // route: se un route le incapsula (« (2026)», « per: …»), l'anteprima del
  // pannello e il messaggio inviato divergono.
  {
    const files = []
    const cammina = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) cammina(p)
        else if (e.name.endsWith('.ts')) files.push(p)
      }
    }
    cammina('app')
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (!src.includes('@/lib/push/send-with-template')) continue
      for (const m of src.matchAll(/\b(anno|motivo|extra|dettaglio|turno_effettivo)\s*:\s*`([^`]*)`/g)) {
        assert.ok(!/^\s/.test(m[2]), `${f}: «${m[1]}» passato con uno spazio iniziale («${m[2]}»): lo spazio sta nel template`)
        assert.ok(!/^\s*\(/.test(m[2]), `${f}: «${m[1]}» passato fra parentesi («${m[2]}»): le parentesi stanno nel template`)
      }
    }
  }

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
    // Le chiavi si leggono da ENTRAMBE le funzioni d'invio: messageFor (testo
    // risolto, poi inviato a mano) e pushTemplateToUser(s) (invio diretto, es.
    // il push «novità» del changelog).
    for (const m of src.matchAll(/\b(?:messageFor|pushTemplateToUsers?)\(\s*[A-Za-z_$][\w$]*\s*,\s*'([^']+)'/g)) {
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

  // ── TIPI DI NOTIFICA: la lista condivisa, e la bacheca che li mostra tutti ───
  // Bug del 18/09/2026: il push «novità» del changelog partiva col tipo
  // 'changelog_new' mentre la bacheca /notifiche conosceva solo gli altri cinque
  // tipi. La push arrivava, la voce finiva in localStorage e la bacheca la
  // scartava in silenzio (nessun errore, nessuna traccia): l'utente vedeva la
  // notifica sul telefono e non la ritrovava più. Qui si difende il contratto:
  // ogni tipo INVIATO da una push e ogni tipo DICHIARATO dal registro deve
  // stare in NOTIF_TYPES (types/database.ts), e la bacheca deve rendere ognuno
  // di quei tipi (mappa `Record<NotifType, …>`: esaustiva per tipo, non per
  // volontà di chi scrive).
  {
    writeFileSync(join(dir, 'database.js'), transpile(readFileSync('types/database.ts', 'utf8')))
    const { NOTIF_TYPES } = await import(pathToFileURL(join(dir, 'database.js')).href)
    const tipi = new Set(NOTIF_TYPES)
    assert.ok(tipi.size >= 6, `la lista condivisa dei tipi di notifica c'è (${tipi.size})`)

    for (const t of NOTIF_TEMPLATES) {
      assert.ok(tipi.has(t.type), `${t.key}: il tipo dichiarato «${t.type}» è in NOTIF_TYPES`)
    }

    const sorgenti = []
    const raccogli = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) raccogli(p)
        else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) sorgenti.push(p)
      }
    }
    for (const d of ['app', 'lib', 'components']) raccogli(d)
    for (const f of sorgenti) {
      const src = readFileSync(f, 'utf8')
      // Il payload viaggia negli stessi argomenti della chiamata: si guarda la
      // coda della chiamata. Allargare la finestra non fa danni (stringe e
      // basta) e `\btype:` NON cattura `event_type:`.
      const inviati = new Set()
      for (const call of src.matchAll(/\bpush(?:TemplateToUsers?|ToUser)\(/g)) {
        for (const m of src.slice(call.index, call.index + 900).matchAll(/\btype:\s*'([a-z_]+)'/g)) {
          assert.ok(
            tipi.has(m[1]),
            `${f}: la push usa il tipo «${m[1]}», che non è in NOTIF_TYPES — la bacheca non avrebbe dove mostrarlo`,
          )
          inviati.add(m[1])
        }
      }
      // E il tipo deve essere QUELLO DICHIARATO dal registro per i messaggi che
      // il file usa: è il legame che era rotto (la rotta del changelog mandava
      // 'changelog_new' mentre il registro dichiarava 'system'). Si salta il
      // file che non risolve nessun messaggio del registro (es. la push generica
      // dell'admin, che manda testo libero).
      const dichiarati = new Set()
      for (const m of src.matchAll(/\b(?:messageFor|pushTemplateToUsers?)\(\s*[A-Za-z_$][\w$]*\s*,\s*'([^']+)'/g)) {
        const def = NOTIF_TEMPLATE_BY_KEY.get(m[1])
        if (def) dichiarati.add(def.type)
      }
      if (dichiarati.size > 0) {
        for (const t of inviati) {
          assert.ok(
            dichiarati.has(t),
            `${f}: manda il tipo «${t}» ma i messaggi del registro che usa sono di tipo ${[...dichiarati].map(x => `«${x}»`).join(', ')}`,
          )
        }
      }
    }

    // La bacheca: se un tipo nuovo non trovasse la sua sezione, il compilatore si
    // lamenta (SEZIONE_DI è un Record<NotifType, SezioneId>); qui si difende che
    // il raggruppamento resti quello giusto — POCHE sezioni larghe, non una per
    // tipo (18/09/2026: nove sezioni erano un indice, non una bacheca) — e che
    // la rete di sicurezza per i tipi sconosciuti non sparisca.
    const bacheca = readFileSync('components/notifications/notification-list.tsx', 'utf8')
    assert.ok(
      /SEZIONE_DI\s*:\s*Record<NotifType,\s*SezioneId>/.test(bacheca),
      'la bacheca mappa OGNI tipo su una sezione (Record<NotifType, SezioneId>: esaustivo per costruzione)',
    )
    assert.ok(/Altre notifiche/.test(bacheca), 'la bacheca ha la sezione di sicurezza per i tipi sconosciuti')
    const union = bacheca.match(/type SezioneId = ([^\n]+)/)?.[1] ?? ''
    const quante = ((union.match(/'/g) ?? []).length) / 2
    assert.equal(
      quante,
      4,
      `la bacheca ha 4 sezioni (${union.trim() || 'SezioneId non trovato'}): se ne cambi il numero, aggiorna anche tests/bacheca-notifiche.spec.ts`,
    )
  }

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

  console.log('OK — registry, override, variabili, contesto destinatario, tipi di notifica e bacheca coerenti')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
