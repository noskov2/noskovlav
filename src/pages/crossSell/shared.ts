import type { Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, receiptContainsProduct } from '@/kpi/receipts'
import { fuelProductIds } from '@/kpi/productGroups'
import type { CrossSellReport } from '@/kpi/crossSell'

export interface CrossSellTabProps {
  transactions: TransactionLine[]
  products: Product[]
  report: CrossSellReport
}

/** Lines belonging to a given cashier (or all, if cashierId is '__station__'). */
export function linesForCashier(transactions: TransactionLine[], cashierId: string): TransactionLine[] {
  if (cashierId === '__station__') return transactions
  return transactions.filter((t) => t.cashierId === cashierId)
}

/** Lines belonging to receipts that contain fuel, for a given cashier (or station). */
export function fuelReceiptLines(
  transactions: TransactionLine[],
  products: Product[],
  cashierId: string,
  requireGoods: boolean,
): TransactionLine[] {
  const fuelIds = fuelProductIds(products)
  const scoped = linesForCashier(transactions, cashierId)
  const receipts = groupIntoReceipts(scoped, fuelIds)
  const matching = receipts.filter((r) => r.hasFuel && (!requireGoods || r.hasGoods))
  return matching.flatMap((r) => r.lines)
}

export function receiptLinesWithProduct(
  transactions: TransactionLine[],
  products: Product[],
  cashierId: string,
  productIds: Set<string>,
): TransactionLine[] {
  const fuelIds = fuelProductIds(products)
  const scoped = linesForCashier(transactions, cashierId)
  const receipts = groupIntoReceipts(scoped, fuelIds)
  const matching = receipts.filter((r) => receiptContainsProduct(r, productIds))
  return matching.flatMap((r) => r.lines)
}
