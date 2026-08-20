import clsx from 'clsx'
import type { Delta } from '@/kpi/monthComparison'

// Compact "vs. luna anterioară" badge, reused anywhere a current-vs-previous
// comparison needs to show up next to a number (KPI cards use their own
// `trend` prop instead — this is for table cells and summary strips).
export function DeltaBadge({ delta, decimals = 1 }: { delta: Delta; decimals?: number }) {
  if (delta.pct == null) {
    return <span className="text-[11px] text-slate-400">— (n/a luna trecută)</span>
  }
  const up = delta.pct > 0
  const flat = delta.pct === 0
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
        flat ? 'bg-slate-100 text-slate-500' : up ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad',
      )}
    >
      {flat ? '—' : up ? '▲' : '▼'} {Math.abs(delta.pct).toFixed(decimals)}%
    </span>
  )
}
