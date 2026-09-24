'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Pencil, Trash2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { getUserShiftOnDate } from '@/lib/shift-compat'
import { buildSalaFocusUrl } from '@/lib/shift-tokens'
import { boardSectionKeys, loadEsitoOnce, rememberedEsito, shiftLookupKey, type EsitoSala } from '@/lib/sala-jump'
import { formatShiftDate, formatRelativeTime, formatDisplayName, getShiftItemState, SHIFT_STATE_CLASSES, SHIFT_DATE_CLASSES, SHIFT_PILL_CLASSES } from '@/lib/utils'
import { isAdmin } from '@/types/database'
import type { Shift, ShiftType } from '@/types/database'
import { toggleInterest, deleteShift } from '@/lib/queries/shifts'
import { useQueryClient } from '@tanstack/react-query'
import { SHIFTS_QUERY_KEY } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  shift: Shift
  currentUserId: string
  loggedInUserId: string
  isSecondary: boolean
  isDcoPlus?: boolean          // viewer DCO+ (vede anche i turni dei Noni)
  isSameDateAsPrevious?: boolean
  isSameDateAsNext?: boolean
  dateIndex?: number
  onEdit?: (shift: Shift) => void
  isHighlighted?: boolean
  duplicateCognomi?: Set<string>
  isManagerView?: boolean
  /** DISPONIBILI «D» (richiesta 25/09/2026): quanti dipendenti dei gruppi
   *  contati hanno il turno D nel giorno del cambio (scope del viewer:
   *  DCO senza noni, noni solo noni, manager tutti). */
  disponibiliCount?: number
}

export function ShiftItem({ shift, currentUserId, loggedInUserId, isSecondary, isDcoPlus = false, isSameDateAsPrevious = false, isSameDateAsNext = false, dateIndex = 0, onEdit, isHighlighted = false, duplicateCognomi, isManagerView = false, disponibiliCount }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showRing, setShowRing] = useState(isHighlighted)
  /* Il tap sulla data interroga i turni prima di muoversi: evita il doppio tocco
     mentre la risposta è in volo. Da qui parte anche l'attesa VISIVA (opacità
     della colonna) — solo quando la risposta non è già in memoria. */
  const [verificando, setVerificando] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  // Manager-specific state
  const [managerAction, setManagerAction] = useState<'reject' | 'confirm' | 'pending' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [selectedInterestUserId, setSelectedInterestUserId] = useState<string>('')
  const [managerLoading, setManagerLoading] = useState(false)

  useEffect(() => {
    if (!isHighlighted) return
    setShowRing(true)
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setShowRing(false), 3000)
    return () => clearTimeout(t)
  }, [isHighlighted])

  /* DISPONIBILI «D» (richiesta 25/09/2026): «DISP: N» sotto la DATA, nella
     colonna sinistra (richiesta 25/09, spostato dal fianco del cuore) = quanti
     dipendenti dei gruppi contati (noni/terza/seconda/scorte, senza Maternità
     né RIC/ASTER né chi è fuori squadra) hanno il turno D nel giorno del cambio.
     Scope del viewer (vedi use-disponibili). È un dato del GIORNO: si mostra
     solo sulla prima card del giorno, non sui cambi successivi («2°», «3°»…). */
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()

  const isOwn = shift.user_id === currentUserId
  const canAdminAct = isAdmin(loggedInUserId)
  const isImpersonating = currentUserId !== loggedInUserId
  const hasInterest = (shift.shift_interested_users?.length ?? 0) > 0
  const isInterested = shift.shift_interested_users?.some(i => i.user_id === currentUserId) ?? false

  // Richiesta dell'ALTRO gruppo rispetto allo spettatore: DCO+ vede i Noni,
  // i Noni vedono i DCO+. I DCO+ sono formalmente DCO → per un DCO normale nulla.
  const isDcoPlusViewer = isDcoPlus === true
  const isCrossCategory = isDcoPlusViewer
    ? shift.user.is_secondary === true
    : isSecondary
      ? shift.user.is_dco_plus === true
      : false
  const crossBadgeLabel = isCrossCategory ? (isDcoPlusViewer ? 'NONO' : 'DCO+') : null

  const state = getShiftItemState({ isOwn, hasInterest })
  const stateClass = SHIFT_STATE_CLASSES[state]
  const { day, month, weekday } = formatShiftDate(shift.shift_date)

  // Colonna data delle card NON prime del giorno: sfondo opaco dedicato (niente
  // opacity sull'intero blocco → ordinale leggibile e divisore verticale pieno).
  // MAI sulla propria card (Variante A): il riquadro TUO resta completo.
  const dateBgClass = isSameDateAsPrevious && !isOwn
    ? 'shift-date-sub-others'
    : SHIFT_DATE_CLASSES[state]

  // Card dello stesso giorno agglomerate in un blocco unico: angoli rotondi solo sul
  // primo (top) e sull'ultimo (bottom) del gruppo; le intermedie sono squadrate.
  // Espansa, la card estende il bordo sul pannello: tondo in alto solo se è la prima
  // del giorno, tondo in basso (sul pannello) solo se è l'ultima. Il raggio vive sul
  // WRAPPER interno (che contiene riga+pannello e ha il bordo continuo).
  const isFirstOfDay = !isSameDateAsPrevious
  const isLastOfDay = !isSameDateAsNext
  const borderRadius = expanded
    ? cn(isFirstOfDay && 'rounded-t-[10px]', isLastOfDay && 'rounded-b-[10px]')
    : isFirstOfDay && isLastOfDay
      ? 'rounded-[10px]'
      : isFirstOfDay
        ? 'rounded-t-[10px]'
        : isLastOfDay
          ? 'rounded-b-[10px]'
          : ''

  async function handleInterestToggle(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      if (isImpersonating) {
        const res = await fetch('/api/admin/interests', {
          method: isInterested ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shift_id: shift.id, user_id: currentUserId }),
        })
        if (!res.ok) throw new Error('Interest toggle failed')
      } else {
        await toggleInterest(shift.id, currentUserId, isInterested)
        if (!isInterested) {
          // Notify shift owner when adding interest (not removing)
          const actorName = profile ? `${profile.cognome ?? ''} ${profile.nome ?? ''}`.trim() : 'Qualcuno'
          fetch('/api/push/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'interest', shiftId: shift.id, actorName }),
          }).catch(() => {})
        }
      }
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
    } catch {
      toast.error('Errore')
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setConfirmDelete(false)
    try {
      if (isOwn && !isImpersonating) {
        await deleteShift(shift.id)
      } else {
        const res = await fetch(`/api/admin/shifts/${shift.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Delete failed')
      }
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
      toast.success('Turno eliminato')
    } catch {
      toast.error('Errore eliminazione')
    }
  }

  async function handleManagerReject() {
    setManagerLoading(true)
    try {
      const res = await fetch(`/api/manager/shift-requests/${shift.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason.trim() || undefined }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
      toast.success('Richiesta rifiutata')
      setManagerAction(null)
      setRejectReason('')
    } catch {
      toast.error('Errore')
    } finally {
      setManagerLoading(false)
    }
  }

  async function handleManagerConfirm() {
    const interestedUsers = shift.shift_interested_users ?? []
    if (interestedUsers.length > 1 && !selectedInterestUserId) {
      setManagerAction('confirm')
      return
    }
    const userId = interestedUsers.length === 1 ? interestedUsers[0].user_id : selectedInterestUserId
    setManagerLoading(true)
    try {
      const res = await fetch(`/api/manager/shift-requests/${shift.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', selectedUserId: userId || undefined }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
      toast.success('Richiesta confermata')
      setManagerAction(null)
      setSelectedInterestUserId('')
    } catch {
      toast.error('Errore')
    } finally {
      setManagerLoading(false)
    }
  }

  async function handleManagerPending(e: React.MouseEvent) {
    e.stopPropagation()
    if (shift.is_pending) {
      setManagerLoading(true)
      try {
        const res = await fetch(`/api/manager/shift-requests/${shift.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pending' }),
        })
        if (!res.ok) throw new Error()
        queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
      } catch {
        toast.error('Errore')
      } finally {
        setManagerLoading(false)
      }
      return
    }
    const interestedUsers = shift.shift_interested_users ?? []
    if (interestedUsers.length > 1 && !selectedInterestUserId) {
      setExpanded(true)
      setManagerAction('pending')
      return
    }
    const userId = interestedUsers.length === 1 ? interestedUsers[0].user_id : selectedInterestUserId
    setManagerLoading(true)
    try {
      const res = await fetch(`/api/manager/shift-requests/${shift.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pending', selectedUserId: userId || undefined }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
      setManagerAction(null)
      setSelectedInterestUserId('')
    } catch {
      toast.error('Errore')
    } finally {
      setManagerLoading(false)
    }
  }

  const displayName = formatDisplayName(shift.user, duplicateCognomi)

  /**
   * DALLA CARD AL TURNO IN SALA (richiesta 18/09/2026).
   *
   * Tap sulla colonna della DATA (o sull'ordinale, per i cambi successivi dello
   * stesso giorno) → /turnisala aperta sul GIORNO della card e sul turno M/P/N del
   * turno OFFERTO («cedo Mattina» → turno M), con la persona che cede evidenziata:
   * la board trova la sua card di sezione e la illumina.
   *
   * PRIMA DI PARTIRE si CHIEDE AI TURNI se quella persona ha davvero quel turno
   * quel giorno (PDF del mese, altrimenti rotazione teorica: la stessa fonte che
   * alimenta /turnisala) E DOVE LA BOARD LA MOSTRA. Le due domande sono diverse e
   * la seconda mancava (revisione 19/09/2026: il collega vedeva il vecchio avviso
   * giallo «non è in sala…» anche nei mesi col PDF, perché la board non ha
   * nessuna card per chi è «presente senza sezione»).
   *
   * Se il turno non torna si RESTA QUI e lo si dice. Se il turno c'è si va in
   * sala OVUNQUE la board sappia accendere qualcosa: la card di sezione, oppure la
   * PILLOLA della riga «Altre attività» (turno «nudo» M/N/P, trasferta `NDis*`,
   * `TUTOR`/`MTUTOR`…), che ora respira come una card. Si resta qui solo quando la
   * board non mostrerebbe la persona in nessun posto: la sezione non è collegata a
   * una card della piantina, oppure il codice non compare affatto (invisibile per
   * decisione utente: `G`, `MSb`, `12.14`…).
   *
   * Le due regole vivono in un posto solo: `boardPlacementOf` (lib/shift-tokens),
   * che è lo STESSO ramo di `applyTokenToDay` con cui la board decide dove scrive
   * un nome — così verifica e board non possono più contraddirsi.
   * Il resto della card continua ad aprire il pannello come prima.
   *
   * ISTANTANEO (richiesta 19/09/2026): la verifica PARTE GIÀ al pointerdown e il
   * suo esito resta in memoria per persona+giorno (`lib/sala-jump.ts`), così il
   * click è un salto senza attesa: la promessa è la stessa che il dito ha già
   * avviato (o la risposta è già lì).
   */
  const salaKey = shift.shift_date ? shiftLookupKey(shift.user_id, shift.shift_date) : ''
  const loadEsito = (): Promise<EsitoSala> => {
    const date = shift.shift_date
    if (!date) return Promise.resolve({ shift: null, token: '', placement: null, section: null })
    const supabase = createClient()
    // La piantina si scalda insieme alla verifica: serve alla decisione, non al
    // salto, ed è una lettura per sessione di pagina (vedi boardSectionKeys).
    void boardSectionKeys(supabase)
    return getUserShiftOnDate(supabase, shift.user_id, date).then(s => ({
      shift: s.shift, token: s.token, placement: s.placement, section: s.section,
    }))
  }
  /** Scalda la verifica (pointerdown / tastiera); se la risposta è già nota non
   *  tocca la rete. Gli errori li decide il click, che rilancia la stessa promessa. */
  function scaldaVerifica() {
    if (!salaKey || verificando) return
    void loadEsitoOnce(salaKey, loadEsito).catch(() => {})
  }
  async function vaiInSala() {
    if (!salaKey || verificando) return
    // Risposta già in memoria: nessun segnale d'attesa da mostrare, il salto è
    // immediato (l'await di una promessa risolta si chiude nello stesso tick).
    setVerificando(rememberedEsito(salaKey) === undefined)
    const apriSala = () => {
      const url = buildSalaFocusUrl({
        shiftDate: shift.shift_date,
        offeredShift: shift.offered_shift,
        cognome: shift.user?.cognome ?? '',
        nome: shift.user?.nome,
        // Contesto della dashboard (bypass del guard PWA, impersonazione): senza,
        // il salto in un browser normale (anteprima, desktop) atterra sul guard.
        from: new URLSearchParams(window.location.search),
      })
      if (url) router.push(url)
    }
    try {
      const esito = await loadEsitoOnce(salaKey, loadEsito)
      if (esito.shift !== shift.offered_shift) {
        // toast.error, NON info: è un avvertimento (richiesta 19/09/2026) e con
        // `richColors` acceso su <Toaster> l'errore è l'unico tono ROSSO, in
        // chiaro e in scuro senza CSS nostro.
        toast.error(`Dai turni non risulta che ${displayName} abbia ${shift.offered_shift} il giorno ${day}.`)
        return
      }
      // Il turno c'è. La PILLOLA delle «Altre attività» non dipende dalla
      // piantina: se la board mostra la persona lì, si va (l'evidenzia c'è).
      if (esito.placement?.kind === 'altri') {
        apriSala()
        return
      }
      // Altrimenti la board avrebbe una card da illuminare? Se la piantina non si
      // legge (`null`) si torna al comportamento di prima — un errore di rete non
      // deve bloccare i salti legittimi.
      const sezioni = await boardSectionKeys(createClient())
      const suCard = esito.placement?.kind === 'card' &&
        (sezioni === null || sezioni.has(esito.section ?? ''))
      if (!suCard) {
        // Due motivi, due frasi — entrambe vere, nessun codice grezzo addosso
        // all'utente: la sezione non è collegata a una card, oppure la board non
        // mostra affatto quel codice (invisibile per decisione utente).
        toast.error(esito.placement?.kind === 'card'
          ? `${displayName} il giorno ${day} è in sezione «${esito.section ?? ''}», che non ha una card sulla board.`
          : `${displayName} il giorno ${day} non compare in nessuna sezione della board.`)
        return
      }
      apriSala()
    } catch {
      // Rete o mese illeggibile: si va comunque in sala (la board sa spiegarsi
      // da sé se non trova nessuno).
      apriSala()
    } finally {
      setVerificando(false)
    }
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        'rounded-[10px] transition-shadow duration-700',
      )}
    >
      {/* Wrapper interno (25/08/2026): bordo + sfondo + raggio + clip UNICI sulla card
          (riga+pannello). Il tratto di bordo continuo elimina i 'triangoli' alle giunzioni
          riga↔pannello e pannello↔card successiva (i bordi 1px di elementi impilati con lo
          stesso colore vengono antialiasati dal browser a zoom alto). Il divisore fra le
          card dello stesso giorno è il bordo basso VISIBILE (.shift-grouped-b).
          Da espansa, il pannello è una CARD A SÉ (.shift-expand-panel): full-width, con
          divisore orizzontale rispetto alla riga; il pattern data/corpo NON si estende
          nell'espansione (la striscia della colonna data vive sulla riga,
          .shift-grouped-row-strip). */}
      <div className={cn(stateClass, borderRadius, 'overflow-hidden',
        // MAI sulla propria card (Variante A): il riquadro TUO resta completo su 4 lati.
        !isOwn && isSameDateAsPrevious && 'shift-grouped-t',
        !isOwn && isSameDateAsNext && 'shift-grouped-b',
        // Durante l'highlight il bordo interno diventa del colore highlight e porta
        // il ring (che segue la forma originale della card); transition per la
        // dissolvenza (colore + ripristino del bordo alto delle card raggruppate).
        'transition-[border-color,border-top-width,box-shadow] duration-700',
        showRing && 'shift-card-highlight-inner',
      )}>
        {/* Main row */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          className={cn('flex items-stretch overflow-hidden cursor-pointer select-none',
            // Striscia della colonna data sotto il divisore: SOLO sulla riga (il
            // pannello espanso non deve ereditarla). MAI sulla propria card.
            !isOwn && isSameDateAsPrevious && 'shift-grouped-row-strip',
            !shift.is_pending && isManagerView && hasInterest && 'confirm-overlay',
            shift.is_pending && 'pending-overlay',
          )}
          onClick={() => setExpanded(v => !v)}
        onKeyDown={e => {
          // Solo la RIGA stessa: senza questo guard, Enter/Space su un controllo
          // dentro la card (la data che porta in sala, «Mi interessa») risaliva
          // fino a qui e apriva ANCHE il pannello.
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v) }
        }}
      >
        {/* Date block — È UN BOTTONE (richiesta 18/09/2026): tappare qui NON apre
            la card, porta al turno corrispondente in /turnisala. Vale anche per
            l'ordinale («2°») dei cambi successivi nello stesso giorno. */}
        <button
          type="button"
          // Il dito che scende sulla data avvia la verifica: quando il click
          // arriva, la risposta è già in memoria o in volo (salto istantaneo).
          onPointerDown={scaldaVerifica}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') scaldaVerifica() }}
          onClick={e => { e.stopPropagation(); void vaiInSala() }}
          disabled={verificando}
          aria-busy={verificando}
          aria-label={`Vedi in sala: turno ${shift.offered_shift} del ${day} ${month} di ${displayName}`}
          className={cn('relative w-[52px] flex-shrink-0 flex flex-col items-center cursor-pointer',
            // (25/09/2026) Con «DISP: N» sotto il mese la data si ALZA un po'
            // (justify-start + padding minore): il numero del giorno resta
            // l'ancora visiva, il DISP sta sotto senza spingere il centro giù.
            // I cambi successivi dello stesso giorno («2°») restano centrati.
            dateIndex > 0 ? 'justify-center py-3' : 'justify-start py-2',
            verificando && 'opacity-60', dateBgClass,
            // A riposo (25/08/2026) niente separatore nella colonna data: il gruppo di card
            // dello stesso giorno è un blocco unico, nessuna linea identifica la parte compressa.
          )}>
          {!shift.is_pending && isManagerView && hasInterest && <span className="absolute inset-0 confirm-overlay pointer-events-none" />}
          {shift.is_pending && <span className="absolute inset-0 pending-overlay pointer-events-none" />}
          {dateIndex > 0 ? (
            <span className="text-[16px] font-extrabold leading-none text-muted-foreground">{dateIndex + 1}°</span>
          ) : (
            <>
              <span className="text-[8px] uppercase tracking-wide text-muted-foreground">{weekday}</span>
              <span className={cn('text-[20px] font-extrabold leading-none', isOwn && hasInterest ? 'text-interest-date' : '')}>
                {day}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{month}</span>
              {typeof disponibiliCount === 'number' && (
                // DISP: N — piccolo, sotto la data (richiesta 25/09/2026).
                <span
                  className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/80 mt-1 tabular-nums"
                  title="Disponibili (turno D) nel giorno del cambio"
                >
                  DISP: {disponibiliCount}
                </span>
              )}
            </>
          )}
        </button>

        {/* Content */}
        <div className={cn('flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0',
          // A riposo (25/08/2026) niente separatore sul contenuto: nessuna linea orizzontale
          // tra card dello stesso giorno (la parte compressa non è identificabile a riposo).
        )}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={cn('font-semibold text-[13px] leading-none', isOwn ? 'text-own-name' : '')}>
                {displayName}
              </span>                {isOwn && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-foreground/10 text-foreground ring-1 ring-foreground/30">TUO</span>
              )}
              {crossBadgeLabel && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-foreground/15 text-foreground ring-1 ring-foreground/30">
                  {crossBadgeLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <ShiftPill type={shift.offered_shift} />
              <span className="text-muted-foreground text-[11px]">→</span>
              {shift.requested_shifts.map((r, i) => (
                <span key={r} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground text-[11px]">o</span>}
                  <ShiftPill type={r as ShiftType} />
                </span>
              ))}
            </div>
          </div>

          {/* Interest count */}
          <div className="flex-shrink-0 text-[11px]">
            {isManagerView ? (
              <div className="flex items-center gap-1">
                {(hasInterest || shift.is_pending) && (
                  <button
                    className={cn(
                      'flex items-center justify-center w-5 h-5 rounded-full border transition-colors',
                      shift.is_pending
                        ? 'ring-pending'
                        : 'ring-confirm',
                      managerLoading && 'opacity-50 pointer-events-none',
                    )}
                    onClick={handleManagerPending}
                    aria-label="Segna come in attesa"
                  >
                    <Clock size={10} />
                  </button>
                )}
                {(shift.shift_interested_users?.length ?? 0) > 0 && (
                  <span className={cn(shift.is_pending ? 'text-pending' : 'text-confirm')}>
                    {shift.shift_interested_users!.length}
                  </span>
                )}
              </div>
            ) : isOwn ? (
              <span className={hasInterest ? 'text-interest-date' : 'text-muted-foreground'}>
                {hasInterest ? `${shift.shift_interested_users!.length} ❤️` : '0 ♡'}
              </span>
            ) : (
              <button
                className={cn('leading-none', isInterested ? 'text-interest-date' : 'text-muted-foreground')}
                onClick={handleInterestToggle}
                aria-label={isInterested ? 'Rimuovi interesse' : 'Sono interessato'}
              >
                {(shift.shift_interested_users?.length ?? 0) > 0
                  ? `${shift.shift_interested_users!.filter(i => i.user_id !== currentUserId).length + (isInterested ? 1 : 0)} ${isInterested ? '❤️' : '♡'}`
                  : `0 ${isInterested ? '❤️' : '♡'}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Card a sé (25/08/2026): divisore orizzontale col colore dei separatori
                fra card dello stesso giorno; il pannello è full-width (niente colonna data). */}
            <div className="shift-expand-panel px-3 py-3">
              {/* ── MANAGER VIEW ── */}
              {isManagerView && (
                <>
                  {/* Interested users list */}
                  {hasInterest ? (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-match uppercase tracking-wide mb-1.5">Interessati</p>
                      <div className="flex flex-col gap-0.5">
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-black/10 dark:border-white/10 last:border-0">
                              <span className="text-[12px]">{formatDisplayName(i.user, duplicateCognomi)}</span>
                              <span className="text-[10px] text-muted-foreground">{formatRelativeTime(i.created_at!)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground mb-3">Nessuno interessato ancora</p>
                  )}

                  {/* Reject popup */}
                  {managerAction === 'reject' && (
                    <div className="mb-3 flex flex-col gap-2">
                      <Textarea
                        placeholder="Motivo (opzionale)"
                        className="text-[12px] min-h-[60px] resize-none"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); setManagerAction(null); setRejectReason('') }}>
                          Annulla
                        </Button>
                        <Button variant="destructive" size="sm" className="flex-1 h-8 text-[11px]" disabled={managerLoading} onClick={e => { e.stopPropagation(); handleManagerReject() }}>
                          {managerLoading ? '...' : 'Conferma rifiuto'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Pending: select interested user if multiple */}
                  {managerAction === 'pending' && (shift.shift_interested_users?.length ?? 0) > 1 && (
                    <div className="mb-3 flex flex-col gap-2">
                      <p className="text-[11px] text-muted-foreground">Seleziona il dipendente per la notifica di attesa:</p>
                      <select
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={selectedInterestUserId}
                        onChange={e => setSelectedInterestUserId(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="">Seleziona…</option>
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <option key={i.user_id} value={i.user_id}>{formatDisplayName(i.user, duplicateCognomi)}</option>
                          ))}
                      </select>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); setManagerAction(null); setSelectedInterestUserId('') }}>
                          Annulla
                        </Button>
                        <Button size="sm" className="flex-1 h-8 text-[11px] btn-pending" disabled={!selectedInterestUserId || managerLoading} onClick={e => { e.stopPropagation(); handleManagerPending(e) }}>
                          {managerLoading ? '...' : 'Segna in attesa'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Confirm: select interested user if multiple */}
                  {managerAction === 'confirm' && (shift.shift_interested_users?.length ?? 0) > 1 && (
                    <div className="mb-3 flex flex-col gap-2">
                      <p className="text-[11px] text-muted-foreground">Seleziona il dipendente con cui fare il cambio:</p>
                      <select
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        value={selectedInterestUserId}
                        onChange={e => setSelectedInterestUserId(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="">Seleziona…</option>
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <option key={i.user_id} value={i.user_id}>{formatDisplayName(i.user, duplicateCognomi)}</option>
                          ))}
                      </select>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); setManagerAction(null); setSelectedInterestUserId('') }}>
                          Annulla
                        </Button>
                        <Button size="sm" className="flex-1 h-8 text-[11px] btn-confirm" disabled={!selectedInterestUserId || managerLoading} onClick={e => { e.stopPropagation(); handleManagerConfirm() }}>
                          {managerLoading ? '...' : 'Conferma'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Conferma / Rifiuta buttons */}
                  {managerAction === null && (
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1 h-8 text-[11px]"
                        onClick={e => { e.stopPropagation(); setManagerAction('reject') }}
                      >
                        Rifiuta
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-[11px] btn-confirm"
                        disabled={managerLoading}
                        onClick={e => { e.stopPropagation(); handleManagerConfirm() }}
                      >
                        Conferma
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* ── NORMAL / ADMIN VIEW ── */}
              {!isManagerView && (
                <>
                  {/* Interested users list — show for own shifts OR admin */}
                  {(isOwn || canAdminAct) && hasInterest && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold text-match uppercase tracking-wide mb-1.5">
                        Interessati
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-black/10 dark:border-white/10 last:border-0">
                              <span className="text-[12px]">{formatDisplayName(i.user, duplicateCognomi)}</span>
                              <span className="text-[10px] text-muted-foreground">{formatRelativeTime(i.created_at!)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* No interest yet — show for own shifts or admin */}
                  {(isOwn || canAdminAct) && !hasInterest && (
                    <p className="text-[12px] text-muted-foreground mb-3">Nessuno interessato ancora</p>
                  )}

                  {/* Also-interested others — show for non-own shifts when NOT admin */}
                  {!isOwn && !canAdminAct && hasInterest && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                        Anche interessati
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {shift.shift_interested_users!
                          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                          .map(i => (
                            <div key={i.user_id} className="flex justify-between items-center py-1 border-b border-black/10 dark:border-white/10 last:border-0">
                              <span className="text-[12px]">{formatDisplayName(i.user, duplicateCognomi)}</span>
                              <span className="text-[10px] text-muted-foreground">{formatRelativeTime(i.created_at!)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Modifica + Elimina — own shifts OR admin on any shift */}
                  {(isOwn || canAdminAct) && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); onEdit?.(shift) }}>
                        <Pencil size={13} className="mr-1" /> Modifica
                      </Button>
                      {/* Bordo visibile (richiesta 17/09/2026): «destructive» è solo
                          tinta di fondo + testo rosso, e senza contorno il pulsante
                          «Elimina» non si distingue dal resto della card espansa. */}
                      {confirmDelete ? (
                        <>
                          <Button variant="destructive" size="sm" className="flex-1 h-8 text-[11px]" onClick={handleDelete}>
                            Conferma
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}>
                            Annulla
                          </Button>
                        </>
                      ) : (
                        <Button variant="destructive" size="sm" className="flex-1 h-8 text-[11px] border-destructive/50" onClick={handleDelete}>
                          <Trash2 size={13} className="mr-1" /> Elimina
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Interest button — non-own shifts (users and admin can both express interest) */}
                  {!isOwn && (
                    <Button
                      className={cn('w-full h-9 text-[12px] font-semibold mt-2', isInterested && 'btn-interest-on')}
                      variant={isInterested ? 'default' : 'outline'}
                      onClick={handleInterestToggle}
                    >
                      {isInterested ? '✓ Sono interessato' : '♡ Sono interessato'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  )
}

function ShiftPill({ type }: { type: ShiftType }) {
  return (
    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', SHIFT_PILL_CLASSES[type])}>
      {type}
    </span>
  )
}
