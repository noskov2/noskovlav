import type { Product, TransactionLine } from '@/types/domain'
import type { StockThresholds } from '@/types/domain'
import { dayCountInRange, type DateRange } from '@/kpi/dateRanges'

export type StockRiskClass = 'risc-ruptura' | 'stoc-scazut' | 'stoc-sanatos' | 'suprastoc' | 'necunoscut'

export const STOCK_RISK_LABELS: Record<StockRiskClass, string> = {
  'risc-ruptura': 'Risc ruptură',
  'stoc-scazut': 'Stoc scăzut',
  'stoc-sanatos': 'Stoc sănătos',
  suprastoc: 'Suprastoc',
  necunoscut: 'Stoc necunoscut',
}

export interface StockRotationRow {
  product: Product
  currentStock: number | null
  stockValue: number | null // currentStock * salePrice
  avgPerDay: number // velocity over the analysis window
  lastSaleDate: string | null
  daysSinceLastSale: number | null
  daysOfStock: number | null // currentStock / avgPerDay; null when stock unknown, Infinity when stock>0 but no recent sales
  riskClass: StockRiskClass
  costUnit: number | null
  blockedCapital: number | null // currentStock * costUnit
  noSaleDays: 30 | 60 | 90 | null // largest no-sale bucket the product falls into (null = sold recently or never sold at all)
  neverSold: boolean
}

/**
 * `range` is the velocity analysis window (e.g. last 30 days) — same
 * pattern as computeSlowMovers. Thresholds are resolved per-product by the
 * caller (see getStockThresholdsForCategory) since they can differ by
 * category.
 */
export function computeStockRotation(
  allTransactions: TransactionLine[],
  products: Product[],
  range: DateRange,
  thresholdsForCategory: (category: string) => StockThresholds,
): StockRotationRow[] {
  const inRange = allTransactions.filter((t) => t.date >= range.start && t.date <= range.end)
  const days = dayCountInRange(range)

  const qtyByProduct = new Map<string, number>()
  for (const t of inRange) {
    qtyByProduct.set(t.productId, (qtyByProduct.get(t.productId) ?? 0) + t.quantity)
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
      const qty = qtyByProduct.get(product.id) ?? 0
      const avgPerDay = qty / days
      const lastSaleDate = lastSaleByProduct.get(product.id) ?? null
      const daysSinceLastSale = lastSaleDate
        ? Math.round((new Date(`${asOf}T00:00:00`).getTime() - new Date(`${lastSaleDate}T00:00:00`).getTime()) / 86400000)
        : null
      const neverSold = lastSaleDate == null

      let noSaleDays: 30 | 60 | 90 | null = null
      if (neverSold) noSaleDays = 90
      else if (daysSinceLastSale != null) {
        if (daysSinceLastSale >= 90) noSaleDays = 90
        else if (daysSinceLastSale >= 60) noSaleDays = 60
        else if (daysSinceLastSale >= 30) noSaleDays = 30
      }

      const currentStock = product.currentStock
      const stockValue = currentStock != null && product.salePrice != null ? currentStock * product.salePrice : null
      const costUnit = product.purchasePrice
      const blockedCapital = currentStock != null && costUnit != null ? currentStock * costUnit : null

      let daysOfStock: number | null = null
      let riskClass: StockRiskClass = 'necunoscut'
      if (currentStock != null) {
        daysOfStock = avgPerDay > 0 ? currentStock / avgPerDay : currentStock > 0 ? Infinity : 0
        const t = thresholdsForCategory(product.category)
        if (daysOfStock < t.ruptureDays) riskClass = 'risc-ruptura'
        else if (daysOfStock < t.lowDays) riskClass = 'stoc-scazut'
        else if (daysOfStock > t.overstockDays) riskClass = 'suprastoc'
        else riskClass = 'stoc-sanatos'
      }

      return {
        product,
        currentStock,
        stockValue,
        avgPerDay,
        lastSaleDate,
        daysSinceLastSale,
        daysOfStock,
        riskClass,
        costUnit,
        blockedCapital,
        noSaleDays,
        neverSold,
      }
    })
}
