import type { Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'

// Fixed value bands requested by the station owner, so "câte bonuri am avut
// între 100 și 250 lei" is a direct lookup instead of eyeballing a sorted
// list. Bands are [min, max) — the lower bound counts, the upper doesn't —
// so a bon of exactly 25 lei falls in "25-50", never double-counted or
// dropped between two bands. An explicit "sub 5 lei" band catches
// everything below the owner's requested range (SGR-only bons, discount
// lines, etc.) so the bands still add up to every bon, not just the ones
// in the requested range.
export interface ValueBucketDef {
  key: string
  label: string
  min: number
  max: number | null // null = no upper bound
}

export const VALUE_BUCKETS: ValueBucketDef[] = [
  { key: 'sub5', label: 'sub 5 lei', min: 0, max: 5 },
  { key: '5-25', label: '5 - 25 lei', min: 5, max: 25 },
  { key: '25-50', label: '25 - 50 lei', min: 25, max: 50 },
  { key: '50-100', label: '50 - 100 lei', min: 50, max: 100 },
  { key: '100-250', label: '100 - 250 lei', min: 100, max: 250 },
  { key: '250-500', label: '250 - 500 lei', min: 250, max: 500 },
  { key: '500-1500', label: '500 - 1.500 lei', min: 500, max: 1500 },
  { key: '1500+', label: 'peste 1.500 lei', min: 1500, max: null },
]

export interface ValueBucketRow {
  key: string
  label: string
  receiptCount: number
  totalValue: number
  pctOfReceipts: number
  lines: TransactionLine[] // every line in every bon in this band, for drill-down
}

export function computeReceiptValueDistribution(transactions: TransactionLine[], products: Product[]): ValueBucketRow[] {
  const fuelIds = fuelProductIds(products)
  const excludedIds = productIdsInGroup(products, 'crossSellExcluded')
  const receipts = groupIntoReceipts(transactions, fuelIds, excludedIds)
  const totalReceipts = receipts.length

  return VALUE_BUCKETS.map((b) => {
    const inBucket = receipts.filter((r) => r.totalValue >= b.min && (b.max == null || r.totalValue < b.max))
    return {
      key: b.key,
      label: b.label,
      receiptCount: inBucket.length,
      totalValue: inBucket.reduce((s, r) => s + r.totalValue, 0),
      pctOfReceipts: totalReceipts > 0 ? (inBucket.length / totalReceipts) * 100 : 0,
      lines: inBucket.flatMap((r) => r.lines),
    }
  })
}
