import type { Product, SupplierReceiptLine } from '@/types/domain'

// A product with zero KNOWN stock (an actual confirmed count from a stock
// import — never null/unknown) and no purchase in NO_PURCHASE_DAYS days is,
// in practice, a product the station has stopped carrying — it just hasn't
// been unchecked in Nomenclator yet. Left as `active: true`, it keeps
// showing up in every "fără vânzare"/rotation/margin alert forever, which
// is exactly the false-positive noise the station owner reported (real
// warnings buried among dozens of dead products nobody meant to keep
// tracking). Reactivates automatically, with no manual step, the moment a
// fresh supplier receipt for that product appears — since receiving a new
// delivery IS the owner deciding to carry it again.
//
// The same "days since last purchase" test drives both directions
// symmetrically: `stale` false means "purchased within the window", which
// is exactly what should flip an auto-deactivated product back on, so
// there's no separate reactivation-only codepath to keep in sync.
export const NO_PURCHASE_DAYS = 45

export interface AutoActivationChange {
  productId: string
  active: boolean
}

export function computeAutoActivationChanges(
  products: Product[],
  supplierReceipts: SupplierReceiptLine[],
  now: number = Date.now(),
): AutoActivationChange[] {
  const lastReceiptMs = new Map<string, number>()
  for (const r of supplierReceipts) {
    const t = new Date(`${r.date}T00:00:00`).getTime()
    if (Number.isNaN(t)) continue
    const prev = lastReceiptMs.get(r.productId)
    if (prev == null || t > prev) lastReceiptMs.set(r.productId, t)
  }

  const thresholdMs = NO_PURCHASE_DAYS * 86400000
  const changes: AutoActivationChange[] = []
  for (const p of products) {
    if (p.currentStock !== 0) continue // only a confirmed zero count — null/unknown stock is left alone
    const lastReceipt = lastReceiptMs.get(p.id)
    const stale = lastReceipt == null || now - lastReceipt >= thresholdMs
    if (p.active && stale) changes.push({ productId: p.id, active: false })
    else if (!p.active && !stale) changes.push({ productId: p.id, active: true })
  }
  return changes
}
