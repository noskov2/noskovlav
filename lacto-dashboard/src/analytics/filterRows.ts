import { db } from '../db/db'
import type { GlobalFilters } from './filters'
import type { TransactionRecord } from '../types'

/**
 * Interoghează `transactions` pe intervalul de perioadă (index pe `date`) și
 * aplică restul filtrelor globale (spec §14). Partajat de toate motoarele de
 * agregare, ca predicatul de filtrare să rămână un singur loc de adevăr.
 */
export async function loadFilteredTransactions(filters: GlobalFilters): Promise<TransactionRecord[]> {
  const rows = await db.transactions.where('date').between(filters.period.start, filters.period.end, true, true).toArray()
  if (rows.length === 0) return []

  const categoryProductIds = await resolveCategoryProductIds(filters.categoryIds)

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

  return rows.filter(passesFilters)
}

async function resolveCategoryProductIds(categoryIds: number[]): Promise<Set<number> | null> {
  if (categoryIds.length === 0) return null
  const products = await db.products.where('categoryId').anyOf(categoryIds).toArray()
  return new Set(products.map((p) => p.id!))
}
