'use client'

import { useState } from 'react'
import { usePlatform } from '@/components/providers/platform-provider'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FilterChip } from '@/components/ui/filter-chip'
import { LoadingShape } from '@/components/ui/loading-shape'
import { PLATFORM_OVERRIDE_KEY, PLATFORMS, type Platform } from '@/lib/platform'
import {
  EASING_OSSERVATO,
  MOLLE_IOS,
  MOLLE_M3,
  RUOLO_MOTO,
  TOKEN_MOTO,
  assestamentoMs,
  linearDaMolla,
  rimbalzo,
} from '@/lib/motion'

/**
 * LA SONDA DEL MOTO (M7 del design system, 22/09/2026).
 *
 * Perché esiste: il colore si misura (c'è la matematica del contrasto) e la forma
 * si guarda in uno screenshot, ma **il movimento si giudica solo guardandolo, e
 * con lo stesso dito che lo userà**. Questa pagina mette fianco a fianco le molle
 * che l'app sta usando con quelle che avrebbe potuto usare, così una taratura si
 * sceglie vedendola invece che immaginandola.
 *
 * Le regole che la tengono onesta (e non è pignoleria, è ciò che la distingue da
 * un mockup):
 *  1. **I valori non sono copiati qui.** Le molle vengono da `lib/motion.ts`, cioè
 *     dalla stessa fonte che genera i token del foglio di stile — e
 *     `scripts/check-motion.mjs` pretende che i due coincidano. Una sonda con
 *     numeri propri mostrerebbe un confronto falso: peggio che non averla.
 *  2. **Non aggiunge nemmeno un token.** Il confronto fra gli schemi (standard /
 *     espressivo) e con l'easing osservato si calcola nel browser al volo: gli
 *     schemi che l'app non usa NON entrano nel foglio di stile, dove sarebbero
 *     token senza lettore (e il contratto li boccia).
 *  3. **Le skin si girano davvero.** I tre pulsanti in alto scrivono l'override di
 *     QA (`lib/platform.ts`) e ricaricano: si guarda la skin dell'altra
 *     piattaforma senza avere due telefoni — che è l'unico modo di tarare il passo
 *     di iOS e di Android nella stessa sessione.
 */

const DISTANZA = 132

export function ProvaMovimento() {
  const piattaforma = usePlatform()
  const [giro, setGiro] = useState(0)
  /** La pressione VIVA (M9), per il primo bottone: il dito giù, non l'hover. */
  const [premuto, setPremuto] = useState(false)
  /** L'allarme di prova: la conferma distruttiva senza conseguenze. */
  const [allarmeAperto, setAllarmeAperto] = useState(false)

  /** La piattaforma su cui stiamo tarando: se è desktop, le molle sono quelle di base. */
  const skin: 'ios' | 'android' = piattaforma === 'android' ? 'android' : 'ios'

  const molle = TOKEN_MOTO.map((voce) => ({ ...voce, molla: voce[skin], easing: linearDaMolla(voce[skin]) }))

  /**
   * Le molle che l'app NON usa, per il confronto (calcolate qui, mai in CSS).
   *
   * Nemmeno la riga dell'easing osservato ha un numero proprio: la sua durata è
   * quella del VELO dell'app (`--motion-duration-exit`, che è l'assestamento della
   * molla della dissolvenza) — così la riga mostra la cosa che conta davvero, cioè
   * la stessa durata con la curva scritta a mano di ieri contro la molla di oggi.
   */
  const confronto = [
    {
      nome: 'La molla dell’app',
      nota: skin === 'ios' ? 'il trio in linguaggio iOS' : 'lo schema espressivo di Material',
      molla: molle[1].molla,
    },
    { nome: 'Material, schema standard', nota: 'damping 0.9 — il Material sobrio', molla: MOLLE_M3.standard.fast.spatial },
    { nome: 'Material, schema espressivo', nota: 'damping 0.7 — quello scelto per l’app', molla: MOLLE_M3.espresso.fast.spatial },
    {
      nome: 'L’easing osservato',
      nota: 'per il moto NON guidato (velo, avanzamento)',
      curva: EASING_OSSERVATO[skin],
      durata: assestamentoMs(molle[2].molla),
    },
    { nome: 'iOS: snappy', nota: 'la molla del tocco, per riferimento', molla: MOLLE_IOS.snappy },
  ]

  function gira() {
    setGiro((n) => n + 1)
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8 space-y-6">
      <style>{`
        @keyframes mv-corsa { from { transform: translateX(0) } to { transform: translateX(${DISTANZA}px) } }
        @keyframes mv-arrivo { from { opacity: 0; transform: translateY(-7px) scale(.9) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes mv-press { from { transform: scale(.96) } to { transform: scale(1) } }
        @keyframes mv-velo { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      <div className="space-y-1">
        <h1 className="text-lg font-bold">Il movimento</h1>
        <p className="text-body text-muted-foreground">
          Le molle di M7: qui si guardano, si confrontano e si girano le skin. Il desktop non le usa — è la
          ragione per cui su desktop non cambia niente.
        </p>
      </div>

      {/* ── Le skin. Non è un menu di prova: è l'override di QA vero. ─────────── */}
      <section className="space-y-2">
        <h2 className="text-title3 font-semibold">La skin</h2>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p: Platform) => (
            <Button
              key={p}
              variant={p === piattaforma ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                window.localStorage.setItem(PLATFORM_OVERRIDE_KEY, p)
                window.location.reload()
              }}
            >
              {p}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.localStorage.removeItem(PLATFORM_OVERRIDE_KEY)
              window.location.reload()
            }}
          >
            torna alla skin automatica
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          Skin attiva: <strong>{piattaforma}</strong> · le molle mostrate sono quelle {skin === 'ios' ? 'iOS' : 'Material'}.
        </p>
      </section>

      {/* ── Le molle in uso, una per ruolo. ───────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-title3 font-semibold">Le molle in uso</h2>
        {molle.map(({ token, ruolo, molla, easing }) => (
          <div key={token} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-body font-semibold truncate">{RUOLO_MOTO[ruolo]}</p>
                <p className="text-caption text-muted-foreground font-mono truncate">{token}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={gira}>
                Riproduci
              </Button>
            </div>

            <p className="text-caption text-muted-foreground">
              ζ {molla.damping} · k {Math.round(molla.stiffness)} → si posa in {assestamentoMs(molla)} ms · rimbalzo{' '}
              {(rimbalzo(molla) * 100).toFixed(2)}%
            </p>

            {/* La pista: il pallino va a fondo corsa e — se la molla rimbalza — lo supera. */}
            <div className="relative h-8 overflow-hidden rounded-md bg-muted">
              <div
                key={`${token}-${giro}`}
                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-primary"
                style={{
                  animationName: ruolo === 'pop' ? 'mv-arrivo' : ruolo === 'fade' ? 'mv-velo' : 'mv-press',
                  animationDuration: `${assestamentoMs(molla)}ms`,
                  animationTimingFunction: easing,
                  animationFillMode: 'both',
                  transformOrigin: 'center',
                }}
              />
            </div>
          </div>
        ))}
        <p className="text-caption text-muted-foreground">
          «Fade» e «press» non rimbalzano di proposito: la famiglia <em>effects</em> di Material serve a colore e
          opacità, e un’alpha che supera il bersaglio si vede come uno sfarfallio.
        </p>
      </section>

      {/* ── Il confronto fra schemi: la parte che si guarda per scegliere. ────── */}
      <section className="space-y-3">
        <h2 className="text-title3 font-semibold">Il confronto</h2>
        <p className="text-caption text-muted-foreground">
          Stessa distanza, stesso compito: cinque curve che partono insieme. È così che si sceglie un passo — non
          leggendo un numero.
        </p>
        <Button size="sm" onClick={gira}>
          Riproduci tutte
        </Button>

        {confronto.map((riga) => {
          const easing = riga.curva ?? linearDaMolla(riga.molla)
          const durata = riga.durata ?? assestamentoMs(riga.molla)
          const salto = riga.curva ? 0 : rimbalzo(riga.molla)
          return (
            <div key={riga.nome} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-caption">
                <span className="font-semibold">{riga.nome}</span>
                <span className="text-muted-foreground">{riga.nota}</span>
              </div>
              <div className="relative h-6 overflow-hidden rounded-md bg-muted">
                <div
                  key={`${riga.nome}-${giro}`}
                  className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-sm bg-foreground"
                  style={{
                    animationName: 'mv-corsa',
                    animationDuration: `${durata}ms`,
                    animationTimingFunction: easing,
                    animationFillMode: 'both',
                  }}
                />
              </div>
              <p className="text-caption text-muted-foreground font-mono">
                {durata} ms · rimbalzo {(salto * 100).toFixed(2)}%
              </p>
            </div>
          )
        })}
      </section>

      {/* ── La pressione: i controlli VERI dell'app, non copie. ──────────────── */}
      <section className="space-y-3">
        <h2 className="text-title3 font-semibold">La pressione</h2>
        <p className="text-caption text-muted-foreground">
          Su iOS il controllo si ritrae (0.96) e la luce sul bordo alto si accende; il ritorno lo fa la molla (270 ms, rimbalzo 1.5%).
          Su Android la superficie si vela con la molla delle <em>effects</em> (150 ms, nessun rimbalzo) e l’increspatura parte da dove
          hai toccato. Il desktop non si muove.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Conferma</Button>
          <Button variant="outline">Annulla</Button>
          <Button variant="ghost" size="sm">
            Piccolo
          </Button>
          <Button variant="destructive" size="sm">
            Elimina
          </Button>
          <FilterChip selected>Miei</FilterChip>
          <FilterChip>Compatibili</FilterChip>
        </div>
      </section>

      {/* ── M9: la FORMA espressiva — dove esiste, e dove no. ──────────────── */}
      <section className="space-y-3">
        <h2 className="text-title3 font-semibold">La forma espressiva</h2>
        <p className="text-caption text-muted-foreground">
          Su Android la pressione DEFORMA (scala 0.85, angoli a 24) e la glow della specifica parte dal punto del dito;
          su iOS nessuna regola tocca i controlli — HIG non ha forme expressive, e la skin non la copia.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-gl
            data-gl-press={premuto ? 'true' : undefined}
            onPointerDown={() => setPremuto(true)}
            onPointerUp={() => setPremuto(false)}
            onPointerCancel={() => setPremuto(false)}
            onPointerLeave={() => setPremuto(false)}
          >
            Conferma
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAllarmeAperto(true)}>
            Prova l&apos;allarme
          </Button>
          <Button data-gl variant="destructive" size="sm">
            Elimina
          </Button>
          <FilterChip data-gl selected>
            Miei
          </FilterChip>
        </div>
        <p className="text-caption text-muted-foreground">
          Solo il primo ha la pressione VIVA (data-gl-press scritta dal componente): gli altri mostrano
          l&apos;onda expressive al tocco, che è per tutti i controlli con l&apos;attributo data-gl.
        </p>

        {/* L'ALLARME DI PROVA: la stessa primitiva `Alert` dell'app, con una
            conferma distruttiva che NON distrugge niente — è ciò che permette di
            provare l'accento pesante dell'aptica senza toccare il database. */}
        <Alert
          open={allarmeAperto}
          onOpenChange={setAllarmeAperto}
          title="Eliminare il documento di prova?"
          description="Questa è una sonda: la conferma non elimina niente di vero."
          confirmLabel="Elimina"
          destructive
          onConfirm={() => setAllarmeAperto(false)}
        />
      </section>

      {/* ── M9: la SCALA DI TAGLIE e il SEGNO DI ATTESA. ───────────────────── */}
      <section className="space-y-3">
        <h2 className="text-title3 font-semibold">La scala e l&apos;attesa</h2>
        <p className="text-caption text-muted-foreground">
          I cinque gradini XS–XL della stessa scala: i due PRIMARI crescono su Android (48 e 56 contro 36 e 44),
          perché lì la taglia vera è la strada del target di tocco (l&apos;increspatura non lascia spazio agli
          pseudo-elementi). Fuori da Android i valori sono quelli di oggi.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(['xs', 'sm', 'default', 'lg', 'xl'] as const).map((gradino) => (
            <Button key={gradino} size={gradino} variant="outline" data-gradino={gradino}>
              {gradino}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <LoadingShape etichetta="Caricamento di prova" />
          <span className="text-caption text-muted-foreground">
            Su Android il segno cambia forma mentre gira (sette forme da otto vertici l&apos;una); altrove è un
            quadrato arrotondato che gira.
          </span>
        </div>
      </section>

      {/* ── Il pannello che sale: la classe VERA dell'app (.month-pop). ──────── */}
      <section className="space-y-3">
        <h2 className="text-title3 font-semibold">Il pannello che sale</h2>
        <p className="text-caption text-muted-foreground">
          Questa è la classe <span className="font-mono">.month-pop</span> dell’app (il selettore mese della board):
          i fotogrammi sono due e il rimbalzo lo fa la molla, non più un fotogramma scritto a mano.
        </p>
        <Button size="sm" variant="secondary" onClick={gira}>
          Aprilo
        </Button>
        <div className="relative h-24">
          {giro > 0 && (
            <div
              key={giro}
              className="month-pop absolute left-0 top-0 rounded-lg border border-border bg-card px-4 py-3 shadow-[var(--elevation-dialog)]"
            >
              <p className="text-body font-semibold">Luglio 2026</p>
              <p className="text-caption text-muted-foreground">Seleziona il mese</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
