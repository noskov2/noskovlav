import type { Cashier, Product, ScoreWeights, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, receiptContainsProduct } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { PONTAJ_ROW_PREFIX } from '@/kpi/pontajTeamReport'
import { buildPontajIndex, scheduledTeamFor } from '@/data/pontaj'
import type { CrossSellReport } from '@/kpi/crossSell'

export interface CrossSellTabProps {
  transactions: TransactionLine[]
  products: Product[]
  report: CrossSellReport
  prevReport?: CrossSellReport
  cashiersById: Map<string, Cashier>
  scoreWeights?: ScoreWeights
}

/**
 * Lines belonging to a given row's id: '__station__' for everything, a
 * real cashier id for that cashier, or a synthetic 'pontaj:<teamKey>' id
 * (as produced by computePontajTeamReport) for every line whose date+tură
 * was rostered to that team on the Target page's pontaj — regardless of
 * which cashier actually rang it up.
 */
export function linesForCashier(
  transactions: TransactionLine[],
  cashierId: string,
  _cashiersById: Map<string, Cashier>,
): TransactionLine[] {
  if (cashierId === '__station__') return transactions
  if (cashierId.startsWith(PONTAJ_ROW_PREFIX)) {
    const teamKey = cashierId.slice(PONTAJ_ROW_PREFIX.length)
    const pontajIndex = buildPontajIndex()
    return transactions.filter((t) => scheduledTeamFor(pontajIndex, t.date, t.shift) === teamKey)
  }
  return transactions.filter((t) => t.cashierId === cashierId)
}

/** Lines belonging to receipts that contain fuel, for a given cashier/team (or station). */
export function fuelReceiptLines(
  transactions: TransactionLine[],
  products: Product[],
  cashierId: string,
  requireGoods: boolean,
  cashiersById: Map<string, Cashier>,
): TransactionLine[] {
  const fuelIds = fuelProductIds(products)
  const excludedIds = productIdsInGroup(products, 'crossSellExcluded')
  const scoped = linesForCashier(transactions, cashierId, cashiersById)
  const receipts = groupIntoReceipts(scoped, fuelIds, excludedIds)
  const matching = receipts.filter((r) => r.hasFuel && (!requireGoods || r.hasGoods))
  return matching.flatMap((r) => r.lines)
}

export function receiptLinesWithProduct(
  transactions: TransactionLine[],
  products: Product[],
  cashierId: string,
  productIds: Set<string>,
  cashiersById: Map<string, Cashier>,
): TransactionLine[] {
  const fuelIds = fuelProductIds(products)
  const scoped = linesForCashier(transactions, cashierId, cashiersById)
  const receipts = groupIntoReceipts(scoped, fuelIds)
  const matching = receipts.filter((r) => receiptContainsProduct(r, productIds))
  return matching.flatMap((r) => r.lines)
}
