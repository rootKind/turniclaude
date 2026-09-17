/**
 * SONDA COLORI — logica pura (richiesta 17/09/2026).
 *
 * Il problema che risolve: in questa app i colori vivono in UN POSTO SOLO
 * (`app/globals.css`: variabili sotto `:root` per il tema chiaro e sotto `.dark`
 * per quello scuro), ma dallo schermo non si vede «quale variabile è questo
 * pulsante che non mi piace». Dire a voce «il bordo della card dove sono io» non
 * basta a trovarlo nel codice: serve il nome della variabile, o la regola, e il
 * colore di partenza.
 *
 * Qui c'è la parte che si può provare senza browser: i nomi leggibili delle
 * variabili, la conversione dei colori, il CSS dell'ANTEPRIMA e il testo della
 * RICHIESTA da copiare. La lettura del DOM (che colore ha QUESTO elemento, da
 * dove viene, qual è il suo selettore) sta in `lib/theme-inspector-dom.ts`.
 *
 * NIENTE OVERRIDE NEL DATABASE (decisione 17/09/2026): la sonda ANTEPRIMA sul
 * dispositivo e PREPARA LA RICHIESTA. I colori definitivi restano in
 * globals.css, dove sono sempre stati: la memoria del progetto dice di non
 * reintrodurre gli override globali (migrazione 014, 03/08/2026) e questa volta
 * si è scelto di tenerla quella regola.
 */

/** I due temi dell'app: in globals.css sono `:root` (chiaro) e `.dark` (scuro). */
export type TemaSonda = 'light' | 'dark'

/** Cosa si sta cambiando: una VARIABILE (token dell'app) o una REGOLA puntuale. */
export type SlotTipo = 'var' | 'regola'

/** Un «buco» di colore trovato su un elemento: quello che si può cambiare. */
export interface Slot {
  /** Chiave stabile fra sessioni (draft salvato): `var:--x` / `regola:.sel|prop`. */
  id: string
  tipo: SlotTipo
  /** Nome della variabile (`--cell-rest-bg`) o selettore della regola. */
  nome: string
  /** Proprietà CSS: vuota per i token (il token È la proprietà). */
  proprieta: string
  /** Nome in italiano («Cella riposo — sfondo»). */
  etichetta: string
  /** Colore in vigore adesso (hex leggibile, o rgba() se ha trasparenza). */
  valore: string
  /** Dove quel colore è deciso oggi (`:root`, `.dark`, una classe, una regola). */
  origine: string
}

/** Una modifica richiesta: è la riga che finisce nella richiesta da copiare. */
export interface VoceRichiesta {
  id: string
  tipo: SlotTipo
  nome: string
  proprieta: string
  /** Tema in cui è stata scelta (in chiaro e in scuro le variabili sono diverse). */
  tema: TemaSonda
  /** Colore di partenza e colore voluto. */
  da: string
  a: string
  etichetta: string
  origine: string
  /** Selettore leggibile dell'elemento toccato. */
  selettore: string
  /** Descrizione umana («cella del giorno 12 — “MDCCM”»). */
  descrizione: string
  /** Pagina dove è stato toccato (`/turnisala`). */
  pagina: string
  /** Quando (ISO): serve a me per capire l'ordine in cui le hai scelte. */
  quando: string
}

// ── Nomi leggibili delle variabili ────────────────────────────────────────────
// Non è una tabella di tutte le 323 variabili di globals.css (invecchierebbe in
// una settimana): è una MAPPA DELLE AREE (il primo pezzo del nome) più le voci
// speciali della palette base. Il resto lo compone la regola sotto, così una
// variabile nuova (`--cell-prova-bg`) esce comunque leggibile.

const AREE: Record<string, string> = {
  cell: 'Cella',
  pill: 'Pill',
  chip: 'Chip',
  shift: 'Riga turno',
  sala: 'Sala',
  match: 'Match',
  chain: 'Catena',
  banner: 'Banner',
  banner_impersonate: 'Banner «sto impersonando»',
  'my-period': 'Il mio periodo',
  'altri-pill': 'Chip «altre presenze»',
  vacation: 'Ferie',
  notif: 'Notifica',
  cal: 'Calendario',
  picker: 'Selettore',
  fab: 'Pulsante flottante',
  bottom: 'Barra di navigazione',
  empty: 'Vuoto',
  pend: 'Da confermare',
  swap: 'Cambio turno',
  interest: 'Interesse',
  own: 'Mio',
  others: 'Degli altri',
  highlight: 'Evidenziato',
  row: 'Riga',
  card: 'Card',
}

/** Le parti finali: l'ultimo pezzo del nome dice quale colore è. */
const PARTI: Record<string, string> = {
  bg: 'sfondo',
  background: 'sfondo',
  text: 'testo',
  fg: 'testo',
  foreground: 'testo',
  border: 'bordo',
  ring: 'cornice',
  fill: 'riempimento',
  stroke: 'contorno',
  shadow: 'ombra',
  dot: 'pallino',
  icon: 'icona',
  badge: 'badge',
  date: 'data',
  header: 'testata',
  body: 'corpo',
}

/** La palette base di shadcn: qui il nome da solo non dice niente, va spiegato. */
const BASE: Record<string, string> = {
  '--background': 'Sfondo dell’app',
  '--foreground': 'Testo principale',
  '--card': 'Sfondo delle card',
  '--card-foreground': 'Testo delle card',
  '--popover': 'Sfondo dei pannelli',
  '--popover-foreground': 'Testo dei pannelli',
  '--primary': 'Colore principale (pulsanti, chip accese)',
  '--primary-foreground': 'Testo sul colore principale',
  '--secondary': 'Sfondo secondario',
  '--secondary-foreground': 'Testo sul secondario',
  '--muted': 'Sfondo attenuato',
  '--muted-foreground': 'Testo attenuato (etichette)',
  '--accent': 'Sfondo di evidenziazione al passaggio',
  '--accent-foreground': 'Testo dell’evidenziazione',
  '--destructive': 'Colore di eliminazione',
  '--destructive-foreground': 'Testo sull’eliminazione',
  '--border': 'Bordi (linee)',
  '--input': 'Bordo dei campi',
  '--ring': 'Anello di fuoco',
}

/**
 * «--cell-rest-text» → «Cella rest — testo». Se il nome non si capisce, torna il
 * nome TECNICO con i suoi due trattini (es. `--x9`): meglio una riga tecnica che
 * una riga sbagliata, perché quel nome lo si ritrova in globals.css.
 */
export function etichettaToken(nomeVar: string): string {
  if (BASE[nomeVar]) return BASE[nomeVar]
  const pezzi = nomeVar.replace(/^--/, '').split('-').filter(Boolean)
  if (pezzi.length === 0) return nomeVar
  const parte = PARTI[pezzi[pezzi.length - 1]]
  const testa = pezzi.slice(0, parte ? -1 : undefined)
  const area = AREE[testa[0]] ?? null
  // Se non si è riconosciuto NIENTE (né l'area né la parte), non si inventa una
  // frase con le parole del nome tecnico: si dice com'è.
  if (!parte && !area) return nomeVar
  const resto = (area ? testa.slice(1) : testa).join(' ')
  const nome = [area, resto].filter(Boolean).join(' ').trim()
  if (!nome) return nomeVar
  return [nome, ...(parte ? [parte] : [])].join(' — ')
}

// ── Colori ────────────────────────────────────────────────────────────────────

/**
 * Il colore come lo legge un umano: `#rrggbb`. Da `rgb(a,b,c)` e da `#rgb`.
 * Con trasparenza NON si mente: torna `rgba(r, g, b, a)` (un `#rrggbb` non
 * saprebbe dirlo, e nel report servirebbe a sbagliare).
 */
export function coloreLeggibile(valore: string): string {
  const v = valore.trim()
  if (!v) return ''
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(v)
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(n => Math.round(Number(n)))
    const a = rgb[4] === undefined ? 1 : Number(rgb[4].replace('%', '')) / (rgb[4].endsWith('%') ? 100 : 1)
    if (a >= 1) return rgbToHex(r, g, b)
    return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`
  }
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v)
  if (corto) return `#${corto[1]}${corto[1]}${corto[2]}${corto[2]}${corto[3]}${corto[3]}`.toLowerCase()
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  // oklch()/lab()/color-mix()…: non li converto a mano (sarebbe un pezzo di
  // motore grafico). Il browser lo fa per noi in `lib/theme-inspector-dom.ts`
  // (risolviColore), quindi qui si restituisce il valore così com'è.
  return v
}

function rgbToHex(r: number, g: number, b: number): string {
  const due = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${due(r)}${due(g)}${due(b)}`
}

/** true se i due colori sono lo stesso colore (confronto fra hex e rgba). */
export function stessoColore(a: string, b: string): boolean {
  return coloreLeggibile(a).toLowerCase() === coloreLeggibile(b).toLowerCase()
}

// ── Anteprima ─────────────────────────────────────────────────────────────────

/**
 * Il CSS dell'ANTEPRIMA (solo sul dispositivo): le variabili dove vivrebbero
 * davvero — `:root` per il tema chiaro, `.dark` per lo scuro, com'è in
 * globals.css — e le regole puntuali con `!important`, perché devono battere
 * quello che c'è già (compresi gli stili in linea).
 *
 * Separare i due blocchi NON è un dettaglio: una variabile scritta in `:root`
 * cambia anche il tema scuro se la stessa variabile non è ridefinita in `.dark`.
 * Tenendole nei due blocchi si vede esattamente quello che succederebbe nel
 * codice.
 */
export function previewCss(voci: VoceRichiesta[]): string {
  const chiare = voci.filter(v => v.tipo === 'var' && v.tema === 'light')
  const scure = voci.filter(v => v.tipo === 'var' && v.tema === 'dark')
  const regole = voci.filter(v => v.tipo === 'regola')
  const parte = (elenco: VoceRichiesta[]) =>
    elenco.map(v => `  ${v.nome}: ${v.a}; /* era ${v.da} — ${v.etichetta} */`).join('\n')
  const blocchi: string[] = []
  if (chiare.length) blocchi.push(`:root {\n${parte(chiare)}\n}`)
  if (scure.length) blocchi.push(`.dark {\n${parte(scure)}\n}`)
  for (const r of regole) blocchi.push(`${r.nome} { ${r.proprieta}: ${r.a} !important; } /* era ${r.da} */`)
  return blocchi.join('\n\n')
}

/** Le variabili dell'anteprima raggruppate come nello store (per riapplicarla). */
export function variabiliAnteprima(voci: VoceRichiesta[]): { light: Record<string, string>; dark: Record<string, string> } {
  const out = { light: {} as Record<string, string>, dark: {} as Record<string, string> }
  for (const v of voci) if (v.tipo === 'var') out[v.tema][v.nome] = v.a
  return out
}

// ── La richiesta da copiare ───────────────────────────────────────────────────

/**
 * Il testo che mi arriva in chat. È scritto per essere LETTO DA ME, non da un
 * parser: pagina, elemento, selettore, dove sta oggi il colore, e il cambio
 * `da → a`. Il colore di partenza c'è SEMPRE: senza, non si sa se il valore nel
 * codice è ancora quello che hai visto.
 */
export function richiestaTesto(voci: VoceRichiesta[]): string {
  if (voci.length === 0) return ''
  const quando = new Date(voci[0].quando)
  const data = `${String(quando.getDate()).padStart(2, '0')}/${String(quando.getMonth() + 1).padStart(2, '0')}/${quando.getFullYear()}`
  const righe: string[] = [
    `RICHIESTA COLORI — dal pannello «Sonda colori» (${data})`,
    `${voci.length} ${voci.length === 1 ? 'modifica' : 'modifiche'}`,
    '',
  ]
  voci.forEach((v, i) => {
    righe.push(`${i + 1}. ${v.etichetta}`)
    righe.push(`   pagina:    ${v.pagina} (tema ${v.tema === 'dark' ? 'scuro' : 'chiaro'})`)
    righe.push(`   elemento:  ${v.descrizione}`)
    righe.push(`   selettore: ${v.selettore}`)
    righe.push(`   oggi è:    ${v.origine}`)
    const bersaglio = v.tipo === 'var' ? `${v.nome}` : `${v.nome} { ${v.proprieta} }`
    righe.push(`   voglio:    ${bersaglio}  ${v.da} → ${v.a}`)
    righe.push('')
  })
  righe.push('(Anteprima solo sul mio dispositivo: i colori definitivi restano in globals.css, li cambi tu e pushi.)')
  return righe.join('\n')
}

// ── Selezione leggibile ───────────────────────────────────────────────────────

/** Un gradino del percorso: il tag e le classi che valgono la pena di scrivere. */
export interface GradinoSelettore {
  tag: string
  classi: string[]
  /** Posizione fra i fratelli omonimi: si scrive solo se non c'è altro appiglio. */
  nth?: number
}

/**
 * Il selettore leggibile di un elemento, dal più esterno al più interno.
 * NON è un selettore «unico» da test automatici: è quello che serve a me per
 * ritrovare il pezzo nel codice. Per questo: poche classi (le più parlanti), e
 * `:nth-child` SOLO quando l'elemento non ha né id né classi utili.
 */
export function selettoreDaPercorso(percorso: GradinoSelettore[]): string {
  return percorso
    .map(g => {
      const base = g.tag + g.classi.map(c => `.${c}`).join('')
      const nudo = g.classi.length === 0
      return nudo && g.nth ? `${base}:nth-child(${g.nth})` : base
    })
    .join(' > ')
}

/**
 * Le classi che vale la pena scrivere nel selettore: fuori le utility di
 * Tailwind, che sono decine e non dicono a cosa serve l'elemento.
 *
 * IL FILTRO NON PUÒ ESSERE UNA LISTA DI UTILITY (sono migliaia): è una regola
 * sulla FORMA. Una utility è `prefisso-noto` + `valore-di-scala` (`p-4`,
 * `w-full`, `text-xs`, `rounded-lg`), oppure porta `[`, `/` o `:` (arbitrarie,
 * opacità, varianti). Il resto è una classe del progetto.
 *
 * Il caso che ha reso necessaria questa forma: `my-period-border` (la card del
 * proprio periodo in /turniferie) inizia come `my-2` (margin verticale) e con un
 * filtro a prefissi spariva dal selettore — cioè proprio la classe che serve a
 * chi legge la richiesta per ritrovare il pezzo nel codice.
 */
const PREFISSI_UTILITY = new Set([
  'bg', 'text', 'border', 'ring', 'shadow', 'fill', 'stroke', 'divide', 'outline', 'decoration',
  'accent', 'caret', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr',
  'w', 'h', 'size', 'min-w', 'max-w', 'min-h', 'max-h', 'gap', 'space-x', 'space-y', 'top', 'left',
  'right', 'bottom', 'inset', 'z', 'order', 'col', 'row', 'aspect', 'basis', 'grow', 'shrink', 'flex',
  'grid', 'rounded', 'overflow', 'object', 'whitespace', 'break', 'line-clamp', 'font', 'leading',
  'tracking', 'opacity', 'duration', 'delay', 'ease', 'animate', 'blur', 'brightness', 'contrast',
  'grayscale', 'hue-rotate', 'invert', 'saturate', 'sepia', 'cursor', 'pointer-events', 'select',
  'touch', 'snap', 'place', 'justify', 'items', 'self', 'origin', 'scale', 'rotate', 'skew-x', 'skew-y',
  'translate-x', 'translate-y', 'indent', 'align', 'list', 'columns', 'content',
])

/** Le parole con cui Tailwind chiude i nomi delle utility. */
const SCALA = new Set([
  'auto', 'full', 'screen', 'fit', 'min', 'max', 'none', 'px', 'sm', 'md', 'lg', 'xl', 'xs', 'base',
  '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl', 'center', 'left', 'right', 'top', 'bottom',
  'start', 'end', 'first', 'last', 'odd', 'even', 'solid', 'dashed', 'dotted', 'double', 'hidden',
  'visible', 'scroll', 'clip', 'ellipsis', 'tight', 'snug', 'normal', 'relaxed', 'loose', 'wide',
  'wider', 'widest', 'wrap', 'nowrap', 'balance', 'pretty', 'inherit', 'initial', 'unset',
])

/** Le utility che sono una parola sola, senza trattino. */
const UTILITY_SINGOLE = new Set([
  'flex', 'grid', 'block', 'inline', 'inline-block', 'inline-flex', 'hidden', 'contents', 'table',
  'absolute', 'relative', 'fixed', 'sticky', 'static', 'truncate', 'italic', 'underline', 'uppercase',
  'lowercase', 'capitalize', 'antialiased', 'transform', 'transition', 'container', 'isolate',
  'sr-only', 'not-sr-only', 'grow', 'shrink', 'border', 'shadow', 'filter', 'blur', 'group', 'peer',
])

function èUtility(classe: string): boolean {
  if (UTILITY_SINGOLE.has(classe)) return true
  // Arbitrarie (`text-[11px]`), con opacità (`bg-primary/10`) o con variante
  // (`sm:flex`, `dark:hover:bg-x`): sono utility per costruzione.
  if (/[[\]/:]/.test(classe)) return true
  const [testa, ...resto] = classe.split('-')
  if (resto.length === 0) return false
  if (!PREFISSI_UTILITY.has(testa)) return false
  const coda = resto[resto.length - 1]
  return SCALA.has(coda) || /^[\d.]/.test(resto[0])
}

export function classiSalienti(classi: string[], massimo = 3): string[] {
  return classi
    .filter(c => /^[a-zA-Z][\w-]*$/.test(c))
    .filter(c => !èUtility(c))
    .slice(0, massimo)
}

// ── Il campionario: guardare la coerenza FRA pagine ───────────────────────────

/**
 * Un colore CAMPIONATO: una fotografia, non una modifica.
 *
 * Nasce da un problema pratico (17/09/2026): chi guarda un tema non cambia un
 * colore alla volta, CONFRONTA lo stesso elemento su pagine diverse — «la card
 * della sala ha questo sfondo, la card delle ferie ha lo stesso sfondo?».
 * Per farlo non serve toccare niente: serve che il colore visto su una pagina
 * resti scritto da qualche parte, perché a memoria non si tiene.
 *
 * `nome` è la chiave del confronto ed è MODIFICABILE: campionando lo stesso
 * elemento su tre pagine il nome si ripete da solo, e quello che non torna
 * salta all'occhio invece di andarlo a cercare.
 */
export interface Campione {
  id: string
  /** Come si chiama questo colore nel confronto («Sfondo · Card — sfondo»). */
  nome: string
  pagina: string
  tema: TemaSonda
  descrizione: string
  selettore: string
  /** La variabile che lo regge (vuota se il colore viene da una regola). */
  token: string
  origine: string
  valore: string
  quando: string
}

/** Il nome con cui un colore entra nel campionario la prima volta. */
export function nomeCampione(slot: Slot): string {
  return slot.etichetta.replace(/\s*\(impostata qui\)\s*$/, '').trim()
}

/** Dove è stato campionato: l'elemento (descrizione + selettore), la pagina e il tema. */
export interface ContestoElemento {
  tema: TemaSonda
  pagina: string
  selettore: string
  descrizione: string
}

/**
 * Fotografa UN colore dell'elemento nel campionario.
 *
 * `valore` è quello che si vede ADESSO (se c'è un'anteprima, la tinta provata e
 * non quella di partenza): il campionario serve a guardare lo schermo, non il
 * codice.
 *
 * L'`id` è fatto di quello che l'elemento È (tema, pagina, slot, elemento) e non
 * di un numero casuale: rifotografare lo stesso colore sulla stessa pagina lo
 * SOSTITUISCE invece di duplicarlo (è la stessa cosa vista due volte).
 */
export function campioneDaSlot(slot: Slot, valore: string, ctx: ContestoElemento): Campione {
  return {
    id: `${ctx.tema}|${ctx.pagina}|${slot.id}|${ctx.descrizione}`,
    nome: nomeCampione(slot),
    pagina: ctx.pagina,
    tema: ctx.tema,
    descrizione: ctx.descrizione,
    selettore: ctx.selettore,
    token: slot.tipo === 'var' ? slot.nome : '',
    origine: slot.origine,
    valore: coloreLeggibile(valore),
    quando: new Date().toISOString(),
  }
}

/** Cosa si sa di un colore GUARDANDO il campionario già raccolto. */
export interface ConfrontoCampione {
  /** Lo stesso nome visto su un'ALTRA pagina (l'ultimo campionato). */
  altrove: Campione | null
  /** true quando là il colore è diverso: è la cosa da guardare. */
  diverso: boolean
  /** Su quante altre pagine è già stato campionato. */
  quante: number
}

/**
 * Il confronto IMMEDIATO mentre si guarda un elemento: c'è già lo stesso colore
 * da un'altra parte, e se sì è lo stesso?
 *
 * È il pezzo che rende inutile ricordare a memoria: si campiona lo sfondo della
 * card su /turnisala, si passa su /turniferie, la riga dello sfondo dice subito
 * «≠ #f8fbfd su /turnisala» oppure «= come su /turnisala». Il tema fa parte del
 * confronto perché chiaro e scuro hanno due insiemi di variabili diversi.
 */
export function confrontoCampione(
  campioni: Campione[],
  nome: string,
  tema: TemaSonda,
  pagina: string,
  valore: string,
): ConfrontoCampione {
  const chiave = nome.trim().toLowerCase()
  const altri = campioni.filter(
    c => c.tema === tema && c.nome.trim().toLowerCase() === chiave && c.pagina !== pagina,
  )
  return {
    altrove: altri.length ? altri[altri.length - 1] : null,
    diverso: altri.some(c => c.valore !== coloreLeggibile(valore)),
    quante: altri.length,
  }
}

export interface GruppoCampioni {
  nome: string
  tema: TemaSonda
  campioni: Campione[]
  /** I colori distinti trovati: uno solo = coerente, due o più = da guardare. */
  valori: string[]
  /** true quando lo stesso colore cambia fra le pagine. È la cosa da guardare. */
  diverso: boolean
}

/**
 * I campioni raggruppati per NOME e TEMA.
 *
 * Il tema fa parte della chiave e non è un dettaglio: chiaro e scuro hanno due
 * insiemi di variabili diversi, quindi un colore campionato in chiaro e uno in
 * scuro non sono «diversi», sono due cose. Confrontarli sarebbe rumore.
 */
export function raggruppaCampioni(campioni: Campione[]): GruppoCampioni[] {
  const perChiave = new Map<string, GruppoCampioni>()
  for (const c of campioni) {
    const chiave = `${c.tema}|${c.nome.trim().toLowerCase()}`
    const gruppo = perChiave.get(chiave) ?? { nome: c.nome.trim(), tema: c.tema, campioni: [], valori: [], diverso: false }
    gruppo.campioni.push(c)
    if (!gruppo.valori.includes(c.valore)) gruppo.valori.push(c.valore)
    perChiave.set(chiave, gruppo)
  }
  return [...perChiave.values()]
    .map(g => ({ ...g, diverso: g.valori.length > 1 }))
    // Prima quello che non torna: è l'unica cosa che c'è da guardare.
    .sort((a, b) => Number(b.diverso) - Number(a.diverso) || a.nome.localeCompare(b.nome) || a.tema.localeCompare(b.tema))
}

/**
 * Il campionario come testo da copiare. Anche questo lo leggo io: se chiedi un
 * allineamento fra pagine, `diverso` dice già dove guardare.
 */
export function campionarioTesto(gruppi: GruppoCampioni[]): string {
  if (gruppi.length === 0) return ''
  const righe: string[] = [`CAMPIONARIO COLORI — ${gruppi.reduce((n, g) => n + g.campioni.length, 0)} campioni`, '']
  for (const g of gruppi) {
    righe.push(`${g.diverso ? '⚠' : '='} ${g.nome} (tema ${g.tema === 'dark' ? 'scuro' : 'chiaro'})`)
    for (const c of g.campioni) {
      righe.push(`    ${c.valore.padEnd(9)} ${c.pagina}${c.token ? `  ← ${c.token}` : ''}`)
    }
    if (g.diverso) righe.push(`    diverso su ${g.valori.length} valori: ${g.valori.join(' · ')}`)
    righe.push('')
  }
  return righe.join('\n')
}

// ── Il quaderno delle modifiche ───────────────────────────────────────────────

/**
 * Mette un campione nel campionario, o SOSTITUISCE quello dello stesso id: si
 * preme ＋ due volte sullo stesso colore e non si accumulano doppioni.
 */
export function aggiornaCampione(campioni: Campione[], nuovo: Campione): Campione[] {
  const i = campioni.findIndex(c => c.id === nuovo.id)
  if (i === -1) return [...campioni, nuovo]
  const copia = [...campioni]
  copia[i] = nuovo
  return copia
}

/** Aggiunge una voce, o SOSTITUISCE quella dello stesso slot (una sola per slot). */
export function aggiornaVoce(voci: VoceRichiesta[], nuova: VoceRichiesta): VoceRichiesta[] {
  const i = voci.findIndex(v => v.id === nuova.id)
  if (i === -1) return [...voci, nuova]
  const copia = [...voci]
  copia[i] = nuova
  return copia
}

/** Toglie la voce dello slot (se si torna al colore di partenza non c'è niente da chiedere). */
export function rimuoviVoce(voci: VoceRichiesta[], id: string): VoceRichiesta[] {
  return voci.filter(v => v.id !== id)
}

/** C'è già una modifica per questo slot? */
export function voceDi(voci: VoceRichiesta[], id: string): VoceRichiesta | undefined {
  return voci.find(v => v.id === id)
}
