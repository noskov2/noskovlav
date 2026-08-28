import type { Cashier, Product, Team, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, type Receipt } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { idsOf, resolveCoffeeVariants, resolveSandwichVariants, SANDWICH_VARIANT_LABELS, type SandwichVariants } from '@/kpi/namedVariants'
import { monthLabel } from '@/kpi/dateRanges'
import { NO_TEAM_ID } from '@/kpi/teamRollup'
import { buildTeamAsOfResolver } from '@/kpi/teamHistory'

// "Analiza Produse" — inspired by the station's own "Analiza produse" workbook
// (TURE / SANDWICH / CAFEA sections, per-team rows), extended per the
// station's request with: dulciuri-vitrină broken down per individual
// product, and a "linii promoții" section. Unlike the monthly report and
// Raport Bonuri, this one is NOT required to be 1:1 with the reference file
// — it is meant to improve on it.
//
// "Linii promoții" is detected two ways, combined with OR:
//  1. The "Promoție" column mapped at import time (Import date -> Mapare
//     coloane) — its raw text becomes the promotion's name/label, so the
//     breakdown below can show *which* promotion each team sold, not just a
//     count.
//  2. The "Promoții" special group in Nomenclator -> Grupuri pe categorie
//     (same mechanism used for Cafea/Sandwich/Dulciuri Vitrină), for stations
//     that only have a dedicated category rather than a per-line column.
// Until at least one is configured, the section still renders with a clear
// explanation instead of being silently skipped.

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export interface TeamShiftRow {
  teamId: string
  teamName: string
  morning: number
  evening: number
  total: number
}

export interface TeamSandwichRow {
  teamId: string
  teamName: string
  values: Record<keyof SandwichVariants, number>
  other: number // sandwich group members that don't match any of the 5 named variants
  total: number
}

export interface TeamCoffeeRow {
  teamId: string
  teamName: string
  espressoLung: number
  espresso: number
  cappuccino: number
  other: number // cafea group members that don't match espresso/espressoLung/cappuccino by name
  total: number
}

export interface VitrinaProductRow {
  productId: string
  productName: string
  byTeam: Record<string, number> // teamId -> quantity
  total: number
}

export interface TeamPromoRow {
  teamId: string
  teamName: string
  lineCount: number
  value: number
  totalReceipts: number
  pctOfReceipts: number // 0..100
}

export interface PromoBreakdownRow {
  label: string // the promotion's name, from the mapped column (or the product name as a fallback)
  byTeam: Record<string, number> // teamId -> line count
  total: number
}

export interface ProductAnalysisData {
  year: number
  month: number
  title: string
  monthLabelText: string

  teamIds: string[]
  teamNames: Record<string, string>

  shifts: TeamShiftRow[]
  sandwich: TeamSandwichRow[]
  sandwichTotals: Record<keyof SandwichVariants, number>
  sandwichOtherTotal: number

  vitrinaProducts: VitrinaProductRow[]
  vitrinaTeamTotals: Record<string, number>

  coffee: TeamCoffeeRow[]
  coffeeTotals: { espressoLung: number; espresso: number; cappuccino: number; other: number; total: number }

  promo: TeamPromoRow[]
  promoBreakdown: PromoBreakdownRow[]
  promoConfigured: boolean // false if neither the "Promoție" column nor the "Promoții" group is set up yet
}

export function computeProductAnalysisData(
  year: number,
  month: number,
  allTransactions: TransactionLine[],
  products: Product[],
  cashiers: Cashier[],
  teams: Team[],
): ProductAnalysisData {
  const monthPrefix = `${year}-${pad(month)}`
  const monthTx = allTransactions.filter((t) => t.date.startsWith(monthPrefix))

  // Resolved per transaction/receipt date, not from each cashier's CURRENT
  // team — a team change recorded after this month must not retroactively
  // move that month's sales into the new team.
  const teamAsOf = buildTeamAsOfResolver(cashiers)
  const cashierTeamOn = (cashierId: string, date: string) => teamAsOf(cashierId, date) ?? NO_TEAM_ID
  const teamName = new Map<string, string>(teams.map((t) => [t.id, t.name]))
  teamName.set(NO_TEAM_ID, 'Fără echipă')

  const teamIds = [...teams.map((t) => t.id)]
  if (monthTx.some((t) => cashierTeamOn(t.cashierId, t.date) === NO_TEAM_ID)) teamIds.push(NO_TEAM_ID)

  const fuelIds = fuelProductIds(products)
  const receipts = groupIntoReceipts(monthTx, fuelIds)

  const linesByTeam = new Map<string, TransactionLine[]>()
  const receiptsByTeam = new Map<string, Receipt[]>()
  for (const id of teamIds) {
    linesByTeam.set(id, [])
    receiptsByTeam.set(id, [])
  }
  for (const t of monthTx) {
    const id = cashierTeamOn(t.cashierId, t.date)
    linesByTeam.get(id)?.push(t)
  }
  for (const r of receipts) {
    const id = cashierTeamOn(r.cashierId, r.date)
    receiptsByTeam.get(id)?.push(r)
  }

  // ---- TURE (shifts) ----
  const shifts: TeamShiftRow[] = teamIds.map((id) => {
    const lines = linesByTeam.get(id)!
    // One team-shift per date, not per member on duty that date — two
    // cashiers from the same team working the same date+shift is one tură
    // for the team, not two.
    const morningKeys = new Set(lines.filter((t) => t.shift === 1).map((t) => t.date))
    const eveningKeys = new Set(lines.filter((t) => t.shift === 2).map((t) => t.date))
    return {
      teamId: id,
      teamName: teamName.get(id) ?? id,
      morning: morningKeys.size,
      evening: eveningKeys.size,
      total: morningKeys.size + eveningKeys.size,
    }
  })

  // ---- SANDWICH ----
  // Totals tie to the 'sandwich' Nomenclator group (same one Comparație
  // lunară and the Dashboard use) — the 5 named variants below only split
  // that total into buckets; anything in the group that matches none of
  // them still counts, in "other".
  const sandwichGroupIds = productIdsInGroup(products, 'sandwich')
  const sandwichVariants = resolveSandwichVariants(products)
  const sandwichSets: Record<keyof SandwichVariants, Set<string>> = {
    prosciuttoCotto: new Set([...idsOf(sandwichVariants.prosciuttoCotto)].filter((id) => sandwichGroupIds.has(id))),
    prosciuttoCrudo: new Set([...idsOf(sandwichVariants.prosciuttoCrudo)].filter((id) => sandwichGroupIds.has(id))),
    mozzarellaPesto: new Set([...idsOf(sandwichVariants.mozzarellaPesto)].filter((id) => sandwichGroupIds.has(id))),
    kebab: new Set([...idsOf(sandwichVariants.kebab)].filter((id) => sandwichGroupIds.has(id))),
    toast: new Set([...idsOf(sandwichVariants.toast)].filter((id) => sandwichGroupIds.has(id))),
  }
  const sandwichKeys = Object.keys(sandwichSets) as (keyof SandwichVariants)[]
  const sandwichNamedIds = new Set(sandwichKeys.flatMap((k) => [...sandwichSets[k]]))
  const sandwichOtherIds = new Set([...sandwichGroupIds].filter((id) => !sandwichNamedIds.has(id)))

  const sandwich: TeamSandwichRow[] = teamIds.map((id) => {
    const lines = linesByTeam.get(id)!
    const values = {} as Record<keyof SandwichVariants, number>
    for (const k of sandwichKeys) {
      values[k] = lines.filter((t) => sandwichSets[k].has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    }
    const other = lines.filter((t) => sandwichOtherIds.has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    const total = sandwichKeys.reduce((s, k) => s + values[k], 0) + other
    return { teamId: id, teamName: teamName.get(id) ?? id, values, other, total }
  })
  const sandwichTotals = {} as Record<keyof SandwichVariants, number>
  for (const k of sandwichKeys) sandwichTotals[k] = sandwich.reduce((s, r) => s + r.values[k], 0)
  const sandwichOtherTotal = sandwich.reduce((s, r) => s + r.other, 0)

  // ---- CAFEA ----
  // Same idea: total ties to the 'cafea' group, named variants only split it.
  const coffeeGroupIds = productIdsInGroup(products, 'cafea')
  const coffeeVariants = resolveCoffeeVariants(products)
  const espressoIds = new Set([...idsOf(coffeeVariants.espresso)].filter((id) => coffeeGroupIds.has(id)))
  const espressoLungIds = new Set([...idsOf(coffeeVariants.espressoLung)].filter((id) => coffeeGroupIds.has(id)))
  const cappuccinoIds = new Set([...idsOf(coffeeVariants.cappuccino)].filter((id) => coffeeGroupIds.has(id)))
  const coffeeNamedIds = new Set([...espressoIds, ...espressoLungIds, ...cappuccinoIds])
  const coffeeOtherIds = new Set([...coffeeGroupIds].filter((id) => !coffeeNamedIds.has(id)))

  const coffee: TeamCoffeeRow[] = teamIds.map((id) => {
    const lines = linesByTeam.get(id)!
    const espressoLung = lines.filter((t) => espressoLungIds.has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    const espresso = lines.filter((t) => espressoIds.has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    const cappuccino = lines.filter((t) => cappuccinoIds.has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    const other = lines.filter((t) => coffeeOtherIds.has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    return {
      teamId: id,
      teamName: teamName.get(id) ?? id,
      espressoLung,
      espresso,
      cappuccino,
      other,
      total: espressoLung + espresso + cappuccino + other,
    }
  })
  const coffeeTotals = {
    espressoLung: coffee.reduce((s, r) => s + r.espressoLung, 0),
    espresso: coffee.reduce((s, r) => s + r.espresso, 0),
    cappuccino: coffee.reduce((s, r) => s + r.cappuccino, 0),
    other: coffee.reduce((s, r) => s + r.other, 0),
    total: coffee.reduce((s, r) => s + r.total, 0),
  }

  // ---- DULCIURI VITRINĂ, per product ----
  const vitrinaProductIds = productIdsInGroup(products, 'dulciuriVitrina')
  const vitrinaProductsById = new Map(products.filter((p) => vitrinaProductIds.has(p.id)).map((p) => [p.id, p]))
  const vitrinaQtyByProductTeam = new Map<string, Map<string, number>>() // productId -> teamId -> qty
  for (const id of teamIds) {
    const lines = linesByTeam.get(id)!
    for (const t of lines) {
      if (!vitrinaProductIds.has(t.productId)) continue
      let byTeam = vitrinaQtyByProductTeam.get(t.productId)
      if (!byTeam) {
        byTeam = new Map()
        vitrinaQtyByProductTeam.set(t.productId, byTeam)
      }
      byTeam.set(id, (byTeam.get(id) ?? 0) + t.quantity)
    }
  }
  const vitrinaProducts: VitrinaProductRow[] = Array.from(vitrinaQtyByProductTeam.entries())
    .map(([productId, byTeam]) => {
      const byTeamObj: Record<string, number> = {}
      let total = 0
      for (const id of teamIds) {
        const q = byTeam.get(id) ?? 0
        byTeamObj[id] = q
        total += q
      }
      return { productId, productName: vitrinaProductsById.get(productId)?.name ?? productId, byTeam: byTeamObj, total }
    })
    .sort((a, b) => b.total - a.total)
  const vitrinaTeamTotals: Record<string, number> = {}
  for (const id of teamIds) vitrinaTeamTotals[id] = vitrinaProducts.reduce((s, p) => s + (p.byTeam[id] ?? 0), 0)

  // ---- PROMOȚII ----
  const promoProductIds = productIdsInGroup(products, 'promotii')
  const productsById = new Map(products.map((p) => [p.id, p]))
  const hasPromoColumn = monthTx.some((t) => !!t.promotionRaw)
  const promoConfigured = promoProductIds.size > 0 || hasPromoColumn
  const isPromoLine = (t: TransactionLine) => !!t.promotionRaw || promoProductIds.has(t.productId)
  const promoLabelOf = (t: TransactionLine) => t.promotionRaw?.trim() || productsById.get(t.productId)?.name || t.productRaw

  const promo: TeamPromoRow[] = teamIds.map((id) => {
    const lines = linesByTeam.get(id)!
    const promoLines = lines.filter(isPromoLine)
    const totalReceipts = receiptsByTeam.get(id)!.length
    return {
      teamId: id,
      teamName: teamName.get(id) ?? id,
      lineCount: promoLines.length,
      value: promoLines.reduce((s, t) => s + t.value, 0),
      totalReceipts,
      pctOfReceipts: totalReceipts > 0 ? (promoLines.length / totalReceipts) * 100 : 0,
    }
  })

  const promoCountByLabelTeam = new Map<string, Map<string, number>>() // label -> teamId -> count
  for (const id of teamIds) {
    for (const t of linesByTeam.get(id)!) {
      if (!isPromoLine(t)) continue
      const label = promoLabelOf(t)
      let byTeam = promoCountByLabelTeam.get(label)
      if (!byTeam) {
        byTeam = new Map()
        promoCountByLabelTeam.set(label, byTeam)
      }
      byTeam.set(id, (byTeam.get(id) ?? 0) + 1)
    }
  }
  const promoBreakdown: PromoBreakdownRow[] = Array.from(promoCountByLabelTeam.entries())
    .map(([label, byTeam]) => {
      const byTeamObj: Record<string, number> = {}
      let total = 0
      for (const id of teamIds) {
        const c = byTeam.get(id) ?? 0
        byTeamObj[id] = c
        total += c
      }
      return { label, byTeam: byTeamObj, total }
    })
    .sort((a, b) => b.total - a.total)

  const monthLabelText = monthLabel(`${year}-${pad(month)}-01`)

  return {
    year,
    month,
    title: `ANALIZA PRODUSE PER ECHIPE — ${monthLabelText.toUpperCase()}`,
    monthLabelText,
    teamIds,
    teamNames: Object.fromEntries(teamIds.map((id) => [id, teamName.get(id) ?? id])),
    shifts,
    sandwich,
    sandwichTotals,
    sandwichOtherTotal,
    vitrinaProducts,
    vitrinaTeamTotals,
    coffee,
    coffeeTotals,
    promo,
    promoBreakdown,
    promoConfigured,
  }
}

export { SANDWICH_VARIANT_LABELS }
