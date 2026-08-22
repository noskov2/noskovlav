import type { Product, SupplierReceiptLine, TransactionLine } from '@/types/domain'

export interface SupplierRankingRow {
  supplier: string
  productCount: number
  purchaseQuantity: number
  purchaseValue: number
  salesValue: number // vânzările produselor al căror furnizor cel mai recent este acesta
  salesQuantity: number
}

/**
 * Product.supplier is never actually populated by the import pipeline (it's
 * left blank at creation and nothing writes to it since supplier only shows
 * up per-receipt in achiziții imports) — so "which supplier does this
 * product come from" has to be derived from its own purchase-receipt
 * history instead. We use each product's most recent receipt's supplier as
 * its "furnizor principal", the same notion already used as `lastSupplier`
 * in kpi/suppliers.ts, so a product bought from two suppliers over time is
 * attributed to whichever one supplied it last.
 */
export function computeSupplierRanking(
  supplierReceipts: SupplierReceiptLine[],
  transactions: TransactionLine[],
  products: Product[],
): SupplierRankingRow[] {
  const rows = new Map<string, SupplierRankingRow>()
  const ensure = (supplier: string) => {
    let row = rows.get(supplier)
    if (!row) {
      row = { supplier, productCount: 0, purchaseQuantity: 0, purchaseValue: 0, salesValue: 0, salesQuantity: 0 }
      rows.set(supplier, row)
    }
    return row
  }

  const productsBySupplier = new Map<string, Set<string>>()
  const primarySupplierByProduct = new Map<string, string>()
  const sortedReceipts = [...supplierReceipts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const r of sortedReceipts) {
    const supplier = r.supplier.trim() || 'Furnizor necunoscut'
    const row = ensure(supplier)
    row.purchaseQuantity += r.quantity
    row.purchaseValue += r.quantity * r.price
    const set = productsBySupplier.get(supplier) ?? new Set<string>()
    set.add(r.productId)
    productsBySupplier.set(supplier, set)
    primarySupplierByProduct.set(r.productId, supplier) // ascending date order → ends up as the latest
  }
  for (const [supplier, set] of productsBySupplier) ensure(supplier).productCount = set.size

  const productsById = new Map(products.map((p) => [p.id, p]))
  for (const t of transactions) {
    const supplier = primarySupplierByProduct.get(t.productId)
    if (!supplier || !productsById.has(t.productId)) continue
    const row = ensure(supplier)
    row.salesValue += t.value
    row.salesQuantity += t.quantity
  }

  return Array.from(rows.values()).sort((a, b) => b.purchaseValue - a.purchaseValue)
}
