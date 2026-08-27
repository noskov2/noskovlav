import { db } from '../db/db'
import { buildProductSnapshot, type ProductMatchSnapshot } from '../import/matching'
import { normalizeForCompare } from '../lib/ro-format'
import type { CategoryRecord, NewProductRequest, ProductRecord } from '../types'

export async function loadProductSnapshot(): Promise<ProductMatchSnapshot> {
  const [products, aliases] = await Promise.all([db.products.toArray(), db.productAliases.toArray()])
  return buildProductSnapshot({
    products: products.filter((p): p is typeof p & { id: number } => p.id !== undefined),
    aliases,
  })
}

export async function createProduct(canonicalName: string, extra?: Partial<ProductRecord>): Promise<number> {
  const now = Date.now()
  const id = await db.products.add({
    canonicalName,
    canonicalNameNormalized: normalizeForCompare(canonicalName),
    active: true,
    createdAt: now,
    updatedAt: now,
    ...extra,
  })
  return id as number
}

export async function addProductAlias(productId: number, rawName: string): Promise<void> {
  const normalizedName = normalizeForCompare(rawName)
  const existing = await db.productAliases
    .where('productId')
    .equals(productId)
    .and((a) => a.normalizedName === normalizedName)
    .first()
  if (existing) return
  await db.productAliases.add({ productId, rawName, normalizedName, source: 'import-exact', createdAt: Date.now() })
}

export async function moveProductAlias(aliasId: number, toProductId: number): Promise<void> {
  const alias = await db.productAliases.get(aliasId)
  if (!alias) throw new Error('Aliasul nu mai există.')
  await db.productAliases.update(aliasId, { productId: toProductId })
  await db.transactions.where('productNormalized').equals(alias.normalizedName).modify({ canonicalProductId: toProductId })
}

export async function deleteProductAlias(aliasId: number): Promise<void> {
  const alias = await db.productAliases.get(aliasId)
  if (!alias) return
  await db.productAliases.delete(aliasId)
  await db.transactions.where('productNormalized').equals(alias.normalizedName).modify({ canonicalProductId: null })
}

export async function updateProduct(id: number, patch: Partial<ProductRecord>): Promise<void> {
  await db.products.update(id, { ...patch, updatedAt: Date.now() })
}

export async function listProducts(): Promise<ProductRecord[]> {
  const products = await db.products.toArray()
  return products.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'ro'))
}

/** Creează produsele noi identificate în worker în timpul unui import. Returnează maparea normalizedName -> id. */
export async function applyImportResolutions(newProducts: NewProductRequest[]): Promise<Record<string, number>> {
  const productIdMap: Record<string, number> = {}
  for (const req of newProducts) {
    const id = await createProduct(req.rawName, { productCode: req.productCode })
    await addProductAlias(id, req.rawName)
    productIdMap[req.normalizedName] = id
  }
  return productIdMap
}

export async function createCategory(name: string): Promise<number> {
  const existing = await db.categories.where('name').equals(name).first()
  if (existing?.id !== undefined) return existing.id
  return (await db.categories.add({ name, createdAt: Date.now() })) as number
}

export async function listCategories(): Promise<CategoryRecord[]> {
  return db.categories.orderBy('name').toArray()
}
