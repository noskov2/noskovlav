import { db } from '../db/db'
import { loadFilteredTransactions } from './filterRows'
import type { GlobalFilters } from './filters'

const UNIDENTIFIED_LABEL = 'Neidentificat'
const NO_CATEGORY_LABEL = 'Fără categorie'

export interface BreakdownRow {
  id: number | null
  name: string
  value: number
  quantity: number
  count: number
  /** Câți clienți distincți compun acest rând (nesemnificativ pentru byClient — mereu 1). */
  distinctClients: number
  /** Câte produse distincte compun acest rând (nesemnificativ pentru byProduct — mereu 1). */
  distinctProducts: number
}

export interface MonthRow {
  year: number
  month: number
  value: number
  quantity: number
  count: number
  distinctClients: number
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

interface GroupAcc {
  id: number | null
  name: string
  value: number
  quantity: number
  count: number
  clientIds: Set<number>
  productIds: Set<number>
}

function bump(
  map: Map<number | null, GroupAcc>,
  key: number | null,
  name: string,
  value: number,
  quantity: number,
  clientId: number | null,
  productId: number | null,
) {
  let row = map.get(key)
  if (!row) {
    row = { id: key, name, value: 0, quantity: 0, count: 0, clientIds: new Set(), productIds: new Set() }
    map.set(key, row)
  }
  row.value += value
  row.quantity += quantity
  row.count += 1
  if (clientId !== null) row.clientIds.add(clientId)
  if (productId !== null) row.productIds.add(productId)
}

function finalize(map: Map<number | null, GroupAcc>): BreakdownRow[] {
  return [...map.values()]
    .map((r) => ({
      id: r.id,
      name: r.name,
      value: r.value,
      quantity: r.quantity,
      count: r.count,
      distinctClients: r.clientIds.size,
      distinctProducts: r.productIds.size,
    }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Calculează KPI-uri și breakdown-uri pentru filtrele date, direct din
 * `transactions` (spec §13-16). Interogarea folosește indexul pe `date`
 * pentru a restrânge rapid la perioada selectată, apoi restul filtrelor și
 * agregările se fac într-un singur pass în memorie.
 *
 * Notă de performanță: la sute de mii de rânduri, un scan mărginit de
 * interval e suficient de rapid pentru un dashboard (sub o secundă în
 * browser real). Agregări precompute zilnice/lunare (spec §34) rămân de
 * adăugat când volumul real o cere — nu sunt construite încă.
 */
export async function computeAggregate(filters: GlobalFilters): Promise<AggregateResult> {
  const rows = await loadFilteredTransactions(filters)
  if (rows.length === 0) return emptyResult()

  const [clients, products, categories] = await Promise.all([db.clients.toArray(), db.products.toArray(), db.categories.toArray()])
  const clientNameById = new Map(clients.map((c) => [c.id!, c.canonicalName]))
  const productNameById = new Map(products.map((p) => [p.id!, p.canonicalName]))
  const productCategoryById = new Map(products.map((p) => [p.id!, p.categoryId ?? null]))
  const categoryNameById = new Map(categories.map((c) => [c.id!, c.name]))

  let totalValue = 0
  let totalQuantity = 0
  let transactionCount = 0
  const distinctClients = new Set<number>()
  const distinctProducts = new Set<number>()

  const channelByName = new Map<string, GroupAcc>()
  const clientAcc = new Map<number | null, GroupAcc>()
  const productAcc = new Map<number | null, GroupAcc>()
  const categoryAcc = new Map<number | null, GroupAcc>()
  const monthAcc = new Map<string, GroupAcc & { year: number; month: number }>()

  for (const t of rows) {
    const value = t.value ?? 0
    const quantity = t.quantity ?? 0
    const clientId = t.canonicalClientId
    const productId = t.canonicalProductId

    totalValue += value
    totalQuantity += quantity
    transactionCount += 1
    if (clientId !== null) distinctClients.add(clientId)
    if (productId !== null) distinctProducts.add(productId)

    let channelRow = channelByName.get(t.channel)
    if (!channelRow) {
      channelRow = { id: null, name: t.channel, value: 0, quantity: 0, count: 0, clientIds: new Set(), productIds: new Set() }
      channelByName.set(t.channel, channelRow)
    }
    channelRow.value += value
    channelRow.quantity += quantity
    channelRow.count += 1
    if (clientId !== null) channelRow.clientIds.add(clientId)
    if (productId !== null) channelRow.productIds.add(productId)

    const clientName = clientId !== null ? (clientNameById.get(clientId) ?? t.clientRaw) : UNIDENTIFIED_LABEL
    bump(clientAcc, clientId, clientName, value, quantity, clientId, productId)

    const productName = productId !== null ? (productNameById.get(productId) ?? t.productRaw) : UNIDENTIFIED_LABEL
    bump(productAcc, productId, productName, value, quantity, clientId, productId)

    const categoryId = productId !== null ? (productCategoryById.get(productId) ?? null) : null
    const categoryName = categoryId !== null ? (categoryNameById.get(categoryId) ?? 'Categorie ștearsă') : NO_CATEGORY_LABEL
    bump(categoryAcc, categoryId, categoryName, value, quantity, clientId, productId)

    const monthKey = `${t.year}-${t.month}`
    let monthRow = monthAcc.get(monthKey)
    if (!monthRow) {
      monthRow = {
        id: null,
        name: monthKey,
        year: t.year,
        month: t.month,
        value: 0,
        quantity: 0,
        count: 0,
        clientIds: new Set(),
        productIds: new Set(),
      }
      monthAcc.set(monthKey, monthRow)
    }
    monthRow.value += value
    monthRow.quantity += quantity
    monthRow.count += 1
    if (clientId !== null) monthRow.clientIds.add(clientId)
    if (productId !== null) monthRow.productIds.add(productId)
  }

  const byChannel = [...channelByName.values()]
    .map((r) => ({
      id: r.id,
      name: r.name,
      value: r.value,
      quantity: r.quantity,
      count: r.count,
      distinctClients: r.clientIds.size,
      distinctProducts: r.productIds.size,
    }))
    .sort((a, b) => b.value - a.value)

  const byMonth: MonthRow[] = [...monthAcc.values()]
    .map((r) => ({ year: r.year, month: r.month, value: r.value, quantity: r.quantity, count: r.count, distinctClients: r.clientIds.size }))
    .sort((a, b) => a.year - b.year || a.month - b.month)

  return {
    totalValue,
    totalQuantity,
    transactionCount,
    distinctClients: distinctClients.size,
    distinctProducts: distinctProducts.size,
    avgValuePerTransaction: transactionCount > 0 ? totalValue / transactionCount : 0,
    avgValuePerClient: distinctClients.size > 0 ? totalValue / distinctClients.size : 0,
    avgPricePerUnit: totalQuantity > 0 ? totalValue / totalQuantity : null,
    byChannel,
    byClient: finalize(clientAcc),
    byProduct: finalize(productAcc),
    byCategory: finalize(categoryAcc),
    byMonth,
  }
}
