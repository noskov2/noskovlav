import type { Product, TransactionLine } from '@/types/domain'
import type { PeriodBreakdownRow } from '@/kpi/periodBreakdown'

function aggByProduct(transactions: TransactionLine[], productIds: Set<string>): Map<string, { count: number; value: number }> {
  const result = new Map<string, { count: number; value: number }>()
  for (const t of transactions) {
    if (!productIds.has(t.productId)) continue
    const acc = result.get(t.productId) ?? { count: 0, value: 0 }
    acc.count += t.quantity
    acc.value += t.value
    result.set(t.productId, acc)
  }
  return result
}

// One row per distinct product within the given group (e.g. every coffee
// variant, every sandwich), each with quantity sold/value for three
// windows: the currently viewed period, the same elapsed days one month
// earlier, and that earlier month in full. The count is QUANTITY, matching
// exactly what summary.ts already sums for coffeeCount/sandwichCount — kept
// as the same unit here so the breakdown never implies a different,
// incompatible total than the KPI card it drills down from.
export function computeProductBreakdown(
  currentTx: TransactionLine[],
  prevSamePeriodTx: TransactionLine[],
  prevFullMonthTx: TransactionLine[],
  products: Product[],
  productIds: Set<string>,
): PeriodBreakdownRow[] {
  const productsById = new Map(products.map((p) => [p.id, p]))
  const current = aggByProduct(currentTx, productIds)
  const prevSame = aggByProduct(prevSamePeriodTx, productIds)
  const prevFull = aggByProduct(prevFullMonthTx, productIds)
  const ids = new Set([...current.keys(), ...prevSame.keys(), ...prevFull.keys()])

  const rows: PeriodBreakdownRow[] = []
  for (const id of ids) {
    rows.push({
      key: id,
      label: productsById.get(id)?.name ?? id,
      current: current.get(id) ?? { count: 0, value: 0 },
      prevSamePeriod: prevSame.get(id) ?? { count: 0, value: 0 },
      prevFullMonth: prevFull.get(id) ?? { count: 0, value: 0 },
    })
  }

  return rows.sort((a, b) => b.current.value - a.current.value)
}
