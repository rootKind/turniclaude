// Contratto del design system duale iOS/Android (20/09/2026).
//
// Cosa verifica, e perché ognuna di queste cose è un difetto che si vede tardi:
//
//  1. TOKEN DI PIATTAFORMA COMPLETI — i due blocchi `[data-platform='ios']` e
//     `[data-platform='android']` dichiarano le STESSE chiavi e ognuna esiste
//     anche in `:root`. Senza il controllo, un token aggiunto a una piattaforma
//     e dimenticato nell'altra non dà errore: dà una skin mezza vestita, e il
//     `var()` non risolto rende la dichiarazione invalida (colore/spaziatura che
//     spariscono solo su un telefono).
//  2. SKIN VIVA — le chiavi che DEVONO differire fra le due piattaforme
//     differiscono davvero. Una skin «morta» (valori copiati) passa ogni altro
//     controllo e non fa niente: il design system esiste solo se quei valori
//     divergono.
//  3. UTILITY TIPOGRAFICHE — ogni `--fs-*` ha la sua utility `--text-*` in
//     `@theme inline`: è ciò che permette alle pagine di usare `text-body` invece
//     di `text-[15px]`, e senza `inline` la utility copierebbe il valore invece
//     di riferirlo (la piattaforma non potrebbe più cambiarlo).
//  4. CONTRASTO WCAG — le coppie sfondo/testo di pillole e celle passano 4.5:1,
//     in chiaro E in scuro. La matematica NON è riscritta qui: si transpila e si
//     importa `lib/color.ts`, la stessa che usa l'app per il pannello colori,
//     così il controllo non può divergere da ciò che l'utente vede.
//  5. RATCHET — il numero di misure tipografiche arbitrarie (`text-[15px]`) e di
//     copie della regex sullo User-Agent non può RISALIRE. Questi numeri scendono
//     man mano che le milestone migrano i componenti; qui sotto sono la fotografia
//     di oggi, e vanno abbassati quando calano (mai alzati).
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const CSS = readFileSync('app/globals.css', 'utf8')

// ── estrazione dei blocchi ────────────────────────────────────────────────────
// TRAPPOLA (vista in azione col controllo negativo del 20/09/2026): cercare
// `.dark` con `indexOf` prende il `.dark` dentro `@custom-variant dark
// (&:is(.dark *))` alla riga 6 e, brace-matching da lì, restituisce il blocco
// `@theme`: il tema SCURO veniva confrontato coi valori chiari (36 coppie invece
// di 18 × 2, e tutte verdi per finta). Le regex sono ancorate a inizio riga, e la
// guardia sotto pretende che i due blocchi siano davvero diversi.
function block(re, label) {
  const m = re.exec(CSS)
  assert.ok(m, `blocco \`${label}\` presente in app/globals.css`)
  const open = CSS.indexOf('{', m.index)
  let depth = 0
  let i = open
  for (; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++
    else if (CSS[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return CSS.slice(open + 1, i)
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

function declarations(text) {
  const out = {}
  for (const m of stripComments(text).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[`--${m[1]}`] = m[2].trim()
  }
  return out
}

const rootTokens = declarations(block(/^:root\s*\{/m, ':root'))
const darkOnly = declarations(block(/^\.dark\s*\{/m, '.dark'))
const darkTokens = { ...rootTokens, ...darkOnly }
const iosTokens = declarations(block(/^\[data-platform='ios'\]\s*\{/m, "[data-platform='ios']"))
const androidTokens = declarations(block(/^\[data-platform='android'\]\s*\{/m, "[data-platform='android']"))
const themeTokens = declarations(block(/^@theme inline\s*\{/m, '@theme inline'))

// Guardia sull'estrazione: se un giorno un selettore cambia forma e la regex
// aggancia un blocco diverso, il controllo non deve degradare in silenzio a
// «verifica due volte il tema chiaro» — deve fallire.
assert.ok(Object.keys(darkOnly).length > 100, `il blocco .dark ha le sue variabili (${Object.keys(darkOnly).length})`)
assert.notEqual(darkTokens['--background'], rootTokens['--background'], '.dark letto davvero (sfondo diverso dal chiaro)')

// ── 1. contratto: stesse chiavi, tutte con una base ───────────────────────────
const CONTRATTO = [
  '--font-ui',
  '--touch-min',
  // `--radius-card` NON c'è: era nel contratto dalla M1 ed è stato RIMOSSO in M6
  // perché non lo leggeva nessuno (le superfici prendono il raggio dal loro
  // componente: `--radius-sheet`, `--desk-card-radius`, `--dialog-radius`). Un
  // token che non disegna niente non è una promessa, è peso — e il controllo 6 qui
  // sotto ora lo direbbe comunque.
  '--radius-control', '--radius-sheet',
  // Navigazione (M2): l'altezza della barra, il materiale del fondo, la pillola
  // della voce attiva e la forma delle azioni. Sono nel contratto perché una
  // chiave dichiarata su una piattaforma sola darebbe una skin mezza vestita.
  // `--nav-tint` e `--nav-muted` NON sono nell'elenco di proposito: sono la tinta
  // della voce attiva e del testo spento, e valgono le stesse su entrambe le
  // piattaforme (il chrome di questa app è neutro). Pretenderle per piattaforma
  // suggerirebbe che debbano divergere, che è il falso. Se un giorno una sola
  // delle due le ridefinisse, il controllo le trova lo stesso: le chiavi dei due
  // blocchi devono essere IDENTICHE, e una chiave in più da un lato fa fallire
  // quel confronto.
  '--nav-height', '--nav-item-label',
  '--nav-indicator', '--on-nav-indicator', '--nav-bg', '--nav-blur',
  // La GEOMETRIA della barra (M8, 22/09/2026): i due distacchi dall'isola di
  // iOS 26 e il raggio della capsula. Nel contratto perché su iOS sono la forma
  // della barra e su Android sono zero — una chiave dichiarata solo da un lato
  // darebbe una skin mezza vestita, che è esattamente ciò che questo file
  // impedisce.
  '--fab-size', '--fab-radius', '--fab-offset',
  // Il selettore di vista delle pagine «Turni» (M2b, 20/09/2026). Stanno nel
  // contratto perché sono la PROVA che la skin è viva: le stesse classi
  // disegnano un segmented control su iOS e delle tab di Material su Android, e
  // se uno di questi valori smettesse di divergere il componente resterebbe uno
  // solo — quello sbagliato su una delle due piattaforme.
  '--seg-bg', '--seg-pad', '--seg-radius', '--seg-height',
  '--seg-active-bg', '--seg-active-shadow', '--seg-indicator', '--seg-indicator-h',
  '--elevation-nav', '--elevation-dialog',
  '--scrim',
  // Overlay (M3, 20/09/2026): il raggio di un dialog centrato e la ricetta del
  // velo. Sono nel contratto perché le due piattaforme le LEGGONO in modo
  // diverso (M3 28dp e 32%, iOS 14 e 40%), e un token dichiarato da una parte
  // sola darebbe un velo che sparisce su un telefono.
  '--dialog-radius', '--dialog-scrim', '--dialog-scrim-blur',
  // Controlli (M4, 20/09/2026): bottoni, switch, campi, chip. Ogni chiave è
  // nel contratto perché le DUE skin la leggono: se ne manca una, un controllo
  // perde la sua forma su un telefono (un `var()` non risolto non è un fallback,
  // è una dichiarazione invalida).
  '--state-layer-hover', '--state-layer-press', '--ripple',
  '--switch-track-w', '--switch-track-h', '--switch-thumb', '--switch-thumb-off',
  '--switch-pad', '--switch-on', '--switch-unchecked-border',
  '--input-bg', '--input-border', '--input-underline', '--input-radius',
  '--chip-height', '--chip-label',
  // Board (M5a, 20/09/2026): la card di /turnisala e /tuoturno prende forma e
  // profondità dalle skin (raggio 12 + ombra tenera iOS, 12 + elevazione M3
  // Android; desktop: 8px e nessuna ombra, com'era). Nel contratto perché sono
  // la differenza visibile della board su telefono.
  '--desk-card-radius', '--desk-card-elevation', '--desk-card-border-w',
  // Altezza massima degli overlay: `dvh` su iOS, `svh` altrove (M5).
  '--dialog-max-h',
  // Vetro (M6, 22/09/2026): il bordo della superficie e la luce di bordo interna.
  // Nascono PRIMA del materiale completo (M10) perché il vetro ha bisogno della
  // sua via d'uscita accessibile per esistere: `prefers-reduced-transparency` li
  // spegne, `prefers-contrast: more` li rinforza. Su Android sono spenti — il
  // materiale traslucido è una scelta di iOS — ma le chiavi esistono su entrambe
  // le piattaforme, come vuole il contratto.
  '--glass-rim', '--glass-highlight',
  '--motion-duration-enter', '--motion-duration-exit', '--motion-duration-press', '--motion-ease-standard',
  // Moto (M7, 22/09/2026): le molle. Sono nel contratto perché le due
  // piattaforme le esprimono in linguaggi diversi (Material: damping+stiffness;
  // iOS: risposta+smorzamento) e i valori sono GENERATI da lib/motion.ts: una
  // chiave mancante su un lato darebbe un controllo che non si muove affatto.
  '--motion-spring-press', '--motion-spring-pop', '--motion-spring-fade',
  '--fs-caption', '--fs-footnote', '--fs-body', '--fs-title3', '--fs-large-title',
]
for (const key of CONTRATTO) {
  assert.ok(rootTokens[key], `${key}: valore di base in :root (piattaforma sconosciuta = valori di oggi)`)
  assert.ok(iosTokens[key], `${key}: dichiarato per iOS`)
  assert.ok(androidTokens[key], `${key}: dichiarato per Android`)
}

const chiaviIos = Object.keys(iosTokens).sort()
const chiaviAndroid = Object.keys(androidTokens).sort()
assert.deepEqual(
  chiaviIos,
  chiaviAndroid,
  'iOS e Android dichiarano le stesse chiavi (nessuna skin mezza vestita)',
)
for (const key of chiaviIos) {
  assert.ok(rootTokens[key], `${key}: presente nel blocco Android/iOS ma orfano di base in :root`)
}

// ── 2. la skin deve essere viva ───────────────────────────────────────────────
const DEVONO_DIFFERIRE = [
  '--font-ui', '--touch-min', '--radius-control', '--radius-sheet',
  '--elevation-nav', '--elevation-dialog', '--motion-duration-enter', '--motion-duration-exit',
  '--motion-ease-standard', '--fs-body', '--fs-footnote', '--fs-title3', '--fs-large-title',
  // Navigazione: iOS ha la tab bar a 49pt senza pillola, Android la navigation
  // bar a 80dp CON la pillola (è il modo in cui M3 dice «sei qui»), e le azioni
  // sono una pill a 48px contro un FAB a 56 con angoli a 16. Se questi valori
  // tornassero uguali, la M2 sarebbe una skin copiata: è la ragione per cui sono
  // qui.
  '--nav-height', '--nav-item-label', '--nav-indicator', '--nav-bg', '--nav-blur',
  // M8: l'isola iOS (8pt di distacco, capsula) contro la fascia di Material
  // appoggiata al bordo (0 e 0). Se questi due tornassero uguali, la geometria
  // della barra sarebbe di nuovo una sola — cioè l'isola non esisterebbe.
  '--nav-inset', '--nav-radius',
  '--fab-size', '--fab-radius',
  // Selettore di vista: iOS tinto e con il thumb (9pt, alto 32), Android
  // trasparente e con la barretta da 3dp (alto 48). Tutti e otto divergono — è
  // la definizione stessa delle due superfici.
  '--seg-bg', '--seg-pad', '--seg-radius', '--seg-height',
  '--seg-active-bg', '--seg-active-shadow', '--seg-indicator', '--seg-indicator-h',
  // Overlay: iOS e Android divergono sul raggio (14 contro 28) e sull'opacità del
  // velo (40% contro 32%). `--dialog-scrim-blur` NON è qui: è `none` su entrambe
  // (schermare senza sfocare è la convenzione comune), quindi pretenderne la
  // differenza significherebbe inventarla — come per `--radius-card` e `--scrim`.
  '--dialog-radius', '--dialog-scrim',
  // Controlli: le due skin divergono davvero. Il toggle di iOS è 51×31 col
  // pollice fisso e VERDE; lo switch M3 è 52×32 col pollice che cresce da 16 a
  // 24 e la traccia primaria col contorno da 2dp. I campi: inset senza bordo
  // con angoli continui su iOS, pieno con angoli alti a 4dp e sottolineatura su
  // Android. Le chip: etichetta 13 contro 14sp. Le state layer/ripple: solo
  // Material le ha (trasparenti su iOS di proposito — HIG non le conosce).
  '--switch-track-w', '--switch-track-h', '--switch-thumb', '--switch-thumb-off',
  '--switch-on', '--switch-unchecked-border',
  '--input-bg', '--input-underline', '--input-radius',
  '--chip-label', '--state-layer-hover', '--state-layer-press', '--ripple',
  // Vetro: su iOS è un bordo velato e un filo chiaro, su Android entrambi spenti.
  '--glass-rim', '--glass-highlight',
  // Moto: le molle di iOS (linguaggio SwiftUI) contro quelle di Material
  // (damping+stiffness). Le durate di `enter`/`exit` NON sono qui: derivano
  // dall'assestamento delle molle e le verifica `scripts/check-motion.mjs`, che è
  // l'unico posto in cui possono essere confrontate. La durata della PRESSIONE
  // invece sì, ed è la differenza più visibile delle due skin: su iOS il controllo
  // si ritrae e la molla lo riporta su (270ms, con un rimbalzo dell'1.5%), su
  // Android la velatura si accende e si spegne in 150ms senza superare il
  // bersaglio — cioè due gesti diversi, non due tempi diversi dello stesso gesto.
  // Le tre molle devono divergere, perché è la prova che le due skin del moto non
  // sono la stessa curva copiata.
  '--motion-spring-press', '--motion-spring-pop', '--motion-spring-fade',
  '--motion-duration-press',
]
// `--input-border` NON è qui per lo stesso motivo di `--dialog-scrim-blur`: è
// `transparent` su ENTRAMBE (né iOS né M3 mettono bordi laterali ai campi), e
// pretenderne la differenza significherebbe inventarla.
for (const key of DEVONO_DIFFERIRE) {
  assert.notEqual(
    iosTokens[key],
    androidTokens[key],
    `${key}: iOS e Android devono differire (valore identico = skin morta)`,
  )
}
// `--radius-card` NON è nell'elenco di proposito: 12px su entrambe le guide (M3
// «medium» 12dp, e iOS sta lì), quindi pretenderne la differenza significherebbe
// inventarla. Restano fuori anche `--scrim` (32% per entrambe) e `--fs-caption`
// (12px in tutte e due). Per non lasciare un buco nella difesa, la guardia che
// segue pretende che la maggior parte del contratto diverga comunque: una skin
// copiata e incollata fallisce lo stesso.
const DIFFERISCONO = CONTRATTO.filter((k) => iosTokens[k] !== androidTokens[k])
assert.ok(
  DIFFERISCONO.length >= 12,
  `la skin deve essere viva: solo ${DIFFERISCONO.length} token su ${CONTRATTO.length} divergono fra iOS e Android`,
)

// Il livello 1 semantico: è il vocabolario che il codice nuovo userà.
for (const [nome, bersaglio] of Object.entries({
  '--surface': '--background',
  '--surface-container': '--card',
  '--surface-container-high': '--popover',
  '--on-surface': '--foreground',
  '--on-surface-muted': '--muted-foreground',
  '--primary-action': '--primary',
  '--on-primary-action': '--primary-foreground',
  '--danger': '--destructive',
  '--separator': '--border',
})) {
  assert.equal(rootTokens[nome], `var(${bersaglio})`, `${nome}: alias semantico di ${bersaglio}`)
}

// ── 3. scala tipografica → utility ────────────────────────────────────────────
const scale = Object.keys(rootTokens).filter((k) => k.startsWith('--fs-'))
assert.ok(scale.length >= 5, `scala tipografica presente (${scale.length} gradini)`)
for (const key of scale) {
  const utility = `--text-${key.slice('--fs-'.length)}`
  assert.equal(
    themeTokens[utility],
    `var(${key})`,
    `${utility}: utility collegata a ${key} (serve per smettere di scrivere text-[Npx])`,
  )
}

// ── 4. contrasto WCAG con la matematica dell'app ──────────────────────────────
const riga = (nome, bg, testo) => ({ nome, bg, testo })

const COPPIE = [
  riga('pillola Mattina', '--pill-mattina-bg', '--pill-mattina-text'),
  riga('pillola Pomeriggio', '--pill-pomeriggio-bg', '--pill-pomeriggio-text'),
  riga('pillola Notte', '--pill-notte-bg', '--pill-notte-text'),
  riga('cella Mattina', '--cell-m-bg', '--cell-m-text'),
  riga('cella Pomeriggio', '--cell-p-bg', '--cell-p-text'),
  riga('cella Notte', '--cell-n-bg', '--cell-n-text'),
  riga('cella riposo', '--cell-rest-bg', '--cell-rest-text'),
  riga('cella disponibilità', '--cell-avail-bg', '--cell-avail-text'),
  riga('cella assenza', '--cell-abs-bg', '--cell-abs-text'),
  riga('cella servizio', '--cell-duty-bg', '--cell-duty-text'),
  riga('cella vuota', '--cell-empty-bg', '--cell-empty-text'),
  riga('chip gialla di sala', '--cell-yellow-bg', '--sala-yellow-chip-text'),
  riga('periodo 1', '--period-1-pill-bg', '--period-1-pill-text'),
  riga('periodo 2', '--period-2-pill-bg', '--period-2-pill-text'),
  riga('periodo 3', '--period-3-pill-bg', '--period-3-pill-text'),
  riga('periodo 4', '--period-4-pill-bg', '--period-4-pill-text'),
  riga('periodo 5', '--period-5-pill-bg', '--period-5-pill-text'),
  riga('periodo 6', '--period-6-pill-bg', '--period-6-pill-text'),
]

// Le pillole dei periodi in tema SCURO hanno lo sfondo TRASLUCIDO
// (`rgba(6,78,59,0.38)`): il loro contrasto reale dipende dalla superficie che
// c'è sotto (la card), e qui non c'è nessuna superficie — inventarne una
// significherebbe misurare un colore che l'utente non vede mai. Non si
// verificano: si SALTANO, con il motivo stampato a fine controllo, e l'elenco di
// quelle saltate è bloccato: una coppia traslucida NUOVA fa fallire il controllo
// invece di scivolare via in silenzio.
const SALTATE_ATTESE = [
  'periodo 1 (scuro)', 'periodo 2 (scuro)', 'periodo 3 (scuro)',
  'periodo 4 (scuro)', 'periodo 5 (scuro)', 'periodo 6 (scuro)',
]

function resolve(name, map, depth = 0) {
  const raw = map[name]
  if (raw === undefined) return undefined
  const m = raw.trim().match(/^var\((--[\w-]+)(?:,[^)]*)?\)$/)
  if (m && depth < 8) return resolve(m[1], map, depth + 1)
  return raw.trim()
}

const HEX = /^#[0-9a-fA-F]{6}$/

const dir = mkdtempSync(join(tmpdir(), 'design-tokens-'))
try {
  const transpiled = ts.transpileModule(readFileSync('lib/color.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  writeFileSync(join(dir, 'color.js'), transpiled)
  const { contrastRatio } = await import(pathToFileURL(join(dir, 'color.js')).href)

  const TRASLUCIDO = /^rgba?\(/

  const sotto = []
  const saltate = []
  for (const [nomeTema, map] of [['chiaro', rootTokens], ['scuro', darkTokens]]) {
    for (const { nome, bg, testo } of COPPIE) {
      const sfondo = resolve(bg, map)
      const colore = resolve(testo, map)
      assert.ok(colore && HEX.test(colore), `${nome} (${nomeTema}): ${testo} → un esadecimale, non «${colore}»`)
      if (sfondo && TRASLUCIDO.test(sfondo)) {
        saltate.push(`${nome} (${nomeTema})`)
        continue
      }
      assert.ok(sfondo && HEX.test(sfondo), `${nome} (${nomeTema}): ${bg} → un esadecimale, non «${sfondo}»`)
      const ratio = contrastRatio(sfondo, colore)
      if (ratio < 4.5) sotto.push(`${nome} (${nomeTema}): ${ratio.toFixed(2)}:1 — ${colore} su ${sfondo}`)
    }
  }
  assert.deepEqual(
    [...saltate].sort(),
    [...SALTATE_ATTESE].sort(),
    'le coppie non verificabili sono esattamente quelle note (sfondo traslucido in scuro)',
  )
  assert.equal(
    sotto.length,
    0,
    `contrasto AA (4.5:1) su testo normale in chiaro e scuro:\n    ${sotto.join('\n    ')}`,
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// ── 5. ratchet: i numeri possono solo scendere ────────────────────────────────
function walk(dir) {
  const out = []
  for (const voce of readdirSync(dir)) {
    if (voce.startsWith('.') || voce === 'node_modules') continue
    const path = join(dir, voce)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

/**
 * Misure tipografiche arbitrarie (`text-[7px]`, `text-[15px]`…): 310 al momento di
 * M1, **303 dopo M2** (la barra vecchia ne aveva sette: l'etichetta a 7px, i
 * badge, i mini-FAB), **301 dopo M3** (la conferma di eliminazione in linea è
 * diventata un allarme: due pulsanti a 11px non esistono più). Il numero può solo
 * scendere — quando cala si abbassa qui, così il guadagno è bloccato e non si può
 * «riprendere» per sbaglio.
 */
const MAX_TEXT_PX = 301
/** Copie della regex sullo User-Agent fuori da lib/platform.ts: 3 oggi, 0 alla fine di M3. */
const MAX_UA_REGEX = 3

const sorgenti = [...walk('app'), ...walk('components')]
const textPx = sorgenti.reduce(
  (n, file) => n + (readFileSync(file, 'utf8').match(/text-\[[0-9]+px\]/g)?.length ?? 0),
  0,
)
const uaRegex = [...walk('app'), ...walk('components'), ...walk('hooks'), ...walk('lib')].filter(
  (file) =>
    !file.endsWith(join('lib', 'platform.ts')) &&
    /iPad\|iPhone\|iPod/.test(readFileSync(file, 'utf8')),
)

assert.ok(
  textPx <= MAX_TEXT_PX,
  `misure tipografiche arbitrarie: ${textPx} (massimo ${MAX_TEXT_PX}: il ratchet sale solo se ci si dimentica della scala)`,
)
assert.ok(
  uaRegex.length <= MAX_UA_REGEX,
  `copie della regex sullo User-Agent: ${uaRegex.length} (massimo ${MAX_UA_REGEX})\n    ${uaRegex.join('\n    ')}`,
)

// ── 6. nessun token di piattaforma dichiarato e mai LETTO ─────────────────────
/**
 * Una skin può essere «viva» (i valori divergono) ed essere comunque INVISIBILE:
 * se nessuna regola legge un token, quella differenza non si disegna. È il caso di
 * `--elevation-nav`, che fino a M6 era dichiarato in tre blocchi e letto da
 * nessuno — la barra usava una classe del web e la promessa «filo sottile su iOS,
 * ombra di elevazione su Android» non esisteva da nessuna parte. Il controllo di
 * sopra non poteva accorgersene: guarda i VALORI, non i LETTORI. Questo chiude il
 * buco, e vale per ogni token dei blocchi di piattaforma.
 *
 * Cosa conta come lettura: `var(--x)` (anche con ripiego) e
 * `getPropertyValue('--x')`. I commenti del CSS vengono tolti prima di cercare,
 * perché un token nominato in una spiegazione non è un token usato.
 */
const SORGENTI_TOKEN = [
  ...new Set(['app/globals.css', ...walk('app'), ...walk('components'), ...walk('lib'), ...walk('hooks'), ...walk('scripts')]),
].filter((file) => /\.(css|tsx?|mjs|js)$/.test(file))

const LETTURE = new Set()
for (const file of SORGENTI_TOKEN) {
  const testo = file === 'app/globals.css' ? stripComments(readFileSync(file, 'utf8')) : readFileSync(file, 'utf8')
  for (const m of testo.matchAll(/var\(\s*(--[\w-]+)/g)) LETTURE.add(m[1])
  for (const m of testo.matchAll(/getPropertyValue\(\s*['"`](--[\w-]+)['"`]\s*\)/g)) LETTURE.add(m[1])
}

const NON_LETTI = chiaviIos.filter((k) => !LETTURE.has(k))
assert.equal(
  NON_LETTI.length,
  0,
  'token di piattaforma dichiarati e mai letti (una skin così è invisibile: la differenza non si disegna):\n    ' +
    NON_LETTI.join('\n    '),
)

console.log(
  `OK — token di piattaforma coerenti (${chiaviIos.length} chiavi × 2), scala tipografica collegata, ` +
    `contrasto AA su ${COPPIE.length * 2 - SALTATE_ATTESE.length} coppie ` +
    `(${SALTATE_ATTESE.length} saltate: sfondo traslucido in scuro), ` +
    `ratchet: ${textPx} misure arbitrarie, ${uaRegex.length} regex UA fuori da lib/platform.ts, ` +
    `nessun token di piattaforma senza lettore`,
)
