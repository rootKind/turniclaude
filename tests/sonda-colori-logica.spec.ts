import { test, expect } from '@playwright/test'
import {
  aggiornaCampione,
  aggiornaVoce,
  campioneDaSlot,
  campionarioTesto,
  classiSalienti,
  coloreLeggibile,
  confrontoCampione,
  etichettaToken,
  nomeCampione,
  previewCss,
  raggruppaCampioni,
  richiestaTesto,
  rimuoviVoce,
  selettoreDaPercorso,
  stessoColore,
  variabiliAnteprima,
  voceDi,
  type Campione,
  type Slot,
  type VoceRichiesta,
} from '../lib/theme-inspector'

/**
 * LA SONDA COLORI, provata sulla LOGICA (richiesta 17/09/2026).
 *
 * Perché qui e non solo nell'app: i nomi leggibili dei token, la conversione dei
 * colori, il CSS dell'anteprima e il testo della richiesta si provano in
 * millisecondi, senza browser e senza dev server. Quello che resta da vedere nel
 * browser (il tocco che seleziona, la lettura dell'elemento, l'anteprima che si
 * applica davvero) sta in `sonda-colori.spec.ts` e in
 * `lib/theme-inspector-dom.ts`.
 *
 * Il test più importante è l'ultimo gruppo: la RICHIESTA. È il pezzo che esce
 * dall'app e arriva a chi mette mano a globals.css, quindi deve contenere
 * sempre il colore di PARTENZA (senza, non si sa se il valore nel codice è
 * ancora quello visto sullo schermo) e la pagina dove è stato toccato.
 */

test('il nome leggibile di una variabile si compone dal nome tecnico', () => {
  expect(etichettaToken('--cell-rest-bg')).toBe('Cella rest — sfondo')
  expect(etichettaToken('--cell-rest-text')).toBe('Cella rest — testo')
  expect(etichettaToken('--sala-card-title-bg')).toBe('Sala card title — sfondo')
  expect(etichettaToken('--pill-mattina-text')).toBe('Pill mattina — testo')
  // La palette base non si indovina dal nome: ha il suo testo.
  expect(etichettaToken('--primary')).toBe('Colore principale (pulsanti, chip accese)')
  expect(etichettaToken('--muted-foreground')).toBe('Testo attenuato (etichette)')
  // Un nome che non si capisce NON si inventa: torna com'è.
  expect(etichettaToken("--x9")).toBe("--x9")
})

test('i colori diventano leggibili, e la trasparenza non si perde', () => {
  expect(coloreLeggibile('rgb(228, 230, 233)')).toBe('#e4e6e9')
  expect(coloreLeggibile('rgba(15, 23, 42, 0.14)')).toBe('rgba(15, 23, 42, 0.14)')
  expect(coloreLeggibile('#abc')).toBe('#aabbcc')
  expect(coloreLeggibile('#DC2626')).toBe('#dc2626')
  // Notazioni larghe (oklch/lab) NON si convertono qui: lo fa il browser, e la
  // conversione si prova in sonda-colori.spec.ts. Qui si difende che non venga
  // inventato un colore.
  expect(coloreLeggibile('oklch(0.145 0 0)')).toBe('oklch(0.145 0 0)')
  expect(stessoColore('#DC2626', 'rgb(220, 38, 38)')).toBe(true)
  expect(stessoColore('#dc2626', 'rgba(220, 38, 38, 0.5)')).toBe(false)
})

test('il selettore è breve e parlante: poche classi, nth-child solo se serve', () => {
  expect(
    selettoreDaPercorso([
      { tag: 'div', classi: ['sala-card-body'] },
      { tag: 'span', classi: ['sala-fit-text'] },
    ]),
  ).toBe('div.sala-card-body > span.sala-fit-text')

  // Senza classi utili (e con fratelli) si scrive la posizione: meglio un
  // selettore brutto che un selettore ambiguo.
  expect(selettoreDaPercorso([{ tag: 'div', classi: [], nth: 2 }])).toBe('div:nth-child(2)')

  // Le utility di Tailwind non dicono a cosa serve l'elemento: fuori.
  expect(classiSalienti(['flex', 'grid', 'text-[11px]', 'bg-primary/10', 'my-period-border', 'sm:hidden'])).toEqual([
    'my-period-border',
  ])
  expect(classiSalienti(['cell-day', 'cell-tint-rest', 'rounded-lg'])).toEqual(['cell-day', 'cell-tint-rest'])
})

test('l’anteprima scrive le variabili dove vivrebbero davvero', () => {
  const voce = (over: Partial<VoceRichiesta>): VoceRichiesta => ({
    id: 'var:--x',
    tipo: 'var',
    nome: '--x',
    proprieta: '',
    tema: 'light',
    da: '#ffffff',
    a: '#ff0000',
    etichetta: 'Prova',
    origine: 'variabile --x (:root)',
    selettore: '.prova',
    descrizione: '<div> “prova”',
    pagina: '/turnisala',
    quando: '2026-09-17T10:00:00.000Z',
    ...over,
  })

  const css = previewCss([
    voce({}),
    voce({ id: 'var:--y', nome: '--y', tema: 'dark', a: '#00ff00' }),
    voce({ id: 'regola:.card|box-shadow', tipo: 'regola', nome: '.card', proprieta: 'box-shadow', da: '0 0 0 1px rgba(15,23,42,0.14)', a: '0 0 0 1px #ff0000' }),
  ])

  // Il tema chiaro va in :root e lo scuro in .dark, come in globals.css: se
  // finissero nello stesso blocco, una modifica pensata per un tema cambierebbe
  // anche l'altro.
  expect(css).toContain(':root {')
  expect(css).toContain('  --x: #ff0000;')
  expect(css).toContain('.dark {')
  expect(css).toContain('  --y: #00ff00;')
  // Le regole puntuali hanno !important: devono battere quello che c'è già.
  expect(css).toContain('.card { box-shadow: 0 0 0 1px #ff0000 !important; }')
  // E il «da» resta scritto nel commento: serve a chi legge il foglio.
  expect(css).toContain('era #ffffff')

  const variabili = variabiliAnteprima([voce({}), voce({ id: 'var:--y', nome: '--y', tema: 'dark', a: '#00ff00' })])
  expect(variabili).toEqual({ light: { '--x': '#ff0000' }, dark: { '--y': '#00ff00' } })
  expect(previewCss([])).toBe('')
})

test('la richiesta dice pagina, elemento, selettore, origine e «da → a»', () => {
  const prima: VoceRichiesta = {
    id: 'var:--sala-card-body-bg',
    tipo: 'var',
    nome: '--sala-card-body-bg',
    proprieta: '',
    tema: 'light',
    da: '#f8fbfd',
    a: '#ff0000',
    etichetta: 'Sfondo · Sala card body — sfondo',
    origine: 'variabile --sala-card-body-bg (#f8fbfd — tema chiaro (:root))',
    selettore: 'div > div:nth-child(2) > div.sala-card-body',
    descrizione: '<div.sala-card-body> “Ebbrezza”',
    pagina: '/turnisala',
    quando: '2026-09-17T10:00:00.000Z',
  }
  const testo = richiestaTesto([prima])

  expect(testo).toContain('RICHIESTA COLORI')
  expect(testo).toContain('1 modifica')
  expect(testo).toContain('pagina:    /turnisala (tema chiaro)')
  expect(testo).toContain('elemento:  <div.sala-card-body> “Ebbrezza”')
  expect(testo).toContain('selettore: div > div:nth-child(2) > div.sala-card-body')
  expect(testo).toContain('oggi è:    variabile --sala-card-body-bg')
  // Il verso del cambio è esplicito: da che colore a che colore.
  expect(testo).toContain('voglio:    --sala-card-body-bg  #f8fbfd → #ff0000')
  expect(richiestaTesto([])).toBe('')

  // Una REGOLA porta la proprietà intera (l'ombra): nel testo si legge così.
  const regola = richiestaTesto([
    { ...prima, id: 'regola:.card|box-shadow', tipo: 'regola', nome: '.card', proprieta: 'box-shadow', da: '0 0 0 1px rgba(15, 23, 42, 0.14)', a: '0 0 0 1px #ff0000' },
  ])
  expect(regola).toContain('voglio:    .card { box-shadow }  0 0 0 1px rgba(15, 23, 42, 0.14) → 0 0 0 1px #ff0000')
})

test('una voce per slot: si sostituisce, non si accumula. E si può togliere', () => {
  const voce = (a: string): VoceRichiesta => ({
    id: 'var:--x',
    tipo: 'var',
    nome: '--x',
    proprieta: '',
    tema: 'light',
    da: '#ffffff',
    a,
    etichetta: 'Prova',
    origine: 'variabile --x (:root)',
    selettore: '.prova',
    descrizione: '<div>',
    pagina: '/turnisala',
    quando: '2026-09-17T10:00:00.000Z',
  })

  // Toccare due volte lo stesso colore non deve produrre due righe nella
  // richiesta: l'ultima scelta è quella che vale.
  const due = aggiornaVoce(aggiornaVoce([], voce('#ff0000')), voce('#00ff00'))
  expect(due).toHaveLength(1)
  expect(due[0].a).toBe('#00ff00')
  expect(voceDi(due, 'var:--x')?.a).toBe('#00ff00')

  // E slot diversi restano righe diverse.
  const tre = aggiornaVoce(due, { ...voce('#0000ff'), id: 'var:--y', nome: '--y' })
  expect(tre.map(v => v.id)).toEqual(['var:--x', 'var:--y'])

  expect(rimuoviVoce(tre, 'var:--x').map(v => v.id)).toEqual(['var:--y'])
  expect(rimuoviVoce(tre, 'non-esiste')).toHaveLength(2)
})

// ── Il campionario: guardare la coerenza FRA pagine ───────────────────────────

const slotSfondo: Slot = {
  id: 'var:--sala-card-body-bg',
  tipo: 'var',
  nome: '--sala-card-body-bg',
  proprieta: '',
  etichetta: 'Sfondo · Sala card body — sfondo',
  valore: '#f8fbfd',
  origine: 'variabile --sala-card-body-bg (#f8fbfd — tema chiaro (:root))',
}

/** Un campione come lo produrrebbe la sonda su quella pagina. */
function campione(pagina: string, valore: string, over: Partial<Campione> = {}): Campione {
  return {
    ...campioneDaSlot(slotSfondo, valore, {
      tema: 'light',
      pagina,
      selettore: 'nav.bottom',
      descrizione: '<nav.bottom> “Turni”',
    }),
    ...over,
  }
}

test('un campione è una fotografia: nome leggibile, pagina, variabile e colore', () => {
  const c = campione('/turnisala', 'rgb(248, 251, 253)')
  expect(c.nome).toBe('Sfondo · Sala card body — sfondo')
  expect(c.pagina).toBe('/turnisala')
  expect(c.token).toBe('--sala-card-body-bg')
  // Il colore si scrive leggibile: `#f8fbfd`, non `rgb(248, 251, 253)`.
  expect(c.valore).toBe('#f8fbfd')
  expect(c.origine).toContain('tema chiaro')
  // Le variabili «impostate qui» non entrano nel nome del confronto con la
  // parentesi: quello che si confronta è il colore, non dove è stato impostato.
  expect(nomeCampione({ ...slotSfondo, etichetta: 'Sfondo · Prova (impostata qui)' })).toBe('Sfondo · Prova')
  // Rifotografare lo stesso slot sulla stessa pagina SOSTITUISCE (è la stessa
  // cosa vista due volte), non duplica.
  const due = aggiornaCampione(aggiornaCampione([], c), campione('/turnisala', '#ff0000'))
  expect(due).toHaveLength(1)
  expect(due[0].valore).toBe('#ff0000')
})

test('il confronto si fa col campione di UN’ALTRA pagina, nello stesso tema', () => {
  const sala = campione('/turnisala', '#f8fbfd')

  // Sulle stesse pagina non c'è confronto da fare (è già lì che sto guardando).
  expect(confrontoCampione([sala], 'Sfondo · Sala card body — sfondo', 'light', '/turnisala', '#f8fbfd')).toEqual({
    altrove: null, diverso: false, quante: 0,
  })

  // Altrove con lo STESSO colore: coerente.
  const uguale = confrontoCampione([sala], 'Sfondo · Sala card body — sfondo', 'light', '/turniferie', '#f8fbfd')
  expect(uguale.diverso).toBe(false)
  expect(uguale.altrove?.pagina).toBe('/turnisala')

  // Altrove con un colore DIVERSO: è la cosa da guardare.
  const diverso = confrontoCampione([sala], 'Sfondo · Sala card body — sfondo', 'light', '/turniferie', '#ffffff')
  expect(diverso.diverso).toBe(true)
  expect(diverso.altrove?.valore).toBe('#f8fbfd')

  // Chiaro e scuro sono due insiemi di variabili diversi: il campione del tema
  // chiaro non è «diverso», è un'altra cosa. Confrontarli sarebbe rumore.
  expect(confrontoCampione([sala], 'Sfondo · Sala card body — sfondo', 'dark', '/turniferie', '#0a0a0a').altrove).toBeNull()
})

test('il campionario raggruppa e segnala i gruppi che non tornano', () => {
  const gruppi = raggruppaCampioni([
    campione('/turnisala', '#f8fbfd'),
    campione('/turniferie', '#f8fbfd'),
    campione('/dashboard', '#ffffff'),
    campione('/turnisala', '#0a0a0a', { tema: 'dark' }),
  ])

  // Prima quello che non torna: è l'unica cosa che c'è da guardare.
  expect(gruppi.map(g => [g.nome, g.tema, g.diverso])).toEqual([
    ['Sfondo · Sala card body — sfondo', 'light', true],
    ['Sfondo · Sala card body — sfondo', 'dark', false],
  ])
  const chiaro = gruppi[0]
  expect(chiaro.campioni).toHaveLength(3)
  expect(chiaro.valori).toEqual(['#f8fbfd', '#ffffff'])

  // Il testo da copiare: ⚠ dove non torna, = dove sì, e le pagine attaccate a
  // ciascun colore (è quello che leggo io per metterci mano).
  const testo = campionarioTesto(gruppi)
  expect(testo).toContain('CAMPIONARIO COLORI — 4 campioni')
  expect(testo).toContain('⚠ Sfondo · Sala card body — sfondo (tema chiaro)')
  expect(testo).toContain('#f8fbfd   /turnisala  ← --sala-card-body-bg')
  expect(testo).toContain('#ffffff   /dashboard')
  expect(testo).toContain('diverso su 2 valori: #f8fbfd · #ffffff')
  expect(testo).toContain('= Sfondo · Sala card body — sfondo (tema scuro)')
  expect(campionarioTesto([])).toBe('')
})
