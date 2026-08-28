import type { Cashier, Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, type Receipt } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { buildCashierRow, type CashierCrossSellRow } from '@/kpi/crossSell'
import { buildPontajIndex, scheduledTeamFor, resolveTeamName, loadTeamNames, defaultTeamLabel, hasPontajData } from '@/data/pontaj'

export const PONTAJ_ROW_PREFIX = 'pontaj:'

export interface PontajTeamReport {
  stationTotal: CashierCrossSellRow
  teams: CashierCrossSellRow[]
  // Receipts whose date+tură has no scheduled team — either that day isn't
  // covered by any pontaj imported on the Target page, or the sale's shift
  // couldn't be determined. Surfaced so "Pe echipă" totals never look wrong
  // without explanation when they fall short of the station total.
  unscheduledReceiptCount: number
  unscheduledValue: number
  hasPontaj: boolean
}

function syntheticTeamCashier(id: string, name: string): Cashier {
  return {
    id,
    name,
    aliases: [],
    active: true,
    teamId: null,
    teamHistory: [],
    resignedAt: null,
    resignedNote: null,
    createdAt: 0,
  }
}

// Per-team sales, attributed by the pre-set monthly schedule (pontaj) from
// the Target page — which team was ROSTERED for a given date+tură — never
// by which cashier happened to be logged into the register that shift.
// Employees swap shifts informally among themselves; the register login
// then reflects who actually worked, not who the schedule assigned, so
// grouping by Cashier.teamId (the old approach) attributed sales to the
// wrong team whenever that happened. The pontaj is the schedule of record.
export function computePontajTeamReport(transactions: TransactionLine[], products: Product[]): PontajTeamReport {
  const fuelIds = fuelProductIds(products)
  const excludedIds = productIdsInGroup(products, 'crossSellExcluded')
  const receipts = groupIntoReceipts(transactions, fuelIds, excludedIds)

  const stationTotal = buildCashierRow(syntheticTeamCashier('__station__', 'TOTAL STAȚIE'), receipts, products, fuelIds, excludedIds)

  const pontajIndex = buildPontajIndex()
  const teamNames = loadTeamNames()

  const byTeamKey = new Map<string, Receipt[]>()
  let unscheduledReceiptCount = 0
  let unscheduledValue = 0
  for (const r of receipts) {
    const key = scheduledTeamFor(pontajIndex, r.date, r.shift)
    if (!key) {
      unscheduledReceiptCount++
      unscheduledValue += r.totalValue
      continue
    }
    const arr = byTeamKey.get(key)
    if (arr) arr.push(r)
    else byTeamKey.set(key, [r])
  }

  const teams = Array.from(byTeamKey.entries())
    .map(([key, teamReceipts]) => {
      const name = resolveTeamName(defaultTeamLabel(key), teamNames)
      return buildCashierRow(syntheticTeamCashier(`${PONTAJ_ROW_PREFIX}${key}`, name), teamReceipts, products, fuelIds, excludedIds)
    })
    .sort((a, b) => b.totalSales - a.totalSales)

  return { stationTotal, teams, unscheduledReceiptCount, unscheduledValue, hasPontaj: hasPontajData() }
}
