import type { Product, SupplierReceiptLine, TransactionLine } from '@/types/domain'
import { computePeriodSummary, type PeriodSummary } from '@/kpi/summary'
import { computeProductProfitability } from '@/kpi/profitability'
import { fuelProductIds } from '@/kpi/productGroups'
import { computeFuelBreakdown, type FuelBreakdown } from '@/kpi/fuelVariants'
import { filterByRange } from '@/kpi/applyFilters'
import { monthLabel } from '@/kpi/dateRanges'

export interface MonthlyRow {
  monthKey: string // YYYY-MM
  label: string // "Ianuarie 2026"
  shortLabel: string // "Ian 2026"
  summary: PeriodSummary
  fuelBreakdown: FuelBreakdown // vânzări carburant, pe tip (motorină/benzină/GPL), valoric + cantitativ
  grossProfit: number | null
  fuelGrossProfit: number | null // grossProfit split: carburant
  goodsGrossProfit: number | null // grossProfit split: marfă (everything non-fuel)
  marginPct: number | null
}

const SHORT_MONTH_NAMES = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec']

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/**
 * One row per calendar month that has at least one transaction, chronological
 * order, from the earliest month present in the data through the latest —
 * the "ian - X, feb - X, mar - X..." view the station owner asked for,
 * instead of only ever comparing two adjacent months (see monthComparison.ts,
 * which this doesn't replace — that's still what powers the "compară cu luna
 * anterioară" toggle scattered across other pages).
 *
 * Profit/margin reuse computeProductProfitability so this never re-derives
 * (and risks re-breaking) the VAT-mixing / historical-cost logic already
 * fixed there — a month's gross profit is just that month's per-product rows
 * summed, restricted to the cost-known slice exactly like every other page.
 */
export function computeMonthlySeries(
  allTransactions: TransactionLine[],
  products: Product[],
  supplierReceipts: SupplierReceiptLine[],
  defaultVatRatePct = 19,
): MonthlyRow[] {
  const monthKeys = Array.from(new Set(allTransactions.map((t) => t.date.slice(0, 7)))).sort()
  const fuelIds = fuelProductIds(products)

  return monthKeys.map((monthKey) => {
    const start = `${monthKey}-01`
    const end = `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, '0')}`
    const monthTx = filterByRange(allTransactions, start, end)
    const summary = computePeriodSummary(monthTx, products, defaultVatRatePct)
    const fuelBreakdown = computeFuelBreakdown(monthTx, products)

    const profitRows = computeProductProfitability(monthTx, products, supplierReceipts, defaultVatRatePct)
    let grossProfit = 0
    let fuelGrossProfit = 0
    let goodsGrossProfit = 0
    let salesNoVatKnown = 0
    let hasCost = false
    for (const r of profitRows) {
      if (r.grossProfit != null) {
        grossProfit += r.grossProfit
        salesNoVatKnown += r.salesValueNoVat ?? 0
        hasCost = true
        if (fuelIds.has(r.product.id)) fuelGrossProfit += r.grossProfit
        else goodsGrossProfit += r.grossProfit
      }
    }

    const label = monthLabel(start)
    const [monthName, year] = label.split(' ')
    const shortLabel = `${SHORT_MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1]} ${year}`

    return {
      monthKey,
      label: `${monthName} ${year}`,
      shortLabel,
      summary,
      fuelBreakdown,
      grossProfit: hasCost ? grossProfit : null,
      fuelGrossProfit: hasCost ? fuelGrossProfit : null,
      goodsGrossProfit: hasCost ? goodsGrossProfit : null,
      marginPct: hasCost && salesNoVatKnown > 0 ? (grossProfit / salesNoVatKnown) * 100 : null,
    }
  })
}
