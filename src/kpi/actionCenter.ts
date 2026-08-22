import type { Product, SupplierReceiptLine, TargetSet, TransactionLine } from '@/types/domain'
import type { DateRange } from '@/kpi/dateRanges'
import { addDays } from '@/kpi/dateRanges'
import { computeSlowMovers, noSaleSinceDays } from '@/kpi/slowMovers'
import { computeProductPriceSummaries } from '@/kpi/suppliers'
import { computePeriodSummary } from '@/kpi/summary'
import { computeDelta, previousMonthRange } from '@/kpi/monthComparison'

export type ActionTone = 'red' | 'orange' | 'green'

export interface ActionItem {
  tone: ActionTone
  text: string
  link: string
}

// Thresholds here are judgment calls, documented rather than hidden:
// < 7 zile de stoc la ritmul curent de vânzare = risc de ruptură;
// creștere KPI > 15% față de luna anterioară = demn de semnalat pozitiv.
const STOCK_RISK_DAYS = 7
const NOTABLE_GROWTH_PCT = 15

export function computeActionCenter(
  range: DateRange,
  allTransactions: TransactionLine[],
  products: Product[],
  supplierReceipts: SupplierReceiptLine[],
  stationTarget: TargetSet | null,
  crossSellPct: number,
  defaultVatRatePct: number,
): ActionItem[] {
  const items: ActionItem[] = []

  // 🔴 Risc de ruptură stoc — produse cu vânzare activă și < 7 zile de stoc la ritmul curent.
  const stockRows = computeSlowMovers(allTransactions, products, range)
  const atRisk = stockRows.filter((r) => {
    if (r.product.currentStock == null || r.avgPerDay <= 0) return false
    return r.product.currentStock / r.avgPerDay < STOCK_RISK_DAYS
  })
  if (atRisk.length > 0) {
    items.push({
      tone: 'red',
      text: `${atRisk.length} produse au sub ${STOCK_RISK_DAYS} zile de stoc la ritmul curent de vânzare.`,
      link: '/vanzare-slaba',
    })
  }

  // 🔴 Costuri furnizori crescute puternic (> 5%, ultimele 60 zile).
  const recentReceipts = supplierReceipts.filter((r) => r.date >= addDays(range.end, -60))
  const hikes = computeProductPriceSummaries(recentReceipts, products).filter((s) => (s.diffPct ?? 0) > 5)
  if (hikes.length > 0) {
    items.push({
      tone: 'red',
      text: `${hikes.length} produse au avut creșteri de cost peste 5% în ultimele 60 zile.`,
      link: '/furnizori',
    })
  }

  // 🟠 Produse fără vânzare 30/60/90 zile.
  const wideRange: DateRange = { start: addDays(range.end, -90), end: range.end }
  const wideRows = computeSlowMovers(allTransactions, products, wideRange)
  const noSale30 = noSaleSinceDays(wideRows, range.end, 30)
  const noSale90 = noSaleSinceDays(wideRows, range.end, 90)
  if (noSale30.length > 0) {
    items.push({
      tone: 'orange',
      text: `${noSale30.length} produse nu au avut nicio vânzare în ultimele 30 zile.`,
      link: '/vanzare-slaba',
    })
  }
  if (noSale90.length > 0) {
    items.push({
      tone: 'orange',
      text: `${noSale90.length} produse nu au avut nicio vânzare în ultimele 90 zile — candidați clari pentru scos din stoc.`,
      link: '/vanzare-slaba',
    })
  }

  // 🟠 Cross-sell sub target.
  if (stationTarget?.crossSellPct != null && crossSellPct < stationTarget.crossSellPct) {
    const gapPp = stationTarget.crossSellPct - crossSellPct
    items.push({
      tone: 'orange',
      text: `Cross-sell este cu ${gapPp.toFixed(1)} pp sub target (${crossSellPct.toFixed(1)}% față de ${stationTarget.crossSellPct.toFixed(1)}%).`,
      link: '/cross-sell',
    })
  }

  // 🟢 KPI cu creșteri importante față de luna anterioară.
  const prevRange = previousMonthRange(range)
  const currentTx = allTransactions.filter((t) => t.date >= range.start && t.date <= range.end)
  const prevTx = allTransactions.filter((t) => t.date >= prevRange.start && t.date <= prevRange.end)
  if (prevTx.length > 0) {
    const currentSummary = computePeriodSummary(currentTx, products, defaultVatRatePct)
    const prevSummary = computePeriodSummary(prevTx, products, defaultVatRatePct)
    const salesDelta = computeDelta(currentSummary.totalSales, prevSummary.totalSales)
    if (salesDelta.pct != null && salesDelta.pct >= NOTABLE_GROWTH_PCT) {
      items.push({
        tone: 'green',
        text: `Vânzările sunt cu ${salesDelta.pct.toFixed(1)}% peste perioada echivalentă din luna anterioară.`,
        link: '/',
      })
    }
    const profitDelta = computeDelta(currentSummary.grossProfitEstimate, prevSummary.grossProfitEstimate)
    if (profitDelta.pct != null && profitDelta.pct >= NOTABLE_GROWTH_PCT && prevSummary.grossProfitEstimate > 0) {
      items.push({
        tone: 'green',
        text: `Profitul brut estimat este cu ${profitDelta.pct.toFixed(1)}% peste perioada echivalentă din luna anterioară.`,
        link: '/profitabilitate',
      })
    }
  }

  return items
}
