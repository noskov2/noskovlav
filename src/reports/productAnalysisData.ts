import type { Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, type Receipt } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { idsOf, resolveCoffeeVariants, resolveSandwichVariants, SANDWICH_VARIANT_LABELS, type SandwichVariants } from '@/kpi/namedVariants'
import { monthLabel } from '@/kpi/dateRanges'
import { buildPontajIndex, scheduledTeamFor, resolveTeamName, loadTeamNames, defaultTeamLabel } from '@/data/pontaj'
import { computePromoLineLabels } from '@/kpi/promoLines'

// "Analiza Produse" — inspired by the station's own "Analiza produse" workbook
// (TURE / SANDWICH / CAFEA sections, per-team rows), extended per the
// station's request with: dulciuri-vitrină broken down per individual
// product, and a "linii promoții" section. Unlike the monthly report and
// Raport Bonuri, this one is NOT required to be 1:1 with the reference file
// — it is meant to improve on it.
//
// Team attribution follows the pre-set monthly schedule (pontaj) from the
// Target page — which team was ROSTERED for a given date+tură — never which
// cashier happened to be logged into the register that shift. Cashiers swap
// shifts informally among themselves, so grouping by Cashier.teamId (this
// report's old approach) could pile up a whole month's sales under the
// wrong team — e.g. showing a team with more "ture" in a month than the
// month has days, which is what this fix was reported against. Per the
// station owner, the pontaj is the schedule of record — see src/data/pontaj.ts.
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

const UNSCHEDULED_KEY = '__unscheduled__'

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
  // No pontaj imported on the Target page for this month at all — every row
  // will be "Fără pontaj" until one is imported/created there.
  pontajConfigured: boolean

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
): ProductAnalysisData {
  const monthPrefix = `${year}-${pad(month)}`
  const monthTx = allTransactions.filter((t) => t.date.startsWith(monthPrefix))

  const pontajIndex = buildPontajIndex()
  const teamNamesOverride = loadTeamNames()
  const teamLabel = (key: string) => (key === UNSCHEDULED_KEY ? 'Fără pontaj' : resolveTeamName(defaultTeamLabel(key), teamNamesOverride))
  const teamKeyFor = (date: string, shift: TransactionLine['shift']) => scheduledTeamFor(pontajIndex, date, shift) ?? UNSCHEDULED_KEY

  const fuelIds = fuelProductIds(products)
  const receipts = groupIntoReceipts(monthTx, fuelIds)

  const linesByTeam = new Map<string, TransactionLine[]>()
  const receiptsByTeam = new Map<string, Receipt[]>()
  for (const t of monthTx) {
    const key = teamKeyFor(t.date, t.shift)
    const arr = linesByTeam.get(key)
    if (arr) arr.push(t)
    else linesByTeam.set(key, [t])
  }
  for (const r of receipts) {
    const key = teamKeyFor(r.date, r.shift)
    const arr = receiptsByTeam.get(key)
    if (arr) arr.push(r)
    else receiptsByTeam.set(key, [r])
  }
  const linesFor = (id: string) => linesByTeam.get(id) ?? []
  const receiptsFor = (id: string) => receiptsByTeam.get(id) ?? []

  // TURE (shifts): counted straight from the schedule itself — how many days
  // this month the team was ROSTERED for tură 1 / tură 2 — never from
  // whether a transaction happens to exist that shift, and never capped by
  // (or dependent on) which cashier actually rang the register.
  const shiftCounts = new Map<string, { morning: number; evening: number }>()
  const ensureShiftCount = (key: string) => {
    let c = shiftCounts.get(key)
    if (!c) { c = { morning: 0, evening: 0 }; shiftCounts.set(key, c) }
    return c
  }
  let pontajConfigured = false
  for (const [iso, day] of pontajIndex) {
    if (!iso.startsWith(monthPrefix)) continue
    pontajConfigured = true
    if (day.tura1) ensureShiftCount(day.tura1).morning++
    if (day.tura2) ensureShiftCount(day.tura2).evening++
  }

  // Every team key that shows up anywhere this month — scheduled shifts,
  // sales lines, or receipts — gets a row, "Fără pontaj" (if present) always
  // last.
  const teamKeySet = new Set<string>([...shiftCounts.keys(), ...linesByTeam.keys(), ...receiptsByTeam.keys()])
  const hasUnscheduled = teamKeySet.has(UNSCHEDULED_KEY)
  teamKeySet.delete(UNSCHEDULED_KEY)
  const teamIds = Array.from(teamKeySet).sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)))
  if (hasUnscheduled) teamIds.push(UNSCHEDULED_KEY)
  const teamName = new Map<string, string>(teamIds.map((id) => [id, teamLabel(id)]))

  const shifts: TeamShiftRow[] = teamIds.map((id) => {
    const c = shiftCounts.get(id) ?? { morning: 0, evening: 0 }
    return { teamId: id, teamName: teamName.get(id) ?? id, morning: c.morning, evening: c.evening, total: c.morning + c.evening }
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
    const lines = linesFor(id)
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
    const lines = linesFor(id)
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
    const lines = linesFor(id)
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
  const promoLabelsById = computePromoLineLabels(monthTx, products)
  const hasPromoColumn = monthTx.some((t) => !!t.promotionRaw)
  const promoConfigured = promoProductIds.size > 0 || hasPromoColumn

  const promo: TeamPromoRow[] = teamIds.map((id) => {
    const lines = linesFor(id)
    const promoLines = lines.filter((t) => promoLabelsById.has(t.id))
    const totalReceipts = receiptsFor(id).length
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
    for (const t of linesFor(id)) {
      const label = promoLabelsById.get(t.id)
      if (!label) continue
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
    pontajConfigured,
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
