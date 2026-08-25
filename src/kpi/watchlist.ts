import type { Product, TransactionLine } from '@/types/domain'

// Fixed bakery/coffee-corner product line the station owner asked to track
// on "Zi de vânzare" — a specific list of named items, as he described them
// (not necessarily the exact wording used in the real Nomenclator).
export interface WatchlistItem {
  id: string
  label: string
}

export const BAKERY_WATCHLIST: WatchlistItem[] = [
  { id: 'ceai-cald-capsuni', label: 'Ceai cald de căpșuni' },
  { id: 'ceai-cald-fr-padure', label: 'Ceai cald fructe de pădure' },
  { id: 'ceai-cald-menta', label: 'Ceai cald de mentă' },
  { id: 'mini-croissant-pizza', label: 'Mini croissant pizza 3 buc' },
  { id: 'croissant-unt', label: 'Croissant cu unt' },
  { id: 'melc-vanilie-stafide', label: 'Melc cu vanilie și stafide' },
  { id: 'briosa-ciocolata', label: 'Brioșă cu ciocolată' },
  { id: 'briosa-caramel-nuci', label: 'Brioșă cu caramel și nuci' },
  { id: 'tarta-mere', label: 'Tartă cu mere' },
  { id: 'tarta-lamaie', label: 'Tartă cu lămâie' },
  { id: 'tarta-visine', label: 'Tartă cu vișine' },
  { id: 'tarta-ciocolata', label: 'Tartă cu ciocolată' },
  { id: 'cookie-clasic-cioco-neagra', label: 'Cookie clasic cu ciocolată neagră' },
  { id: 'cookie-clasic-neagra-alba', label: 'Cookie clasic neagră & albă' },
  { id: 'cookie-cioco-alba-macadamia', label: 'Cookie ciocolată albă & macadamia' },
  { id: 'gogoasa-berlineza-cacao', label: 'Gogoașă berlineză cu cacao' },
  { id: 'gogoasa-glazura-alba-neagra', label: 'Gogoașă cu glazură albă și neagră' },
  { id: 'bilute-mozzarella-pane', label: 'Bilute de mozzarella pane' },
  { id: 'cioc-calda-neagra', label: 'Ciocolată caldă neagră' },
  { id: 'cioc-calda-alba', label: 'Ciocolată caldă albă' },
  { id: 'iced-latte', label: 'Iced latte' },
  { id: 'iced-americano', label: 'Iced americano' },
  { id: 'pain-au-chocolate', label: 'Pain au chocolate' },
  { id: 'limonada-300ml', label: 'Limonadă 300ml' },
  { id: 'ceai-lamaie-300ml', label: 'Ceai lămâie 300ml' },
  { id: 'ceai-fr-padure-300ml', label: 'Ceai fructe de pădure 300ml' },
  { id: 'ceai-piersica-300ml', label: 'Ceai piersică 300ml' },
]

const STOPWORDS = new Set(['cu', 'si', 'de', 'la', 'fara', 'pe'])

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' si ')
    .replace(/[.,]/g, ' ')
    // Splits a number glued to a unit/word (e.g. "3buc", "300ml") so
    // "3 buc" and "3buc" tokenize identically regardless of which spacing
    // the real product name happens to use.
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

// Matches each watchlist label against the real Nomenclator by word overlap
// (diacritic/case-insensitive) since the owner's names are close to, but not
// guaranteed identical to, the real product names on file. Only auto-picks a
// product when it's a clear winner — high overlap AND a solid lead over the
// runner-up — so two near-identical real names (e.g. the two "cookie
// clasic..." variants) never get silently swapped; anything less clear is
// left unmatched for the user to pick by hand rather than guessed.
export function matchWatchlistItem(products: Product[], item: WatchlistItem): string | null {
  const labelTokens = tokenize(item.label)
  if (labelTokens.length === 0) return null
  const scored = products
    .map((p) => {
      const productTokens = new Set(tokenize(p.name))
      const hits = labelTokens.filter((t) => productTokens.has(t)).length
      return { id: p.id, score: hits / labelTokens.length }
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const runnerUp = scored[1]
  const confident = !!best && best.score >= 0.74 && (!runnerUp || best.score - runnerUp.score >= 0.15)
  return confident ? best.id : null
}

export interface WatchlistRowInput {
  key: string
  label: string
  product: Product | null
}

export interface WatchlistRow {
  key: string
  label: string
  product: Product | null
  todayQty: number
  last7Qty: number
  last7AvgQty: number
  diffPct: number | null // todayQty vs. last7AvgQty
}

// `transactions` should already be pre-filtered to [last7Start, selectedDate]
// by the caller (e.g. via filterByRange) so this stays a single pass
// regardless of how much history the station has.
export function computeWatchlistRows(
  transactions: TransactionLine[],
  rows: WatchlistRowInput[],
  selectedDate: string,
  last7Start: string,
  last7End: string,
): WatchlistRow[] {
  const todayByProduct = new Map<string, number>()
  const last7ByProduct = new Map<string, number>()
  for (const t of transactions) {
    if (t.date === selectedDate) {
      todayByProduct.set(t.productId, (todayByProduct.get(t.productId) ?? 0) + t.quantity)
    } else if (t.date >= last7Start && t.date <= last7End) {
      last7ByProduct.set(t.productId, (last7ByProduct.get(t.productId) ?? 0) + t.quantity)
    }
  }

  return rows.map(({ key, label, product }) => {
    if (!product) {
      return { key, label, product: null, todayQty: 0, last7Qty: 0, last7AvgQty: 0, diffPct: null }
    }
    const todayQty = todayByProduct.get(product.id) ?? 0
    const last7Qty = last7ByProduct.get(product.id) ?? 0
    const last7AvgQty = last7Qty / 7
    const diffPct = last7AvgQty > 0 ? ((todayQty - last7AvgQty) / last7AvgQty) * 100 : null
    return { key, label, product, todayQty, last7Qty, last7AvgQty, diffPct }
  })
}
