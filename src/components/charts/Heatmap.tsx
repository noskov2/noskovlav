import { useMemo, useState } from 'react'
import type { Product, TransactionLine } from '@/types/domain'
import type { DateRange } from '@/kpi/dateRanges'
import { computeHourlyHeatmap, HEATMAP_METRIC_LABELS, WEEKDAY_SHORT_LABELS, type HeatmapMetricKey } from '@/kpi/heatmap'
import { formatLei, formatNumber, formatPct } from '@/lib/format'

const METRIC_OPTIONS: HeatmapMetricKey[] = ['totalSales', 'receiptCount', 'avgReceiptValue', 'totalLiters', 'crossSellPct', 'coffeeCount']

function formatCellValue(metric: HeatmapMetricKey, value: number): string {
  if (metric === 'crossSellPct') return formatPct(value)
  if (metric === 'receiptCount' || metric === 'coffeeCount') return formatNumber(value)
  if (metric === 'totalLiters') return `${formatNumber(value, 0)} L`
  return formatLei(value)
}

export function HourlyHeatmap({
  transactions,
  products,
  range,
}: {
  transactions: TransactionLine[]
  products: Product[]
  range: DateRange
}) {
  const [metric, setMetric] = useState<HeatmapMetricKey>('totalSales')
  const grid = useMemo(() => computeHourlyHeatmap(transactions, products, range, metric), [transactions, products, range, metric])
  const max = useMemo(() => Math.max(0, ...grid.flatMap((row) => row.map((c) => c.value))), [grid])

  function cellStyle(value: number, lineCount: number) {
    if (lineCount === 0 || max === 0) return { backgroundColor: '#f8fafc' }
    const intensity = Math.min(1, value / max)
    // brand green ramp: light at low intensity, saturated at high intensity
    const alpha = 0.08 + intensity * 0.82
    return { backgroundColor: `rgba(31, 164, 108, ${alpha.toFixed(3)})` }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Heatmap — Zi × Oră</h3>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as HeatmapMetricKey)}
          className="rounded-md border border-slate-200 px-2 py-1 text-xs"
        >
          {METRIC_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {HEATMAP_METRIC_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="w-16"></th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="w-8 pb-1 text-center font-normal text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, weekday) => (
              <tr key={weekday}>
                <td className="pr-2 text-right font-medium text-slate-600">{WEEKDAY_SHORT_LABELS[weekday]}</td>
                {row.map((cell) => (
                  <td
                    key={cell.hour}
                    className="h-6 w-8 rounded"
                    style={cellStyle(cell.value, cell.lineCount)}
                    title={`${WEEKDAY_SHORT_LABELS[cell.weekday]} ${cell.hour}:00 — ${HEATMAP_METRIC_LABELS[metric]}: ${formatCellValue(metric, cell.value)}`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Culoare mai intensă = valoare mai mare pentru „{HEATMAP_METRIC_LABELS[metric]}". Treci cu mouse-ul peste o celulă pentru
        valoarea exactă.
      </p>
    </div>
  )
}
