import { formatPercent } from '../lib/ro-format'

interface Props {
  label: string
  value: string
  growth?: number | null
}

export function KpiCard({ label, value, growth }: Props) {
  const growthColor =
    growth === undefined || growth === null
      ? ''
      : growth > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : growth < 0
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-slate-400'

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      {growth !== undefined && growth !== null && (
        <div className={`text-xs mt-1 ${growthColor}`}>{formatPercent(growth)} față de perioada de comparație</div>
      )}
    </div>
  )
}
