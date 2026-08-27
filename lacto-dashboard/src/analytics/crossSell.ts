import { db } from '../db/db'
import { loadFilteredTransactions } from './filterRows'
import type { GlobalFilters } from './filters'

export interface CategoryShare {
  id: number | null
  name: string
  value: number
  share: number
}

export interface Opportunity {
  id: number
  name: string
  peerValue: number
  peerClientCount: number
}

export interface CrossSellResult {
  clientId: number
  clientName: string
  primaryChannel: string | null
  peerCount: number
  purchasedCategories: CategoryShare[]
  opportunities: Opportunity[]
}

const NO_CATEGORY_LABEL = 'Fără categorie'

/**
 * Cross-sell / white space (spec §23), scopat la un singur client (varianta
 * acționabilă a matricei client×categorie): ce cumpără clientul, și ce
 * cumpără clienți similari (același canal principal) dar el nu — oportunități
 * comerciale concrete, nu doar o matrice brută.
 */
export async function computeCrossSell(clientId: number, filters: GlobalFilters): Promise<CrossSellResult | null> {
  const client = await db.clients.get(clientId)
  if (!client) return null

  const [tx, products, categories] = await Promise.all([loadFilteredTransactions(filters), db.products.toArray(), db.categories.toArray()])
  const productCategoryById = new Map(products.map((p) => [p.id!, p.categoryId ?? null]))
  const categoryNameById = new Map(categories.map((c) => [c.id!, c.name]))

  const clientTx = tx.filter((t) => t.canonicalClientId === clientId)
  if (clientTx.length === 0) {
    return { clientId, clientName: client.canonicalName, primaryChannel: null, peerCount: 0, purchasedCategories: [], opportunities: [] }
  }

  const channelValue = new Map<string, number>()
  for (const t of clientTx) channelValue.set(t.channel, (channelValue.get(t.channel) ?? 0) + (t.value ?? 0))
  const primaryChannel = [...channelValue.entries()].sort((a, b) => b[1] - a[1])[0][0]

  const purchasedAcc = new Map<number | null, number>()
  let clientTotal = 0
  for (const t of clientTx) {
    const catId = t.canonicalProductId !== null ? (productCategoryById.get(t.canonicalProductId) ?? null) : null
    purchasedAcc.set(catId, (purchasedAcc.get(catId) ?? 0) + (t.value ?? 0))
    clientTotal += t.value ?? 0
  }
  const purchasedCategoryIds = new Set(purchasedAcc.keys())
  const purchasedCategories: CategoryShare[] = [...purchasedAcc.entries()]
    .map(([id, value]) => ({ id, name: id !== null ? (categoryNameById.get(id) ?? 'Categorie ștearsă') : NO_CATEGORY_LABEL, value, share: clientTotal > 0 ? (value / clientTotal) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)

  const peers = tx.filter((t) => t.canonicalClientId !== null && t.canonicalClientId !== clientId && t.channel === primaryChannel)
  const peerClientIds = new Set(peers.map((t) => t.canonicalClientId))

  const opportunityAcc = new Map<number, { value: number; clientIds: Set<number> }>()
  for (const t of peers) {
    const catId = t.canonicalProductId !== null ? (productCategoryById.get(t.canonicalProductId) ?? null) : null
    if (catId === null || purchasedCategoryIds.has(catId)) continue
    const acc = opportunityAcc.get(catId) ?? { value: 0, clientIds: new Set() }
    acc.value += t.value ?? 0
    if (t.canonicalClientId !== null) acc.clientIds.add(t.canonicalClientId)
    opportunityAcc.set(catId, acc)
  }
  const opportunities: Opportunity[] = [...opportunityAcc.entries()]
    .map(([id, acc]) => ({ id, name: categoryNameById.get(id) ?? 'Categorie ștearsă', peerValue: acc.value, peerClientCount: acc.clientIds.size }))
    .sort((a, b) => b.peerValue - a.peerValue)

  return { clientId, clientName: client.canonicalName, primaryChannel, peerCount: peerClientIds.size, purchasedCategories, opportunities }
}
