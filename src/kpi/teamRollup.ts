import type { Team } from '@/types/domain'
import type { CashierCrossSellRow } from '@/kpi/crossSell'

export const NO_TEAM_ID = '__no-team__'
export const TEAM_ROW_PREFIX = 'team:'

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0
}

/**
 * Aggregates per-cashier cross-sell rows into per-team rows, grouped by
 * each cashier's `teamId`. Cashiers without a team land in a "Fără echipă"
 * bucket rather than being silently dropped. Percentage/rate fields are
 * always recomputed from the summed numerator/denominator — never averaged
 * — so e.g. a team's cross-sell % is (sum of combo bonuri) / (sum of fuel
 * bonuri), not the average of each member's already-computed percentage.
 *
 * The output re-uses CashierCrossSellRow's shape (with a synthetic
 * "cashier" standing in for the team) so every existing cross-sell tab
 * component can render team rows with no changes.
 */
export function computeTeamRollup(
  cashierRows: CashierCrossSellRow[],
  teams: Team[],
): CashierCrossSellRow[] {
  const teamsById = new Map(teams.map((t) => [t.id, t]))
  const groups = new Map<string, CashierCrossSellRow[]>()

  for (const row of cashierRows) {
    const teamId = row.cashier.teamId && teamsById.has(row.cashier.teamId) ? row.cashier.teamId : NO_TEAM_ID
    const arr = groups.get(teamId)
    if (arr) arr.push(row)
    else groups.set(teamId, [row])
  }

  const result: CashierCrossSellRow[] = []
  for (const [teamId, rows] of groups.entries()) {
    const teamName = teamId === NO_TEAM_ID ? 'Fără echipă' : (teamsById.get(teamId)?.name ?? teamId)

    const sum = (pick: (r: CashierCrossSellRow) => number) => rows.reduce((s, r) => s + pick(r), 0)
    const totalReceipts = sum((r) => r.totalReceipts)
    const totalSales = sum((r) => r.totalSales)
    // Union, not sum: two teammates on the same date+shift is one tură for
    // the team, not two — summing per-member counts double-counts every
    // shift/day the team actually worked together.
    const shiftsWorked = new Set(rows.flatMap((r) => r.shiftKeys)).size
    const daysWorked = new Set(rows.flatMap((r) => r.dayKeys)).size
    const fuelReceipts = sum((r) => r.fuelReceipts)
    const fuelPlusGoodsReceipts = sum((r) => r.fuelPlusGoodsReceipts)

    const coffeeTotal = sum((r) => r.coffee.total)
    const coffeeReceipts = sum((r) => r.coffee.receiptsWithCoffee)
    const vitrinaQty = sum((r) => r.vitrina.quantity)
    const vitrinaValue = sum((r) => r.vitrina.value)
    const vitrinaReceipts = sum((r) => r.vitrina.receiptsWithVitrina)
    const sandwichTotal = sum((r) => r.sandwich.total)
    const sandwichValue = sum((r) => r.sandwich.value)
    const sandwichReceipts = sum((r) => r.sandwich.receiptsWithSandwich)
    const lemonadeQty = sum((r) => r.lemonade.quantity)
    const lemonadeValue = sum((r) => r.lemonade.value)
    const lemonadeReceipts = sum((r) => r.lemonade.receiptsWithLemonade)
    const promoLineCount = sum((r) => r.promo.lineCount)
    const promoValue = sum((r) => r.promo.value)
    const promoReceipts = sum((r) => r.promo.receiptsWithPromo)

    result.push({
      cashier: { id: `${TEAM_ROW_PREFIX}${teamId}`, name: teamName, aliases: [], active: true, teamId: null, createdAt: 0 },
      totalReceipts,
      totalSales,
      avgReceiptValue: totalReceipts > 0 ? totalSales / totalReceipts : 0,
      daysWorked,
      dayKeys: Array.from(new Set(rows.flatMap((r) => r.dayKeys))),
      shiftsWorked,
      shiftKeys: Array.from(new Set(rows.flatMap((r) => r.shiftKeys))),
      fuelReceipts,
      fuelPlusGoodsReceipts,
      crossSellPct: pct(fuelPlusGoodsReceipts, fuelReceipts),
      coffee: {
        espresso: sum((r) => r.coffee.espresso),
        espressoLung: sum((r) => r.coffee.espressoLung),
        cappuccinoLung: sum((r) => r.coffee.cappuccinoLung),
        total: coffeeTotal,
        receiptsWithCoffee: coffeeReceipts,
        pctReceiptsWithCoffee: pct(coffeeReceipts, totalReceipts),
        per100Receipts: pct(coffeeTotal, totalReceipts),
        perShift: shiftsWorked > 0 ? coffeeTotal / shiftsWorked : 0,
        perDay: daysWorked > 0 ? coffeeTotal / daysWorked : 0,
      },
      vitrina: {
        receiptsWithVitrina: vitrinaReceipts,
        pctReceipts: pct(vitrinaReceipts, totalReceipts),
        quantity: vitrinaQty,
        value: vitrinaValue,
      },
      sandwich: {
        prosciuttoCotto: sum((r) => r.sandwich.prosciuttoCotto),
        prosciuttoCrudo: sum((r) => r.sandwich.prosciuttoCrudo),
        mozzarellaPesto: sum((r) => r.sandwich.mozzarellaPesto),
        kebab: sum((r) => r.sandwich.kebab),
        toast: sum((r) => r.sandwich.toast),
        total: sandwichTotal,
        value: sandwichValue,
        receiptsWithSandwich: sandwichReceipts,
        pctReceipts: pct(sandwichReceipts, totalReceipts),
        per100Receipts: pct(sandwichTotal, totalReceipts),
      },
      lemonade: {
        quantity: lemonadeQty,
        value: lemonadeValue,
        receiptsWithLemonade: lemonadeReceipts,
        pctReceipts: pct(lemonadeReceipts, totalReceipts),
      },
      promo: {
        lineCount: promoLineCount,
        value: promoValue,
        receiptsWithPromo: promoReceipts,
        pctReceipts: pct(promoReceipts, totalReceipts),
      },
    })
  }

  return result.sort((a, b) => b.totalSales - a.totalSales)
}
