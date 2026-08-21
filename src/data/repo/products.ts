import { db } from '@/data/db'
import { slugify } from '@/lib/id'
import { emptyGroups, type CategoryGroupRules, type Product, type ProductGroups } from '@/types/domain'
import { guessGroupsFromName } from '@/processing/groupHeuristics'
import { getSettings } from '@/data/repo/settings'

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
  const settings = await getSettings()
  const category = categoryRaw || 'Necategorizat'
  // Once a group has at least one category mapped in Nomenclator -> Grupuri
  // pe categorie, that mapping is authoritative for the group (true only if
  // this product's category is in the list, false otherwise) — the
  // name-keyword heuristic only fills in groups nobody has configured yet.
  const guessed = { ...emptyGroups(), ...guessGroupsFromName(trimmed, categoryRaw) }
  const groups = emptyGroups()
  for (const key of Object.keys(groups) as (keyof ProductGroups)[]) {
    const rule = settings.categoryGroupRules[key]
    groups[key] = rule.length > 0 ? rule.includes(category) : guessed[key]
  }

  const product: Product = {
    id,
    name: trimmed,
    category,
    subcategory: '',
    purchasePrice: purchasePriceUnit,
    salePrice: null,
    currentStock: null,
    supplier: '',
    active: true,
    groups,
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

/**
 * Re-applies one group's full category list to every product (not just the
 * one category that was just toggled), so the category rule is fully
 * authoritative for this group: a product in an allowed category ends up
 * with the flag on, and — importantly — a product that had picked up the
 * flag some other way (the name-keyword heuristic at creation time, e.g.)
 * but is NOT in an allowed category gets it turned back off. This is what
 * makes toggling a category a real fix, not just an addition.
 */
export async function setGroupForCategory(
  group: keyof ProductGroups,
  allowedCategories: string[],
): Promise<number> {
  const allowed = new Set(allowedCategories)
  const all = await db.products.toArray()
  const toUpdate = all
    .filter((p) => p.groups[group] !== allowed.has(p.category))
    .map((p) => ({ ...p, groups: { ...p.groups, [group]: allowed.has(p.category) }, updatedAt: Date.now() }))
  if (toUpdate.length > 0) await db.products.bulkPut(toUpdate)
  return toUpdate.length
}

/**
 * Re-derives every configured group's membership from categoryGroupRules
 * across all products in one pass — for groups with no categories mapped
 * yet, existing flags are left untouched. Use this to clean up products
 * that were auto-tagged by the name-keyword heuristic before a category
 * rule existed for their group.
 */
export async function resyncAllGroupsFromCategoryRules(rules: CategoryGroupRules): Promise<number> {
  const all = await db.products.toArray()
  const toUpdate: Product[] = []
  for (const p of all) {
    let changed = false
    const groups = { ...p.groups }
    for (const key of Object.keys(rules) as (keyof ProductGroups)[]) {
      const allowed = rules[key]
      if (allowed.length === 0) continue
      const shouldBe = allowed.includes(p.category)
      if (groups[key] !== shouldBe) {
        groups[key] = shouldBe
        changed = true
      }
    }
    if (changed) toUpdate.push({ ...p, groups, updatedAt: Date.now() })
  }
  if (toUpdate.length > 0) await db.products.bulkPut(toUpdate)
  return toUpdate.length
}
