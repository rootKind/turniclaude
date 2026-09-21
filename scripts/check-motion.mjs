// CONTRATTO DEL MOTO (M7, 22/09/2026).
//
// Cosa verifica, e perché ognuna di queste cose è un difetto che si vede tardi:
//
//  1. I TOKEN E LE MOLLE COINCIDONO. I valori in `app/globals.css` (le molle
//     `linear(...)`) devono essere ESATTAMENTE quelli calcolati da `lib/motion.ts`.
//     Non è pignoleria: una molla è ~400 caratteri di numeri, e l'unico modo di
//     sbagliarla è copiarla a mano. La matematica NON è riscritta qui — si
//     transpila e si importa `lib/motion.ts`, la stessa che genera i token.
//  2. LA DURATA È QUELLA DELLA MOLLA. In CSS una molla va in coppia con una
//     durata, e la durata giusta è il suo tempo di assestamento: se resta quella
//     di prima, il campione viene tagliato a metà e il rimbalzo non si vede. Le tre
//     durate delle due piattaforme — `--motion-duration-enter` (il pannello che
//     sale), `--motion-duration-press` (la pressione e il suo ritorno) e
//     `--motion-duration-exit` (il velo) — devono quindi valere quanto
//     `assestamentoMs()` della molla che governano.
//  3. LE DUE PIATTAFORME DIVERGONO DAVVERO. Android usa le molle di Material
//     (famiglia spatial per ciò che si sposta, effects per colore e opacità);
//     iOS usa il trio in linguaggio SwiftUI. Se i due valori tornassero uguali,
//     la skin del moto sarebbe copiata.
//  4. LE EFFECTS NON RIMBALZANO. È la regola che si sbaglia sempre: un'alpha o un
//     colore che supera il bersaglio è un difetto (una dissolvenza che «va sopra»
//     si vede come uno sfarfallio). Si controlla il rimbalzo massimo.
//
// Uso: `node scripts/check-motion.mjs` (verifica) · `--print` (stampa i valori)
//     `--write` (li scrive nei blocchi di piattaforma del foglio di stile).
//
// Perché `--write` esiste: una molla in CSS sono ~400 caratteri di numeri, e
// l'unico modo di sbagliarla è copiarla a mano. I valori sono GENERATI, quindi si
// rigenerano — come il seed delle squadre (`generate-seed.mjs`).
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const CSS = readFileSync('app/globals.css', 'utf8')

// Gli stessi due aiutanti di `check-design-tokens.mjs`: il blocco si estrae con
// il brace-matching perché una regex sola non reggerebbe le graffe annidate
// (`color-mix()`, `calc()`), e un'estrazione sbagliata deve fallire, non
// degradare in silenzio.
function blockRange(re, label, css = CSS) {
  const m = re.exec(css)
  assert.ok(m, `blocco \`${label}\` presente in app/globals.css`)
  const open = css.indexOf('{', m.index)
  let depth = 0
  let i = open
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return { da: open + 1, a: i }
}

function block(re, label) {
  const { da, a } = blockRange(re, label)
  return CSS.slice(da, a)
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

function declarations(text) {
  const out = {}
  for (const m of stripComments(text).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[`--${m[1]}`] = m[2].trim().replace(/\s+/g, ' ')
  }
  return out
}

const iosTokens = declarations(block(/^\[data-platform='ios'\]\s*\{/m, "[data-platform='ios']"))
const androidTokens = declarations(block(/^\[data-platform='android'\]\s*\{/m, "[data-platform='android']"))

// ── la fisica, importata (non riscritta) ──────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'motion-check-'))
let moto
try {
  const transpiled = ts.transpileModule(readFileSync('lib/motion.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  writeFileSync(join(dir, 'motion.js'), transpiled)
  moto = await import(pathToFileURL(join(dir, 'motion.js')).href)

  const righe = []
  const attesi = { ios: {}, android: {} }

  for (const voce of moto.TOKEN_MOTO) {
    for (const [piattaforma, molla] of [
      ['ios', voce.ios],
      ['android', voce.android],
    ]) {
      const easing = moto.linearDaMolla(molla)
      attesi[piattaforma][voce.token] = easing

      // 4. Le effects non devono superare il bersaglio (e nemmeno le altre
      //    esagerare: oltre il 12% di rimbalzo non è più «espressivo», è instabile).
      const rimbalzo = moto.rimbalzo(molla)
      if (voce.ruolo === 'fade') {
        assert.ok(rimbalzo === 0, `${voce.token} (${piattaforma}): un velo non rimbalza (misurato ${(rimbalzo * 100).toFixed(2)}%)`)
      }
      assert.ok(rimbalzo <= 0.12, `${voce.token} (${piattaforma}): rimbalzo ${(rimbalzo * 100).toFixed(2)}%, oltre il 12% il movimento sembra instabile`)

      righe.push(
        `  ${voce.token} (${piattaforma}/${voce.ruolo}): ζ=${molla.damping} k=${molla.stiffness} ` +
          `→ assesta in ${moto.assestamentoMs(molla)}ms, rimbalzo ${(rimbalzo * 100).toFixed(2)}%`,
      )
    }
  }

  // 2. Le durate derivano dalle molle: `enter` dalla molla del pannello che sale,
  //    `exit` da quella della dissolvenza, `press` da quella della pressione. In
  //    CSS una molla non sta mai da sola (`transition` e `animation` vogliono una
  //    durata): la durata giusta è il tempo di assestamento, non un numero a parte.
  const perRuolo = (piattaforma, ruolo) => moto.TOKEN_MOTO.find((v) => v.ruolo === ruolo)[piattaforma]
  for (const [piattaforma, ruolo, token] of [
    ['ios', 'pop', '--motion-duration-enter'],
    ['ios', 'fade', '--motion-duration-exit'],
    ['ios', 'press', '--motion-duration-press'],
    ['android', 'pop', '--motion-duration-enter'],
    ['android', 'fade', '--motion-duration-exit'],
    ['android', 'press', '--motion-duration-press'],
  ]) {
    attesi[piattaforma][token] = `${moto.assestamentoMs(perRuolo(piattaforma, ruolo))}ms`
  }

  if (process.argv.includes('--print')) {
    console.log('── da incollare nei blocchi di piattaforma di app/globals.css ──')
    for (const [piattaforma, mappa] of [['ios', attesi.ios], ['android', attesi.android]]) {
      console.log(`\n[data-platform='${piattaforma}']`)
      for (const [token, valore] of Object.entries(mappa)) console.log(`  ${token}: ${valore};`)
    }
    console.log('\n── misure ──')
    for (const riga of righe) console.log(riga)
    process.exit(0)
  }

  if (process.argv.includes('--write')) {
    // Si scrive DENTRO i blocchi di piattaforma, token per token: le righe già
    // presenti si aggiornano, quelle che mancano si aggiungono dopo
    // `--motion-ease-standard` (l'ancora del moto a durate, che è lì da M1).
    const ancore = { ios: "[data-platform='ios']", android: "[data-platform='android']" }
    let css = CSS
    let scritte = 0

    for (const [piattaforma, mappa] of [['ios', attesi.ios], ['android', attesi.android]]) {
      const re = new RegExp(`^\\[data-platform='${piattaforma}'\\]\\s*\\{`, 'm')
      const { da, a } = blockRange(re, ancore[piattaforma], css)
      let testo = css.slice(da, a)

      for (const [token, valore] of Object.entries(mappa)) {
        const riga = new RegExp(`^(\\s*)${token}\\s*:[^;]*;`, 'm')
        if (riga.test(testo)) {
          testo = testo.replace(riga, `$1${token}: ${valore};`)
        } else {
          const ancoraggio = /^(\s*)--motion-ease-standard\s*:[^;]*;/m
          assert.ok(ancoraggio.test(testo), `${piattaforma}: manca l'ancora --motion-ease-standard`)
          testo = testo.replace(ancoraggio, (m) => `${m}\n  ${token}: ${valore};`)
        }
        scritte++
      }

      css = css.slice(0, da) + testo + css.slice(a)
    }

    writeFileSync('app/globals.css', css)
    console.log(`scritte ${scritte} righe di moto nei due blocchi di piattaforma`)
    process.exit(0)
  }

  // 1 + 2. Confronto con i blocchi veri del foglio di stile.
  for (const [piattaforma, mappa] of [
    ['iOS', attesi.ios],
    ['Android', attesi.android],
  ]) {
    const dichiarati = piattaforma === 'iOS' ? iosTokens : androidTokens
    for (const [token, valore] of Object.entries(mappa)) {
      assert.equal(
        dichiarati[token],
        valore,
        `${token} su ${piattaforma}: nel foglio di stile deve esserci la molla calcolata da lib/motion.ts ` +
          `(esegui \`node scripts/check-motion.mjs --print\` per rigenerarla)`,
      )
    }
  }

  // 3-bis. L'easing OSSERVATO (quello che resta ai movimenti non guidati) deve
  //      coincidere con `--motion-ease-standard` delle due piattaforme: la sonda
  //      (`/admin/movimento`) disegna il confronto molla-contro-easing con questi
  //      valori, quindi se divergessero mostrerebbe un confronto falso — cioè
  //      proprio la cosa che serve a decidere.
  assert.equal(
    iosTokens['--motion-ease-standard'],
    moto.EASING_OSSERVATO.ios,
    '--motion-ease-standard su iOS deve essere quello dichiarato in lib/motion.ts',
  )
  assert.equal(
    androidTokens['--motion-ease-standard'],
    moto.EASING_OSSERVATO.android,
    '--motion-ease-standard su Android deve essere quello dichiarato in lib/motion.ts',
  )

  // 3. Le due skin del moto devono divergere davvero.
  for (const voce of moto.TOKEN_MOTO) {
    assert.notEqual(
      attesi.ios[voce.token],
      attesi.android[voce.token],
      `${voce.token}: iOS e Android devono avere molle diverse (valore identico = skin copiata)`,
    )
  }

  const durate = (p) =>
    `enter ${attesi[p]['--motion-duration-enter']} / press ${attesi[p]['--motion-duration-press']} / ` +
    `exit ${attesi[p]['--motion-duration-exit']}`
  console.log(
    `OK — ${moto.TOKEN_MOTO.length} molle × 2 piattaforme, con le durate derivate dall'assestamento ` +
      `(iOS ${durate('ios')}, Android ${durate('android')}), ` +
      `nessuna famiglia effects che rimbalza`,
  )
  for (const riga of righe) console.log(riga)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
