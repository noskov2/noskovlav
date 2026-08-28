import { db } from '../db/db'
import { buildProductSnapshot, normalizeCode, resolveProduct, type ProductMatchSnapshot } from '../import/matching'
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

/** Găsește sau creează o categorie/subcategorie (§: `parentId: null` = categorie, altfel subcategorie a ei). */
export async function createCategory(name: string, parentId: number | null = null): Promise<number> {
  const normalizedName = normalizeForCompare(name)
  const all = await db.categories.toArray()
  const existing = all.find((c) => normalizeForCompare(c.name) === normalizedName && (c.parentId ?? null) === parentId)
  if (existing?.id !== undefined) return existing.id
  return (await db.categories.add({ name, parentId, createdAt: Date.now() })) as number
}

export async function listCategories(): Promise<CategoryRecord[]> {
  return db.categories.orderBy('name').toArray()
}

/** Doar categoriile de top (fără subcategorii), sortate alfabetic. */
export async function listTopCategories(): Promise<CategoryRecord[]> {
  const all = await listCategories()
  return all.filter((c) => !c.parentId)
}

/** Subcategoriile unei anume categorii, sortate alfabetic. */
export async function listSubcategories(categoryId: number): Promise<CategoryRecord[]> {
  const all = await listCategories()
  return all.filter((c) => c.parentId === categoryId)
}

export interface ProductCatalogRow {
  name: string
  code?: string
  category: string
  subcategory?: string
}

export interface ProductCatalogImportSummary {
  totalRows: number
  productsCreated: number
  productsUpdated: number
  categoriesCreated: number
  subcategoriesCreated: number
  skipped: { row: number; reason: string }[]
}

/**
 * Import catalog produse (categorie + subcategorie „sfinte"): singurul loc
 * care setează `categoryId`/`subcategoryId` pe un produs. Importul de vânzări
 * Mentor nu le atinge niciodată — la re-import, catalogul e sursa de adevăr
 * și suprascrie orice categorizare anterioară a produselor deja existente.
 */
export async function importProductCatalog(rows: ProductCatalogRow[]): Promise<ProductCatalogImportSummary> {
  const summary: ProductCatalogImportSummary = {
    totalRows: rows.length,
    productsCreated: 0,
    productsUpdated: 0,
    categoriesCreated: 0,
    subcategoriesCreated: 0,
    skipped: [],
  }

  const categoryCache = new Map<string, number>()

  async function resolveCategory(name: string, parentId: number | null): Promise<number> {
    const key = `${parentId}::${normalizeForCompare(name)}`
    const cached = categoryCache.get(key)
    if (cached !== undefined) return cached
    const countBefore = await db.categories.count()
    const id = await createCategory(name, parentId)
    const countAfter = await db.categories.count()
    if (countAfter > countBefore) {
      if (parentId === null) summary.categoriesCreated++
      else summary.subcategoriesCreated++
    }
    categoryCache.set(key, id)
    return id
  }

  const snapshot = await loadProductSnapshot()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = row.name?.trim()
    const category = row.category?.trim()
    if (!name || !category) {
      summary.skipped.push({ row: i + 1, reason: 'Denumire sau categorie lipsă.' })
      continue
    }
    const code = row.code?.trim() || undefined
    const subcategory = row.subcategory?.trim() || undefined

    const categoryId = await resolveCategory(category, null)
    const subcategoryId = subcategory ? await resolveCategory(subcategory, categoryId) : null

    const resolution = resolveProduct(name, code, snapshot)
    if (resolution.type === 'matched') {
      await updateProduct(resolution.productId, { categoryId, subcategoryId, ...(code ? { productCode: code } : {}) })
      summary.productsUpdated++
    } else {
      const id = await createProduct(name, { productCode: code, categoryId, subcategoryId })
      await addProductAlias(id, name)
      snapshot.byNormalizedName.set(normalizeForCompare(name), id)
      if (code) snapshot.byCode.set(normalizeCode(code), id)
      summary.productsCreated++
    }
  }

  return summary
}
