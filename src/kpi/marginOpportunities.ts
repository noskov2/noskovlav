import type { Product } from '@/types/domain'
import { computeCategoryProfitability, type ProductProfitRow } from '@/kpi/profitability'
import { fuelProductIds } from '@/kpi/productGroups'

// "Marjă prea mică pentru ce e" — compared against the AVERAGE margin of
// its own category (Cafea, Sandwich, Dulciuri Vitrină, etc.), never against
// the whole store's median. Fuel margins are structurally tiny by design
// (regulated/thin by market, nothing to do with pricing skill), so
// comparing a sandwich's margin against a global median that includes fuel
// would flag half the shop for no reason — same-category comparison avoids
// that entirely, whatever categories this station happens to use.
export interface MarginOpportunityRow {
  row: ProductProfitRow
  category: string
  categoryAvgMarginPct: number
  categoryProductCount: number
  marginGapPp: number // categoryAvgMarginPct - row.marginPct, always > 0 for rows returned here
  potentialExtraProfit: number // what this product would have earned at the category's average margin
  currentUnitPriceInclVat: number // salesValue / quantity — the price actually realized this period, not a possibly-stale catalog price
  unitCost: number | null
  targetUnitPriceInclVat: number | null // price needed (at today's cost) to reach the category's average margin
}

const MIN_SALES_VALUE = 30 // RON — filters out one-off/sample-size noise
const MIN_MARGIN_GAP_PP = 5 // percentage points below category average to flag as an opportunity
const MAX_TARGET_MARGIN_PCT = 85 // clamp — guards the target-price formula against a data-anomaly margin near/at 100%

export function computeMarginOpportunities(productRows: ProductProfitRow[], vatRatePct: number): MarginOpportunityRow[] {
  const categoryRows = computeCategoryProfitability(productRows)
  const categoryInfo = new Map<string, { marginPct: number; productCount: number }>()
  for (const c of categoryRows) {
    if (c.marginPct != null) categoryInfo.set(c.category, { marginPct: c.marginPct, productCount: c.productCount })
  }

  const out: MarginOpportunityRow[] = []
  for (const row of productRows) {
    if (row.marginPct == null || row.salesValue < MIN_SALES_VALUE) continue
    if (row.product.groups.crossSellExcluded || row.product.groups.neVandabil) continue
    const category = row.product.category || 'Necategorizat'
    const info = categoryInfo.get(category)
    // Comparing against a peer group of 1 (itself) is meaningless — skip.
    if (!info || info.productCount < 2) continue
    const gap = info.marginPct - row.marginPct
    if (gap < MIN_MARGIN_GAP_PP) continue

    const currentUnitPriceInclVat = row.quantity > 0 ? row.salesValue / row.quantity : 0
    // Today's cost, not the historical cost used to measure past margin —
    // a price recommendation is forward-looking. Falls back to this
    // period's average realized cost only if no current price is set.
    const unitCost =
      row.product.purchasePrice ??
      (row.costValue != null && row.costCoverage > 0 ? row.costValue / (row.quantity * row.costCoverage) : null)
    const targetMarginFraction = Math.min(info.marginPct, MAX_TARGET_MARGIN_PCT) / 100
    const targetUnitPriceInclVat =
      unitCost != null && targetMarginFraction < 1 ? (unitCost / (1 - targetMarginFraction)) * (1 + vatRatePct / 100) : null

    out.push({
      row,
      category,
      categoryAvgMarginPct: info.marginPct,
      categoryProductCount: info.productCount,
      marginGapPp: gap,
      potentialExtraProfit: (row.salesValueNoVat ?? 0) * (gap / 100),
      currentUnitPriceInclVat,
      unitCost,
      targetUnitPriceInclVat,
    })
  }

  return out.sort((a, b) => b.potentialExtraProfit - a.potentialExtraProfit)
}

// ---------- weekly promo suggestions ----------
// Pairs an underpriced-but-still-selling product with a genuinely popular,
// healthy-margin "anchor" from the rest of the catalog, at a combo price
// discounted just enough to feel like a deal — while a floor on the
// combo's own margin guarantees the station doesn't lose money running it.
// Fuel is excluded from both sides (a "Motorină + sandwich" combo isn't a
// real retail move for this kind of shop), and an anchor is never a
// product that is itself flagged as underpriced.
export interface PromoSuggestion {
  primary: MarginOpportunityRow
  anchor: ProductProfitRow
  normalComboPriceInclVat: number
  promoPriceInclVat: number
  discountPct: number
  comboCostExVat: number | null
  comboProfitExVat: number | null
  comboMarginPct: number | null // null only when one side's cost is unknown
}

const MAX_SUGGESTIONS = 5
const MAX_DISCOUNT_PCT = 15
const MIN_COMBO_MARGIN_PCT = 8

function unitCostOf(row: ProductProfitRow): number | null {
  return row.product.purchasePrice ?? (row.costValue != null && row.costCoverage > 0 ? row.costValue / (row.quantity * row.costCoverage) : null)
}

export function computePromoSuggestions(
  opportunities: MarginOpportunityRow[],
  productRows: ProductProfitRow[],
  products: Product[],
  vatRatePct: number,
): PromoSuggestion[] {
  const fuelIds = fuelProductIds(products)
  const opportunityIds = new Set(opportunities.map((o) => o.row.product.id))

  const anchors = productRows
    .filter((r) => !fuelIds.has(r.product.id) && !opportunityIds.has(r.product.id))
    .filter((r) => !r.product.groups.crossSellExcluded && !r.product.groups.neVandabil)
    .filter((r) => r.marginPct != null && r.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, MAX_SUGGESTIONS)
  if (!anchors.length) return []

  const primaries = opportunities.filter((o) => !fuelIds.has(o.row.product.id)).slice(0, MAX_SUGGESTIONS)

  const suggestions: PromoSuggestion[] = []
  primaries.forEach((primary, i) => {
    const anchor = anchors[i % anchors.length]
    const anchorUnitPrice = anchor.quantity > 0 ? anchor.salesValue / anchor.quantity : 0
    const normalComboPriceInclVat = primary.currentUnitPriceInclVat + anchorUnitPrice
    const anchorUnitCost = unitCostOf(anchor)

    if (primary.unitCost == null || anchorUnitCost == null) {
      // Can't verify a floor without both costs — surface the pairing idea
      // without fabricating a margin figure, at a conservative flat discount.
      suggestions.push({
        primary, anchor, normalComboPriceInclVat,
        promoPriceInclVat: normalComboPriceInclVat * 0.9, discountPct: 10,
        comboCostExVat: null, comboProfitExVat: null, comboMarginPct: null,
      })
      return
    }

    const comboCostExVat = primary.unitCost + anchorUnitCost
    let discountPct = MAX_DISCOUNT_PCT
    let promoPriceInclVat = normalComboPriceInclVat
    let comboProfitExVat = 0
    let comboMarginPct = -Infinity
    for (; discountPct >= 0; discountPct--) {
      promoPriceInclVat = normalComboPriceInclVat * (1 - discountPct / 100)
      const promoPriceExVat = promoPriceInclVat / (1 + vatRatePct / 100)
      comboProfitExVat = promoPriceExVat - comboCostExVat
      comboMarginPct = promoPriceExVat > 0 ? (comboProfitExVat / promoPriceExVat) * 100 : -Infinity
      if (comboMarginPct >= MIN_COMBO_MARGIN_PCT) break
    }
    // Even at 0% discount the combo can't clear the safety margin — don't
    // suggest something that would lose the station money.
    if (comboMarginPct < MIN_COMBO_MARGIN_PCT) return

    suggestions.push({ primary, anchor, normalComboPriceInclVat, promoPriceInclVat, discountPct, comboCostExVat, comboProfitExVat, comboMarginPct })
  })

  return suggestions
}
