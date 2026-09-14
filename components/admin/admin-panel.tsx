'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart2, Bell, Users, MessageSquare, ChevronRight, Eye, EyeOff, ChevronLeft, FlaskConical, Megaphone, LayoutGrid, ArrowLeftRight, Eraser, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { NotificationBadge } from '@/components/ui/notification-badge'
import { getAppSettings, updateAppSettings } from '@/lib/queries/app-settings'
import { NotificationDialog } from './notification-dialog'
import { NotificationDebugDialog } from './notification-debug-dialog'
import { FeedbackList } from './feedback-list'
import { UserManagementDialog } from './user-management-dialog'
import { ImpersonateDialog } from './impersonate-dialog'
import { ChangelogManagerDialog } from './changelog-manager-dialog'
import { SquadreDialog } from './squadre-dialog'
import { ShiftDialog } from './shift-dialog'
import { ShiftCleanupDialog } from './shift-cleanup-dialog'
import { CompareVisibilityDialog } from './compare-visibility-dialog'

export function AdminPanel() {
  const router = useRouter()
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTestOpen, setNotifTestOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackUnread, setFeedbackUnread] = useState(0)
  const [userCount, setUserCount] = useState(0)
  const [impersonateOpen, setImpersonateOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [squadreOpen, setSquadreOpen] = useState(false)
  const [shiftOpen, setShiftOpen] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [compareVisOpen, setCompareVisOpen] = useState(false)
  const [minYearTurniferie, setMinYearTurniferie] = useState(2026)
  const [minYearVacanze, setMinYearVacanze] = useState(2026)
  const [savingYears, setSavingYears] = useState(false)
  const [limitEnabled, setLimitEnabled] = useState(false)
  const [maxSwapDays, setMaxSwapDays] = useState(90)
  const [hideShiftsBeyond, setHideShiftsBeyond] = useState(false)
  const [savingLimit, setSavingLimit] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('feedback')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
      .then(({ count }) => setFeedbackUnread(count ?? 0))
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(({ users }: { users: { id: string; nome: string | null; cognome: string | null; is_secondary: boolean }[] }) => setUserCount(users?.length ?? 0))
      .catch(() => setUserCount(0))
    getAppSettings(supabase).then(s => {
      setMinYearTurniferie(s.min_year_turniferie)
      setMinYearVacanze(s.min_year_vacanze)
      setLimitEnabled(s.shift_swap_limit_enabled)
      setMaxSwapDays(s.max_shift_swap_days)
      setHideShiftsBeyond(s.hide_shifts_beyond_limit)
    }).catch(() => {})
  }, [])

  async function saveYear(field: 'min_year_turniferie' | 'min_year_vacanze', value: number) {
    setSavingYears(true)
    try {
      const supabase = createClient()
      await updateAppSettings(supabase, { [field]: value })
    } finally {
      setSavingYears(false)
    }
  }

  async function saveLimit(patch: { shift_swap_limit_enabled?: boolean; max_shift_swap_days?: number; hide_shifts_beyond_limit?: boolean }) {
    setSavingLimit(true)
    try {
      const supabase = createClient()
      await updateAppSettings(supabase, patch)
    } finally {
      setSavingLimit(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      {/* Torna indietro (utile da PC/preview, dove manca la barra di navigazione) */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.back()}
          aria-label="Torna indietro"
          title="Torna indietro"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={20} />
        </button>
        <h1 className="flex-1 text-lg font-bold">Pannello Admin</h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <button
          className="text-left w-full"
          onClick={() => setUsersOpen(true)}
        >
          <StatCard label="Utenti registrati" value={userCount} clickable />
        </button>
        <StatCard label="Feedback non letti" value={feedbackUnread} highlight={feedbackUnread > 0} />
      </div>

      {/* Azioni — griglia compatta di pulsanti (la descrizione esce in tooltip) */}
      <div className="grid grid-cols-3 gap-2">
        <PanelButton
          icon={<Bell size={15} />}
          label="Invia Notifiche"
          description="Invia una notifica push a tutti gli utenti"
          onClick={() => setNotifOpen(true)}
        />
        <PanelButton
          icon={<Users size={15} />}
          label="Utenti"
          description="Crea, modifica o elimina account"
          onClick={() => setUsersOpen(true)}
        />
        <PanelButton
          icon={<LayoutGrid size={15} />}
          label="Squadre"
          description="Tipologie, squadre e membri con i turni teorici"
          onClick={() => setSquadreOpen(true)}
        />
        <PanelButton
          icon={<EyeOff size={15} />}
          label="Confronta"
          description="Scegli chi compare nel selettore di confronto di «Il tuo turno»"
          onClick={() => setCompareVisOpen(true)}
        />
        <PanelButton
          icon={<ArrowLeftRight size={15} />}
          label="Shift teorici"
          description="Sposta di ±1 giorno tutti i turni da una data (es. anni bisestili)"
          onClick={() => setShiftOpen(true)}
        />
        <PanelButton
          icon={<Eraser size={15} />}
          label="Pulizia cambi"
          description="Elimina le richieste di cambio già esaudite dai turni caricati"
          onClick={() => setCleanupOpen(true)}
        />
        <PanelButton
          icon={<Eye size={15} />}
          label="Vedi come"
          description="Accedi alla dashboard dal punto di vista di un collega"
          onClick={() => setImpersonateOpen(true)}
        />
        <PanelButton
          icon={<BarChart2 size={15} />}
          label="Statistiche"
          description="Accessi, turni pubblicati, interessi per utente"
          onClick={() => router.push('/admin/statistiche')}
        />
        <PanelButton
          icon={<MessageSquare size={15} />}
          label="Feedback"
          description="Leggi le segnalazioni degli utenti"
          badge={feedbackUnread}
          onClick={() => setFeedbackOpen(true)}
        />
        <PanelButton
          icon={<FlaskConical size={15} />}
          label="Debug notifiche"
          description="Messaggi push dell'app, variabili, invii di prova e dispositivi"
          onClick={() => setNotifTestOpen(true)}
        />
        <PanelButton
          icon={<Megaphone size={15} />}
          label="Changelog"
          description="Gestisci le novità, lancia una nuova versione, vedi chi le ha lette"
          onClick={() => setChangelogOpen(true)}
        />
      </div>

      {/* Anno minimo ferie */}
      <div className="rounded-xl border bg-card px-4 py-3 space-y-3">
        <p className="text-sm font-semibold">Anno minimo visibile</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Turni Ferie</span>
          <YearStepper
            value={minYearTurniferie}
            disabled={savingYears}
            onChange={v => { setMinYearTurniferie(v); saveYear('min_year_turniferie', v) }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Cambi Ferie</span>
          <YearStepper
            value={minYearVacanze}
            disabled={savingYears}
            onChange={v => { setMinYearVacanze(v); saveYear('min_year_vacanze', v) }}
          />
        </div>
      </div>

      {/* Limite giorni cambio turno */}
      <div className="rounded-xl border bg-card px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Limite cambio turno</p>
          <Toggle
            enabled={limitEnabled}
            disabled={savingLimit}
            onChange={v => {
              setLimitEnabled(v)
              saveLimit({ shift_swap_limit_enabled: v })
            }}
          />
        </div>
        {limitEnabled && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Giorni massimi in avanti</span>
              <DaysInput
                value={maxSwapDays}
                disabled={savingLimit}
                onChange={v => { setMaxSwapDays(v); saveLimit({ max_shift_swap_days: v }) }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Nascondi turni oltre limite</span>
              <Toggle
                enabled={hideShiftsBeyond}
                disabled={savingLimit}
                onChange={v => {
                  setHideShiftsBeyond(v)
                  saveLimit({ hide_shifts_beyond_limit: v })
                }}
              />
            </div>
          </>
        )}
      </div>

      <NotificationDialog open={notifOpen} onClose={() => setNotifOpen(false)} />
      <NotificationDebugDialog open={notifTestOpen} onClose={() => setNotifTestOpen(false)} />
      <UserManagementDialog open={usersOpen} onClose={() => setUsersOpen(false)} />
      <FeedbackList open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <ImpersonateDialog open={impersonateOpen} onClose={() => setImpersonateOpen(false)} />
      <ChangelogManagerDialog open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <SquadreDialog open={squadreOpen} onClose={() => setSquadreOpen(false)} />
      <ShiftDialog open={shiftOpen} onClose={() => setShiftOpen(false)} />
      <ShiftCleanupDialog open={cleanupOpen} onClose={() => setCleanupOpen(false)} />
      <CompareVisibilityDialog open={compareVisOpen} onClose={() => setCompareVisOpen(false)} />
    </div>
  )
}

function StatCard({ label, value, highlight = false, clickable = false }: {
  label: string; value: number; highlight?: boolean; clickable?: boolean
}) {
  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 space-y-1 transition-colors',
      highlight ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40',
      clickable && 'hover:bg-accent/60 cursor-pointer'
    )}>
      <p className={cn('text-2xl font-bold', highlight && 'text-destructive')}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/** Pulsante compatto del pannello: la descrizione compare come tooltip. */
function PanelButton({ icon, label, description, badge, onClick }: {
  icon: React.ReactNode
  label: string
  description: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={description}
      aria-label={`${label} — ${description}`}
      className="relative flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-1.5 py-3 text-center hover:bg-accent active:translate-y-px transition-colors"
    >
      <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
        {icon}
      </span>
      <span className="text-[11px] font-medium leading-tight">{label}</span>
      {badge !== undefined && badge > 0 && (
        /* Fondo opaco «taglio» (superficie = card) + badge: niente icona che traspare. */
        <NotificationBadge count={badge} surface="card" className="absolute top-1 right-1 min-w-[17px] h-[17px]" />
      )}
    </button>
  )
}

function YearStepper({ value, disabled, onChange }: {
  value: number
  disabled: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 2020}
        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-semibold tabular-nums w-12 text-center">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= 2099}
        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

function Toggle({ enabled, disabled, onChange }: {
  enabled: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        'focus:outline-none disabled:opacity-40',
        enabled ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200',
          enabled ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
}

function DaysInput({ value, disabled, onChange }: {
  value: number
  disabled: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={disabled || value <= 1}
        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <input
        type="number"
        min={1}
        max={365}
        value={value}
        disabled={disabled}
        onChange={e => {
          const n = Math.max(1, Math.min(365, parseInt(e.target.value) || 1))
          onChange(n)
        }}
        onBlur={e => {
          const n = Math.max(1, Math.min(365, parseInt(e.target.value) || 1))
          onChange(n)
        }}
        className="w-14 text-center text-sm font-semibold tabular-nums bg-transparent border rounded-lg px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
      />
      <button
        onClick={() => onChange(Math.min(365, value + 1))}
        disabled={disabled || value >= 365}
        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
