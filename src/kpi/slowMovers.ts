import type { Product, TransactionLine } from '@/types/domain'
import { addDays, dayCountInRange, type DateRange } from '@/kpi/dateRanges'

export type MovementClass = 'activ' | 'lent' | 'foarte-lent' | 'fara-vanzare'

export const MOVEMENT_LABELS: Record<MovementClass, string> = {
  activ: 'Activ',
  lent: 'Lent',
  'foarte-lent': 'Foarte lent',
  'fara-vanzare': 'Fără vânzare',
}

export interface SlowMoverRow {
  product: Product
  quantitySold: number
  salesValue: number
  avgPerDay: number
  lastSaleDate: string | null
  daysSinceLastSale: number | null
  classification: MovementClass
  blockedStockValue: number | null // currentStock * purchasePrice, if both known
}

/**
 * `range` is the analysis window (e.g. last 30 days). Products with zero
 * lines in range are still included, with lastSaleDate looked up from the
 * full, unfiltered transaction history so "45 zile de la ultima vânzare"
 * stays meaningful even if that last sale falls outside the window.
 */
export function computeSlowMovers(
  allTransactions: TransactionLine[],
  products: Product[],
  range: DateRange,
): SlowMoverRow[] {
  const inRange = allTransactions.filter((t) => t.date >= range.start && t.date <= range.end)
  const days = dayCountInRange(range)

  const byProductInRange = new Map<string, { qty: number; value: number }>()
  for (const t of inRange) {
    const acc = byProductInRange.get(t.productId) ?? { qty: 0, value: 0 }
    acc.qty += t.quantity
    acc.value += t.value
    byProductInRange.set(t.productId, acc)
  }

  const lastSaleByProduct = new Map<string, string>()
  for (const t of allTransactions) {
    const current = lastSaleByProduct.get(t.productId)
    if (!current || t.date > current) lastSaleByProduct.set(t.productId, t.date)
  }

  const asOf = range.end

  return products
    .filter((p) => p.active && !p.groups.neVandabil)
    .map((product) => {
      const agg = byProductInRange.get(product.id) ?? { qty: 0, value: 0 }
      const lastSaleDate = lastSaleByProduct.get(product.id) ?? null
      const daysSinceLastSale = lastSaleDate
        ? Math.round(
            (new Date(`${asOf}T00:00:00`).getTime() - new Date(`${lastSaleDate}T00:00:00`).getTime()) /
              86400000,
          )
        : null
      const avgPerDay = agg.qty / days

      let classification: MovementClass
      if (agg.qty === 0) classification = 'fara-vanzare'
      else if (avgPerDay >= 1) classification = 'activ'
      else if (avgPerDay >= 0.2) classification = 'lent'
      else classification = 'foarte-lent'

      const blockedStockValue =
        product.currentStock != null && product.purchasePrice != null
          ? product.currentStock * product.purchasePrice
          : null

      return {
        product,
        quantitySold: agg.qty,
        salesValue: agg.value,
        avgPerDay,
        lastSaleDate,
        daysSinceLastSale,
        classification,
        blockedStockValue,
      }
    })
}

export function noSaleSinceDays(rows: SlowMoverRow[], asOf: string, days: number): SlowMoverRow[] {
  const cutoff = addDays(asOf, -days)
  return rows.filter((r) => !r.lastSaleDate || r.lastSaleDate < cutoff)
}
