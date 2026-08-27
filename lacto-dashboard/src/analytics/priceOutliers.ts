import { db } from '../db/db'
import { loadFilteredTransactions } from './filterRows'
import type { GlobalFilters } from './filters'

export interface ClientPriceRow {
  clientId: number | null
  clientName: string
  value: number
  quantity: number
  avgPrice: number
  deviationPercent: number
  isOutlier: boolean
}

export interface ProductPriceAnalysis {
  productId: number
  productName: string
  minPrice: number | null
  maxPrice: number | null
  medianPrice: number | null
  weightedAvgPrice: number | null
  rows: ClientPriceRow[]
}

const OUTLIER_THRESHOLD = 15 // % abatere fata de media ponderata

/**
 * Analiza prețurilor (spec §25): pentru un produs, prețul mediu plătit de
 * fiecare client, cu abaterea față de media ponderată și marcarea outlierilor.
 */
export async function computeProductPriceAnalysis(productId: number, filters: GlobalFilters): Promise<ProductPriceAnalysis | null> {
  const product = await db.products.get(productId)
  if (!product) return null

  const [tx, clients] = await Promise.all([loadFilteredTransactions(filters), db.clients.toArray()])
  const clientNameById = new Map(clients.map((c) => [c.id!, c.canonicalName]))

  const productTx = tx.filter((t) => t.canonicalProductId === productId && (t.quantity ?? 0) > 0)
  const totalValue = productTx.reduce((s, t) => s + (t.value ?? 0), 0)
  const totalQuantity = productTx.reduce((s, t) => s + (t.quantity ?? 0), 0)
  const weightedAvgPrice = totalQuantity > 0 ? totalValue / totalQuantity : null

  const unitPrices = productTx.map((t) => (t.value ?? 0) / (t.quantity ?? 1)).sort((a, b) => a - b)
  const minPrice = unitPrices.length > 0 ? unitPrices[0] : null
  const maxPrice = unitPrices.length > 0 ? unitPrices[unitPrices.length - 1] : null
  const medianPrice = unitPrices.length > 0 ? unitPrices[Math.floor(unitPrices.length / 2)] : null

  const byClient = new Map<number | null, { value: number; quantity: number }>()
  for (const t of productTx) {
    const acc = byClient.get(t.canonicalClientId) ?? { value: 0, quantity: 0 }
    acc.value += t.value ?? 0
    acc.quantity += t.quantity ?? 0
    byClient.set(t.canonicalClientId, acc)
  }

  const rows: ClientPriceRow[] = [...byClient.entries()].map(([clientId, acc]) => {
    const avgPrice = acc.quantity > 0 ? acc.value / acc.quantity : 0
    const deviationPercent = weightedAvgPrice && weightedAvgPrice > 0 ? ((avgPrice - weightedAvgPrice) / weightedAvgPrice) * 100 : 0
    return {
      clientId,
      clientName: clientId !== null ? (clientNameById.get(clientId) ?? '—') : 'Neidentificat',
      value: acc.value,
      quantity: acc.quantity,
      avgPrice,
      deviationPercent,
      isOutlier: Math.abs(deviationPercent) >= OUTLIER_THRESHOLD,
    }
  })
  rows.sort((a, b) => a.deviationPercent - b.deviationPercent)

  return { productId, productName: product.canonicalName, minPrice, maxPrice, medianPrice, weightedAvgPrice, rows }
}
