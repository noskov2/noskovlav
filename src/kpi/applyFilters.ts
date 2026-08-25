import type { TransactionLine, Product, Cashier } from '@/types/domain'
import type { FilterState } from '@/kpi/filterState'
import { effectiveRange } from '@/kpi/filterState'
import { buildTeamAsOfResolver } from '@/kpi/teamHistory'

function matchesDimensions(
  t: TransactionLine,
  filter: FilterState,
  productsById: Map<string, Product>,
  teamAsOf: (cashierId: string, date: string) => string | null,
): boolean {
  if (filter.cashierId !== 'all' && t.cashierId !== filter.cashierId) return false
  // Resolved as of the transaction's own date — a cashier's later team
  // change never pulls their past sales into the new team's filter.
  if (filter.teamId !== 'all' && teamAsOf(t.cashierId, t.date) !== filter.teamId) return false
  if (filter.shift !== 'all' && t.shift !== filter.shift) return false
  if (filter.productId !== 'all' && t.productId !== filter.productId) return false
  if (filter.category !== 'all') {
    const product = productsById.get(t.productId)
    const category = product?.category || t.categoryRaw
    if (category !== filter.category) return false
  }
  return true
}

export function filterTransactions(
  transactions: TransactionLine[],
  filter: FilterState,
  productsById: Map<string, Product>,
  cashiersById: Map<string, Cashier>,
): TransactionLine[] {
  const range = effectiveRange(filter)
  const teamAsOf = buildTeamAsOfResolver(Array.from(cashiersById.values()))
  return transactions.filter((t) => {
    if (t.date < range.start || t.date > range.end) return false
    return matchesDimensions(t, filter, productsById, teamAsOf)
  })
}

// Applies only the non-date dimensions of a FilterState (team/cashier/shift/
// category/product). Used by pages that need to layer a specific date
// window (e.g. period-over-period comparisons) on top of the user's other
// filter selections.
export function filterByDimensions(
  transactions: TransactionLine[],
  filter: FilterState,
  productsById: Map<string, Product>,
  cashiersById: Map<string, Cashier>,
): TransactionLine[] {
  const teamAsOf = buildTeamAsOfResolver(Array.from(cashiersById.values()))
  return transactions.filter((t) => matchesDimensions(t, filter, productsById, teamAsOf))
}

export function filterByRange(
  transactions: TransactionLine[],
  start: string,
  end: string,
): TransactionLine[] {
  return transactions.filter((t) => t.date >= start && t.date <= end)
}
