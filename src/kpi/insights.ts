import type { Product, SupplierReceiptLine, TransactionLine } from '@/types/domain'
import type { DateRange } from '@/kpi/dateRanges'
import { addDays, dayCountInRange } from '@/kpi/dateRanges'
import { filterByRange } from '@/kpi/applyFilters'
import { computePeriodSummary } from '@/kpi/summary'
import { computeSlowMovers, noSaleSinceDays } from '@/kpi/slowMovers'
import { computeProductPriceSummaries } from '@/kpi/suppliers'
import { computeCrossSellReport } from '@/kpi/crossSell'
import { SANDWICH_VARIANT_LABELS } from '@/kpi/namedVariants'

export interface Insight {
  text: string
  tone: 'good' | 'warn' | 'bad' | 'neutral'
}

function previousRange(range: DateRange): DateRange {
  const len = dayCountInRange(range)
  return { start: addDays(range.start, -len), end: addDays(range.start, -1) }
}

export function computeInsights(
  range: DateRange,
  allTransactions: TransactionLine[],
  products: Product[],
  cashiers: Parameters<typeof computeCrossSellReport>[2],
  supplierReceipts: SupplierReceiptLine[],
): Insight[] {
  const insights: Insight[] = []
  const current = filterByRange(allTransactions, range.start, range.end)
  const prevRange = previousRange(range)
  const previous = filterByRange(allTransactions, prevRange.start, prevRange.end)

  const currentSummary = computePeriodSummary(current, products)
  const previousSummary = computePeriodSummary(previous, products)

  if (previousSummary.totalSales > 0) {
    const diffPct = ((currentSummary.totalSales - previousSummary.totalSales) / previousSummary.totalSales) * 100
    if (Math.abs(diffPct) >= 1) {
      insights.push({
        text: `Vânzările sunt cu ${Math.abs(diffPct).toFixed(1)}% ${diffPct >= 0 ? 'peste' : 'sub'} perioada anterioară echivalentă.`,
        tone: diffPct >= 0 ? 'good' : 'bad',
      })
    }
  }

  const currentCrossSell = computeCrossSellReport(current, products, cashiers).stationTotal.crossSellPct
  const previousCrossSell = computeCrossSellReport(previous, products, cashiers).stationTotal.crossSellPct
  if (previousCrossSell > 0 && current.length > 0 && previous.length > 0) {
    const diff = currentCrossSell - previousCrossSell
    if (Math.abs(diff) >= 0.5) {
      insights.push({
        text: `Cross-sell-ul a ${diff >= 0 ? 'crescut' : 'scăzut'} de la ${previousCrossSell.toFixed(1)}% la ${currentCrossSell.toFixed(1)}%.`,
        tone: diff >= 0 ? 'good' : 'warn',
      })
    }
  }

  const sandwich = computeCrossSellReport(current, products, cashiers).stationTotal.sandwich
  const sandwichEntries: [keyof typeof SANDWICH_VARIANT_LABELS, number][] = [
    ['prosciuttoCotto', sandwich.prosciuttoCotto],
    ['prosciuttoCrudo', sandwich.prosciuttoCrudo],
    ['mozzarellaPesto', sandwich.mozzarellaPesto],
    ['kebab', sandwich.kebab],
    ['toast', sandwich.toast],
  ]
  const topSandwich = sandwichEntries.sort((a, b) => b[1] - a[1])[0]
  if (topSandwich && topSandwich[1] > 0) {
    insights.push({
      text: `Sandwich ${SANDWICH_VARIANT_LABELS[topSandwich[0]]} este cel mai vândut sandwich în perioada selectată (${topSandwich[1]} buc).`,
      tone: 'neutral',
    })
  }

  const last30Range: DateRange = { start: addDays(range.end, -29), end: range.end }
  const slowRows = computeSlowMovers(allTransactions, products, last30Range, supplierReceipts)
  const noSale = noSaleSinceDays(slowRows, range.end, 30)
  if (noSale.length > 0) {
    insights.push({
      text: `${noSale.length} produse nu au avut nicio vânzare în ultimele 30 zile.`,
      tone: 'warn',
    })
  }

  const recentPurchases = supplierReceipts.filter((r) => r.date >= addDays(range.end, -60))
  const priceSummaries = computeProductPriceSummaries(recentPurchases, products)
  const hikes = priceSummaries.filter((s) => (s.diffPct ?? 0) > 5)
  if (hikes.length > 0) {
    insights.push({
      text: `${hikes.length} produse au avut creșteri ale costului de achiziție mai mari de 5% în ultimele 60 zile.`,
      tone: 'bad',
    })
  }

  return insights
}
