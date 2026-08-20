import type { Cashier, Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, receiptContainsProduct } from '@/kpi/receipts'
import { fuelProductIds } from '@/kpi/productGroups'
import { NO_TEAM_ID, TEAM_ROW_PREFIX } from '@/kpi/teamRollup'
import type { CrossSellReport } from '@/kpi/crossSell'

export interface CrossSellTabProps {
  transactions: TransactionLine[]
  products: Product[]
  report: CrossSellReport
  cashiersById: Map<string, Cashier>
}

/**
 * Lines belonging to a given row's id: '__station__' for everything, a
 * real cashier id for that cashier, or a synthetic 'team:<teamId>' id (as
 * produced by computeTeamRollup) for every cashier in that team.
 */
export function linesForCashier(
  transactions: TransactionLine[],
  cashierId: string,
  cashiersById: Map<string, Cashier>,
): TransactionLine[] {
  if (cashierId === '__station__') return transactions
  if (cashierId.startsWith(TEAM_ROW_PREFIX)) {
    const teamId = cashierId.slice(TEAM_ROW_PREFIX.length)
    return transactions.filter((t) => {
      const cashier = cashiersById.get(t.cashierId)
      return teamId === NO_TEAM_ID ? !cashier?.teamId : cashier?.teamId === teamId
    })
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
  const scoped = linesForCashier(transactions, cashierId, cashiersById)
  const receipts = groupIntoReceipts(scoped, fuelIds)
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
