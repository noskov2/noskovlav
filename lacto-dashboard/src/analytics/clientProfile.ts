import { db } from '../db/db'
import type { GlobalFilters } from './filters'
import type { BreakdownRow } from './aggregate'

const NO_CATEGORY_LABEL = 'Fără categorie'

export interface CategoryTrend {
  id: number | null
  name: string
  value: number
  previousValue: number
  diffPercent: number | null
}

export interface ClientProfile {
  clientId: number
  canonicalName: string

  totalValue: number
  totalQuantity: number
  orderCount: number
  orderCountIsDocumentBased: boolean
  avgOrderValue: number
  distinctProducts: number
  avgPricePerUnit: number | null

  firstPurchaseDate: string | null
  lastPurchaseDate: string | null
  avgFrequencyDays: number | null

  previousTotalValue: number | null
  yoyGrowthPercent: number | null

  monthlyEvolution: { year: number; month: number; value: number; quantity: number }[]
  topProducts: BreakdownRow[]
  topCategories: BreakdownRow[]

  productsLost: string[]
  productsNew: string[]
  categoriesGrowing: CategoryTrend[]
  categoriesDeclining: CategoryTrend[]
}

/**
 * Client 360° (spec §17). KPI-urile de perioadă (valoare, cantitate, top
 * produse/categorii, evoluție) respectă filtrele globale curente; prima/
 * ultima achiziție și frecvența medie sunt calculate pe TOATĂ istoria
 * clientului (fapte de-a lungul întregii relații, nu doar din perioada
 * selectată).
 */
export async function computeClientProfile(clientId: number, filters: GlobalFilters): Promise<ClientProfile | null> {
  const client = await db.clients.get(clientId)
  if (!client) return null

  const [allTx, currentTx, previousTx, products, categories] = await Promise.all([
    fullClientScan(clientId),
    scanClientPeriod(clientId, filters.period.start, filters.period.end),
    filters.comparisonPeriod ? scanClientPeriod(clientId, filters.comparisonPeriod.start, filters.comparisonPeriod.end) : Promise.resolve(null),
    db.products.toArray(),
    db.categories.toArray(),
  ])

  const productNameById = new Map(products.map((p) => [p.id!, p.canonicalName]))
  const productCategoryById = new Map(products.map((p) => [p.id!, p.categoryId ?? null]))
  const categoryNameById = new Map(categories.map((c) => [c.id!, c.name]))

  // --- fapte lifetime (toată istoria) ---
  const dates = [...new Set(allTx.map((t) => t.date))].sort()
  const firstPurchaseDate = dates[0] ?? null
  const lastPurchaseDate = dates[dates.length - 1] ?? null
  let avgFrequencyDays: number | null = null
  if (dates.length > 1) {
    const first = new Date(dates[0]).getTime()
    const last = new Date(dates[dates.length - 1]).getTime()
    avgFrequencyDays = (last - first) / 86400000 / (dates.length - 1)
  }

  // --- KPI perioadă curentă ---
  const totalValue = sum(currentTx, (t) => t.value ?? 0)
  const totalQuantity = sum(currentTx, (t) => t.quantity ?? 0)
  const hasDocumentNo = currentTx.some((t) => t.documentNo)
  const orderCount = hasDocumentNo ? new Set(currentTx.map((t) => t.documentNo).filter(Boolean)).size : currentTx.length
  const distinctProductIds = new Set(currentTx.map((t) => t.canonicalProductId).filter((id): id is number => id !== null))

  const previousTotalValue = previousTx ? sum(previousTx, (t) => t.value ?? 0) : null
  const yoyGrowthPercent =
    previousTotalValue !== null && previousTotalValue !== 0 ? ((totalValue - previousTotalValue) / previousTotalValue) * 100 : null

  // --- breakdown-uri perioadă curentă ---
  const productAcc = new Map<number | null, BreakdownRow>()
  const categoryAcc = new Map<number | null, BreakdownRow>()
  const monthAcc = new Map<string, { year: number; month: number; value: number; quantity: number }>()

  for (const t of currentTx) {
    const value = t.value ?? 0
    const quantity = t.quantity ?? 0

    bumpRow(productAcc, t.canonicalProductId, t.canonicalProductId !== null ? (productNameById.get(t.canonicalProductId) ?? t.productRaw) : t.productRaw, value, quantity)

    const catId = t.canonicalProductId !== null ? (productCategoryById.get(t.canonicalProductId) ?? null) : null
    const catName = catId !== null ? (categoryNameById.get(catId) ?? 'Categorie ștearsă') : NO_CATEGORY_LABEL
    bumpRow(categoryAcc, catId, catName, value, quantity)

    const key = `${t.year}-${t.month}`
    let m = monthAcc.get(key)
    if (!m) {
      m = { year: t.year, month: t.month, value: 0, quantity: 0 }
      monthAcc.set(key, m)
    }
    m.value += value
    m.quantity += quantity
  }

  // --- comparație produse/categorii vs. perioada de comparație ---
  const currentProductNames = new Set(currentTx.map((t) => (t.canonicalProductId !== null ? productNameById.get(t.canonicalProductId) ?? t.productRaw : t.productRaw)))
  const previousProductNames = new Set((previousTx ?? []).map((t) => (t.canonicalProductId !== null ? productNameById.get(t.canonicalProductId) ?? t.productRaw : t.productRaw)))
  const productsLost = previousTx ? [...previousProductNames].filter((n) => !currentProductNames.has(n)) : []
  const productsNew = previousTx ? [...currentProductNames].filter((n) => !previousProductNames.has(n)) : []

  const previousCategoryAcc = new Map<number | null, number>()
  for (const t of previousTx ?? []) {
    const catId = t.canonicalProductId !== null ? (productCategoryById.get(t.canonicalProductId) ?? null) : null
    previousCategoryAcc.set(catId, (previousCategoryAcc.get(catId) ?? 0) + (t.value ?? 0))
  }
  const categoryTrends: CategoryTrend[] = previousTx
    ? [...categoryAcc.values()].map((r) => {
        const previousValue = previousCategoryAcc.get(r.id) ?? 0
        const diffPercent = previousValue > 0 ? ((r.value - previousValue) / previousValue) * 100 : r.value > 0 ? null : 0
        return { id: r.id, name: r.name, value: r.value, previousValue, diffPercent }
      })
    : []

  return {
    clientId,
    canonicalName: client.canonicalName,
    totalValue,
    totalQuantity,
    orderCount,
    orderCountIsDocumentBased: hasDocumentNo,
    avgOrderValue: orderCount > 0 ? totalValue / orderCount : 0,
    distinctProducts: distinctProductIds.size,
    avgPricePerUnit: totalQuantity > 0 ? totalValue / totalQuantity : null,
    firstPurchaseDate,
    lastPurchaseDate,
    avgFrequencyDays,
    previousTotalValue,
    yoyGrowthPercent,
    monthlyEvolution: [...monthAcc.values()].sort((a, b) => a.year - b.year || a.month - b.month),
    topProducts: [...productAcc.values()].sort((a, b) => b.value - a.value).slice(0, 10),
    topCategories: [...categoryAcc.values()].sort((a, b) => b.value - a.value),
    productsLost,
    productsNew,
    categoriesGrowing: categoryTrends.filter((c) => (c.diffPercent ?? 0) > 0).sort((a, b) => (b.diffPercent ?? 0) - (a.diffPercent ?? 0)),
    categoriesDeclining: categoryTrends.filter((c) => (c.diffPercent ?? 0) < 0).sort((a, b) => (a.diffPercent ?? 0) - (b.diffPercent ?? 0)),
  }
}

async function scanClientPeriod(clientId: number, start: string, end: string) {
  return db.transactions.where('date').between(start, end, true, true).and((t) => t.canonicalClientId === clientId).toArray()
}

/** canonicalClientId nu e indexat (operație rară, nu justifică un index în plus pe calea de import). */
async function fullClientScan(clientId: number) {
  return db.transactions.toCollection().filter((t) => t.canonicalClientId === clientId).toArray()
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
