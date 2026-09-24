'use client'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { User } from 'lucide-react'
import { useVacationRequests } from '@/hooks/use-vacation-requests'
import { gruppiCompatibiliFerie } from '@/lib/vacation-compat-dashboard'
import { VacationRequestItem } from './vacation-request-item'
import { FilterChip } from '@/components/ui/filter-chip'
import { Skeleton } from '@/components/ui/skeleton'
import { useDuplicateCognomi } from '@/hooks/use-users'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isManager } from '@/types/database'
import { cn } from '@/lib/utils'
import type { VacationPeriod } from '@/types/database'
import type { RichiestaPropria } from '@/lib/vacation-compat-dashboard'

/** Alias locale: il punto di vista è una richiesta propria (vera o ipotetica). */
type VacationRequestItemPropsLike = RichiestaPropria

interface Props {
  isSecondary: boolean
  effectiveUserId: string
  loggedInUserId: string
  myPeriodThisYear: VacationPeriod | null
  year: number
  highlightRequestIds?: number[]
}

function dayKey(createdAt: string) {
  // Group by Europe/Rome day, not UTC (Italian evenings would land on the next day)
  return new Intl.DateTimeFormat('sv', { timeZone: 'Europe/Rome' }).format(new Date(createdAt))
}

export function VacationRequestList({ isSecondary, effectiveUserId, loggedInUserId, myPeriodThisYear, year, highlightRequestIds = [] }: Props) {
  const { data: requests = [], isLoading } = useVacationRequests(isSecondary, year)
  const { profile } = useCurrentUser()
  const isManagerView = profile ? isManager(profile) : false
  const [compatibleOnly, setCompatibleOnly] = useState(false)
  // Le due chip PERSONALI (richiesta 25/09/2026): «Compatibili» (scambio
  // diretto a due) e «⛓ A catena» (giri chiusi da ≥ 3 persone). Un solo filtro
  // attivo per volta; il manager resta sulla sua «Solo compatibili» (richieste
  // con interessi), che parla di un'altra cosa.
  const [filtroMio, setFiltroMio] = useState<'dirette' | 'catene' | null>(null)

  const duplicateCognomi = useDuplicateCognomi(isSecondary)

  // Le MIE richieste ferie nell'anno visto: sono il punto di vista del filtro.
  const propri = useMemo(() => requests.filter(r => r.user_id === effectiveUserId), [requests, effectiveUserId])

  // SENZA richieste pubblicate le chip restano ATTIVE (richiesta 25/09/2026):
  // usano il periodo ASSEGNATO («Il tuo periodo 2027») come IPOTESI — «se
  // offrissi il tuo P6…» — così anche chi non ha ancora pubblicato capisce da
  // cosa potrebbe partire. Un banner lo dice esplicitamente.
  const ipotesi = propri.length === 0 && myPeriodThisYear !== null
  const puntoDiVista = useMemo<VacationRequestItemPropsLike[]>(() => {
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
  // + findVacationChains): lista e dialog non possono contraddirsi.
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

  // Le chip personali si toccano SOLO se c'è un punto di vista: richieste
  // pubblicate OPPURE periodo assegnato (modalità ipotesi).
  const possoFiltrare = propri.length > 0 || ipotesi

  // Conteggi per i contatori sulle chip dei filtri
  const chipCounts = useMemo(() => ({
    total: requests.length,
    compatible: requests.filter(r => r.vacation_request_interests.length > 0).length,
    mieDirette: compat.dirette.length,
    mieCatene: compat.catene.length,
  }), [requests, compat])

  const dateIndexes = useMemo(() => {
    const count = new Map<string, number>()
    return filtered.map(r => {
      const k = dayKey(r.created_at)
      const idx = count.get(k) ?? 0
      count.set(k, idx + 1)
      return idx
    })
  }, [filtered])

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
              {/* Chip `FilterChip` (M4): geometria nei token, non markup copiato. */}
              <FilterChip
                onClick={() => setCompatibleOnly(false)}
                selected={!compatibleOnly}
                count={chipCounts.total}
              >
                Tutti
              </FilterChip>
              <FilterChip
                onClick={() => setCompatibleOnly(true)}
                selected={compatibleOnly}
                dashed={!compatibleOnly}
                icon={<User className="w-3 h-3" />}
                count={chipCounts.compatible}
              >
                Solo compatibili
              </FilterChip>
            </div>
          ) : (
            <>
              {ipotesi && (
                <p className="mb-2 px-1 text-[11px] leading-snug text-muted-foreground">
                  Ipotesi: il tuo periodo assegnato ({myPeriodThisYear ? `P${myPeriodThisYear}` : '—'}) —
                  {' '}pubblica una richiesta per rendere lo scambio reale.
                </p>
              )}
              <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
                <FilterChip
                  disabled={!possoFiltrare}
                  onClick={() => setFiltroMio(f => (f === 'dirette' ? null : 'dirette'))}
                  selected={filtroMio === 'dirette'}
                  dashed={filtroMio !== 'dirette'}
                  className={!possoFiltrare ? 'opacity-50 cursor-not-allowed' : undefined}
                  count={chipCounts.mieDirette}
                >
                  Compatibili
                </FilterChip>
                <FilterChip
                  disabled={!possoFiltrare}
                  onClick={() => setFiltroMio(f => (f === 'catene' ? null : 'catene'))}
                  selected={filtroMio === 'catene'}
                  dashed={filtroMio !== 'catene'}
                  className={!possoFiltrare ? 'opacity-50 cursor-not-allowed' : undefined}
                  count={chipCounts.mieCatene}
                >
                  ⛓ A catena
                </FilterChip>
              </div>
            </>
          )}

          {/* Catene attive: un gruppo PER catena, con il giro nell'intestazione
              (richiesta 25/09/2026). Una richiesta in più catene appare in più
              gruppi: ogni gruppo è un giro possibile diverso. */}
          {!isManagerView && filtroMio === 'catene' ? (
            <div className="flex flex-col gap-0">
              {compat.catene.map((catena, ci) => (
                <div key={catena.titolo} data-catena={catena.titolo}>
                  <div className={cn('mb-2 flex items-center gap-2', ci > 0 && 'mt-4 border-t border-border pt-3')}>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {catena.titolo}
                    </span>
                    <span className="chip-count" aria-hidden="true">{catena.requests.length}</span>
                  </div>
                  {catena.requests.map((request, index) => {
                    const prev = catena.requests[index - 1]
                    const next = catena.requests[index + 1]
                    return (
                      <motion.div
                        key={request.id}
                        data-vac-request={request.id}
                        className={index === 0 ? 'mt-0' : prev && dayKey(prev.created_at) === dayKey(request.created_at) ? 'mt-0' : 'mt-3'}
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
                          isSameDateAsPrevious={!!prev && dayKey(prev.created_at) === dayKey(request.created_at)}
                          isSameDateAsNext={!!next && dayKey(next.created_at) === dayKey(request.created_at)}
                          dateIndex={index}
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
          ) : (
            <div className="flex flex-col gap-0">
              {filtered.map((request, index) => {
                const prev = filtered[index - 1]
                const next = filtered[index + 1]
                const isSameDateAsPrevious = !!prev && dayKey(prev.created_at) === dayKey(request.created_at)
                const isSameDateAsNext = !!next && dayKey(next.created_at) === dayKey(request.created_at)
                return (
                  <motion.div
                    key={request.id}
                    data-vac-request={request.id}
                    className={index === 0 ? 'mt-0' : isSameDateAsPrevious ? 'mt-0' : 'mt-3'}
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
                      isSameDateAsPrevious={isSameDateAsPrevious}
                      isSameDateAsNext={isSameDateAsNext}
                      dateIndex={dateIndexes[index]}
                      year={year}
                      isHighlighted={highlightRequestIds.includes(request.id)}
                      duplicateCognomi={duplicateCognomi}
                      isManagerView={isManagerView}
                    />
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* Filtro personale attivo ma nessun risultato: messaggio dedicato */}
          {!isManagerView && filtroMio && !filtered.length && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {filtroMio === 'dirette'
                ? 'Nessuno scambio diretto col tuo periodo: offri ciò che qualcuno cerca e viceversa.'
                : 'Nessuna catena disponibile col tuo periodo, per ora.'}
            </div>
          )}
        </>
      )}
    </motion.div>
  )
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
