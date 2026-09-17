'use client'
/**
 * SONDA COLORI — si tiene premuto l'elemento e si vede di che colore è
 * (richiesta 17/09/2026, seconda versione).
 *
 * PERCHÉ QUESTA FORMA. In questa app i colori sono in un posto solo
 * (`app/globals.css`) e arrivano agli elementi per variabile o per classe: dallo
 * schermo, però, non si vede «quale variabile è questo bordo che non mi piace».
 * La sonda fa il collegamento al posto mio: premi il pezzo, lei dice **come si
 * chiama** (selettore), **da dove viene il colore** (variabile + blocco in cui è
 * dichiarata, o classe, o regola), e ti fa provare il colore nuovo **solo sul
 * tuo dispositivo**. Poi «Copia la richiesta»: quella riga arriva a me, che la
 * porto in globals.css. Nessun override nel database (decisione 17/09/2026: la
 * memoria del progetto vieta di reintrodurli).
 *
 * LA PRIMA VERSIONE SBAGLIAVA IMPOSTAZIONE. Prendeva i tocchi (`stopPropagation`
 * in fase di cattura): così un tocco selezionava invece di navigare, e per usare
 * l'app — aprire un popup, stirare una card, cambiare giorno nella board — non
 * c'era altra strada che «sospendere la sonda». Ma il motivo per cui si guarda un
 * tema non è cambiare un colore: è **verificare la coerenza fra pagine**, e per
 * farlo bisogna navigare davvero. Ora i tocchi sono tutti dell'app e la cattura è
 * una **pressione prolungata** (650 ms): un gesto che l'app non usa, che si fa
 * anche in mezzo a una schermata piena di bottoni, e che non obbliga a scegliere
 * fra guardare e usare.
 *
 * L'unica cosa che la sonda toglie all'app è il `click` che segue una cattura
 * (rilasciando dopo la pressione il browser manderebbe comunque il click, e si
 * navigherebbe per sbaglio).
 *
 * LA PILA. La pressione prende sempre il pezzo più piccolo (il testo dentro il
 * badge dentro la card): sotto il dito ci sono di solito 4-5 elementi. La sonda
 * li elenca tutti dal più esterno al più interno — il «livello» si sceglie da lì,
 * senza indovinare il punto giusto.
 *
 * IL CAMPIONARIO. Per confrontare due pagine non serve toccare niente: serve che
 * il colore visto resti scritto. Ogni riga di colore ha un ＋ che lo fotografa
 * (nome, pagina, tema, valore, variabile); quando lo stesso nome è già stato
 * campionato altrove la riga lo dice subito — «= come su /turnisala» oppure
 * «≠ #f8fbfd su /turnisala» — e nel pannello c'è la vista che li raggruppa tutti.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Check, Copy, Layers, ListChecks, Pipette, Plus, RotateCcw, X } from 'lucide-react'
import { ADMIN_ID } from '@/types/database'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useThemeInspectorStore } from '@/stores/theme-inspector-store'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { QUICK_SWATCHES } from '@/lib/card-palettes'
import { normalizeHex } from '@/lib/color'
import {
  campioneDaSlot,
  campionarioTesto,
  classiSalienti,
  coloreLeggibile,
  confrontoCampione,
  nomeCampione,
  previewCss,
  raggruppaCampioni,
  richiestaTesto,
  voceDi,
  type Campione,
  type GruppoCampioni,
  type Slot,
  type TemaSonda,
  type VoceRichiesta,
} from '@/lib/theme-inspector'
import {
  applicaAnteprimaCss,
  coloriDentro,
  descrizioneDi,
  leggiElemento,
  pilaAlPunto,
  risolviColore,
  selettoreDi,
  sostituisciColore,
  type LetturaElemento,
} from '@/lib/theme-inspector-dom'

interface Punto { x: number; y: number }

/**
 * Quanto dura la PRESSIONE perché parta la cattura dell'elemento.
 *
 * Il tocco è il modo in cui si usa l'app (bottoni, card, popup) e la sonda non
 * deve portarlo via: si campiona tenendolo premuto.
 *
 * I 650 ms non sono un numero tondo a caso: l'app ha GIÀ una pressione lunga sua
 * (500 ms sul pulsante «Turni Sala e Ferie» della barra in basso, che apre i
 * mini-comandi), e con una soglia uguale o più corta ogni pressione avrebbe fatto
 * due cose insieme. Così una pressione normale (mezzo secondo) resta dell'app, e
 * la cattura è un gesto un po' più lungo — che è anche quello che serve per non
 * campionare per sbaglio mentre si scorre.
 */
const DURATA_PRESSIONE = 650
/** Oltre questo spostamento è uno scorrimento, non una pressione. */
const TOLLERANZA = 12

/**
 * L'interruttore della sonda: montato una volta per tutta l'app.
 *
 * Sta QUI e non dentro la sonda per un motivo di costi: `armata` è letto da un
 * solo hook, e finché è spento non si rende niente, non si chiede il profilo con
 * `useCurrentUser` (una query in più a ogni pagina, per tutti gli 88 utenti) e
 * non si ascolta nessun evento sul `document`. La sonda la accende l'admin dal
 * pannello: per chiunque altro quello stato resta com'è.
 */
export function ThemeInspector() {
  const armata = useThemeInspectorStore(s => s.armata)
  if (!armata) return null
  return <Sonda />
}

function Sonda() {
  // Chi sono: `useCurrentUser` (react-query + store) — non `useUserStore` da
  // solo, che nessuno popola finché questo hook non gira.
  const { profile } = useCurrentUser()
  const isAdmin = profile?.id === ADMIN_ID
  const {
    armata, setArmata, voci, segna, dimentica, azzera,
    campioni, campiona, rinomina, scarta, svuotaCampionario,
  } = useThemeInspectorStore()
  const { resolvedTheme } = useTheme()
  const tema: TemaSonda = resolvedTheme === 'dark' ? 'dark' : 'light'
  const pathname = usePathname()

  const [panelAperto, setPanelAperto] = useState(false)
  const [vista, setVista] = useState<'elemento' | 'campionario'>('elemento')
  const [slotAperto, setSlotAperto] = useState<string | null>(null)
  const [testo, setTesto] = useState<{ etichetta: string; valore: string } | null>(null)
  /**
   * Tutto quello che riguarda «un pezzo di QUESTA pagina» porta dentro il nome
   * della pagina: cambiando pagina l'elemento di prima non esiste più, e invece
   * di azzerare gli stati con un `useEffect` (che il lint del progetto vieta: è
   * una cascata di render) si considera vecchio e basta.
   */
  const [sel, setSel] = useState<{ pagina: string; el: Element; lettura: LetturaElemento } | null>(null)
  const [pila, setPila] = useState<{ pagina: string; elementi: Element[] }>({ pagina: '', elementi: [] })
  const [misurazione, setMisurazione] = useState<{ pagina: string; top: number; left: number; w: number; h: number } | null>(null)
  const puntoRef = useRef<Punto | null>(null)

  const selezione = sel && sel.pagina === pathname ? sel : null
  const rettangolo = misurazione && misurazione.pagina === pathname ? misurazione : null
  const pilaCorrente = pila.pagina === pathname ? pila.elementi : []
  const modifiche = voci.length

  /** Il rettangolo dell'elemento in schermo (bordo dell'evidenziazione). */
  const misura = useCallback((el: Element | null) => {
    if (!el) return setMisurazione(null)
    const r = el.getBoundingClientRect()
    setMisurazione({ pagina: window.location.pathname, top: r.top, left: r.left, w: r.width, h: r.height })
  }, [])

  /**
   * Legge un elemento SENZA l'anteprima addosso. Non è una finezza: con
   * l'anteprima già scritta nel `head`, la lettura restituirebbe i colori NUOVI
   * come se fossero quelli di partenza, e la richiesta perderebbe il «da».
   * Si toglie, si legge e si rimette: tutto nello stesso giro, senza sfarfallio.
   */
  const leggiPulito = useCallback(
    (el: Element, corrente: VoceRichiesta[]): LetturaElemento => {
      applicaAnteprimaCss('')
      const letto = leggiElemento(el, tema)
      applicaAnteprimaCss(previewCss(corrente))
      return letto
    },
    [tema],
  )

  const scegli = useCallback(
    (el: Element, punto?: Punto) => {
      setSlotAperto(null)
      setSel({ pagina: window.location.pathname, el, lettura: leggiPulito(el, voci) })
      misura(el)
      if (punto) puntoRef.current = punto
      setPanelAperto(true)
    },
    [leggiPulito, misura, voci],
  )

  // ── La pressione prolungata che campiona (il tocco resta all'app) ──────────
  useEffect(() => {
    if (!isAdmin || !armata) return
    let timer: number | null = null
    let partenza: Punto | null = null
    // true quando la pressione ha catturato: il click che segue (quello che il
    // browser manda al rilascio) va mangiato, altrimenti si naviga per sbaglio.
    let preso = false

    const dentroLaSonda = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest('[data-sonda-colori]')

    const annulla = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      partenza = null
    }

    const giu = (e: PointerEvent) => {
      preso = false
      if (e.pointerType === 'mouse' && e.button !== 0) return
      annulla()
      if (dentroLaSonda(e.target)) return
      const bersaglio = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement ?? null
      if (!bersaglio) return
      partenza = { x: e.clientX, y: e.clientY }
      const punto = partenza
      timer = window.setTimeout(() => {
        timer = null
        preso = true
        navigator.vibrate?.(20)
        setPila({ pagina: window.location.pathname, elementi: pilaAlPunto(punto.x, punto.y) })
        scegli(bersaglio, punto)
      }, DURATA_PRESSIONE)
    }

    const muovi = (e: PointerEvent) => {
      if (timer === null || !partenza) return
      if (Math.hypot(e.clientX - partenza.x, e.clientY - partenza.y) > TOLLERANZA) annulla()
    }

    const click = (e: MouseEvent) => {
      if (!preso) return
      preso = false
      e.stopPropagation()
      e.preventDefault()
      e.stopImmediatePropagation()
    }

    // Un click può arrivare anche SENZA un tocco (Invio su un bottone a fuoco):
    // lì non c'è nessuna cattura da proteggere, e un `preso` rimasto appeso
    // mangerebbe un click legittimo. La tastiera lo azzera.
    const tasto = () => { preso = false }

    document.addEventListener('pointerdown', giu, { capture: true })
    document.addEventListener('pointermove', muovi, { capture: true })
    document.addEventListener('pointerup', annulla, { capture: true })
    document.addEventListener('pointercancel', annulla, { capture: true })
    document.addEventListener('click', click, { capture: true })
    document.addEventListener('keydown', tasto, { capture: true })
    return () => {
      annulla()
      document.removeEventListener('pointerdown', giu, { capture: true })
      document.removeEventListener('pointermove', muovi, { capture: true })
      document.removeEventListener('pointerup', annulla, { capture: true })
      document.removeEventListener('pointercancel', annulla, { capture: true })
      document.removeEventListener('click', click, { capture: true })
      document.removeEventListener('keydown', tasto, { capture: true })
    }
  }, [isAdmin, armata, scegli])

  /**
   * Passaggio del puntatore (da PC): il pezzo sotto il mouse si accende prima
   * ancora di premerlo. Da telefono non c'è, e la pressione fa tutto. Si spegne
   * quando il pannello è aperto, altrimenti sembrerebbe che la selezione cambi
   * da sola.
   */
  useEffect(() => {
    if (!isAdmin || !armata || panelAperto) return
    const su = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || el.closest('[data-sonda-colori]')) return
      misura(el)
    }
    document.addEventListener('pointermove', su, { passive: true })
    return () => document.removeEventListener('pointermove', su)
  }, [isAdmin, armata, panelAperto, misura])

  // L'anteprima segue le voci: si riapplica quando cambiano, e si toglie uscendo.
  useEffect(() => {
    if (!isAdmin) return
    if (!armata) {
      applicaAnteprimaCss('')
      return
    }
    applicaAnteprimaCss(previewCss(voci))
  }, [isAdmin, armata, voci])

  if (!isAdmin) return null

  return (
    <>
      {/* La pressione non deve diventare «seleziona testo» o aprire il menù di
          sistema: mentre la sonda è accesa il callout è spento. I campi di testo
          restano selezionabili (la richiesta a volte si copia a mano). */}
      <style>{`:root { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
input, textarea, [contenteditable] { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }`}</style>

      {/* ── Bordo dell'elemento scelto (o di quello sotto il mouse) ─────────── */}
      {rettangolo && (
        <div
          data-sonda-colori="evidenzia"
          aria-hidden
          data-testid="sonda-evidenzia"
          className="pointer-events-none fixed z-[60] rounded-[6px] outline outline-2 outline-[#e11d8f]"
          style={{ top: rettangolo.top - 2, left: rettangolo.left - 2, width: rettangolo.w + 4, height: rettangolo.h + 4 }}
        />
      )}

      {/* ── La pillola: l'unico ingombro fisso della sonda ──────────────────
          Un pulsante solo, fuori dalla strada: la barra di sotto e il pulsante
          flottante restano liberi (i tocchi sono dell'app), il pannello si apre
          da qui e si chiude quando il pannello non serve. */}
      <div
        data-sonda-colori="pillola"
        className="fixed bottom-20 left-2 z-[70] flex items-center gap-1 rounded-full border border-[#e11d8f]/40 bg-card px-1.5 py-1 shadow-lg"
      >
        <button
          type="button"
          data-testid="sonda-apri"
          onClick={() => setPanelAperto(v => !v)}
          aria-expanded={panelAperto}
          aria-label={panelAperto ? 'Chiudi il pannello della sonda colori' : 'Apri il pannello della sonda colori'}
          title="Sonda colori: premi a lungo un elemento per vedere da dove viene il suo colore"
          className="grid h-7 w-7 place-items-center rounded-full bg-[#fce7f3] text-[#9d174d] dark:bg-[#4c0d2f] dark:text-[#fbcfe8]"
        >
          <Pipette size={14} />
        </button>
        <span className="px-0.5 text-[10px] font-bold text-[#9d174d] dark:text-[#fbcfe8]">{modifiche}</span>
        {campioni.length > 0 && (
          <span className="text-[10px] font-bold text-muted-foreground">◎ {campioni.length}</span>
        )}
        <button
          type="button"
          onClick={() => { setArmata(false); setPanelAperto(false); applicaAnteprimaCss('') }}
          aria-label="Spegni la sonda colori"
          title="Spegni la sonda (l’anteprima si toglie, le richieste restano)"
          className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Il pannello: elemento, pila, colori, campionario ────────────────── */}
      {panelAperto && (
        <div
          data-sonda-colori="pannello"
          className="fixed inset-x-0 bottom-0 z-[69] max-h-[72svh] overflow-y-auto rounded-t-2xl border-t border-[#e11d8f]/40 bg-background pb-24 shadow-2xl"
        >
          <div className="mx-auto max-w-lg space-y-2 p-3">
            <div className="flex items-center gap-1.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#fce7f3] text-[#9d174d] dark:bg-[#4c0d2f] dark:text-[#fbcfe8]">
                <Pipette size={14} />
              </span>
              <p className="min-w-0 flex-1 truncate text-[12px] font-bold">
                Sonda colori · {tema === 'dark' ? 'scuro' : 'chiaro'}
              </p>
              <div className="flex shrink-0 overflow-hidden rounded-full border border-border/60">
                <button
                  type="button"
                  data-testid="sonda-vista-elemento"
                  onClick={() => setVista('elemento')}
                  aria-pressed={vista === 'elemento'}
                  className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${vista === 'elemento' ? 'bg-[#e11d8f] text-white' : 'text-muted-foreground'}`}
                >
                  <Layers size={11} /> Elemento
                </button>
                <button
                  type="button"
                  data-testid="sonda-vista-campionario"
                  onClick={() => setVista('campionario')}
                  aria-pressed={vista === 'campionario'}
                  className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold ${vista === 'campionario' ? 'bg-[#e11d8f] text-white' : 'text-muted-foreground'}`}
                >
                  <ListChecks size={11} /> Campionario {campioni.length > 0 && `(${campioni.length})`}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPanelAperto(false)}
                aria-label="Chiudi il pannello"
                className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X size={15} />
              </button>
            </div>

            {vista === 'elemento' ? (
              <>
                {!selezione && (
                  <p className="rounded-xl border border-border/60 bg-card px-3 py-4 text-center text-[11px] text-muted-foreground">
                    <strong>Premi a lungo</strong> (mezzo secondo) l’elemento che ti interessa: ti dico <strong>da quale variabile</strong> viene
                    il suo colore. Toccare normalmente continua a fare quello che ha sempre fatto — bottoni, card, popup: per questo si preme a
                    lungo, e non serve sospendere niente per usare l’app.
                  </p>
                )}

                {selezione && (
                  <>
                    <div className="rounded-xl border border-border/60 bg-card p-2">
                      <p className="text-[12px] font-bold">{selezione.lettura.descrizione}</p>
                      <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{selezione.lettura.selettore}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {pathname} · {tema === 'dark' ? 'tema scuro' : 'tema chiaro'} · {Math.round(rettangolo?.w ?? 0)}×{Math.round(rettangolo?.h ?? 0)} px
                        {selezione.lettura.sfondo && /rgba?\(0, 0, 0, 0\)/.test(getComputedStyle(selezione.el).backgroundColor)
                          ? ` · sfondo trasparente: si vede ${selezione.lettura.sfondo.colore} di ${selezione.lettura.sfondo.da}`
                          : ''}
                      </p>

                      {/* La pila sotto il dito: il livello giusto si sceglie da qui. */}
                      {pilaCorrente.length > 1 && (
                        <div className="mt-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Elementi sotto la pressione (dal più esterno)
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {[...pilaCorrente].reverse().map((el, i) => (
                              <button
                                key={`${el.tagName}-${i}`}
                                type="button"
                                onClick={() => scegli(el, puntoRef.current ?? undefined)}
                                aria-pressed={el === selezione.el}
                                className={`max-w-full truncate rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                                  el === selezione.el ? 'border-[#e11d8f] bg-[#fce7f3] dark:bg-[#4c0d2f]' : 'border-border/60'
                                }`}
                              >
                                {descrizionePila(el)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* I colori: uno per riga, con da dove viene e il confronto. */}
                    {selezione.lettura.slots.length === 0 ? (
                      <p className="rounded-xl border border-border/60 p-3 text-[11px] text-muted-foreground">
                        Nessun colore modificabile su questo elemento (è trasparente e senza bordi: prova a salire di un livello nella pila).
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {selezione.lettura.slots.map(slot => {
                          const voce = voceDi(voci, slot.id)
                          const attuale = voce ? (coloriDentro(voce.a)[0] ?? voce.a) : slot.valore
                          const nome = nomeCampione(slot)
                          const confronto = confrontoCampione(campioni, nome, tema, pathname, attuale)
                          return (
                            <SlotRow
                              key={slot.id}
                              slot={slot}
                              voce={voce}
                              aperto={slotAperto === slot.id}
                              contrasto={conColoreConfronto(slot, selezione.lettura, selezione.el)}
                              confronto={confronto}
                              segnato={campioni.some(
                                c => c.pagina === pathname && c.tema === tema && c.nome.trim().toLowerCase() === nome.trim().toLowerCase(),
                              )}
                              onSegna={() => {
                                campiona(campioneDaSlot(slot, attuale, {
                                  tema,
                                  pagina: pathname,
                                  selettore: selezione.lettura.selettore,
                                  descrizione: selezione.lettura.descrizione,
                                }))
                                toast.success(`«${nome}» segnato nel campionario: vai a vedere l’elemento simile su un’altra pagina`, {
                                  description: confronto.altrove
                                    ? `C’era già su ${confronto.altrove.pagina}: ${confronto.altrove.valore}`
                                    : 'Torna qui dal ─ della pillola per confrontarli',
                                })
                              }}
                              onApri={() => setSlotAperto(s => (s === slot.id ? null : slot.id))}
                              onChange={hex => {
                                const nuova = costruisciVoce(slot, selezione.el, hex, tema, window.location.pathname)
                                if (!nuova) {
                                  toast.error('Questo colore non si può cambiare da qui')
                                  return
                                }
                                segna(nuova)
                              }}
                              onRipristina={() => { dimentica(slot.id); setSlotAperto(null) }}
                            />
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px]"
                    disabled={modifiche === 0}
                    onClick={() => azzera()}
                  >
                    <RotateCcw size={12} /> Azzera l’anteprima ({modifiche})
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-[11px]"
                    disabled={modifiche === 0}
                    onClick={() => copiaTesto(richiestaTesto(voci), 'Richiesta copiata: incollala in chat', setTesto, 'Richiesta colori')}
                  >
                    <Copy size={12} /> Copia la richiesta
                  </Button>
                </div>

                {/* L'elenco di quello che si sta chiedendo, con il «da → a» */}
                {modifiche > 0 && (
                  <ul className="space-y-1">
                    {voci.map(v => (
                      <li key={v.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1">
                        <span className="h-5 w-5 shrink-0 rounded border border-border" style={{ background: coloreLeggibile(coloriDentro(v.a)[0] ?? v.a) }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold">{v.etichetta}</span>
                          <span className="block truncate font-mono text-[9px] text-muted-foreground">
                            {v.nome} {coloreLeggibile(coloriDentro(v.da)[0] ?? v.da)} → {coloreLeggibile(coloriDentro(v.a)[0] ?? v.a)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => dimentica(v.id)}
                          aria-label={`Togli la modifica su ${v.etichetta}`}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p className="px-1 text-[10px] text-muted-foreground">
                  I colori che hai <strong>segnato</strong> con ＋, messi per nome: quelli scritti in due modi diversi sono i punti dove il
                  tema non è coerente fra pagine. Tocca un nome per unirli o separarli.
                </p>

                {campioni.length === 0 ? (
                  <p className="rounded-xl border border-border/60 bg-card px-3 py-4 text-center text-[11px] text-muted-foreground">
                    Il campionario è vuoto. Apri la vista «Elemento», premi a lungo un pezzo e tocca <strong>＋</strong> sulla riga del colore:
                    resta scritto qui, poi vai sulla pagina con l’elemento simile e fai lo stesso. La riga del colore ti dirà già se combaciano.
                  </p>
                ) : (
                  <>
                    <div data-testid="sonda-campionario" className="space-y-2">
                      {raggruppaCampioni(campioni).map(g => (
                        <GruppoCampioniView
                          key={`${g.tema}|${g.nome.toLowerCase()}`}
                          gruppo={g}
                          onRinomina={nuovo => rinomina(g.tema, g.nome, nuovo)}
                          onScarta={scarta}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-8 text-[11px]"
                        onClick={() => copiaTesto(campionarioTesto(raggruppaCampioni(campioni)), 'Campionario copiato: incollalo in chat', setTesto, 'Campionario colori')}
                      >
                        <Copy size={12} /> Copia il campionario
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => svuotaCampionario()}>
                        <RotateCcw size={12} /> Svuota ({campioni.length})
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Il testo copiato: vignette per la richiesta E per il campionario,
                perché quando gli appunti non si possono usare resta l'unica via
                per portare fuori quello che si è visto. */}
            {testo && (
              <textarea
                readOnly
                value={testo.valore}
                aria-label={testo.etichetta}
                data-testid="sonda-richiesta"
                onFocus={e => e.currentTarget.select()}
                className="h-40 w-full rounded-xl border border-border/60 bg-muted/20 p-2 font-mono text-[10px] leading-relaxed"
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Copia negli appunti, e se non si può (contesto non sicuro, permesso negato)
 * mette il testo nel riquadro da selezionare a mano: la copia è l'unica cosa che
 * porta fuori dalla PWA quello che si è visto, quindi non può fallire in silenzio.
 */
async function copiaTesto(
  valore: string,
  messaggio: string,
  mostra: (t: { etichetta: string; valore: string }) => void,
  etichetta: string,
) {
  if (!valore) return
  mostra({ etichetta, valore })
  try {
    await navigator.clipboard.writeText(valore)
    toast.success(messaggio)
  } catch {
    toast('Testo pronto qui sotto: selezionalo e copialo')
  }
}

/** Un gruppo del campionario: nome (modificabile), colori, e l'avviso se non combaciano. */
function GruppoCampioniView({ gruppo, onRinomina, onScarta }: {
  gruppo: GruppoCampioni
  onRinomina: (nome: string) => void
  onScarta: (id: string) => void
}) {
  const [nome, setNome] = useState(gruppo.nome)
  return (
    <div className={`rounded-xl border p-2 ${gruppo.diverso ? 'border-[#e11d8f] bg-[#fce7f3]/40 dark:bg-[#4c0d2f]/30' : 'border-border/60 bg-card'}`}>
      <div className="flex items-center gap-2">
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          onBlur={() => { if (nome.trim() && nome !== gruppo.nome) onRinomina(nome.trim()) }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-label={`Nome del gruppo ${gruppo.nome}`}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-semibold hover:border-border/60 focus:border-border focus:outline-none"
        />
        <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {gruppo.tema === 'dark' ? 'scuro' : 'chiaro'} · {gruppo.campioni.length}
        </span>
        {gruppo.diverso && <span className="shrink-0 text-[9px] font-bold text-[#9d174d] dark:text-[#fbcfe8]">≠ {gruppo.valori.length} colori</span>}
      </div>
      <ul className="mt-1 space-y-0.5">
        {gruppo.campioni.map(c => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="h-4 w-4 shrink-0 rounded border border-black/10 dark:border-white/20" style={{ background: c.valore }} aria-hidden />
            <span className="w-[76px] shrink-0 font-mono text-[10px]">{c.valore}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
              {c.pagina}{c.token ? ` · ${c.token}` : ''}
            </span>
            <button
              type="button"
              onClick={() => onScarta(c.id)}
              aria-label={`Togli ${c.pagina} dal campionario`}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Una riga di colore: campione, nome leggibile, valore, origine, selettore, ＋. */
function SlotRow({ slot, voce, aperto, contrasto, confronto, segnato, onApri, onChange, onRipristina, onSegna }: {
  slot: Slot
  voce: VoceRichiesta | undefined
  aperto: boolean
  contrasto?: string
  confronto: { altrove: Campione | null; diverso: boolean; quante: number }
  segnato: boolean
  onApri: () => void
  onChange: (hex: string) => void
  onRipristina: () => void
  onSegna: () => void
}) {
  const attuale = voce ? coloreLeggibile(coloriDentro(voce.a)[0] ?? voce.a) : slot.valore
  const iniziale = voce ? coloreLeggibile(coloriDentro(voce.da)[0] ?? voce.da) : slot.valore
  return (
    <div className="rounded-xl border border-border/60 bg-card px-2 py-1.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onApri} aria-expanded={aperto} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span
            className="h-6 w-6 shrink-0 rounded-md border border-black/10 dark:border-white/20"
            style={{ background: attuale }}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold">
              {slot.etichetta}
              {voce && <span className="ml-1 text-[#e11d8f]">· modificato</span>}
            </span>
            <span className="block truncate font-mono text-[9px] text-muted-foreground">
              {voce ? `${iniziale} → ${attuale}` : attuale} · {slot.origine}
            </span>
            {/* Il confronto: la riga dice da sé se altrove è lo stesso colore. */}
            {confronto.altrove && (
              <span className={`block truncate text-[9px] font-semibold ${confronto.diverso ? 'text-[#9d174d] dark:text-[#fbcfe8]' : 'text-muted-foreground'}`}>
                {confronto.diverso ? '≠ ' : '= '}
                {confronto.altrove.valore} su {confronto.altrove.pagina}
                {confronto.quante > 1 ? ` (e altre ${confronto.quante - 1})` : ''}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          data-testid="sonda-segna"
          onClick={onSegna}
          aria-label={`Segna ${slot.etichetta} nel campionario`}
          title="Segna questo colore nel campionario: resta scritto e lo confronti con le altre pagine"
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
            segnato ? 'border-[#e11d8f] bg-[#fce7f3] text-[#9d174d] dark:bg-[#4c0d2f] dark:text-[#fbcfe8]' : 'border-border/60 text-muted-foreground hover:bg-muted'
          }`}
        >
          {segnato ? <Check size={13} /> : <Plus size={13} />}
        </button>
      </div>

      {aperto && (
        <div className="mt-1.5 space-y-1">
          <ColorPicker
            value={normalizeHex(attuale) ?? '#ffffff'}
            label={slot.etichetta}
            swatches={QUICK_SWATCHES}
            contrastWith={contrasto}
            onChange={onChange}
            onClear={voce ? onRipristina : undefined}
            onClose={onApri}
          />
          {!normalizeHex(attuale) && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Il colore attuale ha una trasparenza ({attuale}): il selettore lavora solo su tinte piene, quindi il nuovo colore sarà opaco.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Aiutanti ──────────────────────────────────────────────────────────────────

/**
 * Un nome corto per la pila: tag + la classe PIÙ PARLANTE (non la prima, che
 * nelle nostre card è spesso una utility come `flex`) o l'aria-label.
 */
function descrizionePila(el: Element): string {
  const classe = classiSalienti(Array.from(el.classList), 1)[0]
  const aria = el.getAttribute('aria-label')
  return aria ? `${el.tagName.toLowerCase()} “${aria.slice(0, 18)}”` : `${el.tagName.toLowerCase()}${classe ? `.${classe}` : ''}`
}

/**
 * Il colore con cui questo deve convivere (serve all'avviso di contrasto del
 * selettore): se sto cambiando il testo guardo lo sfondo e viceversa.
 */
function conColoreConfronto(slot: Slot, lettura: LetturaElemento, el: Element): string | undefined {
  const cs = getComputedStyle(el)
  if (slot.proprieta) {
    if (slot.proprieta === 'color') return coloreLeggibile(cs.backgroundColor)
    if (slot.proprieta === 'background-color') return coloreLeggibile(cs.color)
    return undefined
  }
  if (slot.nome.endsWith('-text')) {
    const gemello = slot.nome.replace(/-text$/, '-bg')
    const sfondo = lettura.slots.find(s => s.nome === gemello)?.valore
    return sfondo ?? (lettura.sfondo?.colore ?? undefined)
  }
  return undefined
}

/**
 * La voce da mandare a me: nome dello slot, colore DI PARTENZA e colore voluto.
 *
 * Per le REGOLE il valore scritto è la proprietà intera, non il solo colore: una
 * `box-shadow` è `0 0 0 1px rgba(...)`, e cambiare il colore vuol dire riscrivere
 * tutta la riga lasciandone intatta la forma (`sostituisciColore`).
 */
function costruisciVoce(
  slot: Slot,
  el: Element,
  hex: string,
  tema: TemaSonda,
  pagina: string,
): VoceRichiesta | null {
  const cs = getComputedStyle(el)
  const base = {
    id: slot.id,
    tipo: slot.tipo,
    nome: slot.nome,
    proprieta: slot.proprieta,
    tema,
    etichetta: slot.etichetta,
    origine: slot.origine,
    selettore: selettoreDi(el),
    descrizione: descrizioneDi(el),
    pagina,
    quando: new Date().toISOString(),
  }
  if (slot.tipo === 'var') {
    return { ...base, da: slot.valore, a: coloreLeggibile(hex) }
  }
  const originale = cs.getPropertyValue(slot.proprieta).trim()
  if (slot.proprieta === 'box-shadow') {
    const riscritto = sostituisciColore(originale, slot.valore, hex)
    if (!riscritto) return null
    return { ...base, da: originale, a: riscritto }
  }
  return { ...base, da: risolviColore(originale), a: hex }
}
