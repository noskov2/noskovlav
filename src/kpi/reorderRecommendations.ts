import type { Product, TransactionLine } from '@/types/domain'
import { addDays, weekdayName } from '@/kpi/dateRanges'

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000)
}

// Soonest date strictly after `fromDate` whose weekday is in `weekdays` — an
// order placed today can't arrive today, so "today" itself is never a
// candidate even if today happens to be a delivery day. Searches at most two
// weeks out, which always finds a match for any non-empty weekday list.
export function nextDeliveryDate(fromDate: string, weekdays: number[]): string | null {
  if (weekdays.length === 0) return null
  for (let i = 1; i <= 14; i++) {
    const candidate = addDays(fromDate, i)
    if (weekdays.includes(new Date(`${candidate}T00:00:00`).getDay())) return candidate
  }
  return null
}

export interface ReorderRow {
  product: Product
  avgPerDay: number
  currentStock: number
  nextDeliveryDate: string
  daysUntilDelivery: number
  projectedNeed: number
  recommendedQty: number
  note: string
}

// For each active product whose supplier has a configured delivery
// schedule, projects how many units will be needed to cover sales between
// now and the next delivery, and recommends ordering the shortfall against
// currentStock. Products with no sales in the lookback window, no supplier,
// or a supplier without a configured schedule are silently skipped — there
// is nothing to project for them (see supplierless/unscheduled counts,
// computed separately by callers that want to surface those as a notice).
export function computeReorderRecommendations(
  products: Product[],
  transactions: TransactionLine[],
  supplierDeliveryDays: Record<string, number[]>,
  asOfDate: string,
  lookbackDays = 28,
): ReorderRow[] {
  const rangeStart = addDays(asOfDate, -(lookbackDays - 1))
  const salesByProduct = new Map<string, number>()
  for (const t of transactions) {
    if (t.date < rangeStart || t.date > asOfDate) continue
    salesByProduct.set(t.productId, (salesByProduct.get(t.productId) ?? 0) + t.quantity)
  }

  const weeks = Math.round(lookbackDays / 7)
  const rows: ReorderRow[] = []
  for (const product of products) {
    if (!product.active || !product.supplier) continue
    const weekdays = supplierDeliveryDays[product.supplier]
    if (!weekdays || weekdays.length === 0) continue
    const avgPerDay = (salesByProduct.get(product.id) ?? 0) / lookbackDays
    if (avgPerDay <= 0) continue
    const delivery = nextDeliveryDate(asOfDate, weekdays)
    if (!delivery) continue
    const daysUntilDelivery = daysBetween(asOfDate, delivery)
    const currentStock = product.currentStock ?? 0
    const projectedNeed = avgPerDay * daysUntilDelivery
    const recommendedQty = Math.ceil(projectedNeed - currentStock)
    if (recommendedQty <= 0) continue
    rows.push({
      product,
      avgPerDay,
      currentStock,
      nextDeliveryDate: delivery,
      daysUntilDelivery,
      projectedNeed,
      recommendedQty,
      note: `Până la următoarea livrare de ${weekdayName(delivery)} ai nevoie de ${recommendedQty} bucăți din ${product.name}, ținând cont de vânzările ultimelor ${weeks} săptămâni.`,
    })
  }
  return rows.sort((a, b) => b.recommendedQty - a.recommendedQty)
}

// Active, sellable products with a supplier and recent sales, but whose
// supplier has no delivery schedule configured yet — surfaced separately so
// the owner knows to set one up instead of silently getting no
// recommendation for that product.
export function countProductsAwaitingSchedule(
  products: Product[],
  transactions: TransactionLine[],
  supplierDeliveryDays: Record<string, number[]>,
  asOfDate: string,
  lookbackDays = 28,
): number {
  const rangeStart = addDays(asOfDate, -(lookbackDays - 1))
  const salesByProduct = new Map<string, number>()
  for (const t of transactions) {
    if (t.date < rangeStart || t.date > asOfDate) continue
    salesByProduct.set(t.productId, (salesByProduct.get(t.productId) ?? 0) + t.quantity)
  }
  let count = 0
  for (const product of products) {
    if (!product.active || !product.supplier) continue
    if ((salesByProduct.get(product.id) ?? 0) <= 0) continue
    const weekdays = supplierDeliveryDays[product.supplier]
    if (!weekdays || weekdays.length === 0) count++
  }
  return count
}
