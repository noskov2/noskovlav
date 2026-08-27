import { db } from '@/data/db'
import { slugify } from '@/lib/id'
import { emptyGroups, type AppSettings, type CategoryGroupRules, type Product, type ProductGroups } from '@/types/domain'
import { guessGroupsFromName } from '@/processing/groupHeuristics'
import { getSettings } from '@/data/repo/settings'
import { reassignProduct } from '@/data/repo/transactions'
import { reassignProductInReceipts } from '@/data/repo/suppliers'
import { reassignProductInSnapshots } from '@/data/repo/stockSnapshots'

export async function listProducts(): Promise<Product[]> {
  return db.products.toArray()
}

// The actual "brand-new product" construction logic, shared by
// resolveOrCreateProduct (single DB-backed lookup) and by the in-memory
// batch resolver a large sales import uses (import/importTransactions.ts) —
// one real IndexedDB scan per row of a multi-thousand-row file is minutes
// of dead time with zero feedback, so that path pre-loads every product
// into memory once and only needs this pure builder, never the DB itself.
export function buildNewProduct(
  rawName: string,
  categoryRaw: string,
  purchasePriceUnit: number | null,
  settings: AppSettings,
  supplierRaw = '',
): Product {
  const trimmed = rawName.trim()
  const now = Date.now()
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

  return {
    id: slugify(trimmed) || `product-${now}`,
    name: trimmed,
    category,
    purchasePrice: purchasePriceUnit,
    salePrice: null,
    currentStock: null,
    supplier: supplierRaw,
    active: true,
    groups,
    aliases: [trimmed],
    autoCreated: true,
    vatRatePct: null,
    createdAt: now,
    updatedAt: now,
  }
}

// A product added by hand in Nomenclator, not seen in any import yet — same
// shape as an auto-created one (so it behaves identically everywhere else)
// but starts with no aliases, since there's no raw import string to match
// against; the id-slug from the name still lets a later import with the
// exact same name attach to it instead of creating a duplicate.
export function buildManualProduct(name: string, category: string): Product {
  const trimmed = name.trim()
  const now = Date.now()
  return {
    id: slugify(trimmed) || `product-${now}`,
    name: trimmed,
    category: category.trim() || 'Necategorizat',
    purchasePrice: null,
    salePrice: null,
    currentStock: null,
    supplier: '',
    active: true,
    groups: emptyGroups(),
    aliases: [],
    autoCreated: false,
    vatRatePct: null,
    createdAt: now,
    updatedAt: now,
  }
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
  supplierRaw?: string,
): Promise<Product> {
  const trimmed = rawName.trim()
  const existingByAlias = await db.products
    .filter((p) => p.aliases.includes(trimmed))
    .first()
  if (existingByAlias) {
    // A supplier receipt import is the one place with a real "Furnizor" —
    // back-fill it onto the product once, only if nobody has set one yet,
    // so a manual correction in Nomenclator is never silently overwritten.
    if (supplierRaw && !existingByAlias.supplier) {
      const updated = { ...existingByAlias, supplier: supplierRaw }
      await db.products.put(updated)
      return updated
    }
    return existingByAlias
  }

  const id = slugify(trimmed) || `product-${Date.now()}`
  const existingById = await db.products.get(id)
  if (existingById) {
    if (!existingById.aliases.includes(trimmed)) {
      const updated: Product = {
        ...existingById,
        aliases: [...existingById.aliases, trimmed],
        purchasePrice: existingById.purchasePrice ?? purchasePriceUnit,
        supplier: existingById.supplier || supplierRaw || '',
      }
      await db.products.put(updated)
      return updated
    }
    if (supplierRaw && !existingById.supplier) {
      const updated = { ...existingById, supplier: supplierRaw }
      await db.products.put(updated)
      return updated
    }
    return existingById
  }

  const settings = await getSettings()
  const product = buildNewProduct(rawName, categoryRaw, purchasePriceUnit, settings, supplierRaw)
  await db.products.put(product)
  return product
}

export async function bulkSetProducts(products: Product[]): Promise<void> {
  await db.products.bulkPut(products)
}

// Clears `autoCreated` on a batch of products in one write — the bulk
// counterpart to editing a product by hand in Nomenclator (which also
// clears it, see ProductsTab.commit). Needed because a station's Nomenclator
// can easily have 1000+ auto-created products after a first big import;
// requiring an actual field edit on every single one to satisfy the "Produse
// revizuite" data-quality factor isn't realistic.
export async function markProductsReviewed(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const rows = await db.products.bulkGet(ids)
  const toUpdate = rows.filter((p): p is Product => !!p && p.autoCreated).map((p) => ({ ...p, autoCreated: false, updatedAt: Date.now() }))
  if (toUpdate.length > 0) await db.products.bulkPut(toUpdate)
  return toUpdate.length
}

/**
 * Corrects each listed product's category from an authoritative source
 * (the stock/nomenclature export's own "Categorie" column, typically) and
 * re-derives its groups for every group that already has category rules
 * configured — same "category rule wins once configured" logic as
 * resolveOrCreateProduct/setGroupForCategory, just triggered by a category
 * change instead of a rule change. Groups with no rules yet keep whatever
 * flag they already had (heuristic or manual).
 */
export async function applyCategoriesFromStock(
  entries: { productId: string; category: string }[],
  rules: CategoryGroupRules,
): Promise<number> {
  const byId = new Map(entries.filter((e) => e.category).map((e) => [e.productId, e.category]))
  if (byId.size === 0) return 0
  const all = await db.products.bulkGet(Array.from(byId.keys()))
  const toUpdate: Product[] = []
  for (const p of all) {
    if (!p) continue
    const category = byId.get(p.id)!
    if (category === p.category) continue
    const groups = { ...p.groups }
    for (const key of Object.keys(rules) as (keyof ProductGroups)[]) {
      const allowed = rules[key]
      if (allowed.length > 0) groups[key] = allowed.includes(category)
    }
    toUpdate.push({ ...p, category, groups, updatedAt: Date.now() })
  }
  if (toUpdate.length > 0) await db.products.bulkPut(toUpdate)
  return toUpdate.length
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

/**
 * Merges `sourceId` into `targetId`: reassigns every transaction, supplier
 * receipt and stock snapshot line, folds the alias lists together, and
 * deletes the source record. Mirrors mergeCashiers — this is the fix for a
 * raw name variant across imports resolving to two separate Product records
 * instead of one, which splits one real item's sales/stock between them and
 * can make the "ghost" record wrongly show up as never-sold/stock-0 even
 * though the item is actively selling under the other record.
 */
export async function mergeProducts(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return
  const [source, target] = await Promise.all([db.products.get(sourceId), db.products.get(targetId)])
  if (!source || !target) return

  await Promise.all([
    reassignProduct(sourceId, targetId),
    reassignProductInReceipts(sourceId, targetId),
    reassignProductInSnapshots(sourceId, targetId),
  ])

  const mergedAliases = Array.from(new Set([...target.aliases, ...source.aliases, source.name]))
  await db.products.put({
    ...target,
    aliases: mergedAliases,
    purchasePrice: target.purchasePrice ?? source.purchasePrice,
    salePrice: target.salePrice ?? source.salePrice,
    currentStock: target.currentStock ?? source.currentStock,
    supplier: target.supplier || source.supplier,
    updatedAt: Date.now(),
  })
  await db.products.delete(sourceId)
}
