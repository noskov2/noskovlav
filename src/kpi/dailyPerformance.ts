import type { Cashier, Product, TransactionLine } from '@/types/domain'
import { computePeriodSummary, type PeriodSummary } from '@/kpi/summary'
import { addDays, weekdayName, type DateRange } from '@/kpi/dateRanges'

export interface DayDetail {
  date: string
  total: PeriodSummary
  byShift: Partial<Record<1 | 2, PeriodSummary>>
  byCashier: { cashier: Cashier; summary: PeriodSummary }[]
}

export function computeDayDetail(
  date: string,
  dayTransactions: TransactionLine[],
  products: Product[],
  cashiers: Cashier[],
): DayDetail {
  const total = computePeriodSummary(dayTransactions, products)

  const byShift: Partial<Record<1 | 2, PeriodSummary>> = {}
  for (const shift of [1, 2] as const) {
    const shiftTx = dayTransactions.filter((t) => t.shift === shift)
    if (shiftTx.length > 0) byShift[shift] = computePeriodSummary(shiftTx, products)
  }

  const cashierIds = new Set(dayTransactions.map((t) => t.cashierId))
  const byCashier = Array.from(cashierIds)
    .map((id) => {
      const cashier = cashiers.find((c) => c.id === id)
      const tx = dayTransactions.filter((t) => t.cashierId === id)
      return cashier ? { cashier, summary: computePeriodSummary(tx, products) } : null
    })
    .filter((x): x is { cashier: Cashier; summary: PeriodSummary } => x !== null)
    .sort((a, b) => b.summary.totalSales - a.summary.totalSales)

  return { date, total, byShift, byCashier }
}

export type ComparisonMetricKey =
  | 'totalSales'
  | 'goodsSales'
  | 'fuelSales'
  | 'receiptCount'
  | 'avgReceiptValue'
  | 'coffeeCount'
  | 'sandwichCount'
  | 'crossSellPct'
  | 'grossProfitEstimate'
  | 'promoValue'
  | 'totalLiters'

export const COMPARISON_METRIC_LABELS: Record<ComparisonMetricKey, string> = {
  totalSales: 'Vânzări totale',
  goodsSales: 'Vânzări marfă',
  fuelSales: 'Vânzări carburant',
  receiptCount: 'Bonuri',
  avgReceiptValue: 'Bon mediu',
  coffeeCount: 'Cafele',
  sandwichCount: 'Sandwich-uri',
  crossSellPct: 'Cross-sell %',
  grossProfitEstimate: 'Profit brut estimat',
  promoValue: 'Promoții (valoare)',
  totalLiters: 'Litri',
}

export interface ComparisonPoint {
  label: string
  value: number
  diffAbs: number
  diffPct: number | null
}

export interface DayComparisons {
  date: string
  value: number
  vsPeriodAvg: ComparisonPoint
  vsWeekdayAvg: ComparisonPoint
  vsLast30Avg: ComparisonPoint
  vsMonthAvg: ComparisonPoint
  vsLast4SimilarAvg: ComparisonPoint
}

function averageMetric(
  dates: string[],
  transactionsByDate: Map<string, TransactionLine[]>,
  products: Product[],
  metric: ComparisonMetricKey,
): number {
  if (dates.length === 0) return 0
  const values = dates.map((d) => {
    const summary = computePeriodSummary(transactionsByDate.get(d) ?? [], products)
    return summary[metric]
  })
  return values.reduce((a, b) => a + b, 0) / values.length
}

function groupByDate(transactions: TransactionLine[]): Map<string, TransactionLine[]> {
  const map = new Map<string, TransactionLine[]>()
  for (const t of transactions) {
    const arr = map.get(t.date)
    if (arr) arr.push(t)
    else map.set(t.date, [t])
  }
  return map
}

function makePoint(label: string, dayValue: number, avgValue: number): ComparisonPoint {
  return {
    label,
    value: avgValue,
    diffAbs: dayValue - avgValue,
    diffPct: avgValue !== 0 ? ((dayValue - avgValue) / avgValue) * 100 : null,
  }
}

/**
 * Compares the selected day against: the average of every day in the
 * currently-selected filter period, the average of that same weekday
 * within the period, the trailing-30-day average, and the average of the
 * calendar month the day belongs to (the latter two computed from full
 * history, independent of the active period filter).
 */
export function computeDayComparisons(
  date: string,
  metric: ComparisonMetricKey,
  periodRange: DateRange,
  allTransactions: TransactionLine[],
  products: Product[],
): DayComparisons {
  const byDate = groupByDate(allTransactions)
  const dayValue = computePeriodSummary(byDate.get(date) ?? [], products)[metric]

  const periodDates: string[] = []
  for (let d = periodRange.start; d <= periodRange.end; d = addDays(d, 1)) {
    periodDates.push(d)
    if (periodDates.length > 3660) break
  }
  const periodAvg = averageMetric(periodDates, byDate, products, metric)

  const weekday = weekdayName(date)
  const weekdayDates = periodDates.filter((d) => weekdayName(d) === weekday)
  const weekdayAvg = averageMetric(weekdayDates, byDate, products, metric)

  const last30Dates: string[] = []
  for (let i = 0; i < 30; i++) last30Dates.push(addDays(date, -i))
  const last30Avg = averageMetric(last30Dates, byDate, products, metric)

  const monthPrefix = date.slice(0, 7)
  const monthDates = Array.from(byDate.keys()).filter((d) => d.startsWith(monthPrefix))
  const monthAvg = averageMetric(monthDates, byDate, products, metric)

  // Last 4 occurrences of the same weekday before the selected date (7, 14,
  // 21, 28 days back) — a recency-focused reading distinct from
  // vsWeekdayAvg, which averages every matching weekday across the whole
  // selected filter period regardless of how far back it goes.
  const last4SimilarDates = [7, 14, 21, 28].map((n) => addDays(date, -n))
  const last4SimilarAvg = averageMetric(last4SimilarDates, byDate, products, metric)

  return {
    date,
    value: dayValue,
    vsPeriodAvg: makePoint('Media perioadei selectate', dayValue, periodAvg),
    vsWeekdayAvg: makePoint(`Media zilelor de ${weekday}`, dayValue, weekdayAvg),
    vsLast30Avg: makePoint('Media ultimelor 30 zile', dayValue, last30Avg),
    vsMonthAvg: makePoint('Media lunii', dayValue, monthAvg),
    vsLast4SimilarAvg: makePoint('Ultimele 4 zile similare', dayValue, last4SimilarAvg),
  }
}
