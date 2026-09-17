import type { Product, ProductGroups } from '@/types/domain'
import { looksLikeFuel } from '@/processing/groupHeuristics'

// Shared everywhere a product's curated group needs a human label — the
// group is a unified classification (set via Nomenclator, by name heuristic,
// or by a category-group rule) and is independent of `product.category`,
// which is just the raw, often-inconsistent free text a supplier's export
// happens to use (the same real shelf can show up under several different
// category spellings across imports).
export const GROUP_LABELS: Record<keyof ProductGroups, string> = {
  cafea: 'Cafea',
  dulciuriVitrina: 'Dulciuri Vitrină',
  sandwich: 'Sandwich',
  limonadaCeai: 'Limonadă/Ceai',
  carburant: 'Carburant',
  gpl: 'GPL',
  promotii: 'Promoții',
  crossSellExcluded: 'Exclus din Cross-sell',
  neVandabil: 'Nu se vinde (materii prime etc.)',
}

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
//
// The group flags alone aren't enough either: a product imported before a
// fuel keyword existed, or one nobody ever opened Nomenclator to tick, has
// both flags false and used to be silently counted as ordinary "marfă" —
// e.g. a product literally named "Gaz Petrolier Lichefiat" showing up in
// the fuel-excluded Top Products list with real revenue while the
// Dashboard's GPL tile stayed frozen at 0L. So this also recognizes fuel
// by name/category, the same match guessGroupsFromName uses for
// newly-seen products, as a safety net under the manual flags.
export function fuelProductIds(products: Product[]): Set<string> {
  return new Set(
    products.filter((p) => p.groups.carburant || p.groups.gpl || looksLikeFuel(p.name, p.category)).map((p) => p.id),
  )
}

// Named coffee/sandwich variants the spec calls out explicitly, matched by
// product name against the Nomenclator (case/diacritic-insensitive
// contains) so the per-variant breakdown works even before every product
// gets manually tagged with a group.
export function findProductsByNameContains(products: Product[], needle: string): Product[] {
  // NFD doesn't decompose the modern Romanian ș/ț (comma below) the way it
  // does ă/â/î — see lib/id.ts's slugify for the full explanation.
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[șş]/g, 's')
      .replace(/[țţ]/g, 't')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
  const n = norm(needle)
  return products.filter((p) => norm(p.name).includes(n))
}
