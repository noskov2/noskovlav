import type { Product, TransactionLine } from '@/types/domain'

export interface ProductProfitRow {
  product: Product
  quantity: number
  salesValue: number
  salesValueNoVat: number | null
  costValue: number | null // null if purchase price unknown for every line
  costKnown: boolean
  grossProfit: number | null
  marginPct: number | null // grossProfit / salesValue
  markupPct: number | null // grossProfit / costValue ("adaos comercial")
  shareOfSales: number
  shareOfProfit: number | null
}

export interface CategoryProfitRow {
  category: string
  quantity: number
  salesValue: number
  costValue: number | null
  grossProfit: number | null
  marginPct: number | null
  shareOfSales: number
  shareOfProfit: number | null
  productCount: number
}

function unitCost(t: TransactionLine, product: Product | undefined): number | null {
  return t.purchasePriceUnit ?? product?.purchasePrice ?? null
}

export function computeProductProfitability(
  transactions: TransactionLine[],
  products: Product[],
): ProductProfitRow[] {
  const productsById = new Map(products.map((p) => [p.id, p]))
  const totalSales = transactions.reduce((s, t) => s + t.value, 0)

  const byProduct = new Map<
    string,
    { qty: number; sales: number; salesNoVat: number; cost: number; hasCost: boolean; anyLine: boolean }
  >()

  for (const t of transactions) {
    const product = productsById.get(t.productId)
    const acc = byProduct.get(t.productId) ?? {
      qty: 0,
      sales: 0,
      salesNoVat: 0,
      cost: 0,
      hasCost: true,
      anyLine: false,
    }
    acc.qty += t.quantity
    acc.sales += t.value
    acc.salesNoVat += t.valueNoVat ?? 0
    acc.anyLine = true
    const cost = unitCost(t, product)
    if (cost != null) acc.cost += cost * t.quantity
    else acc.hasCost = false
    byProduct.set(t.productId, acc)
  }

  let totalProfit = 0
  const rows: ProductProfitRow[] = []
  for (const [productId, agg] of byProduct.entries()) {
    const product = productsById.get(productId)
    if (!product) continue
    const grossProfit = agg.hasCost ? agg.sales - agg.cost : null
    if (grossProfit != null) totalProfit += grossProfit
    rows.push({
      product,
      quantity: agg.qty,
      salesValue: agg.sales,
      salesValueNoVat: agg.salesNoVat > 0 ? agg.salesNoVat : null,
      costValue: agg.hasCost ? agg.cost : null,
      costKnown: agg.hasCost,
      grossProfit,
      marginPct: grossProfit != null && agg.sales > 0 ? (grossProfit / agg.sales) * 100 : null,
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

export function computeCategoryProfitability(productRows: ProductProfitRow[]): CategoryProfitRow[] {
  const totalSales = productRows.reduce((s, r) => s + r.salesValue, 0)
  const totalProfit = productRows.reduce((s, r) => s + (r.grossProfit ?? 0), 0)

  const byCategory = new Map<
    string,
    { qty: number; sales: number; cost: number; hasCost: boolean; count: number }
  >()

  for (const row of productRows) {
    const cat = row.product.category || 'Necategorizat'
    const acc = byCategory.get(cat) ?? { qty: 0, sales: 0, cost: 0, hasCost: true, count: 0 }
    acc.qty += row.quantity
    acc.sales += row.salesValue
    acc.count += 1
    if (row.costValue != null) acc.cost += row.costValue
    else acc.hasCost = false
    byCategory.set(cat, acc)
  }

  return Array.from(byCategory.entries())
    .map(([category, agg]) => {
      const grossProfit = agg.hasCost ? agg.sales - agg.cost : null
      return {
        category,
        quantity: agg.qty,
        salesValue: agg.sales,
        costValue: agg.hasCost ? agg.cost : null,
        grossProfit,
        marginPct: grossProfit != null && agg.sales > 0 ? (grossProfit / agg.sales) * 100 : null,
        shareOfSales: totalSales > 0 ? (agg.sales / totalSales) * 100 : 0,
        shareOfProfit: grossProfit != null && totalProfit !== 0 ? (grossProfit / totalProfit) * 100 : null,
        productCount: agg.count,
      }
    })
    .sort((a, b) => b.salesValue - a.salesValue)
}
