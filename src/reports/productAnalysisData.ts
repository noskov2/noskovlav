import type { Cashier, Product, Team, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, type Receipt } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { idsOf, resolveCoffeeVariants, resolveSandwichVariants, SANDWICH_VARIANT_LABELS, type SandwichVariants } from '@/kpi/namedVariants'
import { monthLabel } from '@/kpi/dateRanges'
import { NO_TEAM_ID } from '@/kpi/teamRollup'

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
  total: number
}

export interface TeamCoffeeRow {
  teamId: string
  teamName: string
  espressoLung: number
  espresso: number
  cappuccino: number
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

  vitrinaProducts: VitrinaProductRow[]
  vitrinaTeamTotals: Record<string, number>

  coffee: TeamCoffeeRow[]
  coffeeTotals: { espressoLung: number; espresso: number; cappuccino: number; total: number }

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

  const cashierTeam = new Map<string, string>()
  for (const c of cashiers) cashierTeam.set(c.id, c.teamId ?? NO_TEAM_ID)
  const teamName = new Map<string, string>(teams.map((t) => [t.id, t.name]))
  teamName.set(NO_TEAM_ID, 'Fără echipă')

  const teamIds = [...teams.map((t) => t.id)]
  if (monthTx.some((t) => (cashierTeam.get(t.cashierId) ?? NO_TEAM_ID) === NO_TEAM_ID)) teamIds.push(NO_TEAM_ID)

  const fuelIds = fuelProductIds(products)
  const receipts = groupIntoReceipts(monthTx, fuelIds)

  const linesByTeam = new Map<string, TransactionLine[]>()
  const receiptsByTeam = new Map<string, Receipt[]>()
  for (const id of teamIds) {
    linesByTeam.set(id, [])
    receiptsByTeam.set(id, [])
  }
  for (const t of monthTx) {
    const id = cashierTeam.get(t.cashierId) ?? NO_TEAM_ID
    linesByTeam.get(id)?.push(t)
  }
  for (const r of receipts) {
    const id = cashierTeam.get(r.cashierId) ?? NO_TEAM_ID
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
  const sandwichVariants = resolveSandwichVariants(products)
  const sandwichSets: Record<keyof SandwichVariants, Set<string>> = {
    prosciuttoCotto: idsOf(sandwichVariants.prosciuttoCotto),
    prosciuttoCrudo: idsOf(sandwichVariants.prosciuttoCrudo),
    mozzarellaPesto: idsOf(sandwichVariants.mozzarellaPesto),
    kebab: idsOf(sandwichVariants.kebab),
    toast: idsOf(sandwichVariants.toast),
  }
  const sandwichKeys = Object.keys(sandwichSets) as (keyof SandwichVariants)[]

  const sandwich: TeamSandwichRow[] = teamIds.map((id) => {
    const lines = linesByTeam.get(id)!
    const values = {} as Record<keyof SandwichVariants, number>
    for (const k of sandwichKeys) {
      values[k] = lines.filter((t) => sandwichSets[k].has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    }
    const total = sandwichKeys.reduce((s, k) => s + values[k], 0)
    return { teamId: id, teamName: teamName.get(id) ?? id, values, total }
  })
  const sandwichTotals = {} as Record<keyof SandwichVariants, number>
  for (const k of sandwichKeys) sandwichTotals[k] = sandwich.reduce((s, r) => s + r.values[k], 0)

  // ---- CAFEA ----
  const coffeeVariants = resolveCoffeeVariants(products)
  const espressoIds = idsOf(coffeeVariants.espresso)
  const espressoLungIds = idsOf(coffeeVariants.espressoLung)
  const cappuccinoIds = idsOf(coffeeVariants.cappuccinoLung)

  const coffee: TeamCoffeeRow[] = teamIds.map((id) => {
    const lines = linesByTeam.get(id)!
    const espressoLung = lines.filter((t) => espressoLungIds.has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    const espresso = lines.filter((t) => espressoIds.has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    const cappuccino = lines.filter((t) => cappuccinoIds.has(t.productId)).reduce((s, t) => s + t.quantity, 0)
    return { teamId: id, teamName: teamName.get(id) ?? id, espressoLung, espresso, cappuccino, total: espressoLung + espresso + cappuccino }
  })
  const coffeeTotals = {
    espressoLung: coffee.reduce((s, r) => s + r.espressoLung, 0),
    espresso: coffee.reduce((s, r) => s + r.espresso, 0),
    cappuccino: coffee.reduce((s, r) => s + r.cappuccino, 0),
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
