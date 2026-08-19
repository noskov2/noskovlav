import type { Product, ProductGroups } from '@/types/domain'

export function productIdsInGroup(products: Product[], group: keyof ProductGroups): Set<string> {
  return new Set(products.filter((p) => p.groups[group]).map((p) => p.id))
}

export function fuelProductIds(products: Product[]): Set<string> {
  return productIdsInGroup(products, 'carburant')
}

// Named coffee/sandwich variants the spec calls out explicitly, matched by
// product name against the Nomenclator (case/diacritic-insensitive
// contains) so the per-variant breakdown works even before every product
// gets manually tagged with a group.
export function findProductsByNameContains(products: Product[], needle: string): Product[] {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  const n = norm(needle)
  return products.filter((p) => norm(p.name).includes(n))
}
