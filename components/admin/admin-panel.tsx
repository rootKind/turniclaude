'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart2, Bell, Users, MessageSquare, ChevronRight, Eye, ChevronLeft, Palette, FlaskConical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { getAppSettings, updateAppSettings } from '@/lib/queries/app-settings'
import { NotificationDialog } from './notification-dialog'
import { NotificationTestDialog } from './notification-test-dialog'
import { FeedbackList } from './feedback-list'
import { UserManagementDialog } from './user-management-dialog'
import { ImpersonateDialog } from './impersonate-dialog'

export function AdminPanel() {
  const router = useRouter()
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTestOpen, setNotifTestOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackUnread, setFeedbackUnread] = useState(0)
  const [userCount, setUserCount] = useState(0)
  const [impersonateOpen, setImpersonateOpen] = useState(false)
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
      <h1 className="text-lg font-bold">Pannello Admin</h1>

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

      {/* Action tiles */}
      <div className="space-y-2">
        <ActionTile
          icon={<Bell size={18} />}
          title="Notifiche"
          description="Invia una notifica push a tutti gli utenti"
          onClick={() => setNotifOpen(true)}
        />
        <ActionTile
          icon={<Users size={18} />}
          title="Gestione utenti"
          description="Crea, modifica o elimina account"
          onClick={() => setUsersOpen(true)}
        />
        <ActionTile
          icon={<Eye size={18} />}
          title="Visualizza come utente"
          description="Accedi alla dashboard dal punto di vista di un collega"
          onClick={() => setImpersonateOpen(true)}
        />
        <ActionTile
          icon={<BarChart2 size={18} />}
          title="Statistiche"
          description="Accessi, turni pubblicati, interessi per utente"
          onClick={() => router.push('/admin/statistiche')}
        />
        <ActionTile
          icon={<MessageSquare size={18} />}
          title="Feedback"
          description="Leggi le segnalazioni degli utenti"
          badge={feedbackUnread}
          onClick={() => { setFeedbackOpen(true); setFeedbackUnread(0) }}
        />
        <ActionTile
          icon={<Palette size={18} />}
          title="Colori app"
          description="Personalizza tutti i colori dell'interfaccia"
          onClick={() => router.push('/admin/colori')}
        />
        <ActionTile
          icon={<FlaskConical size={18} />}
          title="Test notifiche"
          description="Invia notifiche di prova a un dipendente specifico"
          onClick={() => setNotifTestOpen(true)}
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
      <NotificationTestDialog open={notifTestOpen} onClose={() => setNotifTestOpen(false)} />
      <UserManagementDialog open={usersOpen} onClose={() => setUsersOpen(false)} />
      <FeedbackList open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <ImpersonateDialog open={impersonateOpen} onClose={() => setImpersonateOpen(false)} />
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

function ActionTile({ icon, title, description, badge, onClick }: {
  icon: React.ReactNode
  title: string
  description: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border bg-card hover:bg-accent transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="flex-shrink-0 min-w-[20px] h-5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
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
