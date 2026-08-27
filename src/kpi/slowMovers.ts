import type { Product, SupplierReceiptLine, TransactionLine } from '@/types/domain'
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
  lastReceiptDate: string | null // last supplier delivery on file for this product, if any
  // The later of lastSaleDate/lastReceiptDate — a fresh delivery means
  // nothing has had a chance to sell since it arrived, even if the product
  // itself last sold months ago (likely because it was out of stock in the
  // meantime). "No sale" alerts should measure staleness from here, not
  // from lastSaleDate alone, or a station that just restocked a
  // long-out-of-stock item gets flagged as if it were still sitting idle.
  lastMovementDate: string | null
  daysSinceLastMovement: number | null
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
  supplierReceipts: SupplierReceiptLine[] = [],
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

  const lastReceiptByProduct = new Map<string, string>()
  for (const r of supplierReceipts) {
    const current = lastReceiptByProduct.get(r.productId)
    if (!current || r.date > current) lastReceiptByProduct.set(r.productId, r.date)
  }

  const asOf = range.end
  const daysBetween = (from: string) =>
    Math.round((new Date(`${asOf}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000)

  return products
    .filter((p) => p.active && !p.groups.neVandabil)
    .map((product) => {
      const agg = byProductInRange.get(product.id) ?? { qty: 0, value: 0 }
      const lastSaleDate = lastSaleByProduct.get(product.id) ?? null
      const lastReceiptDate = lastReceiptByProduct.get(product.id) ?? null
      const lastMovementDate =
        lastReceiptDate && (!lastSaleDate || lastReceiptDate > lastSaleDate) ? lastReceiptDate : lastSaleDate
      const daysSinceLastSale = lastSaleDate ? daysBetween(lastSaleDate) : null
      const daysSinceLastMovement = lastMovementDate ? daysBetween(lastMovementDate) : null
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
        lastReceiptDate,
        lastMovementDate,
        daysSinceLastMovement,
        classification,
        blockedStockValue,
      }
    })
}

export function noSaleSinceDays(rows: SlowMoverRow[], asOf: string, days: number): SlowMoverRow[] {
  const cutoff = addDays(asOf, -days)
  return rows.filter((r) => !r.lastMovementDate || r.lastMovementDate < cutoff)
}
