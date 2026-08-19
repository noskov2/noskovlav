import type { ReactNode } from 'react'
import clsx from 'clsx'

interface KpiCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  trend?: { value: number; label?: string } | null
  tone?: 'default' | 'good' | 'warn' | 'bad'
  icon?: ReactNode
}

const toneClasses: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'text-slate-900',
  good: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
}

export function KpiCard({ label, value, hint, trend, tone = 'default', icon }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <p className={clsx('mt-1.5 text-2xl font-semibold tabular-nums', toneClasses[tone])}>{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend != null && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium',
              trend.value > 0
                ? 'bg-good/10 text-good'
                : trend.value < 0
                  ? 'bg-bad/10 text-bad'
                  : 'bg-slate-100 text-slate-500',
            )}
          >
            {trend.value > 0 ? '▲' : trend.value < 0 ? '▼' : '—'} {Math.abs(trend.value).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-slate-400">{hint}</span>}
      </div>
    </div>
  )
}
