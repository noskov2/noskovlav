import type { Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { resolveFuelTypeIds } from '@/kpi/fuelVariants'
import { exVatValue } from '@/kpi/vat'
import { computePromoLineLabels } from '@/kpi/promoLines'

export interface PeriodSummary {
  totalSales: number
  goodsSales: number
  fuelSales: number
  fuelLiters: number
  gplLiters: number
  receiptCount: number
  avgReceiptValue: number
  coffeeCount: number
  sandwichCount: number
  lemonadeCount: number
  vitrinaCount: number
  crossSellReceipts: number
  crossSellPct: number
  fuelReceiptCount: number
  grossProfitEstimate: number
  grossProfitKnownShare: number // fraction of goods sales for which a purchase price was available
  salesNoVatKnown: number // ex-VAT sales for the cost-known slice — the correct denominator for margin %, never totalSales (VAT-inclusive)
  totalLiters: number // fuelLiters + gplLiters
  promoValue: number
  promoCount: number // number of promotional lines (not receipts)
}

export function computePeriodSummary(
  transactions: TransactionLine[],
  products: Product[],
  defaultVatRatePct = 19,
): PeriodSummary {
  const fuelIds = fuelProductIds(products)
  const excludedIds = productIdsInGroup(products, 'crossSellExcluded')
  // Same GPL detection as the Dashboard's Combustibil tile (group flag OR
  // name match) so a GPL product never counts as plain "fuelLiters" just
  // because nobody manually ticked the GPL checkbox.
  const gplIds = resolveFuelTypeIds(products).gpl
  const coffeeIds = productIdsInGroup(products, 'cafea')
  const sandwichIds = productIdsInGroup(products, 'sandwich')
  const lemonadeIds = productIdsInGroup(products, 'limonadaCeai')
  const vitrinaIds = productIdsInGroup(products, 'dulciuriVitrina')
  const promoLabelsById = computePromoLineLabels(transactions, products)
  const productsById = new Map(products.map((p) => [p.id, p]))

  let totalSales = 0
  let goodsSales = 0
  let fuelSales = 0
  let fuelLiters = 0
  let gplLiters = 0
  let coffeeCount = 0
  let sandwichCount = 0
  let lemonadeCount = 0
  let vitrinaCount = 0
  let costKnown = 0
  let costUnknownSalesValue = 0
  let grossProfit = 0
  let salesNoVatKnown = 0
  let promoValue = 0
  let promoCount = 0

  for (const t of transactions) {
    totalSales += t.value
    if (fuelIds.has(t.productId)) {
      fuelSales += t.value
      if (gplIds.has(t.productId)) gplLiters += t.quantity
      else fuelLiters += t.quantity
    } else {
      goodsSales += t.value
    }
    if (coffeeIds.has(t.productId)) coffeeCount += t.quantity
    if (sandwichIds.has(t.productId)) sandwichCount += t.quantity
    if (lemonadeIds.has(t.productId)) lemonadeCount += t.quantity
    if (vitrinaIds.has(t.productId)) vitrinaCount += t.quantity
    if (promoLabelsById.has(t.id)) {
      promoValue += t.value
      promoCount++
    }

    const product = productsById.get(t.productId)
    const purchaseUnit = t.purchasePriceUnit ?? product?.purchasePrice ?? null
    if (purchaseUnit != null) {
      const salesNoVat = exVatValue(t, product, defaultVatRatePct)
      grossProfit += salesNoVat - purchaseUnit * t.quantity
      salesNoVatKnown += salesNoVat
      costKnown += t.value
    } else {
      costUnknownSalesValue += t.value
    }
  }

  const receipts = groupIntoReceipts(transactions, fuelIds, excludedIds)
  const fuelReceipts = receipts.filter((r) => r.hasFuel)

  // Cross-sell = receipts that contain fuel AND at least one non-fuel line.
  const crossSellCount = fuelReceipts.filter((r) => r.hasGoods).length

  const denom = costKnown + costUnknownSalesValue
  const knownShare = denom > 0 ? costKnown / denom : 0

  return {
    totalSales,
    goodsSales,
    fuelSales,
    fuelLiters,
    gplLiters,
    receiptCount: receipts.length,
    avgReceiptValue: receipts.length > 0 ? totalSales / receipts.length : 0,
    coffeeCount,
    sandwichCount,
    lemonadeCount,
    vitrinaCount,
    crossSellReceipts: crossSellCount,
    crossSellPct: fuelReceipts.length > 0 ? (crossSellCount / fuelReceipts.length) * 100 : 0,
    fuelReceiptCount: fuelReceipts.length,
    grossProfitEstimate: grossProfit,
    grossProfitKnownShare: knownShare,
    salesNoVatKnown,
    totalLiters: fuelLiters + gplLiters,
    promoValue,
    promoCount,
  }
}
