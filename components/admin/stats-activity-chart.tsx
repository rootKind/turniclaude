'use client'
import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import type { StatsActivityPoint } from '@/app/api/admin/stats/route'
import { ViaUscita } from '@/components/ui/via-uscita'
import { cn } from '@/lib/utils'

type Mode = 'access' | 'new_shift'

const MODE_LABEL: Record<Mode, string> = { access: 'Accessi', new_shift: 'Turni' }

/**
 * `onAmpliaPeriodo` (M12, 23/09/2026) è la VIA D'USCITA dello stato vuoto, e
 * arriva da fuori perché il grafico non sa nulla del periodo: il selettore 30g /
 * 90g / 1 anno / Tutto sta nella pagina, ed è quello che risponde alla domanda
 * «e adesso?» — che è sempre la stessa: allarga la finestra. Facoltativa, perché
 * il grafico non deve pretendere di conoscere la pagina che lo ospita.
 */
export function StatsActivityChart({
  data,
  onAmpliaPeriodo,
  periodoMassimo = false,
}: {
  data: StatsActivityPoint[]
  onAmpliaPeriodo?: () => void
  periodoMassimo?: boolean
}) {
  const [mode, setMode] = useState<Mode>('access')
  const max = useMemo(() => Math.max(1, ...data.map(d => d[mode])), [data, mode])

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-6">
        <p className="text-sm text-muted-foreground text-center">Nessun dato nel periodo selezionato.</p>
        {/* «Tutto» è il periodo più largo che esiste: lì il comando non si offre,
            perché non ci sarebbe nulla da allargare e sarebbe un pulsante che
            promette e non mantiene. */}
        {onAmpliaPeriodo && !periodoMassimo && (
          <ViaUscita onClick={onAmpliaPeriodo}>Guarda tutto lo storico</ViaUscita>
        )}
      </div>
    )
  }

  const W = 600
  const H = 140
  const PAD = 8
  const bw = (W - PAD * 2) / data.length
  const labelEvery = Math.max(1, Math.ceil(data.length / 8))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-muted-foreground tabular-nums">max {max.toLocaleString('it-IT')}</p>
        <div className="flex gap-1">
          {(['access', 'new_shift'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                mode === m
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted text-muted-foreground border-border hover:text-foreground'
              )}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${MODE_LABEL[mode]} per settimana`}>
        {data.map((d, i) => {
          const v = d[mode]
          const bh = Math.max(2, Math.round((v / max) * (H - 34)))
          const x = PAD + i * bw
          return (
            <rect
              key={d.week}
              x={x}
              y={H - 14 - bh}
              width={Math.max(2, bw - 2)}
              height={bh}
              rx={2}
              className="fill-foreground opacity-90 hover:opacity-100 transition-opacity"
            >
              <title>{`${format(parseISO(d.week), 'dd/MM/yyyy')}: ${v.toLocaleString('it-IT')}`}</title>
            </rect>
          )
        })}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`lbl-${d.week}`}
              x={PAD + i * bw + bw / 2}
              y={H - 2}
              textAnchor="middle"
              fontSize={8.5}
              className="fill-muted-foreground"
            >
              {format(parseISO(d.week), 'dd/MM')}
            </text>
          ) : null
        )}
      </svg>
    </div>
  )
}
