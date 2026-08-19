import type { Product, TransactionLine } from '@/types/domain'
import type { DateRange } from '@/kpi/dateRanges'
import { addDays } from '@/kpi/dateRanges'
import { computePeriodSummary, type PeriodSummary } from '@/kpi/summary'

export interface DailyPoint {
  date: string
  summary: PeriodSummary
}

export function computeDailySeries(
  transactions: TransactionLine[],
  products: Product[],
  range: DateRange,
): DailyPoint[] {
  const byDate = new Map<string, TransactionLine[]>()
  for (const t of transactions) {
    const arr = byDate.get(t.date)
    if (arr) arr.push(t)
    else byDate.set(t.date, [t])
  }

  const points: DailyPoint[] = []
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    points.push({ date: d, summary: computePeriodSummary(byDate.get(d) ?? [], products) })
    if (points.length > 3660) break
  }
  return points
}
