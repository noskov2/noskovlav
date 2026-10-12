import type { Product, TransactionLine } from '@/types/domain'
import { productIdsInGroup } from '@/kpi/productGroups'

// Counts a line as promotional ONLY when it carries its own "Promoție" tag
// directly, or (as a fallback) belongs to a product manually flagged
// 'promotii' in Nomenclator with no tag of its own on this particular line.
//
// This used to also infer a combo's other, untagged half by pairing a
// tagged line with whatever line immediately followed it on the same
// receipt (meant for promos like "CAFEA + APA", tagged on only one of the
// two items). That inference turned out unreliable in practice: for a
// self-tagging promo like "PROMOTIE CASCAVAL RUCAR/DALIA" (where every
// relevant line already carries its own tag — Rucar and Dalia are each
// independently, fully tagged, never relying on a neighbor), it swept
// whatever ordinary, unrelated item happened to ring up right after a
// cascaval line (a different cheese, bread, a drink — anything) into the
// cascaval total, inflating it. There's no reliable, generic way to tell
// "this tag always needs a paired untagged partner" apart from "this tag is
// already fully self-contained" just from the transaction data, so pairing
// is no longer attempted at all — every promo total here now matches
// exactly what filtering by the "Promoție" column and summing Cantitate in
// the source file itself would give, which is also the only way a station
// manager can independently verify it.
export function promoLabelsForReceiptLines(
  lines: TransactionLine[],
  promoProductIds: Set<string>,
  productsById: Map<string, Product>,
): Map<string, string> {
  const labels = new Map<string, string>()
  for (const t of lines) {
    if (t.promotionRaw) {
      labels.set(t.id, t.promotionRaw.trim())
    } else if (promoProductIds.has(t.productId) && !labels.has(t.id)) {
      labels.set(t.id, productsById.get(t.productId)?.name ?? t.productRaw)
    }
  }
  return labels
}

// lineId -> promo label, across an arbitrary (not necessarily receipt-
// grouped) set of transactions.
export function computePromoLineLabels(transactions: TransactionLine[], products: Product[]): Map<string, string> {
  const promoProductIds = productIdsInGroup(products, 'promotii')
  const productsById = new Map(products.map((p) => [p.id, p]))
  return promoLabelsForReceiptLines(transactions, promoProductIds, productsById)
}
