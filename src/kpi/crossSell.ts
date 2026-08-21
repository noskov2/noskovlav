import type { Cashier, Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, receiptContainsProduct, quantityOfProducts, valueOfProducts, type Receipt } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { idsOf, resolveCoffeeVariants, resolveSandwichVariants } from '@/kpi/namedVariants'

export interface CoffeeBreakdown {
  espresso: number
  espressoLung: number
  cappuccinoLung: number
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
}

export interface SandwichBreakdown {
  prosciuttoCotto: number
  prosciuttoCrudo: number
  mozzarellaPesto: number
  kebab: number
  toast: number
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
}

export interface CashierCrossSellRow {
  cashier: Cashier
  totalReceipts: number
  totalSales: number
  avgReceiptValue: number
  daysWorked: number
  shiftsWorked: number
  fuelReceipts: number
  fuelPlusGoodsReceipts: number
  crossSellPct: number
  coffee: CoffeeBreakdown
  vitrina: VitrinaBreakdown
  sandwich: SandwichBreakdown
  lemonade: LemonadeBreakdown
  promo: PromoBreakdown
}

function computeCoffee(receipts: Receipt[], products: Product[]): CoffeeBreakdown {
  const variants = resolveCoffeeVariants(products)
  const espressoIds = idsOf(variants.espresso)
  const espressoLungIds = idsOf(variants.espressoLung)
  const cappuccinoIds = idsOf(variants.cappuccinoLung)
  const allIds = new Set([...espressoIds, ...espressoLungIds, ...cappuccinoIds])

  let espresso = 0
  let espressoLung = 0
  let cappuccinoLung = 0
  let receiptsWithCoffee = 0
  const shiftsSeen = new Set<string>()
  const daysSeen = new Set<string>()

  for (const r of receipts) {
    daysSeen.add(r.date)
    if (r.shift) shiftsSeen.add(`${r.date}:${r.shift}`)
    espresso += quantityOfProducts(r, espressoIds)
    espressoLung += quantityOfProducts(r, espressoLungIds)
    cappuccinoLung += quantityOfProducts(r, cappuccinoIds)
    if (receiptContainsProduct(r, allIds)) receiptsWithCoffee++
  }

  const total = espresso + espressoLung + cappuccinoLung
  const receiptCount = receipts.length
  const shifts = shiftsSeen.size || 1
  const days = daysSeen.size || 1

  return {
    espresso,
    espressoLung,
    cappuccinoLung,
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
  }
}

function computeSandwich(receipts: Receipt[], products: Product[]): SandwichBreakdown {
  const variants = resolveSandwichVariants(products)
  const sets = {
    prosciuttoCotto: idsOf(variants.prosciuttoCotto),
    prosciuttoCrudo: idsOf(variants.prosciuttoCrudo),
    mozzarellaPesto: idsOf(variants.mozzarellaPesto),
    kebab: idsOf(variants.kebab),
    toast: idsOf(variants.toast),
  }
  const allIds = new Set([...sets.prosciuttoCotto, ...sets.prosciuttoCrudo, ...sets.mozzarellaPesto, ...sets.kebab, ...sets.toast])

  let prosciuttoCotto = 0
  let prosciuttoCrudo = 0
  let mozzarellaPesto = 0
  let kebab = 0
  let toast = 0
  let value = 0
  let receiptsWithSandwich = 0

  for (const r of receipts) {
    prosciuttoCotto += quantityOfProducts(r, sets.prosciuttoCotto)
    prosciuttoCrudo += quantityOfProducts(r, sets.prosciuttoCrudo)
    mozzarellaPesto += quantityOfProducts(r, sets.mozzarellaPesto)
    kebab += quantityOfProducts(r, sets.kebab)
    toast += quantityOfProducts(r, sets.toast)
    value += valueOfProducts(r, allIds)
    if (receiptContainsProduct(r, allIds)) receiptsWithSandwich++
  }

  const total = prosciuttoCotto + prosciuttoCrudo + mozzarellaPesto + kebab + toast
  return {
    prosciuttoCotto,
    prosciuttoCrudo,
    mozzarellaPesto,
    kebab,
    toast,
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

// A line counts as promotional either via the "Promoție" column mapped at
// import time (its raw text becomes the promotion's label elsewhere) or via
// the "Promoții" special group in Nomenclator -> Grupuri pe categorie.
function isPromoLine(line: TransactionLine, promoProductIds: Set<string>): boolean {
  return !!line.promotionRaw || promoProductIds.has(line.productId)
}

function computePromo(receipts: Receipt[], products: Product[]): PromoBreakdown {
  const promoProductIds = productIdsInGroup(products, 'promotii')
  let lineCount = 0
  let value = 0
  let receiptsWithPromo = 0
  for (const r of receipts) {
    let hasPromo = false
    for (const l of r.lines) {
      if (!isPromoLine(l, promoProductIds)) continue
      lineCount++
      value += l.value
      hasPromo = true
    }
    if (hasPromo) receiptsWithPromo++
  }
  return {
    lineCount,
    value,
    receiptsWithPromo,
    pctReceipts: receipts.length > 0 ? (receiptsWithPromo / receipts.length) * 100 : 0,
  }
}

function buildCashierRow(cashier: Cashier, receipts: Receipt[], products: Product[]): CashierCrossSellRow {
  const totalSales = receipts.reduce((s, r) => s + r.totalValue, 0)
  const fuelReceipts = receipts.filter((r) => r.hasFuel)
  const fuelPlusGoods = fuelReceipts.filter((r) => r.hasGoods)
  const daysWorked = new Set(receipts.map((r) => r.date)).size
  const shiftsWorked = new Set(receipts.filter((r) => r.shift).map((r) => `${r.date}:${r.shift}`)).size

  return {
    cashier,
    totalReceipts: receipts.length,
    totalSales,
    avgReceiptValue: receipts.length > 0 ? totalSales / receipts.length : 0,
    daysWorked,
    shiftsWorked,
    fuelReceipts: fuelReceipts.length,
    fuelPlusGoodsReceipts: fuelPlusGoods.length,
    crossSellPct: fuelReceipts.length > 0 ? (fuelPlusGoods.length / fuelReceipts.length) * 100 : 0,
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
  const receipts = groupIntoReceipts(transactions, fuelIds)

  const stationCashier: Cashier = {
    id: '__station__',
    name: 'TOTAL STAȚIE',
    aliases: [],
    active: true,
    teamId: null,
    createdAt: 0,
  }
  const stationTotal = buildCashierRow(stationCashier, receipts, products)

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
      return buildCashierRow(cashier, cashierReceipts, products)
    })
    .filter((r): r is CashierCrossSellRow => r !== null)
    .sort((a, b) => b.totalSales - a.totalSales)

  return { stationTotal, cashiers: rows }
}
