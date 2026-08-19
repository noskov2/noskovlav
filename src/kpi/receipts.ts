import type { ShiftNumber, TransactionLine } from '@/types/domain'

export interface Receipt {
  key: string
  date: string
  time: string
  timestamp: number
  cashierId: string
  shift: ShiftNumber | null
  receiptNo: string
  lines: TransactionLine[]
  totalValue: number
  hasFuel: boolean
  hasGoods: boolean
}

/**
 * Groups line-level transactions back into receipts/bonuri. This is the
 * basis for every cross-sell and "bon mediu" calculation, since those are
 * fundamentally about which products co-occur on the same bon, not about
 * individual product rows.
 *
 * `fuelProductIds` is passed in (rather than trusting the `isFuel` flag
 * stored on each line at import time) so that changing a product's
 * "Carburant" group in the Nomenclator later re-classifies historical
 * receipts immediately, without needing to re-import.
 */
export function groupIntoReceipts(
  transactions: TransactionLine[],
  fuelProductIds: Set<string>,
): Receipt[] {
  const map = new Map<string, Receipt>()

  for (const t of transactions) {
    const key = `${t.date}::${t.receiptNo}::${t.cashierId}`
    let receipt = map.get(key)
    if (!receipt) {
      receipt = {
        key,
        date: t.date,
        time: t.time,
        timestamp: t.timestamp,
        cashierId: t.cashierId,
        shift: t.shift,
        receiptNo: t.receiptNo,
        lines: [],
        totalValue: 0,
        hasFuel: false,
        hasGoods: false,
      }
      map.set(key, receipt)
    }
    receipt.lines.push(t)
    receipt.totalValue += t.value
    if (fuelProductIds.has(t.productId)) receipt.hasFuel = true
    else receipt.hasGoods = true
    if (t.timestamp < receipt.timestamp) {
      receipt.timestamp = t.timestamp
      receipt.time = t.time
    }
  }

  return Array.from(map.values())
}

export function receiptContainsProduct(receipt: Receipt, productIds: Set<string>): boolean {
  return receipt.lines.some((l) => productIds.has(l.productId))
}

export function quantityOfProducts(receipt: Receipt, productIds: Set<string>): number {
  return receipt.lines
    .filter((l) => productIds.has(l.productId))
    .reduce((sum, l) => sum + l.quantity, 0)
}

export function valueOfProducts(receipt: Receipt, productIds: Set<string>): number {
  return receipt.lines
    .filter((l) => productIds.has(l.productId))
    .reduce((sum, l) => sum + l.value, 0)
}
