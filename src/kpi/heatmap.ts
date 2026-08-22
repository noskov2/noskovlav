import type { Product, TransactionLine } from '@/types/domain'
import type { DateRange } from '@/kpi/dateRanges'
import { computePeriodSummary } from '@/kpi/summary'

export type HeatmapMetricKey = 'totalSales' | 'receiptCount' | 'avgReceiptValue' | 'totalLiters' | 'crossSellPct' | 'coffeeCount'

export const HEATMAP_METRIC_LABELS: Record<HeatmapMetricKey, string> = {
  totalSales: 'Vânzări',
  receiptCount: 'Bonuri',
  avgReceiptValue: 'Bon mediu',
  totalLiters: 'Litri',
  crossSellPct: 'Cross-sell %',
  coffeeCount: 'Cafele',
}

export const WEEKDAY_SHORT_LABELS = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică']

// JS getDay() is 0=Sunday..6=Saturday; the grid reads Monday-first, so this
// maps a JS weekday index to a 0=Monday..6=Sunday row index.
function mondayFirstIndex(jsDay: number): number {
  return (jsDay + 6) % 7
}

export interface HeatmapCell {
  weekday: number // 0=Luni .. 6=Duminică
  hour: number // 0-23
  value: number
  lineCount: number
}

/**
 * Aggregates transactions in `range` into a 7x24 (weekday x hour) grid for
 * the given metric. Each cell's value is computed with computePeriodSummary
 * over exactly the lines that fall in that weekday+hour bucket, so
 * receipt-based metrics (bon mediu, cross-sell %) stay internally
 * consistent with the rest of the app instead of being hand-rolled here —
 * the caveat is a receipt whose lines happen to straddle an hour boundary
 * gets split across two cells, same simplification already accepted
 * elsewhere (e.g. the daily view groups by calendar day, not by receipt
 * timestamp span).
 */
export function computeHourlyHeatmap(
  transactions: TransactionLine[],
  products: Product[],
  range: DateRange,
  metric: HeatmapMetricKey,
): HeatmapCell[][] {
  const inRange = transactions.filter((t) => t.date >= range.start && t.date <= range.end)

  const buckets: TransactionLine[][][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []))
  for (const t of inRange) {
    const jsDay = new Date(`${t.date}T00:00:00`).getDay()
    const weekday = mondayFirstIndex(jsDay)
    const hour = Math.min(23, Math.max(0, parseInt(t.time.slice(0, 2), 10) || 0))
    buckets[weekday][hour].push(t)
  }

  return buckets.map((row, weekday) =>
    row.map((lines, hour) => {
      const summary = computePeriodSummary(lines, products)
      return { weekday, hour, value: summary[metric], lineCount: lines.length }
    }),
  )
}
