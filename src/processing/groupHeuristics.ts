import type { ProductGroups } from '@/types/domain'

// Best-effort default classification for newly-seen products, so the
// cross-sell modules have something sensible to show before the user opens
// the Nomenclator and reviews it. This is only a suggestion: every group
// flag is editable per-product afterwards and imports never overwrite a
// group the user has already confirmed (see resolveOrCreateProduct).
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const COFFEE_KEYWORDS = ['espresso', 'cappuccino', 'capuccino']
const SANDWICH_KEYWORDS = ['sandwich', 'sandvis', 'sandvici']
// Deliberately does NOT include generic snack-food words like "covrig" or
// "napolitan" — those are packaged/purchased snacks (a different category
// in most POS exports), not in-house patisserie, and matching them caused
// real false positives. Prefer mapping the exact category via Nomenclator
// -> Grupuri pe categorie over widening this list further.
const VITRINA_KEYWORDS = [
  'croissant',
  'gogoasa',
  'gogoasi',
  'brioche',
  'briosa',
  'placinta',
  'ecler',
  'tarta',
  'cornulet',
  'strudel',
  'vitrina',
]
const LEMONADE_KEYWORDS = ['limonada', 'ceai', 'lemonade', 'ice tea', 'icetea']
const FUEL_KEYWORDS = ['motorina', 'benzina', 'diesel', 'euro95', 'euro 95', 'premium', 'gpl', 'gaz petrolier', 'autogaz']
const GPL_KEYWORDS = ['gpl', 'gaz petrolier', 'autogaz']
const PROMO_KEYWORDS = ['promotie', 'promotii', 'promo', 'pachet promo']
// Lines that must never count as "marfă" for cross-sell purposes even
// though they aren't fuel: deposits, discounts, technical/service lines.
const CROSS_SELL_EXCLUDED_KEYWORDS = [
  'sgr', // matches "Garanție SGR" / "Garanții SGR" category or product names alike
  'garantie ambalaj',
  'discount',
  'reducere',
  'taxa verde',
  'timbru verde',
  'ambalaj',
  'retur',
  'storno',
  'comision',
  'serviciu',
]

function matches(name: string, keywords: string[]): boolean {
  return keywords.some((k) => name.includes(k))
}

// Exposed separately from guessGroupsFromName so the *gate* that decides
// "is this product fuel at all" (kpi/productGroups.ts's fuelProductIds, and
// the GPL sub-classification in kpi/fuelVariants.ts) can fall back to the
// same name/category match the auto-tagger uses, instead of trusting the
// Nomenclator checkboxes alone. A product created before these keywords
// existed, or one whose checkboxes were simply never ticked, would
// otherwise be silently treated as "marfă" everywhere (goods sales, cross-
// sell, top-products) with no way to notice short of opening Nomenclator
// row by row.
export function looksLikeFuel(name: string, category: string): boolean {
  return matches(`${norm(name)} ${norm(category || '')}`, FUEL_KEYWORDS)
}

export function looksLikeGpl(name: string, category: string): boolean {
  return matches(`${norm(name)} ${norm(category || '')}`, GPL_KEYWORDS)
}

export function guessGroupsFromName(rawName: string, categoryRaw: string): Partial<ProductGroups> {
  const name = norm(rawName)
  const category = norm(categoryRaw || '')
  const haystack = `${name} ${category}`

  return {
    cafea: matches(haystack, COFFEE_KEYWORDS),
    sandwich: matches(haystack, SANDWICH_KEYWORDS),
    dulciuriVitrina: matches(haystack, VITRINA_KEYWORDS),
    limonadaCeai: matches(haystack, LEMONADE_KEYWORDS),
    carburant: matches(haystack, FUEL_KEYWORDS),
    gpl: matches(haystack, GPL_KEYWORDS),
    promotii: matches(haystack, PROMO_KEYWORDS),
    crossSellExcluded: matches(haystack, CROSS_SELL_EXCLUDED_KEYWORDS),
  }
}
