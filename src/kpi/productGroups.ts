import type { Product, ProductGroups } from '@/types/domain'

export function productIdsInGroup(products: Product[], group: keyof ProductGroups): Set<string> {
  return new Set(products.filter((p) => p.groups[group]).map((p) => p.id))
}

// GPL is fuel, full stop — a product can be tagged 'gpl' in Nomenclator
// without also being separately ticked 'carburant' (the two checkboxes are
// easy to treat as mutually exclusive by a station manager who thinks of
// GPL as its own thing), so "fuel" must be the union of both groups. Every
// GPL-only product used to fall through to "marfă" here — 0 lei/0 L on the
// Dashboard's GPL tile, wrong goodsSales, and GPL receipts invisible to
// cross-sell — even though productIdsInGroup(products, 'gpl') elsewhere
// found them just fine.
export function fuelProductIds(products: Product[]): Set<string> {
  return new Set(products.filter((p) => p.groups.carburant || p.groups.gpl).map((p) => p.id))
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
