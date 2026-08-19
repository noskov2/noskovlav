import { db } from '@/data/db'
import { slugify } from '@/lib/id'
import { emptyGroups, type Product } from '@/types/domain'
import { guessGroupsFromName } from '@/processing/groupHeuristics'

export async function listProducts(): Promise<Product[]> {
  return db.products.toArray()
}

export async function getProduct(id: string): Promise<Product | undefined> {
  return db.products.get(id)
}

export async function upsertProduct(product: Product): Promise<void> {
  await db.products.put({ ...product, updatedAt: Date.now() })
}

export async function deleteProduct(id: string): Promise<void> {
  await db.products.delete(id)
}

/**
 * Resolves a raw product name coming from an import to a stable Product
 * record, creating one (with heuristically-guessed groups) the first time
 * it is seen. Subsequent imports of the same raw name reuse the same id via
 * the alias list, even if the user later renames the canonical product.
 */
export async function resolveOrCreateProduct(
  rawName: string,
  categoryRaw: string,
  purchasePriceUnit: number | null,
): Promise<Product> {
  const trimmed = rawName.trim()
  const existingByAlias = await db.products
    .filter((p) => p.aliases.includes(trimmed))
    .first()
  if (existingByAlias) return existingByAlias

  const id = slugify(trimmed) || `product-${Date.now()}`
  const existingById = await db.products.get(id)
  if (existingById) {
    if (!existingById.aliases.includes(trimmed)) {
      const updated: Product = {
        ...existingById,
        aliases: [...existingById.aliases, trimmed],
        purchasePrice: existingById.purchasePrice ?? purchasePriceUnit,
      }
      await db.products.put(updated)
      return updated
    }
    return existingById
  }

  const now = Date.now()
  const product: Product = {
    id,
    name: trimmed,
    category: categoryRaw || 'Necategorizat',
    subcategory: '',
    purchasePrice: purchasePriceUnit,
    salePrice: null,
    currentStock: null,
    supplier: '',
    active: true,
    groups: { ...emptyGroups(), ...guessGroupsFromName(trimmed, categoryRaw) },
    aliases: [trimmed],
    autoCreated: true,
    createdAt: now,
    updatedAt: now,
  }
  await db.products.put(product)
  return product
}

export async function bulkSetProducts(products: Product[]): Promise<void> {
  await db.products.bulkPut(products)
}
