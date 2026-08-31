import type { Cashier, Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, receiptContainsProduct, quantityOfProducts, valueOfProducts, type Receipt } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { idsOf, resolveCoffeeVariants, resolveSandwichVariants } from '@/kpi/namedVariants'
import { promoLabelsForReceiptLines } from '@/kpi/promoLines'

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter((id) => b.has(id)))
}

export interface CoffeeBreakdown {
  espresso: number
  espressoLung: number
  cappuccino: number
  other: number // cafea group members that don't match espresso/espressoLung/cappuccino by name
  total: number
  receiptsWithCoffee: number
  pctReceiptsWithCoffee: number
  per100Receipts: number
  perShift: number
  perDay: number
}

export interface VitrinaBreakdown {
  receiptsWithVitrina: number
  pctReceipts: number
  quantity: number
  value: number
  per100Receipts: number
}

export interface SandwichBreakdown {
  prosciuttoCotto: number
  prosciuttoCrudo: number
  mozzarellaPesto: number
  kebab: number
  toast: number
  other: number // sandwich group members that don't match any of the 5 named variants
  total: number
  value: number
  receiptsWithSandwich: number
  pctReceipts: number
  per100Receipts: number
}

export interface LemonadeBreakdown {
  quantity: number
  value: number
  receiptsWithLemonade: number
  pctReceipts: number
}

export interface PromoBreakdown {
  lineCount: number
  value: number
  receiptsWithPromo: number
  pctReceipts: number
  per100Receipts: number
}

export interface CashierCrossSellRow {
  cashier: Cashier
  totalReceipts: number
  totalSales: number
  avgReceiptValue: number
  daysWorked: number
  dayKeys: string[] // unique dates — lets team rollups de-duplicate instead of summing per-member counts
  shiftsWorked: number
  shiftKeys: string[] // unique "date:shift" keys — lets team rollups de-duplicate instead of summing per-member counts
  fuelReceipts: number
  fuelPlusGoodsReceipts: number
  crossSellPct: number
  goodsValueOnFuelReceipts: number // valoare marfă (non-carburant, non-exclusă) însumată pe toate bonurile cu carburant
  coffee: CoffeeBreakdown
  vitrina: VitrinaBreakdown
  sandwich: SandwichBreakdown
  lemonade: LemonadeBreakdown
  promo: PromoBreakdown
}

// The total ties to the same 'cafea' Nomenclator group used by every other
// page (Dashboard, Comparație lunară) — NOT just whichever products happen
// to match the espresso/espressoLung/cappuccino name patterns below. Those
// patterns only decide how the group's total splits into named buckets;
// anything in the group that matches none of them still counts, in "other",
// instead of silently vanishing from the total the way it used to (the old
// version summed only the three name-matched buckets, so any cafea-group
// product with a name the patterns didn't recognize — a misspelling, a
// product like "Espresso Dublu", a locally-typed variant — was invisible
// here even though it was correctly counted everywhere else).
function computeCoffee(receipts: Receipt[], products: Product[]): CoffeeBreakdown {
  const groupIds = productIdsInGroup(products, 'cafea')
  const variants = resolveCoffeeVariants(products)
  const espressoIds = intersect(idsOf(variants.espresso), groupIds)
  const espressoLungIds = intersect(idsOf(variants.espressoLung), groupIds)
  const cappuccinoIds = intersect(idsOf(variants.cappuccino), groupIds)
  const namedIds = new Set([...espressoIds, ...espressoLungIds, ...cappuccinoIds])
  const otherIds = new Set([...groupIds].filter((id) => !namedIds.has(id)))

  let espresso = 0
  let espressoLung = 0
  let cappuccino = 0
  let other = 0
  let receiptsWithCoffee = 0
  const shiftsSeen = new Set<string>()
  const daysSeen = new Set<string>()

  for (const r of receipts) {
    daysSeen.add(r.date)
    if (r.shift) shiftsSeen.add(`${r.date}:${r.shift}`)
    espresso += quantityOfProducts(r, espressoIds)
    espressoLung += quantityOfProducts(r, espressoLungIds)
    cappuccino += quantityOfProducts(r, cappuccinoIds)
    other += quantityOfProducts(r, otherIds)
    if (receiptContainsProduct(r, groupIds)) receiptsWithCoffee++
  }

  const total = espresso + espressoLung + cappuccino + other
  const receiptCount = receipts.length
  const shifts = shiftsSeen.size || 1
  const days = daysSeen.size || 1

  return {
    espresso,
    espressoLung,
    cappuccino,
    other,
    total,
    receiptsWithCoffee,
    pctReceiptsWithCoffee: receiptCount > 0 ? (receiptsWithCoffee / receiptCount) * 100 : 0,
    per100Receipts: receiptCount > 0 ? (total / receiptCount) * 100 : 0,
    perShift: total / shifts,
    perDay: total / days,
  }
}

function computeVitrina(receipts: Receipt[], products: Product[]): VitrinaBreakdown {
  const ids = productIdsInGroup(products, 'dulciuriVitrina')
  let receiptsWithVitrina = 0
  let quantity = 0
  let value = 0
  for (const r of receipts) {
    if (receiptContainsProduct(r, ids)) receiptsWithVitrina++
    quantity += quantityOfProducts(r, ids)
    value += valueOfProducts(r, ids)
  }
  return {
    receiptsWithVitrina,
    pctReceipts: receipts.length > 0 ? (receiptsWithVitrina / receipts.length) * 100 : 0,
    quantity,
    value,
    per100Receipts: receipts.length > 0 ? (quantity / receipts.length) * 100 : 0,
  }
}

// Same idea as computeCoffee: the total ties to the 'sandwich' Nomenclator
// group, and the 5 named patterns only split that total into buckets — a
// sandwich whose name doesn't match any of them (e.g. spelled "sandviș"
// instead of "sandwich", or a filling not on this list) still counts, in
// "other", instead of dropping out of the total.
function computeSandwich(receipts: Receipt[], products: Product[]): SandwichBreakdown {
  const groupIds = productIdsInGroup(products, 'sandwich')
  const variants = resolveSandwichVariants(products)
  const sets = {
    prosciuttoCotto: intersect(idsOf(variants.prosciuttoCotto), groupIds),
    prosciuttoCrudo: intersect(idsOf(variants.prosciuttoCrudo), groupIds),
    mozzarellaPesto: intersect(idsOf(variants.mozzarellaPesto), groupIds),
    kebab: intersect(idsOf(variants.kebab), groupIds),
    toast: intersect(idsOf(variants.toast), groupIds),
  }
  const namedIds = new Set([...sets.prosciuttoCotto, ...sets.prosciuttoCrudo, ...sets.mozzarellaPesto, ...sets.kebab, ...sets.toast])
  const otherIds = new Set([...groupIds].filter((id) => !namedIds.has(id)))

  let prosciuttoCotto = 0
  let prosciuttoCrudo = 0
  let mozzarellaPesto = 0
  let kebab = 0
  let toast = 0
  let other = 0
  let value = 0
  let receiptsWithSandwich = 0

  for (const r of receipts) {
    prosciuttoCotto += quantityOfProducts(r, sets.prosciuttoCotto)
    prosciuttoCrudo += quantityOfProducts(r, sets.prosciuttoCrudo)
    mozzarellaPesto += quantityOfProducts(r, sets.mozzarellaPesto)
    kebab += quantityOfProducts(r, sets.kebab)
    toast += quantityOfProducts(r, sets.toast)
    other += quantityOfProducts(r, otherIds)
    value += valueOfProducts(r, groupIds)
    if (receiptContainsProduct(r, groupIds)) receiptsWithSandwich++
  }

  const total = prosciuttoCotto + prosciuttoCrudo + mozzarellaPesto + kebab + toast + other
  return {
    prosciuttoCotto,
    prosciuttoCrudo,
    mozzarellaPesto,
    kebab,
    toast,
    other,
    total,
    value,
    receiptsWithSandwich,
    pctReceipts: receipts.length > 0 ? (receiptsWithSandwich / receipts.length) * 100 : 0,
    per100Receipts: receipts.length > 0 ? (total / receipts.length) * 100 : 0,
  }
}

function computeLemonade(receipts: Receipt[], products: Product[]): LemonadeBreakdown {
  const ids = productIdsInGroup(products, 'limonadaCeai')
  let quantity = 0
  let value = 0
  let receiptsWithLemonade = 0
  for (const r of receipts) {
    quantity += quantityOfProducts(r, ids)
    value += valueOfProducts(r, ids)
    if (receiptContainsProduct(r, ids)) receiptsWithLemonade++
  }
  return {
    quantity,
    value,
    receiptsWithLemonade,
    pctReceipts: receipts.length > 0 ? (receiptsWithLemonade / receipts.length) * 100 : 0,
  }
}

function computePromo(receipts: Receipt[], products: Product[]): PromoBreakdown {
  const promoProductIds = productIdsInGroup(products, 'promotii')
  const productsById = new Map(products.map((p) => [p.id, p]))
  let lineCount = 0
  let value = 0
  let receiptsWithPromo = 0
  for (const r of receipts) {
    const labels = promoLabelsForReceiptLines(r.lines, promoProductIds, productsById)
    if (labels.size > 0) receiptsWithPromo++
    for (const l of r.lines) {
      if (!labels.has(l.id)) continue
      lineCount++
      value += l.value
    }
  }
  return {
    lineCount,
    value,
    receiptsWithPromo,
    pctReceipts: receipts.length > 0 ? (receiptsWithPromo / receipts.length) * 100 : 0,
    per100Receipts: receipts.length > 0 ? (lineCount / receipts.length) * 100 : 0,
  }
}

// Exported so pontajTeamReport.ts can build the same row shape for a group
// of receipts scheduled to a pontaj team, instead of a single cashier.
export function buildCashierRow(
  cashier: Cashier,
  receipts: Receipt[],
  products: Product[],
  fuelIds: Set<string>,
  excludedIds: Set<string>,
): CashierCrossSellRow {
  const totalSales = receipts.reduce((s, r) => s + r.totalValue, 0)
  const fuelReceipts = receipts.filter((r) => r.hasFuel)
  const fuelPlusGoods = fuelReceipts.filter((r) => r.hasGoods)
  const dayKeys = Array.from(new Set(receipts.map((r) => r.date)))
  const shiftKeys = Array.from(new Set(receipts.filter((r) => r.shift).map((r) => `${r.date}:${r.shift}`)))
  const goodsValueOnFuelReceipts = fuelReceipts.reduce(
    (s, r) => s + r.lines.reduce((ls, l) => (fuelIds.has(l.productId) || excludedIds.has(l.productId) ? ls : ls + l.value), 0),
    0,
  )

  return {
    cashier,
    totalReceipts: receipts.length,
    totalSales,
    avgReceiptValue: receipts.length > 0 ? totalSales / receipts.length : 0,
    daysWorked: dayKeys.length,
    dayKeys,
    shiftsWorked: shiftKeys.length,
    shiftKeys,
    fuelReceipts: fuelReceipts.length,
    fuelPlusGoodsReceipts: fuelPlusGoods.length,
    crossSellPct: fuelReceipts.length > 0 ? (fuelPlusGoods.length / fuelReceipts.length) * 100 : 0,
    goodsValueOnFuelReceipts,
    coffee: computeCoffee(receipts, products),
    vitrina: computeVitrina(receipts, products),
    sandwich: computeSandwich(receipts, products),
    lemonade: computeLemonade(receipts, products),
    promo: computePromo(receipts, products),
  }
}

export interface CrossSellReport {
  stationTotal: CashierCrossSellRow
  cashiers: CashierCrossSellRow[]
}

export function computeCrossSellReport(
  transactions: TransactionLine[],
  products: Product[],
  cashiers: Cashier[],
): CrossSellReport {
  const fuelIds = fuelProductIds(products)
  const excludedIds = productIdsInGroup(products, 'crossSellExcluded')
  const receipts = groupIntoReceipts(transactions, fuelIds, excludedIds)

  const stationCashier: Cashier = {
    id: '__station__',
    name: 'TOTAL STAȚIE',
    aliases: [],
    active: true,
    teamId: null,
    teamHistory: [],
    resignedAt: null,
    resignedNote: null,
    createdAt: 0,
  }
  const stationTotal = buildCashierRow(stationCashier, receipts, products, fuelIds, excludedIds)

  const byCashierId = new Map<string, Receipt[]>()
  for (const r of receipts) {
    const arr = byCashierId.get(r.cashierId)
    if (arr) arr.push(r)
    else byCashierId.set(r.cashierId, [r])
  }

  const rows = Array.from(byCashierId.entries())
    .map(([cashierId, cashierReceipts]) => {
      const cashier = cashiers.find((c) => c.id === cashierId)
      if (!cashier) return null
      return buildCashierRow(cashier, cashierReceipts, products, fuelIds, excludedIds)
    })
    .filter((r): r is CashierCrossSellRow => r !== null)
    .sort((a, b) => b.totalSales - a.totalSales)

  return { stationTotal, cashiers: rows }
}
