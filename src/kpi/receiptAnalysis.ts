import type { Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, type Receipt } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'

export type ReceiptBucketKey = 'toate' | 'doarCarburant' | 'doarMarfa' | 'carburantSiMarfa'

export const RECEIPT_BUCKET_LABELS: Record<ReceiptBucketKey, string> = {
  toate: 'Toate bonurile',
  doarCarburant: 'Doar carburant',
  doarMarfa: 'Doar marfă',
  carburantSiMarfa: 'Carburant + marfă',
}

export interface ReceiptStats {
  receiptCount: number
  avgReceiptValue: number
  avgProductsPerReceipt: number
  avgCategoriesPerReceipt: number
  avgGoodsValuePerReceipt: number // marfă/bon — media valorii non-carburant pe acest set de bonuri
}

export interface ReceiptAnalysis {
  buckets: Record<ReceiptBucketKey, ReceiptStats>
  // marfă/bon carburant — media valorii de marfă pe TOATE bonurile cu carburant
  // (indiferent dacă acel bon a avut sau nu marfă), adică "cât marfă vând, în
  // medie, la fiecare vizită de alimentare" — spre deosebire de bucket-ul
  // carburantSiMarfa, unde media e calculată doar peste bonurile care deja
  // au marfă, deci e mereu > 0 și nu răspunde la aceeași întrebare.
  avgGoodsValuePerFuelReceipt: number
}

function goodsValue(r: Receipt, fuelIds: Set<string>, excludedIds: Set<string>): number {
  return r.lines.reduce((s, l) => (fuelIds.has(l.productId) || excludedIds.has(l.productId) ? s : s + l.value), 0)
}

function categoryOf(l: TransactionLine, productsById: Map<string, Product>): string {
  return productsById.get(l.productId)?.category || l.categoryRaw || ''
}

function statsFor(receipts: Receipt[], fuelIds: Set<string>, excludedIds: Set<string>, productsById: Map<string, Product>): ReceiptStats {
  if (receipts.length === 0) {
    return { receiptCount: 0, avgReceiptValue: 0, avgProductsPerReceipt: 0, avgCategoriesPerReceipt: 0, avgGoodsValuePerReceipt: 0 }
  }
  let totalValue = 0
  let totalProducts = 0
  let totalCategories = 0
  let totalGoodsValue = 0
  for (const r of receipts) {
    totalValue += r.totalValue
    totalProducts += new Set(r.lines.map((l) => l.productId)).size
    totalCategories += new Set(r.lines.map((l) => categoryOf(l, productsById))).size
    totalGoodsValue += goodsValue(r, fuelIds, excludedIds)
  }
  const n = receipts.length
  return {
    receiptCount: n,
    avgReceiptValue: totalValue / n,
    avgProductsPerReceipt: totalProducts / n,
    avgCategoriesPerReceipt: totalCategories / n,
    avgGoodsValuePerReceipt: totalGoodsValue / n,
  }
}

export function computeReceiptAnalysis(transactions: TransactionLine[], products: Product[]): ReceiptAnalysis {
  const fuelIds = fuelProductIds(products)
  const excludedIds = productIdsInGroup(products, 'crossSellExcluded')
  const productsById = new Map(products.map((p) => [p.id, p]))
  const receipts = groupIntoReceipts(transactions, fuelIds, excludedIds)

  const doarCarburant = receipts.filter((r) => r.hasFuel && !r.hasGoods)
  const doarMarfa = receipts.filter((r) => !r.hasFuel && r.hasGoods)
  const carburantSiMarfa = receipts.filter((r) => r.hasFuel && r.hasGoods)
  const fuelReceipts = receipts.filter((r) => r.hasFuel)

  return {
    buckets: {
      toate: statsFor(receipts, fuelIds, excludedIds, productsById),
      doarCarburant: statsFor(doarCarburant, fuelIds, excludedIds, productsById),
      doarMarfa: statsFor(doarMarfa, fuelIds, excludedIds, productsById),
      carburantSiMarfa: statsFor(carburantSiMarfa, fuelIds, excludedIds, productsById),
    },
    avgGoodsValuePerFuelReceipt:
      fuelReceipts.length > 0
        ? fuelReceipts.reduce((s, r) => s + goodsValue(r, fuelIds, excludedIds), 0) / fuelReceipts.length
        : 0,
  }
}
