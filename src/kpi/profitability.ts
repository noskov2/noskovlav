import type { Product, SupplierReceiptLine, TransactionLine } from '@/types/domain'
import { exVatValue } from '@/kpi/vat'

export interface ProductProfitRow {
  product: Product
  quantity: number
  salesValue: number
  salesValueNoVat: number | null
  costValue: number | null // null if purchase price unknown for every line
  costKnown: boolean
  costCoverage: number // 0..1 — share of this product's sold quantity for which a cost was found
  grossProfit: number | null // always computed against ex-VAT sales, never mixed with VAT-inclusive value
  marginPct: number | null // grossProfit / salesValueNoVat
  markupPct: number | null // grossProfit / costValue ("adaos comercial")
  shareOfSales: number
  shareOfProfit: number | null
}

/**
 * Resolves a product's unit cost "as of" a given sale date from its
 * supplier-receipt price history, instead of blindly using today's
 * purchasePrice for old sales (which would silently reprice historical
 * profit whenever a cost changes). Returns the price of the latest receipt
 * on or before `date`, or null if there's no receipt at or before it.
 */
export function buildHistoricalCostResolver(
  supplierReceipts: SupplierReceiptLine[],
): (productId: string, date: string) => number | null {
  const byProduct = new Map<string, { date: string; price: number }[]>()
  for (const r of supplierReceipts) {
    const arr = byProduct.get(r.productId)
    if (arr) arr.push({ date: r.date, price: r.price })
    else byProduct.set(r.productId, [{ date: r.date, price: r.price }])
  }
  for (const arr of byProduct.values()) arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  return (productId: string, date: string): number | null => {
    const arr = byProduct.get(productId)
    if (!arr || arr.length === 0) return null
    let lo = 0
    let hi = arr.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid].date <= date) {
        ans = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return ans >= 0 ? arr[ans].price : null
  }
}

export interface CategoryProfitRow {
  category: string
  quantity: number
  salesValue: number // VAT-inclusive, all sales — what customers actually paid
  salesValueNoVat: number | null // ex-VAT, cost-known slice only — the true basis for margin
  costValue: number | null
  grossProfit: number | null
  marginPct: number | null
  costCoverage: number // 0..1 — share of this category's sold quantity for which a cost was found
  shareOfSales: number
  shareOfProfit: number | null
  productCount: number
}

// Cost priority: 1) the line's own purchasePriceUnit (came with the sale
// itself — most trustworthy). 2) the supplier-receipt price history as of
// the sale's date (never today's price for an old sale). 3) the product's
// current purchasePrice, only as a last resort when no history exists at
// all — and even then it's the best information available, not a silent
// guess.
function unitCostAsOf(
  t: TransactionLine,
  product: Product | undefined,
  historicalCost: (productId: string, date: string) => number | null,
): number | null {
  if (t.purchasePriceUnit != null) return t.purchasePriceUnit
  const historical = historicalCost(t.productId, t.date)
  if (historical != null) return historical
  return product?.purchasePrice ?? null
}

export function computeProductProfitability(
  transactions: TransactionLine[],
  products: Product[],
  supplierReceipts: SupplierReceiptLine[] = [],
  defaultVatRatePct = 19,
): ProductProfitRow[] {
  const productsById = new Map(products.map((p) => [p.id, p]))
  const totalSales = transactions.reduce((s, t) => s + t.value, 0)
  const historicalCost = buildHistoricalCostResolver(supplierReceipts)

  const byProduct = new Map<
    string,
    { qty: number; sales: number; costQty: number; costSalesNoVat: number; cost: number }
  >()

  for (const t of transactions) {
    const product = productsById.get(t.productId)
    const acc = byProduct.get(t.productId) ?? { qty: 0, sales: 0, costQty: 0, costSalesNoVat: 0, cost: 0 }
    acc.qty += t.quantity
    acc.sales += t.value
    const cost = unitCostAsOf(t, product, historicalCost)
    if (cost != null) {
      acc.costQty += t.quantity
      acc.cost += cost * t.quantity
      acc.costSalesNoVat += exVatValue(t, product, defaultVatRatePct)
    }
    byProduct.set(t.productId, acc)
  }

  let totalProfit = 0
  const rows: ProductProfitRow[] = []
  for (const [productId, agg] of byProduct.entries()) {
    const product = productsById.get(productId)
    if (!product) continue
    const costCoverage = agg.qty > 0 ? agg.costQty / agg.qty : 0
    const hasCost = agg.costQty > 0
    // Profit is computed only over the cost-known slice of this product's
    // sales — partial coverage still yields a real (if partial) number
    // instead of an all-or-nothing null the moment a single line lacks cost.
    const grossProfit = hasCost ? agg.costSalesNoVat - agg.cost : null
    if (grossProfit != null) totalProfit += grossProfit
    rows.push({
      product,
      quantity: agg.qty,
      salesValue: agg.sales,
      salesValueNoVat: hasCost ? agg.costSalesNoVat : null,
      costValue: hasCost ? agg.cost : null,
      costKnown: costCoverage >= 0.999,
      costCoverage,
      grossProfit,
      marginPct: grossProfit != null && agg.costSalesNoVat > 0 ? (grossProfit / agg.costSalesNoVat) * 100 : null,
      markupPct: grossProfit != null && agg.cost > 0 ? (grossProfit / agg.cost) * 100 : null,
      shareOfSales: totalSales > 0 ? (agg.sales / totalSales) * 100 : 0,
      shareOfProfit: null, // filled in below once totalProfit is known
    })
  }

  for (const row of rows) {
    row.shareOfProfit =
      row.grossProfit != null && totalProfit !== 0 ? (row.grossProfit / totalProfit) * 100 : null
  }

  return rows.sort((a, b) => b.salesValue - a.salesValue)
}

// Aggregates the already-VAT-correct per-product rows into per-category
// totals. This used to sum row.salesValue (VAT-inclusive) against
// row.costValue (ex-VAT) to get "profit" — exactly the mixing bug already
// fixed once at the product level (see buildHistoricalCostResolver's
// caller), reintroduced here because the category rollup summed the wrong
// sales field. Margin must always come out of the ex-VAT sales
// (salesValueNoVat) of the cost-known slice, matched against the ex-VAT
// cost of that same slice — collected VAT is never profit.
export function computeCategoryProfitability(productRows: ProductProfitRow[]): CategoryProfitRow[] {
  const totalSales = productRows.reduce((s, r) => s + r.salesValue, 0)
  const totalProfit = productRows.reduce((s, r) => s + (r.grossProfit ?? 0), 0)

  const byCategory = new Map<
    string,
    { qty: number; costQty: number; sales: number; salesNoVatKnown: number; cost: number; count: number }
  >()

  for (const row of productRows) {
    const cat = row.product.category || 'Necategorizat'
    const acc = byCategory.get(cat) ?? { qty: 0, costQty: 0, sales: 0, salesNoVatKnown: 0, cost: 0, count: 0 }
    acc.qty += row.quantity
    acc.sales += row.salesValue
    acc.count += 1
    if (row.costValue != null && row.salesValueNoVat != null) {
      acc.costQty += row.quantity * row.costCoverage
      acc.cost += row.costValue
      acc.salesNoVatKnown += row.salesValueNoVat
    }
    byCategory.set(cat, acc)
  }

  return Array.from(byCategory.entries())
    .map(([category, agg]) => {
      const hasCost = agg.salesNoVatKnown > 0 || agg.cost > 0
      const grossProfit = hasCost ? agg.salesNoVatKnown - agg.cost : null
      return {
        category,
        quantity: agg.qty,
        salesValue: agg.sales,
        salesValueNoVat: hasCost ? agg.salesNoVatKnown : null,
        costValue: hasCost ? agg.cost : null,
        grossProfit,
        marginPct: grossProfit != null && agg.salesNoVatKnown > 0 ? (grossProfit / agg.salesNoVatKnown) * 100 : null,
        costCoverage: agg.qty > 0 ? agg.costQty / agg.qty : 0,
        shareOfSales: totalSales > 0 ? (agg.sales / totalSales) * 100 : 0,
        shareOfProfit: grossProfit != null && totalProfit !== 0 ? (grossProfit / totalProfit) * 100 : null,
        productCount: agg.count,
      }
    })
    .sort((a, b) => b.salesValue - a.salesValue)
}
