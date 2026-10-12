import type { Product, TransactionLine } from '@/types/domain'
import { productIdsInGroup } from '@/kpi/productGroups'

// This station's POS tags these specific combo promos on only ONE of the
// two items in the deal — the other half rings up as an ordinary,
// untagged line immediately after it on the same receipt. Confirmed from
// the station's own real export: "CAFEA + APA" is tagged only on the apă
// line (never on the cafea), "PATISERIE + CAFEA" only on the cafea line
// (never on the patiserie) — each always paired with its untagged partner
// right after it. Every OTHER promo observed in the data (cascaval,
// patiserie mini, foietaj telemea, ...) tags every relevant line directly
// and never needs a partner — see the long comment on
// promoLabelsForReceiptLines for why pairing was removed as a general rule.
// Add a label here only once confirmed the same way: every instance tags
// just one side, with the other always the immediately following untagged
// line on the same bon.
const COMBO_PROMO_LABELS = new Set(['CAFEA + APA', 'PATISERIE + CAFEA'])

// Counts a line as promotional when it carries its own "Promoție" tag
// directly, or (as a fallback) belongs to a product manually flagged
// 'promotii' in Nomenclator with no tag of its own on this particular line.
//
// General line-pairing (inferring a combo's untagged other half from
// whatever line happens to follow a tagged one) used to apply to every
// promo. That turned out unreliable: for a self-tagging promo like
// "PROMOTIE CASCAVAL RUCAR/DALIA" (Rucar and Dalia each independently,
// fully tagged on their own, never relying on a neighbor), it swept
// whatever ordinary, unrelated item happened to ring up right after a
// cascaval line (a different cheese, bread, a drink — anything) into the
// cascaval total, inflating it. There's no reliable, generic way to tell
// "this tag always needs a paired untagged partner" apart from "this tag
// is already fully self-contained" just from the transaction data alone.
//
// So pairing is now ONLY attempted for the small, explicitly-confirmed
// COMBO_PROMO_LABELS list above — every other promo's total matches
// exactly what filtering by the "Promoție" column and summing Cantitate in
// the source file itself would give, which is also the only way a station
// manager can independently verify it.
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
      if (COMBO_PROMO_LABELS.has(label)) {
        const next = sorted[i + 1]
        if (next && !next.promotionRaw && !labels.has(next.id)) labels.set(next.id, label)
      }
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
