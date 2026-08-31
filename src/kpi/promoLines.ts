import type { Product, TransactionLine } from '@/types/domain'
import { productIdsInGroup } from '@/kpi/productGroups'

// This station's POS tags combo promos ("CAFEA + APA", "PATISERIE + CAFEA")
// on only ONE of the two products in the deal — typically the discounted
// one — via the "Promoție" column. The other half (e.g. the coffee that
// unlocks the discount) rings up as an ordinary full-price line with no tag
// at all, immediately below the tagged line on the same receipt. Counting
// only tagged lines as "promotional" silently drops half of every such
// combo from every promo total/breakdown in the app.
//
// A promo where BOTH products carry the same tag (e.g. "PROMOTIE CASCAVAL
// RUCAR/DALIA", tagged on two consecutive cheese lines) needs no pairing —
// each line is already counted on its own, and this never re-labels a line
// that already has its own tag.
//
// Line order within a receipt can't be reconstructed from timestamp (every
// line on one bon typically shares the exact same one) — TransactionLine's
// rowIndex (the row's position in the imported sheet) is what "the next
// line on this receipt" means here. Lines imported before rowIndex existed
// sort as if rowIndex were 0 and simply don't get paired — re-import to fix.
export function promoLabelsForReceiptLines(
  lines: TransactionLine[],
  promoProductIds: Set<string>,
  productsById: Map<string, Product>,
): Map<string, string> {
  const sorted = [...lines].sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0))
  const labels = new Map<string, string>()
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    if (t.promotionRaw) {
      const label = t.promotionRaw.trim()
      labels.set(t.id, label)
      const next = sorted[i + 1]
      if (next && !next.promotionRaw && !labels.has(next.id)) labels.set(next.id, label)
    } else if (promoProductIds.has(t.productId) && !labels.has(t.id)) {
      labels.set(t.id, productsById.get(t.productId)?.name ?? t.productRaw)
    }
  }
  return labels
}

// lineId -> promo label, across an arbitrary (not necessarily receipt-
// grouped) set of transactions. Groups by receipt internally so pairing
// never crosses from one bon into another.
export function computePromoLineLabels(transactions: TransactionLine[], products: Product[]): Map<string, string> {
  const promoProductIds = productIdsInGroup(products, 'promotii')
  const productsById = new Map(products.map((p) => [p.id, p]))

  const byReceipt = new Map<string, TransactionLine[]>()
  for (const t of transactions) {
    const key = `${t.date}::${t.receiptNo}::${t.cashierId}`
    const arr = byReceipt.get(key)
    if (arr) arr.push(t)
    else byReceipt.set(key, [t])
  }

  const labels = new Map<string, string>()
  for (const lines of byReceipt.values()) {
    for (const [id, label] of promoLabelsForReceiptLines(lines, promoProductIds, productsById)) labels.set(id, label)
  }
  return labels
}
