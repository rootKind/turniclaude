'use client'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { User } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useVacationRequests, VACATION_REQUESTS_QUERY_KEY } from '@/hooks/use-vacation-requests'
import { gruppiCompatibiliFerie, type RichiestaPropria } from '@/lib/vacation-compat-dashboard'
import { VacationRequestItem, PeriodPill } from './vacation-request-item'
import { Skeleton } from '@/components/ui/skeleton'
import { useDuplicateCognomi } from '@/hooks/use-users'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isManager } from '@/types/database'
import { cn } from '@/lib/utils'
import type { VacationPeriod } from '@/types/database'

interface Props {
  isSecondary: boolean
  effectiveUserId: string
  loggedInUserId: string
  myPeriodThisYear: VacationPeriod | null
  year: number
  highlightRequestIds?: number[]
}

/**
 * LA LISTA DEI CAMBI FERIE.
 *
 * Raggruppamento (richiesta 25/09/2026): le viste piatte («Tutti»,
 * «Compatibili») raggruppano per PERIODO CEDUTO — l'intestazione dice cosa si
 * cede, il gruppo contiene tutte le richieste che lo chiedono, ordinate per
 * data di creazione — e TUTTE le card del gruppo portano l'ordinale (1°, 2°…):
 * il periodo è nell'intestazione, la data non è più l'ancora visiva.
 * La vista «Cambi a 3 o più» raggruppa per catena: un gruppo per giro, la pillola
 * del periodo che OTTIENI chiudendolo, e UN solo bottone per aderirvi
 * (toggle: il secondo tap ti fa uscire).
 */
function dayKey(createdAt: string) {
  return new Intl.DateTimeFormat('sv', { timeZone: 'Europe/Rome' }).format(new Date(createdAt))
}

export function VacationRequestList({ isSecondary, effectiveUserId, loggedInUserId, myPeriodThisYear, year, highlightRequestIds = [] }: Props) {
  const { data: requests = [], isLoading } = useVacationRequests(isSecondary, year)
  const { profile } = useCurrentUser()
  const isManagerView = profile ? isManager(profile) : false
  const [compatibleOnly, setCompatibleOnly] = useState(false)
  // Le due chip PERSONALI: «Cambi a 2» (l'altro offre ciò che cerco e cerca
  // ciò che offro) e «Cambi a 3 o più» (giri chiusi da ≥ 3 persone). Un
  // solo filtro attivo per volta; il manager
  // resta sulla sua «Solo compatibili» (richieste con interessi).
  const [filtroMio, setFiltroMio] = useState<'dirette' | 'catene' | null>(null)
  const queryClient = useQueryClient()

  const duplicateCognomi = useDuplicateCognomi(isSecondary)

  // Le MIE richieste ferie nell'anno visto: sono il punto di vista del filtro.
  // Con `propri` vuote, il punto di vista è il PERIODO ASSEGNATO come ipotesi
  // (stesso motore; niente banner: le chip funzionano e basta).
  const propri = useMemo(() => requests.filter(r => r.user_id === effectiveUserId), [requests, effectiveUserId])

  // SENZA richieste pubblicate le chip restano ATTIVE: usano il periodo
  // ASSEGNATO («Il tuo periodo 2027») come IPOTESI — «se offrissi il tuo P6…».
  const ipotesi = propri.length === 0 && myPeriodThisYear !== null
  const puntoDiVista = useMemo<RichiestaPropria[]>(() => {
    if (propri.length > 0) return propri
    if (ipotesi && myPeriodThisYear !== null) {
      return [{
        user_id: effectiveUserId,
        offered_period: myPeriodThisYear,
        // TUTTI i periodi tranne il proprio: chi cerca «qualsiasi periodo»
        // (5 target) accetta anche il mio; il MIO periodo non lo cerco.
        target_periods: ([1, 2, 3, 4, 5, 6] as VacationPeriod[]).filter(p => p !== myPeriodThisYear),
      }]
    }
    return []
  }, [propri, ipotesi, myPeriodThisYear, effectiveUserId])

  // Stesso motore del dialog di pubblicazione (findCompatibleVacationRequests
  // + findVacationChains, con l'esclusione dei diretti dalle catene): lista e
  // dialog non possono contraddirsi.
  const compat = useMemo(
    () => gruppiCompatibiliFerie(requests, puntoDiVista),
    [requests, puntoDiVista],
  )

  const filtered = useMemo(() => {
    if (isManagerView && compatibleOnly) return requests.filter(r => r.vacation_request_interests.length > 0)
    if (!isManagerView && filtroMio === 'dirette') return compat.dirette
    if (!isManagerView && filtroMio === 'catene') return compat.catene.flatMap(c => c.requests)
    return requests
  }, [requests, isManagerView, compatibleOnly, filtroMio, compat])

  // GRUPPI PER PERIODO CEDUTO (viste piatte): ogni gruppo = un offered_period;
  // dentro, ordine di arrivo (created_at). Senza richieste proprie (e senza
  // assegnazione) si ricade su un unico gruppo per non nascondere nulla.
  const gruppiPeriodo = useMemo(() => {
    const mappa = new Map<VacationPeriod | null, typeof filtered>()
    for (const r of filtered) {
      const k = r.offered_period as VacationPeriod | null
      const list = mappa.get(k) ?? []
      list.push(r)
      mappa.set(k, list)
    }
    return [...mappa.entries()]
      .sort((a, b) => (a[0] ?? 9) - (b[0] ?? 9))
      .map(([periodo, lista]) => ({ periodo, lista }))
  }, [filtered])

  // Conteggi per i contatori sulle chip dei filtri
  const chipCounts = useMemo(() => ({
    total: requests.length,
    compatible: requests.filter(r => r.vacation_request_interests.length > 0).length,
    mieDirette: compat.dirette.length,
    mieCatene: compat.catene.length,
  }), [requests, compat])

  // Ordinali dentro il gruppo visualizzato (per data di creazione)
  const dateIndexes = useMemo(() => {
    const count = new Map<string, number>()
    return filtered.map(r => {
      const k = dayKey(r.created_at)
      const idx = count.get(k) ?? 0
      count.set(k, idx + 1)
      return idx
    })
  }, [filtered])

  // Stato delle MIE adesioni a catena (dal contesto degli interessi): il
  // bottone del gruppo catena è un toggle iscrizione/uscita.
  const mieCatene = useMemo(() => {
    const set = new Set<string>()
    for (const catena of compat.catene) {
      const dentro = catena.requests.every(r =>
        r.vacation_request_interests.some(i => i.user_id === effectiveUserId && i.chain_context))
      // Tutti i nodi del giro portano il MIO interesse di catena → sono dentro.
      const miei = catena.requests.filter(r =>
        r.vacation_request_interests.some(i => i.user_id === effectiveUserId && i.chain_context))
      if (dentro || miei.length > 0) set.add(catena.requests.map(r => r.id).join('-'))
    }
    return set
  }, [compat.catene, effectiveUserId])

  async function toggleCatena(catena: { requests: typeof requests }) {
    const requestIds = catena.requests.map(r => r.id)
    const chiave = requestIds.join('-')
    const dentro = mieCatene.has(chiave)
    try {
      const res = await fetch('/api/vacanze/join-chain', {
        method: dentro ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestIds,
          ...(dentro ? {} : {
            actorName: [profile?.nome, profile?.cognome].filter(Boolean).join(' '),
            year,
            source: 'list',
          }),
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || 'Errore')
      }
      queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      toast.success(dentro ? 'Sei uscito dalla catena' : 'Interesse alla catena registrato')
    } catch (err) {
      toast.error((err as Error).message || 'Errore durante l’iscrizione alla catena')
    }
  }

  if (isLoading) return <VacationListSkeleton />

  return (
    <motion.div
      key={year}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {!requests.length ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nessuna richiesta di cambio ferie.
        </div>
      ) : (
        <>
          {isManagerView ? (
            <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
              <button
                onClick={() => setCompatibleOnly(false)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
                  !compatibleOnly ? 'chip-selected' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                Tutti
                <span className="chip-count" aria-hidden="true">{chipCounts.total}</span>
              </button>
              <button
                onClick={() => setCompatibleOnly(true)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border',
                  compatibleOnly
                    ? 'chip-selected'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 border-dashed border-muted-foreground/40'
                )}
              >
                <User className="w-3 h-3" />
                Solo compatibili
                <span className="chip-count" aria-hidden="true">{chipCounts.compatible}</span>
              </button>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
              <button
                type="button"
                disabled={!possoFiltrare(propri.length, ipotesi)}
                onClick={() => setFiltroMio(f => (f === 'dirette' ? null : 'dirette'))}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border',
                  !possoFiltrare(propri.length, ipotesi) && 'opacity-50 cursor-not-allowed',
                  filtroMio === 'dirette'
                    ? 'chip-selected'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 border-dashed border-muted-foreground/40',
                )}
              >
                Cambi a 2
                <span className="chip-count" aria-hidden="true">{chipCounts.mieDirette}</span>
              </button>
              <button
                type="button"
                disabled={!possoFiltrare(propri.length, ipotesi)}
                onClick={() => setFiltroMio(f => (f === 'catene' ? null : 'catene'))}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border',
                  !possoFiltrare(propri.length, ipotesi) && 'opacity-50 cursor-not-allowed',
                  filtroMio === 'catene'
                    ? 'chip-selected'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 border-dashed border-muted-foreground/40',
                )}
              >
                Cambi a 3 o più
                <span className="chip-count" aria-hidden="true">{chipCounts.mieCatene}</span>
              </button>
            </div>
          )}

          {/* Vista CATENE: un gruppo per giro, pillola del periodo che OTTIENI,
              un solo bottone di interesse (toggle iscrizione/uscita). */}
          {!isManagerView && filtroMio === 'catene' ? (
            <div className="flex flex-col gap-0">
              {compat.catene.map((catena, ci) => {
                const chiave = catena.requests.map(r => r.id).join('-')
                const dentro = mieCatene.has(chiave)
                return (
                  <div key={chiave} data-catena={chiave} data-titolo={catena.titolo}>
                    <div className={cn('mb-2 flex items-center gap-2 flex-wrap', ci > 0 && 'mt-4 border-t border-border pt-3')}>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {catena.titolo}
                      </span>
                      {/* Il periodo che OTTIENI chiudendo il giro */}
                      <PeriodPill period={catena.ottieni} />
                    </div>
                    {catena.requests.map((request, index) => (
                      <motion.div
                        key={request.id}
                        data-vac-request={request.id}
                        className={index === 0 ? 'mt-0' : 'mt-0'}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: Math.min(index * 0.04, 0.3), ease: 'easeOut' }}
                      >
                        <VacationRequestItem
                          request={request}
                          currentUserId={effectiveUserId}
                          loggedInUserId={loggedInUserId}
                          isSecondary={isSecondary}
                          myPeriodThisYear={myPeriodThisYear}
                          isSameDateAsPrevious={index > 0}
                          isSameDateAsNext={index < catena.requests.length - 1}
                          dateIndex={index}
                          year={year}
                          isHighlighted={highlightRequestIds.includes(request.id)}
                          duplicateCognomi={duplicateCognomi}
                          isManagerView={isManagerView}
                          isChainView
                          mostraBadgeCatena
                        />
                      </motion.div>
                    ))}
                    <button
                      type="button"
                      onClick={() => void toggleCatena(catena)}
                      className={cn(
                        'mt-2 w-full h-9 rounded-[10px] text-[12px] font-bold transition-colors border',
                        dentro
                          ? 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                          : 'panel-chain btn-chain-action border-transparent',
                      )}
                    >
                      {dentro ? '↩ Esci dalla catena' : '⛓ Unisciti alla catena'}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Viste piatte raggruppate PER PERIODO CEDUTO: intestazione col
               periodo, ordinali su TUTTE le card del gruppo (il giorno non è
               più l'ancora visiva), ordine di arrivo dentro il gruppo. */
            <div className="flex flex-col gap-0">
              {gruppiPeriodo.map(({ periodo, lista }, gi) => (
                <div key={periodo ?? 'ignoto'} data-periodo={periodo ?? 'ignoto'}>
                  <div className={cn('mb-2 flex items-center gap-2', gi > 0 && 'mt-4 border-t border-border pt-3')}>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Cedendo
                    </span>
                    <PeriodPill period={periodo} />
                    <span className="chip-count" aria-hidden="true">{lista.length}</span>
                  </div>
                  {lista.map((request, index) => {
                    const inGruppo = lista.indexOf(request)
                    return (
                      <motion.div
                        key={request.id}
                        data-vac-request={request.id}
                        className="mt-0"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: Math.min(index * 0.04, 0.3), ease: 'easeOut' }}
                      >
                        <VacationRequestItem
                          request={request}
                          currentUserId={effectiveUserId}
                          loggedInUserId={loggedInUserId}
                          isSecondary={isSecondary}
                          myPeriodThisYear={myPeriodThisYear}
                          isSameDateAsPrevious={inGruppo > 0}
                          isSameDateAsNext={inGruppo < lista.length - 1}
                          dateIndex={inGruppo}
                          year={year}
                          isHighlighted={highlightRequestIds.includes(request.id)}
                          duplicateCognomi={duplicateCognomi}
                          isManagerView={isManagerView}
                        />
                      </motion.div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Filtro personale attivo ma nessun risultato: messaggio dedicato */}
          {!isManagerView && filtroMio && !filtered.length && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {filtroMio === 'dirette'
                ? 'Nessun cambio a 2 col tuo periodo: offri ciò che qualcuno cerca e viceversa.'
                : 'Nessun cambio a 3 o più col tuo periodo, per ora.'}
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}

function possoFiltrare(numPropri: number, ipotesi: boolean): boolean {
  return numPropri > 0 || ipotesi
}

function VacationListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
      ))}
    </div>
  )
}
