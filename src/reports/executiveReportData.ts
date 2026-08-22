import type { Product, SupplierReceiptLine, TargetSet, TransactionLine } from '@/types/domain'
import type { DateRange } from '@/kpi/dateRanges'
import { addDays, monthLabel } from '@/kpi/dateRanges'
import { computePeriodSummary, type PeriodSummary } from '@/kpi/summary'
import { computeProductProfitability, type ProductProfitRow } from '@/kpi/profitability'
import { computeMarginMatrix } from '@/kpi/marginMatrix'
import { computeStockRotation } from '@/kpi/stockRotation'
import { computeProductPriceSummaries } from '@/kpi/suppliers'
import { previousMonthRange, previousYearRange, computeDelta, type Delta } from '@/kpi/monthComparison'
import { defaultStockThresholds } from '@/types/domain'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export interface ProductMoveRow {
  name: string
  category: string
  currentValue: number
  previousValue: number
  deltaAbs: number
  deltaPct: number | null
}

export interface ExecutiveReportData {
  year: number
  month: number
  monthLabelText: string
  range: DateRange

  summary: PeriodSummary
  target: TargetSet | null

  prevMonthLabel: string
  vsPrevMonth: {
    totalSales: Delta
    grossProfit: Delta
    crossSellPct: Delta
    avgReceiptValue: Delta
  } | null

  prevYearLabel: string
  vsPrevYear: {
    totalSales: Delta
    grossProfit: Delta
  } | null

  topGrowth: ProductMoveRow[]
  topDecline: ProductMoveRow[]

  problems: string[]
  opportunities: string[]
  recommendations: string[]
}

const STOCK_RISK_WINDOW_DAYS = 30
const PRICE_HIKE_WINDOW_DAYS = 60
const PRICE_HIKE_PCT_THRESHOLD = 5
const TOP_MOVERS_COUNT = 5

function productMoveRows(current: ProductProfitRow[], previous: ProductProfitRow[]): ProductMoveRow[] {
  const prevById = new Map(previous.map((r) => [r.product.id, r]))
  return current.map((r) => {
    const prev = prevById.get(r.product.id)
    const previousValue = prev?.salesValue ?? 0
    const delta = computeDelta(r.salesValue, previousValue)
    return {
      name: r.product.name,
      category: r.product.category,
      currentValue: r.salesValue,
      previousValue,
      deltaAbs: delta.abs,
      deltaPct: delta.pct,
    }
  })
}

/**
 * Synthesizes an "Executive Monthly Report" from data already computed
 * elsewhere in the app (period summary, product profitability, stock risk,
 * supplier price hikes) instead of re-deriving anything. Problems /
 * opportunities / recommendations are template sentences directly tied to
 * a computed number — never a fabricated causal story ("sales dropped
 * because..."), per the standing "never invent" rule for this app.
 */
export function computeExecutiveReportData(
  year: number,
  month: number,
  allTransactions: TransactionLine[],
  products: Product[],
  supplierReceipts: SupplierReceiptLine[],
  stationTarget: TargetSet | null,
  defaultVatRatePct: number,
): ExecutiveReportData {
  const monthKey = `${year}-${pad(month)}`
  const range: DateRange = { start: `${monthKey}-01`, end: `${monthKey}-${pad(daysInMonth(year, month))}` }
  const monthTx = allTransactions.filter((t) => t.date >= range.start && t.date <= range.end)
  const summary = computePeriodSummary(monthTx, products, defaultVatRatePct)

  const prevRange = previousMonthRange(range)
  const prevTx = allTransactions.filter((t) => t.date >= prevRange.start && t.date <= prevRange.end)
  const prevSummary = prevTx.length > 0 ? computePeriodSummary(prevTx, products, defaultVatRatePct) : null

  const yearAgoRange = previousYearRange(range)
  const yearAgoTx = allTransactions.filter((t) => t.date >= yearAgoRange.start && t.date <= yearAgoRange.end)
  const yearAgoSummary = yearAgoTx.length > 0 ? computePeriodSummary(yearAgoTx, products, defaultVatRatePct) : null

  const productRows = computeProductProfitability(monthTx, products, supplierReceipts, defaultVatRatePct)
  const prevProductRows = prevTx.length > 0 ? computeProductProfitability(prevTx, products, supplierReceipts, defaultVatRatePct) : []

  const moves = productMoveRows(productRows, prevProductRows).filter((m) => m.previousValue > 0 || m.currentValue > 0)
  const topGrowth = [...moves].sort((a, b) => b.deltaAbs - a.deltaAbs).slice(0, TOP_MOVERS_COUNT).filter((m) => m.deltaAbs > 0)
  const topDecline = [...moves].sort((a, b) => a.deltaAbs - b.deltaAbs).slice(0, TOP_MOVERS_COUNT).filter((m) => m.deltaAbs < 0)

  const stockWindow: DateRange = { start: addDays(range.end, -(STOCK_RISK_WINDOW_DAYS - 1)), end: range.end }
  const stockRows = computeStockRotation(allTransactions, products, stockWindow, () => defaultStockThresholds)
  const ruptureCount = stockRows.filter((r) => r.riskClass === 'risc-ruptura').length

  const hikeWindow: DateRange = { start: addDays(range.end, -PRICE_HIKE_WINDOW_DAYS), end: range.end }
  const recentReceipts = supplierReceipts.filter((r) => r.date >= hikeWindow.start && r.date <= hikeWindow.end)
  const priceHikes = computeProductPriceSummaries(recentReceipts, products).filter((s) => (s.diffPct ?? 0) > PRICE_HIKE_PCT_THRESHOLD)

  const marginMatrix = computeMarginMatrix(productRows)
  const hiddenGemCount = marginMatrix.rows.filter((r) => r.quadrant === 'hidden-gem').length

  const problems: string[] = []
  const opportunities: string[] = []
  const recommendations: string[] = []

  if (stationTarget?.totalSales != null && summary.totalSales < stationTarget.totalSales) {
    const gap = stationTarget.totalSales - summary.totalSales
    problems.push(`Vânzările lunii (${fmt(summary.totalSales)} lei) sunt sub targetul de ${fmt(stationTarget.totalSales)} lei — diferență de ${fmt(gap)} lei.`)
    recommendations.push('Verifică pagina Target → Forecast & Ritm pentru a vedea ce ritm zilnic mai e necesar.')
  }
  if (stationTarget?.crossSellPct != null && summary.crossSellPct < stationTarget.crossSellPct) {
    problems.push(`Cross-sell (${summary.crossSellPct.toFixed(1)}%) este sub targetul de ${stationTarget.crossSellPct.toFixed(1)}%.`)
    recommendations.push('Analizează Cross-sell → Score Casieri pentru a vedea care casieri/echipe sunt sub medie.')
  } else if (stationTarget?.crossSellPct != null && summary.crossSellPct >= stationTarget.crossSellPct) {
    opportunities.push(`Cross-sell (${summary.crossSellPct.toFixed(1)}%) este peste targetul de ${stationTarget.crossSellPct.toFixed(1)}%.`)
  }
  if (summary.grossProfitKnownShare < 0.95) {
    problems.push(`Doar ${(summary.grossProfitKnownShare * 100).toFixed(0)}% din vânzări au cost de achiziție cunoscut — profitul afișat este parțial.`)
    recommendations.push('Completează prețurile de achiziție lipsă în Nomenclator sau importă achizițiile corespunzătoare.')
  }
  if (ruptureCount > 0) {
    problems.push(`${ruptureCount} produse au risc de ruptură de stoc (sub pragul configurat de zile de stoc).`)
    recommendations.push('Verifică pagina Stoc & Rotație, filtrat pe „Risc ruptură", pentru reaprovizionare.')
  }
  if (priceHikes.length > 0) {
    problems.push(`${priceHikes.length} produse au avut scumpiri de peste ${PRICE_HIKE_PCT_THRESHOLD}% de la furnizori în ultimele ${PRICE_HIKE_WINDOW_DAYS} zile.`)
    recommendations.push('Verifică pagina Furnizori → Impact financiar al scumpirilor pentru estimarea impactului lunar.')
  }
  if (topDecline.length > 0) {
    problems.push(`${topDecline.length} produse au scăzut semnificativ față de luna anterioară (vezi „Top scăderi" mai jos).`)
  }
  if (topGrowth.length > 0) {
    opportunities.push(`${topGrowth.length} produse au crescut semnificativ față de luna anterioară (vezi „Top creșteri" mai jos).`)
  }
  if (hiddenGemCount > 0) {
    opportunities.push(`${hiddenGemCount} produse sunt „Hidden Gem" (vânzări mici, marjă mare) — vezi Profitabilitate → Matrice Vânzări × Marjă.`)
    recommendations.push('Ia în calcul promovarea produselor „Hidden Gem" — au deja marjă bună, dar volum mic.')
  }

  return {
    year,
    month,
    monthLabelText: monthLabel(`${monthKey}-01`),
    range,
    summary,
    target: stationTarget,
    prevMonthLabel: monthLabel(`${prevRange.start}`),
    vsPrevMonth: prevSummary
      ? {
          totalSales: computeDelta(summary.totalSales, prevSummary.totalSales),
          grossProfit: computeDelta(summary.grossProfitEstimate, prevSummary.grossProfitEstimate),
          crossSellPct: computeDelta(summary.crossSellPct, prevSummary.crossSellPct),
          avgReceiptValue: computeDelta(summary.avgReceiptValue, prevSummary.avgReceiptValue),
        }
      : null,
    prevYearLabel: monthLabel(`${yearAgoRange.start}`),
    vsPrevYear: yearAgoSummary
      ? {
          totalSales: computeDelta(summary.totalSales, yearAgoSummary.totalSales),
          grossProfit: computeDelta(summary.grossProfitEstimate, yearAgoSummary.grossProfitEstimate),
        }
      : null,
    topGrowth,
    topDecline,
    problems,
    opportunities,
    recommendations,
  }
}

function fmt(n: number): string {
  return n.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
