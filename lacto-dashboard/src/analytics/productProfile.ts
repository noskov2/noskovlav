import { db } from '../db/db'
import type { GlobalFilters } from './filters'
import type { BreakdownRow } from './aggregate'

export interface ProductProfile {
  productId: number
  canonicalName: string

  totalValue: number
  totalQuantity: number
  distinctClients: number
  avgPricePerUnit: number | null
  shareOfCompanyTotal: number | null

  minPrice: number | null
  maxPrice: number | null
  medianPrice: number | null

  topClients: BreakdownRow[]
  topChannels: BreakdownRow[]
  monthlyEvolution: { year: number; month: number; value: number; quantity: number }[]

  clientsLost: string[]
}

/**
 * Produs 360° (spec §18). KPI-urile respectă filtrele globale curente
 * (perioadă, canal etc., dar nu filtrul de produs — acesta e fixat de pagină).
 */
export async function computeProductProfile(productId: number, filters: GlobalFilters): Promise<ProductProfile | null> {
  const product = await db.products.get(productId)
  if (!product) return null

  const [currentTx, previousTx, companyTotalTx, clients] = await Promise.all([
    scanProductPeriod(productId, filters.period.start, filters.period.end),
    filters.comparisonPeriod ? scanProductPeriod(productId, filters.comparisonPeriod.start, filters.comparisonPeriod.end) : Promise.resolve(null),
    db.transactions.where('date').between(filters.period.start, filters.period.end, true, true).toArray(),
    db.clients.toArray(),
  ])

  const clientNameById = new Map(clients.map((c) => [c.id!, c.canonicalName]))

  const totalValue = sum(currentTx, (t) => t.value ?? 0)
  const totalQuantity = sum(currentTx, (t) => t.quantity ?? 0)
  const distinctClients = new Set(currentTx.map((t) => t.canonicalClientId).filter((id): id is number => id !== null)).size

  const companyTotalValue = sum(companyTotalTx, (t) => t.value ?? 0)
  const shareOfCompanyTotal = companyTotalValue > 0 ? (totalValue / companyTotalValue) * 100 : null

  const unitPrices = currentTx.filter((t) => (t.quantity ?? 0) > 0).map((t) => (t.value ?? 0) / (t.quantity ?? 1))
  const sortedPrices = [...unitPrices].sort((a, b) => a - b)
  const minPrice = sortedPrices.length > 0 ? sortedPrices[0] : null
  const maxPrice = sortedPrices.length > 0 ? sortedPrices[sortedPrices.length - 1] : null
  const medianPrice = sortedPrices.length > 0 ? sortedPrices[Math.floor(sortedPrices.length / 2)] : null

  const clientAcc = new Map<number | null, BreakdownRow>()
  const channelAcc = new Map<string, BreakdownRow>()
  const monthAcc = new Map<string, { year: number; month: number; value: number; quantity: number }>()

  for (const t of currentTx) {
    const value = t.value ?? 0
    const quantity = t.quantity ?? 0

    bumpRow(clientAcc, t.canonicalClientId, t.canonicalClientId !== null ? (clientNameById.get(t.canonicalClientId) ?? t.clientRaw) : t.clientRaw, value, quantity)

    let ch = channelAcc.get(t.channel)
    if (!ch) {
      ch = { id: null, name: t.channel, value: 0, quantity: 0, count: 0, distinctClients: 0, distinctProducts: 0 }
      channelAcc.set(t.channel, ch)
    }
    ch.value += value
    ch.quantity += quantity
    ch.count += 1

    const key = `${t.year}-${t.month}`
    let m = monthAcc.get(key)
    if (!m) {
      m = { year: t.year, month: t.month, value: 0, quantity: 0 }
      monthAcc.set(key, m)
    }
    m.value += value
    m.quantity += quantity
  }

  const currentClientNames = new Set(currentTx.map((t) => (t.canonicalClientId !== null ? clientNameById.get(t.canonicalClientId) ?? t.clientRaw : t.clientRaw)))
  const clientsLost = previousTx
    ? [...new Set(previousTx.map((t) => (t.canonicalClientId !== null ? clientNameById.get(t.canonicalClientId) ?? t.clientRaw : t.clientRaw)))].filter(
        (n) => !currentClientNames.has(n),
      )
    : []

  return {
    productId,
    canonicalName: product.canonicalName,
    totalValue,
    totalQuantity,
    distinctClients,
    avgPricePerUnit: totalQuantity > 0 ? totalValue / totalQuantity : null,
    shareOfCompanyTotal,
    minPrice,
    maxPrice,
    medianPrice,
    topClients: [...clientAcc.values()].sort((a, b) => b.value - a.value).slice(0, 10),
    topChannels: [...channelAcc.values()].sort((a, b) => b.value - a.value),
    monthlyEvolution: [...monthAcc.values()].sort((a, b) => a.year - b.year || a.month - b.month),
    clientsLost,
  }
}

async function scanProductPeriod(productId: number, start: string, end: string) {
  return db.transactions.where('date').between(start, end, true, true).and((t) => t.canonicalProductId === productId).toArray()
}

function sum<T>(arr: T[], fn: (t: T) => number): number {
  return arr.reduce((s, t) => s + fn(t), 0)
}

function bumpRow(map: Map<number | null, BreakdownRow>, id: number | null, name: string, value: number, quantity: number) {
  let row = map.get(id)
  if (!row) {
    row = { id, name, value: 0, quantity: 0, count: 0, distinctClients: 0, distinctProducts: 0 }
    map.set(id, row)
  }
  row.value += value
  row.quantity += quantity
  row.count += 1
}
