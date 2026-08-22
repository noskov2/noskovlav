import type { Product, SupplierReceiptLine } from '@/types/domain'

export type PriceAlertLevel = 'green' | 'yellow' | 'red'

// 🟢 0–2% · 🟡 2–5% · 🔴 peste 5%, per the spec. Price decreases are always green.
export function priceAlertLevel(diffPct: number | null): PriceAlertLevel {
  if (diffPct == null || diffPct <= 2) return 'green'
  if (diffPct <= 5) return 'yellow'
  return 'red'
}

export interface PriceHistoryPoint {
  date: string
  supplier: string
  price: number
  quantity: number
  diffAbs: number | null
  diffPct: number | null
}

export interface SupplierComparisonRow {
  supplier: string
  lastPrice: number
  lastDate: string
  receiptCount: number
  isCheapest: boolean
}

export interface ProductPriceSummary {
  product: Product
  history: PriceHistoryPoint[]
  lastPrice: number | null
  lastSupplier: string | null
  prevPrice: number | null
  diffAbs: number | null
  diffPct: number | null
  alertLevel: PriceAlertLevel
  minPrice: number | null
  maxPrice: number | null
  avgPrice: number | null
  weightedAvgPrice: number | null // SUM(preț × cantitate) / SUM(cantitate)
  totalQuantityPurchased: number
  totalValuePurchased: number
  diffVsAvgPct: number | null
  bySupplier: SupplierComparisonRow[]
}

export function computeProductPriceSummaries(
  receipts: SupplierReceiptLine[],
  products: Product[],
): ProductPriceSummary[] {
  const productsById = new Map(products.map((p) => [p.id, p]))
  const byProduct = new Map<string, SupplierReceiptLine[]>()
  for (const r of receipts) {
    const arr = byProduct.get(r.productId)
    if (arr) arr.push(r)
    else byProduct.set(r.productId, [r])
  }

  const summaries: ProductPriceSummary[] = []

  for (const [productId, lines] of byProduct.entries()) {
    const product = productsById.get(productId)
    if (!product) continue

    const sorted = [...lines].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const history: PriceHistoryPoint[] = sorted.map((line, i) => {
      const prev = i > 0 ? sorted[i - 1] : null
      const diffAbs = prev ? line.price - prev.price : null
      const diffPct = prev && prev.price > 0 ? (diffAbs! / prev.price) * 100 : null
      return {
        date: line.date,
        supplier: line.supplier,
        price: line.price,
        quantity: line.quantity,
        diffAbs,
        diffPct,
      }
    })

    const last = history[history.length - 1] ?? null
    const prev = history.length > 1 ? history[history.length - 2] : null
    const prices = sorted.map((l) => l.price)
    const minPrice = prices.length ? Math.min(...prices) : null
    const maxPrice = prices.length ? Math.max(...prices) : null
    const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null

    const totalQuantityPurchased = sorted.reduce((s, l) => s + l.quantity, 0)
    const totalValuePurchased = sorted.reduce((s, l) => s + l.price * l.quantity, 0)
    const weightedAvgPrice = totalQuantityPurchased > 0 ? totalValuePurchased / totalQuantityPurchased : null

    const bySupplierMap = new Map<string, SupplierReceiptLine[]>()
    for (const line of sorted) {
      const arr = bySupplierMap.get(line.supplier)
      if (arr) arr.push(line)
      else bySupplierMap.set(line.supplier, [line])
    }
    const bySupplierRaw = Array.from(bySupplierMap.entries()).map(([supplier, lines2]) => {
      const lastLine = lines2[lines2.length - 1]
      return {
        supplier,
        lastPrice: lastLine.price,
        lastDate: lastLine.date,
        receiptCount: lines2.length,
      }
    })
    const cheapestPrice = bySupplierRaw.length ? Math.min(...bySupplierRaw.map((s) => s.lastPrice)) : null
    const bySupplier: SupplierComparisonRow[] = bySupplierRaw
      .map((s) => ({ ...s, isCheapest: cheapestPrice != null && s.lastPrice === cheapestPrice }))
      .sort((a, b) => a.lastPrice - b.lastPrice)

    const diffVsAvgPct = last && avgPrice ? ((last.price - avgPrice) / avgPrice) * 100 : null

    summaries.push({
      product,
      history,
      lastPrice: last?.price ?? null,
      lastSupplier: last?.supplier ?? null,
      prevPrice: prev?.price ?? null,
      diffAbs: last?.diffAbs ?? null,
      diffPct: last?.diffPct ?? null,
      alertLevel: priceAlertLevel(last?.diffPct ?? null),
      minPrice,
      maxPrice,
      avgPrice,
      weightedAvgPrice,
      totalQuantityPurchased,
      totalValuePurchased,
      diffVsAvgPct,
      bySupplier,
    })
  }

  return summaries.sort((a, b) => (b.diffPct ?? -Infinity) - (a.diffPct ?? -Infinity))
}
