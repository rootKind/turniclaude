/**
 * SONDA COLORI — lettura del DOM (richiesta 17/09/2026).
 *
 * Qui sta la parte che ha bisogno di un browser: toccato un elemento, dire
 * **che colori ha**, **da dove vengono** e **qual è il suo selettore**. La
 * logica pura (nomi delle variabili, anteprima, testo della richiesta) sta in
 * `lib/theme-inspector.ts`.
 *
 * L'idea che rende utile tutto il resto: in questa app un colore non è quasi mai
 * scritto sull'elemento, è una VARIABILE di globals.css (`--cell-rest-bg`,
 * `--primary`) oppure una classe che la usa (`bg-primary/10`). Quindi per ogni
 * colore trovato si cerca **il collegamento**: prima il valore dichiarato
 * (`var(--x)` nella regola che lo imposta), poi la classe, e solo come ultima
 * spiaggia il confronto per valore fra tutti i token in vigore. Il risultato è
 * che la riga non dice «#e4e6e9» ma «variabile --cell-rest-bg, dichiarata in
 * :root» — che è l'informazione che serve per cambiarla nel codice.
 */
import {
  classiSalienti,
  coloreLeggibile,
  etichettaToken,
  selettoreDaPercorso,
  type GradinoSelettore,
  type Slot,
  type TemaSonda,
} from './theme-inspector'

/** Le proprietà che possono essere un colore, nell'ordine in cui si mostrano. */
const PROPRIETA: { prop: string; etichetta: string }[] = [
  { prop: 'background-color', etichetta: 'Sfondo' },
  { prop: 'color', etichetta: 'Testo' },
  // `border-color` è «tutti e quattro i lati»: se i lati hanno colori diversi
  // (capita: un bordo alto più marcato) il giro si allarga nei quattro lati.
  { prop: 'border-color', etichetta: 'Bordo' },
  { prop: 'outline-color', etichetta: 'Contorno' },
  { prop: 'box-shadow', etichetta: 'Ombra/cornice' },
  { prop: 'fill', etichetta: 'Riempimento' },
  { prop: 'stroke', etichetta: 'Contorno (SVG)' },
  { prop: 'caret-color', etichetta: 'Cursore' },
  { prop: 'text-decoration-color', etichetta: 'Sottolineatura' },
  { prop: 'accent-color', etichetta: 'Bollino dei campi' },
]

const LATI = [
  { prop: 'border-top-color', etichetta: 'Bordo alto' },
  { prop: 'border-right-color', etichetta: 'Bordo destro' },
  { prop: 'border-bottom-color', etichetta: 'Bordo basso' },
  { prop: 'border-left-color', etichetta: 'Bordo sinistro' },
]

/**
 * Da dove può arrivare il valore dichiarato di una proprietà. Serve perché in
 * globals.css i bordi sono scritti in SHORTHAND (`border: 1px solid color-mix(…)`)
 * e il CSSOM non espone `border-top-color` per una regola che dichiara
 * `border`: senza questa catena, il bordo risulterebbe «senza regola» — cioè
 * un'informazione persa proprio dove serve.
 */
const CATENA_SHORTHAND: Record<string, string[]> = {
  'background-color': ['background-color', 'background'],
  color: ['color'],
  'border-color': ['border-color', 'border'],
  'border-top-color': ['border-top-color', 'border-top', 'border'],
  'border-right-color': ['border-right-color', 'border-right', 'border'],
  'border-bottom-color': ['border-bottom-color', 'border-bottom', 'border'],
  'border-left-color': ['border-left-color', 'border-left', 'border'],
  'outline-color': ['outline-color', 'outline'],
  'box-shadow': ['box-shadow'],
  fill: ['fill'],
  stroke: ['stroke'],
  'caret-color': ['caret-color'],
  'text-decoration-color': ['text-decoration-color', 'text-decoration'],
  'accent-color': ['accent-color'],
}

/** Le proprietà in cui si può SCRIVERE il colore trovato (l'ombra si riscrive). */
const SCRIVIBILI = new Set([
  'background-color', 'color', 'border-color', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke',
  'caret-color', 'text-decoration-color', 'accent-color', 'box-shadow',
])

/** Il valore calcolato di una proprietà, shorthand compresi. */
function leggiProp(cs: CSSStyleDeclaration, prop: string): string {
  const diretto = cs.getPropertyValue(prop)
  if (diretto) return diretto
  const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  return (cs as unknown as Record<string, string>)[camel] ?? ''
}

// ── Colori: da qualsiasi notazione a quella leggibile ─────────────────────────

/**
 * Le variabili INTERNE che in Tailwind v4 esistono su ogni elemento
 * (`--tw-duration`, `--tw-enter-opacity`, `--spacing`, `--radius`…): hanno valori
 * che non sono colori e riempirebbero il pannello di righe inutili. Il filtro è
 * sul nome e non sul valore perché i valori cambiano a ogni versione della
 * libreria; «tw-» invece resta il prefisso con cui Tailwind firma le sue.
 */
const VAR_INTERNE = /^--(tw-|spacing|radius|font-|text-|leading|tracking|container|animate|default-|ease|blur|shadow|perspective|aspect|scrollbar|lightningcss)/

export function variabileUtile(nome: string): boolean {
  return !VAR_INTERNE.test(nome)
}

let sonda: HTMLElement | null = null

/**
 * Il colore come lo vede lo schermo. Serve per `oklch()` (il tema chiaro di
 * globals.css usa oklch per metà delle tinte): invece di scrivere qui un motore
 * di conversione, si fa dire il colore al browser con un elemento usa-e-getta
 * (`getComputedStyle` restituisce sempre `rgb()`/`rgba()`).
 *
 * Torna STRINGA VUOTA quando il valore non è un colore. Non è pignoleria: il
 * browser, davanti a `color: .7s`, ignora la dichiarazione e lascia il colore
 * precedente — senza il controllo qui sotto, `--tw-duration: .7s` diventerebbe
 * «nero» e finirebbe nel pannello come se fosse una tinta.
 */
export function risolviColore(valore: string): string {
  if (!valore) return ''
  if (/^#[0-9a-f]{3,8}$/i.test(valore)) return coloreLeggibile(valore)
  if (typeof document === 'undefined') return coloreLeggibile(valore)
  if (!sonda) {
    sonda = document.createElement('span')
    sonda.setAttribute('data-sonda-colori', 'sonda')
    sonda.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden'
    document.body.appendChild(sonda)
  }
  sonda.style.color = ''
  sonda.style.color = valore
  if (!sonda.style.color) return ''
  // La conversione la fa il canvas, non il testo: per i colori fuori gamma
  // (oklch, lab, color-mix) `getComputedStyle` risponde in `lab(…)`, che non è un
  // colore che si possa copiare in una richiesta. Un pixel di canvas è sempre
  // sRGB, cioè un `#rrggbb` leggibile.
  if (/^rgba?\(/i.test(valore)) return coloreLeggibile(valore)
  return convertiConCanvas(valore)
}

let tela: HTMLCanvasElement | null = null

function convertiConCanvas(valore: string): string {
  if (!tela) {
    tela = document.createElement('canvas')
    tela.width = 1
    tela.height = 1
  }
  const ctx = tela.getContext('2d', { willReadFrequently: true })
  if (!ctx) return valore
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = valore
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  const hex = `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`
  return a >= 255 ? hex : `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`
}

/** Un colore che si VEDE: esiste e non è del tutto trasparente. */
export function coloreVisibile(valore: string): string {
  const c = risolviColore(valore)
  return c && c !== 'rgba(0, 0, 0, 0)' ? c : ''
}

/** I colori dentro un valore composto (es. `box-shadow` ne può avere più d'uno). */
export function coloriDentro(valore: string): string[] {
  const trovati = valore.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/gi)
  return trovati ? trovati.map(coloreLeggibile) : []
}

/**
 * Riscrive il colore DENTRO un valore composto, lasciando il resto: da
 * `0 0 0 1px rgba(15,23,42,0.14)` a `0 0 0 1px #dc2626`. Se il colore di
 * partenza non c'è (la forma è cambiata), torna `null`: meglio dirlo che
 * scrivere una regola sbagliata.
 */
export function sostituisciColore(valore: string, da: string, a: string): string | null {
  const target = coloreLeggibile(da).toLowerCase()
  const pezzi = valore.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/gi)
  if (!pezzi) return null
  for (const pezzo of pezzi) {
    if (coloreLeggibile(pezzo).toLowerCase() === target) return valore.replace(pezzo, a)
  }
  if (pezzi.length === 1) return valore.replace(pezzi[0], a)
  return null
}

// ── Le regole CSS in vigore ───────────────────────────────────────────────────

interface RegolaCss {
  selettore: string
  stile: CSSStyleDeclaration
}

/** Le regole di tutti i fogli, appiattite (dentro @media/@supports compresi). */
function tutteLeRegole(): RegolaCss[] {
  const out: RegolaCss[] = []
  const visita = (regole: CSSRuleList) => {
    for (const r of Array.from(regole)) {
      const conFigli = r as CSSRule & { cssRules?: CSSRuleList; selectorText?: string; style?: CSSStyleDeclaration }
      if (conFigli.selectorText && conFigli.style) {
        out.push({ selettore: conFigli.selectorText, stile: conFigli.style })
      } else if (conFigli.cssRules) {
        visita(conFigli.cssRules)
      }
    }
  }
  for (const foglio of Array.from(document.styleSheets)) {
    try {
      visita(foglio.cssRules)
    } catch {
      // Foglio di un'altra origine (font, CDN): non si può leggere, si salta.
    }
  }
  return out
}

function combacia(el: Element, selettore: string): boolean {
  try {
    return selettore.split(',').some(s => el.matches(s.trim().replace(/::[a-z-]+.*$/i, '')))
  } catch {
    return false
  }
}

/**
 * La regola che imposta la proprietà e il valore come è scritto lì, l'ULTIMA che
 * combacia (la cascata: vince l'ultima). Si guarda anche la shorthand, così un
 * `border: 1px solid …` conta come «bordo».
 */
function regolaPerProprieta(
  regole: RegolaCss[],
  el: Element,
  prop: string,
): { regola: RegolaCss; dichiarato: string } | null {
  for (const candidata of CATENA_SHORTHAND[prop] ?? [prop]) {
    let trovata: { regola: RegolaCss; dichiarato: string } | null = null
    for (const r of regole) {
      const valore = r.stile.getPropertyValue(candidata)
      if (valore && combacia(el, r.selettore)) trovata = { regola: r, dichiarato: valore }
    }
    if (trovata) return trovata
  }
  return null
}

/**
 * Il nome della variabile che regge davvero questo colore. In globals.css metà
 * delle regole è una CATENA: `background: var(--c-bg, var(--cell-rest-bg))`, dove
 * `--c-bg` è la manopola della personalizzazione di «Il tuo turno» e
 * `--cell-rest-bg` è il colore vero del tema. Prendere il primo nome della
 * catena sarebbe sbagliato (chiederebbe di cambiare una variabile che nessuno
 * dichiara); quindi si sceglie il primo che un foglio DICHIARA, e si tiene nota
 * della catena per dirlo nel report.
 */
function variabileDelColore(dichiarato: string, regole: RegolaCss[]): { nome: string | null; catena: string[] } {
  const catena = [...dichiarato.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1])
  const dichiarata = catena.find(n => variabileUtile(n) && regole.some(r => r.stile.getPropertyValue(n)))
  return { nome: dichiarata ?? catena.find(variabileUtile) ?? null, catena }
}

/** Dove è dichiarata una variabile: preferendo il blocco del tema in vigore. */
export function origineVariabile(regole: RegolaCss[], nome: string, tema: TemaSonda): string {
  const dichiarano = regole.filter(r => r.stile.getPropertyValue(nome))
  if (dichiarano.length === 0) return 'non dichiarata in un foglio (stile in linea?)'
  const delTema = dichiarano.find(r => r.selettore.split(',').some(s => s.trim() === (tema === 'dark' ? '.dark' : ':root')))
  const scelta = delTema ?? dichiarano[dichiarano.length - 1]
  const selettore = scelta.selettore.split(',')[0].trim()
  const valore = scelta.stile.getPropertyValue(nome).trim()
  const dove = selettore === ':root' ? 'tema chiaro (:root)' : selettore === '.dark' ? 'tema scuro (.dark)' : selettore
  return `${valore} — ${dove}`
}

/** Le variabili di colore in vigore su questo elemento (sue o ereditate). */
function variabiliInVigore(el: Element): Map<string, string> {
  const out = new Map<string, string>()
  const cs = getComputedStyle(el)
  for (let i = 0; i < cs.length; i++) {
    const nome = cs.item(i)
    if (!nome.startsWith('--') || !variabileUtile(nome)) continue
    const valore = cs.getPropertyValue(nome).trim()
    if (valore && coloreVisibile(valore)) out.set(nome, valore)
  }
  return out
}

// ── Descrizione e selettore dell'elemento ─────────────────────────────────────

function testoBreve(el: Element): string {
  const testo = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? ''
  return testo.length > 40 ? `${testo.slice(0, 40)}…` : testo
}

/** «div.cell-day “MDCCM” · giorno 12»: come lo chiamerei a voce. */
export function descrizioneDi(el: Element): string {
  const classi = classiSalienti(Array.from(el.classList), 2)
  const testo = testoBreve(el)
  const pezzi = [`<${el.tagName.toLowerCase()}${classi.map(c => `.${c}`).join('')}>`]
  if (testo) pezzi.push(`“${testo}”`)
  const aria = el.getAttribute('aria-label')
  if (aria) pezzi.push(`(${aria})`)
  const cella = el.closest('.cell-day')
  if (cella) {
    const giorno = cella.querySelector('.day-num')?.textContent?.trim() ?? cella.textContent?.trim().slice(0, 2)
    if (giorno && cella !== el) pezzi.push(`· cella del giorno ${giorno}`)
    else if (giorno) pezzi.push(`· cella del giorno ${giorno}`)
  }
  const sezione = el.closest('.sala-card, [data-desk-card]')
  if (sezione) {
    const titolo = sezione.querySelector('.sala-card-title, [data-card-title]')?.textContent?.replace(/\s+/g, ' ').trim()
    if (titolo) pezzi.push(`· card ${titolo.slice(0, 24)}`)
  }
  return pezzi.join(' ')
}

/** Il percorso dal `body` all'elemento, con al massimo 3 gradini. */
function percorsoDi(el: Element): GradinoSelettore[] {
  const gradini: GradinoSelettore[] = []
  let nodo: Element | null = el
  while (nodo && nodo.tagName.toLowerCase() !== 'body' && gradini.length < 3) {
    const classi = classiSalienti(Array.from(nodo.classList))
    const fratelli = nodo.parentElement
      ? Array.from(nodo.parentElement.children).filter(c => c.tagName === nodo!.tagName)
      : [nodo]
    gradini.unshift({
      tag: nodo.tagName.toLowerCase(),
      classi,
      nth: classi.length === 0 && fratelli.length > 1 ? fratelli.indexOf(nodo as Element) + 1 : undefined,
    })
    nodo = nodo.parentElement
  }
  return gradini
}

/** Il selettore leggibile, con l'id davanti se c'è. */
export function selettoreDi(el: Element): string {
  if (el.id) return `#${el.id}`
  const percorso = percorsoDi(el)
  if (percorso.length === 0) return el.tagName.toLowerCase()
  return selettoreDaPercorso(percorso)
}

/**
 * Lo sfondo che si vede DAVVERO su questo elemento, quando il suo è
 * trasparente: risalendo i genitori. Serve perché metà degli elementi dell'app
 * non hanno uno sfondo proprio (e uno che chiede «questo grigio da dove viene?»
 * merita la risposta).
 */
export function sfondoVisibile(el: Element): { colore: string; da: string } | null {
  let nodo: Element | null = el
  while (nodo) {
    const bg = getComputedStyle(nodo).backgroundColor
    if (bg && coloreLeggibile(bg) && !/rgba\(0, 0, 0, 0\)/.test(bg)) {
      const classi = classiSalienti(Array.from(nodo.classList), 1)
      return { colore: coloreLeggibile(bg), da: `${nodo.tagName.toLowerCase()}${classi.map(c => `.${c}`).join('')}` }
    }
    nodo = nodo.parentElement
  }
  return null
}

// ── Quello che si può cambiare su un elemento ─────────────────────────────────

export interface LetturaElemento {
  descrizione: string
  selettore: string
  /** Sfondo effettivamente visibile quando questo è trasparente. */
  sfondo: { colore: string; da: string } | null
  slots: Slot[]
}

/** La classe di colore che vale per questo elemento (bg-primary/10 → --primary). */
function classeCheDaColore(regole: RegolaCss[], el: Element, prop: string): { classe: string; variabile: string } | null {
  for (const classe of Array.from(el.classList)) {
    const escape = classe.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    const regola = regole.find(r => new RegExp(`\\.${escape}(\\\\/\\d+)?(::?[a-z-]+)?$`).test(r.selettore.trim()) && r.stile.getPropertyValue(prop))
    if (regola) {
      const varName = /var\((--[\w-]+)/.exec(regola.stile.getPropertyValue(prop))
      if (varName) return { classe, variabile: varName[1] }
    }
  }
  return null
}

/**
 * Tutti i colori di un elemento, ognuno con **da dove viene**: la variabile (col
 * suo blocco), la classe che la usa, o la regola che lo imposta. Gli slot sono
 * nell'ordine in cui si mostrano: prima quello che si vede, poi i bordi, poi il
 * resto.
 */
export function leggiElemento(el: Element, tema: TemaSonda): LetturaElemento {
  const regole = tutteLeRegole()
  const cs = getComputedStyle(el)
  const variabili = variabiliInVigore(el)
  const slots: Slot[] = []
  const perId = new Set<string>()

  const aggiungi = (slot: Slot) => {
    if (perId.has(slot.id)) return
    perId.add(slot.id)
    slots.push(slot)
  }

  /** Un colore di una proprietà: token se c'è, altrimenti regola puntuale. */
  const slotPer = (prop: string, etichetta: string, colore: string) => {
    // 1. Il collegamento diretto: la regola che lo imposta e la variabile che usa.
    const trovata = regolaPerProprieta(regole, el, prop)
    const dichiarato = trovata?.dichiarato ?? ''
    const { nome: nomeVar, catena } = variabileDelColore(dichiarato, regole)
    // 2. La classe di Tailwind che lo porta (bg-primary/10 → --primary).
    const daClasse = nomeVar ? null : classeCheDaColore(regole, el, prop)
    const token = nomeVar ?? daClasse?.variabile ?? null
    // 3. Ultima spiaggia: una variabile in vigore con lo stesso colore — ma SOLO
    //    se è l'unica: in questa app più token condividono lo stesso valore
    //    (`--card-foreground` e `--popover-foreground` sono lo stesso nero), e
    //    sceglierne uno a caso sarebbe una bugia comoda: la richiesta manderebbe
    //    a cambiare un token che non c'entra. Meglio non dire niente.
    const perValore = token ? null : (() => {
      const candidati = [...variabili.entries()].filter(([, v]) => risolviColore(v) === colore)
      return candidati.length === 1 ? candidati[0][0] : null
    })()
    const scelto = token ?? perValore ?? null

    const catenaNota = catena.length > 1 ? ` · catena: ${catena.join(' → ')}` : ''
    const segueTesto = /currentcolor/i.test(dichiarato)
      ? ` · segue il colore del testo${slots.find(s => s.nome.endsWith('-text')) ? ` (${slots.find(s => s.nome.endsWith('-text'))!.nome})` : ''}`
      : ''
    const origine = nomeVar
      ? `variabile ${nomeVar} (${origineVariabile(regole, nomeVar, tema)})${catenaNota}${segueTesto}`
      : daClasse
        ? `classe .${daClasse.classe} → variabile ${daClasse.variabile} (${origineVariabile(regole, daClasse.variabile, tema)})`
        : perValore
          ? `variabile ${perValore} (${origineVariabile(regole, perValore, tema)})`
          : trovata
            ? `regola ${trovata.regola.selettore.split(',')[0].trim()}${segueTesto}`
            : 'stile in linea o valore predefinito del browser'

    const etichettaSlot = scelto ? `${etichetta} · ${etichettaToken(scelto)}` : etichetta
    if (scelto) {
      aggiungi({
        id: `var:${scelto}`,
        tipo: 'var',
        nome: scelto,
        proprieta: '',
        etichetta: etichettaSlot,
        valore: risolviColore(variabili.get(scelto) ?? colore),
        origine,
      })
    } else if (trovata || dichiarato) {
      const selettore = trovata?.regola.selettore.split(',')[0].trim() ?? el.tagName.toLowerCase()
      aggiungi({
        id: `regola:${selettore}|${prop}`,
        tipo: 'regola',
        nome: selettore,
        proprieta: prop,
        etichetta: etichettaSlot,
        valore: colore,
        origine,
      })
    }
  }

  /** Un bordo c'è se ha larghezza e uno stile: trasparente o a 0 è rumore. */
  const bordoVisibile = (lato: string) => {
    const larghezza = parseFloat(leggiProp(cs, lato ? `border-${lato}-width` : 'border-width'))
    const stile = leggiProp(cs, lato ? `border-${lato}-style` : 'border-style')
    return !!larghezza && stile !== 'none' && stile !== ''
  }

  /**
   * Un colore si mostra solo se su questo elemento si può VEDERE. La regola non
   * è pedanteria: su ogni `div` il browser tiene un `outline-color` e un
   * `caret-color` che valgono qualcosa anche quando non si vede niente, e il
   * pannello si riempirebbe di righe che, cambiate, non fanno alcun effetto.
   */
  const proprietaVisibile = (prop: string): boolean => {
    switch (prop) {
      case 'outline-color':
        return leggiProp(cs, 'outline-style') !== 'none' && parseFloat(leggiProp(cs, 'outline-width')) > 0
      case 'text-decoration-color':
        return leggiProp(cs, 'text-decoration-line') !== 'none'
      case 'caret-color':
        return el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      case 'accent-color':
        return el instanceof HTMLInputElement && ['checkbox', 'radio', 'range', 'file'].includes(el.type)
      default:
        return true
    }
  }

  for (const { prop, etichetta } of PROPRIETA) {
    if (!SCRIVIBILI.has(prop)) continue
    const grezzo = leggiProp(cs, prop)
    if (!grezzo) continue
    const colore = risolviColore(grezzo)
    if (!colore || colore === 'rgba(0, 0, 0, 0)') continue
    if (prop === 'fill' || prop === 'stroke') {
      if (!(el instanceof SVGElement)) continue
    }
    if (!proprietaVisibile(prop)) continue
    if (prop === 'border-color') {
      // Tutti i lati uguali (il caso normale): una riga sola. Diversi (capita:
      // un bordo alto più marcato) → una riga per lato, così si vede quale è.
      if (!bordoVisibile('')) continue
      const lati = LATI.map(l => ({ ...l, colore: risolviColore(leggiProp(cs, l.prop)) }))
      const uguali = lati.every(l => l.colore === lati[0].colore)
      if (uguali) slotPer('border-color', etichetta, lati[0].colore)
      else for (const l of lati) if (bordoVisibile(l.prop.split('-')[1])) slotPer(l.prop, l.etichetta, l.colore)
      continue
    }
    slotPer(prop, etichetta, colore)
  }

  // Le variabili impostate QUI (sulla regola dell'elemento o in linea): sono le
  // manopole pensate per quell'elemento, anche se il colore che producono si
  // vede su un pezzo che qui non c'è (un `::before`, per esempio).
  const inline = (el as HTMLElement).style
  const qui = new Map<string, string>()
  for (const r of regole) {
    if (!combacia(el, r.selettore)) continue
    for (const nome of Array.from(r.stile)) {
      if (nome.startsWith('--') && r.stile.getPropertyValue(nome)) qui.set(nome, r.stile.getPropertyValue(nome).trim())
    }
  }
  for (const nome of Array.from(inline)) {
    if (nome.startsWith('--') && inline.getPropertyValue(nome)) qui.set(nome, inline.getPropertyValue(nome).trim())
  }
  for (const [nome, valore] of qui) {
    if (perId.has(`var:${nome}`)) continue
    if (!variabileUtile(nome)) continue
    const coloreVar = coloreVisibile(valore)
    if (!coloreVar) continue
    aggiungi({
      id: `var:${nome}`,
      tipo: 'var',
      nome,
      proprieta: '',
      etichetta: `${etichettaToken(nome)} (impostata qui)`,
      valore: coloreVar,
      origine: `variabile impostata su questo elemento (${origineVariabile(regole, nome, tema)})`,
    })
  }

  return {
    descrizione: descrizioneDi(el),
    selettore: selettoreDi(el),
    sfondo: sfondoVisibile(el),
    slots,
  }
}

/**
 * Scrive l'anteprima nel `head` (un solo `<style>`, riscritto a ogni modifica).
 * Toglierla del tutto VUOTA il foglio: l'app torna ai colori suoi.
 */
export function applicaAnteprimaCss(css: string): void {
  let foglio = document.getElementById('sonda-colori-anteprima') as HTMLStyleElement | null
  if (!css) {
    foglio?.remove()
    return
  }
  if (!foglio) {
    foglio = document.createElement('style')
    foglio.id = 'sonda-colori-anteprima'
    document.head.appendChild(foglio)
  }
  foglio.textContent = css
}

/**
 * La pila di elementi sotto il dito, dal più preciso al più esterno: è il modo
 * per «entrare» e «uscire» dall'elemento giusto senza indovinare (il tocco
 * prende sempre il pezzo più piccolo, il testo dentro il badge dentro la card).
 */
export function pilaAlPunto(x: number, y: number, massimo = 8): Element[] {
  return document
    .elementsFromPoint(x, y)
    .filter(el => !el.closest('[data-sonda-colori]'))
    .slice(0, massimo)
}

