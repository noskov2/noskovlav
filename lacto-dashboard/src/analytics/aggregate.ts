import { db } from '../db/db'
import type { GlobalFilters } from './filters'
import type { TransactionRecord } from '../types'

const UNIDENTIFIED_LABEL = 'Neidentificat'
const NO_CATEGORY_LABEL = 'Fără categorie'

export interface BreakdownRow {
  id: number | null
  name: string
  value: number
  quantity: number
  count: number
}

export interface MonthRow {
  year: number
  month: number
  value: number
  quantity: number
  count: number
}

export interface AggregateResult {
  totalValue: number
  totalQuantity: number
  transactionCount: number
  distinctClients: number
  distinctProducts: number
  avgValuePerTransaction: number
  avgValuePerClient: number
  avgPricePerUnit: number | null

  byChannel: BreakdownRow[]
  byClient: BreakdownRow[]
  byProduct: BreakdownRow[]
  byCategory: BreakdownRow[]
  byMonth: MonthRow[]
}

function emptyResult(): AggregateResult {
  return {
    totalValue: 0,
    totalQuantity: 0,
    transactionCount: 0,
    distinctClients: 0,
    distinctProducts: 0,
    avgValuePerTransaction: 0,
    avgValuePerClient: 0,
    avgPricePerUnit: null,
    byChannel: [],
    byClient: [],
    byProduct: [],
    byCategory: [],
    byMonth: [],
  }
}

function bump(map: Map<number | null, BreakdownRow>, key: number | null, name: string, value: number, quantity: number) {
  let row = map.get(key)
  if (!row) {
    row = { id: key, name, value: 0, quantity: 0, count: 0 }
    map.set(key, row)
  }
  row.value += value
  row.quantity += quantity
  row.count += 1
}

/**
 * Calculează KPI-uri și breakdown-uri pentru filtrele date, direct din
 * `transactions` (spec §13-15). Interogarea folosește indexul pe `date`
 * pentru a restrânge rapid la perioada selectată, apoi restul filtrelor și
 * agregările se fac într-un singur pass în memorie.
 *
 * Notă de performanță: la sute de mii de rânduri, un scan mărginit de
 * interval e suficient de rapid pentru un dashboard (sub o secundă în
 * browser real). Agregări precompute zilnice/lunare (spec §34) rămân de
 * adăugat când volumul real o cere — nu sunt construite încă.
 */
export async function computeAggregate(filters: GlobalFilters): Promise<AggregateResult> {
  const rows = await db.transactions.where('date').between(filters.period.start, filters.period.end, true, true).toArray()
  if (rows.length === 0) return emptyResult()

  const [clients, products, categories, categoryProductIds] = await Promise.all([
    db.clients.toArray(),
    db.products.toArray(),
    db.categories.toArray(),
    resolveCategoryProductIds(filters.categoryIds),
  ])
  const clientNameById = new Map(clients.map((c) => [c.id!, c.canonicalName]))
  const productNameById = new Map(products.map((p) => [p.id!, p.canonicalName]))
  const productCategoryById = new Map(products.map((p) => [p.id!, p.categoryId ?? null]))
  const categoryNameById = new Map(categories.map((c) => [c.id!, c.name]))

  const channelSet = filters.channels.length > 0 ? new Set(filters.channels) : null
  const clientSet = filters.clientIds.length > 0 ? new Set(filters.clientIds) : null
  const productSet = filters.productIds.length > 0 ? new Set(filters.productIds) : null
  const countySet = filters.counties.length > 0 ? new Set(filters.counties) : null
  const localitySet = filters.localities.length > 0 ? new Set(filters.localities) : null
  const agentSet = filters.agents.length > 0 ? new Set(filters.agents) : null

  function passesFilters(t: TransactionRecord): boolean {
    if (channelSet && !channelSet.has(t.channel)) return false
    if (clientSet && (t.canonicalClientId === null || !clientSet.has(t.canonicalClientId))) return false
    if (productSet && (t.canonicalProductId === null || !productSet.has(t.canonicalProductId))) return false
    if (categoryProductIds && (t.canonicalProductId === null || !categoryProductIds.has(t.canonicalProductId))) return false
    if (countySet && (!t.county || !countySet.has(t.county))) return false
    if (localitySet && (!t.locality || !localitySet.has(t.locality))) return false
    if (agentSet && (!t.agent || !agentSet.has(t.agent))) return false
    return true
  }

  let totalValue = 0
  let totalQuantity = 0
  let transactionCount = 0
  const distinctClients = new Set<number>()
  const distinctProducts = new Set<number>()

  const channelByName = new Map<string, BreakdownRow>()
  const clientAcc = new Map<number | null, BreakdownRow>()
  const productAcc = new Map<number | null, BreakdownRow>()
  const categoryAcc = new Map<number | null, BreakdownRow>()
  const monthAcc = new Map<string, MonthRow>()

  for (const t of rows) {
    if (!passesFilters(t)) continue

    const value = t.value ?? 0
    const quantity = t.quantity ?? 0

    totalValue += value
    totalQuantity += quantity
    transactionCount += 1
    if (t.canonicalClientId !== null) distinctClients.add(t.canonicalClientId)
    if (t.canonicalProductId !== null) distinctProducts.add(t.canonicalProductId)

    let channelRow = channelByName.get(t.channel)
    if (!channelRow) {
      channelRow = { id: null, name: t.channel, value: 0, quantity: 0, count: 0 }
      channelByName.set(t.channel, channelRow)
    }
    channelRow.value += value
    channelRow.quantity += quantity
    channelRow.count += 1

    const clientName = t.canonicalClientId !== null ? (clientNameById.get(t.canonicalClientId) ?? t.clientRaw) : UNIDENTIFIED_LABEL
    bump(clientAcc, t.canonicalClientId, clientName, value, quantity)

    const productName = t.canonicalProductId !== null ? (productNameById.get(t.canonicalProductId) ?? t.productRaw) : UNIDENTIFIED_LABEL
    bump(productAcc, t.canonicalProductId, productName, value, quantity)

    const categoryId = t.canonicalProductId !== null ? (productCategoryById.get(t.canonicalProductId) ?? null) : null
    const categoryName = categoryId !== null ? (categoryNameById.get(categoryId) ?? 'Categorie ștearsă') : NO_CATEGORY_LABEL
    bump(categoryAcc, categoryId, categoryName, value, quantity)

    const monthKey = `${t.year}-${t.month}`
    let monthRow = monthAcc.get(monthKey)
    if (!monthRow) {
      monthRow = { year: t.year, month: t.month, value: 0, quantity: 0, count: 0 }
      monthAcc.set(monthKey, monthRow)
    }
    monthRow.value += value
    monthRow.quantity += quantity
    monthRow.count += 1
  }

  return {
    totalValue,
    totalQuantity,
    transactionCount,
    distinctClients: distinctClients.size,
    distinctProducts: distinctProducts.size,
    avgValuePerTransaction: transactionCount > 0 ? totalValue / transactionCount : 0,
    avgValuePerClient: distinctClients.size > 0 ? totalValue / distinctClients.size : 0,
    avgPricePerUnit: totalQuantity > 0 ? totalValue / totalQuantity : null,
    byChannel: [...channelByName.values()].sort((a, b) => b.value - a.value),
    byClient: [...clientAcc.values()].sort((a, b) => b.value - a.value),
    byProduct: [...productAcc.values()].sort((a, b) => b.value - a.value),
    byCategory: [...categoryAcc.values()].sort((a, b) => b.value - a.value),
    byMonth: [...monthAcc.values()].sort((a, b) => a.year - b.year || a.month - b.month),
  }
}

async function resolveCategoryProductIds(categoryIds: number[]): Promise<Set<number> | null> {
  if (categoryIds.length === 0) return null
  const products = await db.products.where('categoryId').anyOf(categoryIds).toArray()
  return new Set(products.map((p) => p.id!))
}
