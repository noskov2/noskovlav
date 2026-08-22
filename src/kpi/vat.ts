import type { Product, TransactionLine } from '@/types/domain'

// The single place that turns a line's VAT-inclusive `value` into an
// ex-VAT sales value for profit math. Never subtract a cost (always ex-VAT,
// from a supplier receipt or purchasePrice) from a VAT-inclusive sales
// figure — that overstates profit by the VAT amount on every line that
// doesn't carry its own `valueNoVat` from the import.
//
// Priority: 1) the line's own valueNoVat, if the import provided it —
// always most trustworthy since it's the real number from the POS.
// 2) the product's own VAT override. 3) the station-wide default VAT rate.
export function exVatValue(t: TransactionLine, product: Product | undefined, defaultVatRatePct: number): number {
  if (t.valueNoVat != null) return t.valueNoVat
  const rate = product?.vatRatePct ?? defaultVatRatePct
  if (rate <= 0) return t.value
  return t.value / (1 + rate / 100)
}
