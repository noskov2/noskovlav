import type { Product } from '@/types/domain'

function norm(s: string): string {
  return s
    .toLowerCase()
    // NFD doesn't decompose the modern Romanian ș/ț (comma below) the way
    // it does ă/â/î — see lib/id.ts's slugify for the full explanation.
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function matchAll(products: Product[], must: string[], mustNot: string[] = []): Product[] {
  return products.filter((p) => {
    const name = norm(p.name)
    return must.every((m) => name.includes(m)) && !mustNot.some((m) => name.includes(m))
  })
}

// Same as matchAll, but OR instead of AND across `alternatives` — for a word
// that shows up spelled several different ways across POS exports (e.g. a
// register that types "cappucino" with one 'c', missing the double from the
// Italian spelling).
function matchAny(products: Product[], alternatives: string[]): Product[] {
  return products.filter((p) => {
    const name = norm(p.name)
    return alternatives.some((alt) => name.includes(alt))
  })
}

export interface CoffeeVariants {
  espresso: Product[]
  espressoLung: Product[]
  cappuccino: Product[]
}

// The three coffee products the spec calls out by exact name. Matched by
// name-contains (diacritic/case-insensitive) so small spelling variations
// across exports still resolve, rather than requiring an exact string match.
export function resolveCoffeeVariants(products: Product[]): CoffeeVariants {
  return {
    espresso: matchAll(products, ['espresso'], ['lung']),
    espressoLung: matchAll(products, ['espresso', 'lung']),
    cappuccino: matchAny(products, ['cappuccino', 'cappucino', 'capuccino']),
  }
}

export interface SandwichVariants {
  prosciuttoCotto: Product[]
  prosciuttoCrudo: Product[]
  mozzarellaPesto: Product[]
  kebab: Product[]
  toast: Product[]
}

export const SANDWICH_VARIANT_LABELS: Record<keyof SandwichVariants, string> = {
  prosciuttoCotto: 'Prosciutto Cotto',
  prosciuttoCrudo: 'Prosciutto Crudo',
  mozzarellaPesto: 'Mozzarella și Pesto',
  kebab: 'Kebab',
  toast: 'Toast',
}

export function resolveSandwichVariants(products: Product[]): SandwichVariants {
  return {
    prosciuttoCotto: matchAll(products, ['prosciutto', 'cotto']),
    prosciuttoCrudo: matchAll(products, ['prosciutto', 'crudo']),
    mozzarellaPesto: matchAll(products, ['mozzarella']),
    kebab: matchAll(products, ['kebab']),
    toast: matchAll(products, ['sandwich', 'toast']),
  }
}

export function idsOf(products: Product[]): Set<string> {
  return new Set(products.map((p) => p.id))
}
