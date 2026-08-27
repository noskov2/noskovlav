import { db } from '../db/db'
import { loadFilteredTransactions } from './filterRows'
import type { GlobalFilters } from './filters'
import type { BreakdownRow } from './aggregate'

export type ReportDimension = 'client' | 'product' | 'category' | 'channel' | 'month' | 'county' | 'locality' | 'agent'

export const REPORT_DIMENSIONS: { id: ReportDimension; label: string }[] = [
  { id: 'client', label: 'Client' },
  { id: 'product', label: 'Produs' },
  { id: 'category', label: 'Categorie' },
  { id: 'channel', label: 'Canal' },
  { id: 'month', label: 'Lună' },
  { id: 'county', label: 'Județ' },
  { id: 'locality', label: 'Localitate' },
  { id: 'agent', label: 'Agent' },
]

const UNSPECIFIED_LABEL = 'Nespecificat'
const UNIDENTIFIED_LABEL = 'Neidentificat'
const NO_CATEGORY_LABEL = 'Fără categorie'

const MONTH_NAMES = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]

interface Acc {
  id: number | null
  name: string
  value: number
  quantity: number
  count: number
  clientIds: Set<number>
  productIds: Set<number>
  sortKey: number
}

/**
 * Motor generic de breakdown (spec §29): agregă tranzacțiile filtrate pe
 * ORICE dimensiune cerută de Generatorul de rapoarte, inclusiv câmpurile
 * geografice/agent care nu au un nomenclator propriu (grupare directă pe
 * textul brut din tranzacție, cu eticheta „Nespecificat" pentru gol).
 */
export async function computeGenericBreakdown(filters: GlobalFilters, dimension: ReportDimension): Promise<BreakdownRow[]> {
  const rows = await loadFilteredTransactions(filters)
  if (rows.length === 0) return []

  let clientNameById: Map<number, string> | null = null
  let productNameById: Map<number, string> | null = null
  let productCategoryById: Map<number, number | null> | null = null
  let categoryNameById: Map<number, string> | null = null

  if (dimension === 'client' || dimension === 'product' || dimension === 'category') {
    const [clients, products, categories] = await Promise.all([db.clients.toArray(), db.products.toArray(), db.categories.toArray()])
    clientNameById = new Map(clients.map((c) => [c.id!, c.canonicalName]))
    productNameById = new Map(products.map((p) => [p.id!, p.canonicalName]))
    productCategoryById = new Map(products.map((p) => [p.id!, p.categoryId ?? null]))
    categoryNameById = new Map(categories.map((c) => [c.id!, c.name]))
  }

  const acc = new Map<string, Acc>()

  function bump(
    key: string,
    id: number | null,
    name: string,
    value: number,
    quantity: number,
    clientId: number | null,
    productId: number | null,
    sortKey: number,
  ) {
    let r = acc.get(key)
    if (!r) {
      r = { id, name, value: 0, quantity: 0, count: 0, clientIds: new Set(), productIds: new Set(), sortKey }
      acc.set(key, r)
    }
    r.value += value
    r.quantity += quantity
    r.count += 1
    if (clientId !== null) r.clientIds.add(clientId)
    if (productId !== null) r.productIds.add(productId)
  }

  for (const t of rows) {
    const value = t.value ?? 0
    const quantity = t.quantity ?? 0
    const clientId = t.canonicalClientId
    const productId = t.canonicalProductId

    switch (dimension) {
      case 'client': {
        const name = clientId !== null ? (clientNameById!.get(clientId) ?? t.clientRaw) : UNIDENTIFIED_LABEL
        bump(clientId === null ? 'null' : `c${clientId}`, clientId, name, value, quantity, clientId, productId, 0)
        break
      }
      case 'product': {
        const name = productId !== null ? (productNameById!.get(productId) ?? t.productRaw) : UNIDENTIFIED_LABEL
        bump(productId === null ? 'null' : `p${productId}`, productId, name, value, quantity, clientId, productId, 0)
        break
      }
      case 'category': {
        const categoryId = productId !== null ? (productCategoryById!.get(productId) ?? null) : null
        const name = categoryId !== null ? (categoryNameById!.get(categoryId) ?? 'Categorie ștearsă') : NO_CATEGORY_LABEL
        bump(categoryId === null ? 'null' : `cat${categoryId}`, categoryId, name, value, quantity, clientId, productId, 0)
        break
      }
      case 'channel':
        bump(t.channel, null, t.channel, value, quantity, clientId, productId, 0)
        break
      case 'month': {
        const key = `${t.year}-${String(t.month).padStart(2, '0')}`
        const name = `${MONTH_NAMES[t.month - 1]} ${t.year}`
        bump(key, null, name, value, quantity, clientId, productId, t.year * 100 + t.month)
        break
      }
      case 'county': {
        const name = t.county?.trim() || UNSPECIFIED_LABEL
        bump(name, null, name, value, quantity, clientId, productId, 0)
        break
      }
      case 'locality': {
        const name = t.locality?.trim() || UNSPECIFIED_LABEL
        bump(name, null, name, value, quantity, clientId, productId, 0)
        break
      }
      case 'agent': {
        const name = t.agent?.trim() || UNSPECIFIED_LABEL
        bump(name, null, name, value, quantity, clientId, productId, 0)
        break
      }
    }
  }

  const accByName = new Map([...acc.values()].map((r) => [r.name, r]))
  const result: BreakdownRow[] = [...acc.values()].map((r) => ({
    id: r.id,
    name: r.name,
    value: r.value,
    quantity: r.quantity,
    count: r.count,
    distinctClients: r.clientIds.size,
    distinctProducts: r.productIds.size,
  }))

  if (dimension === 'month') {
    return result.sort((a, b) => (accByName.get(a.name)?.sortKey ?? 0) - (accByName.get(b.name)?.sortKey ?? 0))
  }

  return result.sort((a, b) => b.value - a.value)
}
