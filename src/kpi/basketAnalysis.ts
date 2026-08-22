import type { Product, ProductGroups, TransactionLine } from '@/types/domain'
import { groupIntoReceipts, receiptContainsProduct, type Receipt } from '@/kpi/receipts'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'

interface BasketPairDef {
  key: string
  baseGroup: keyof ProductGroups
  otherGroup: keyof ProductGroups
  baseLabel: string
  otherLabel: string
}

// Perechile cerute explicit: cafea+sandwich, carburant+cafea,
// carburant+băutură, cafea+dulciuri. Nu există un grup dedicat "băutură" în
// nomenclator — grupul Limonade/Ceai e cel mai apropiat proxy pentru
// "băutură" din cele existente, așa că îl folosim aici (etichetat explicit).
const BASKET_PAIRS: BasketPairDef[] = [
  { key: 'cafea-sandwich', baseGroup: 'cafea', otherGroup: 'sandwich', baseLabel: 'Cafea', otherLabel: 'Sandwich' },
  { key: 'carburant-cafea', baseGroup: 'carburant', otherGroup: 'cafea', baseLabel: 'Carburant', otherLabel: 'Cafea' },
  {
    key: 'carburant-bautura',
    baseGroup: 'carburant',
    otherGroup: 'limonadaCeai',
    baseLabel: 'Carburant',
    otherLabel: 'Băutură (limonadă/ceai)',
  },
  { key: 'cafea-dulciuri', baseGroup: 'cafea', otherGroup: 'dulciuriVitrina', baseLabel: 'Cafea', otherLabel: 'Dulciuri vitrină' },
]

export interface BasketPair {
  key: string
  label: string
  baseLabel: string
  otherLabel: string
  baseReceipts: number
  commonReceipts: number
  attachmentRatePct: number // commonReceipts / baseReceipts * 100
  commonLines: TransactionLine[] // pentru drill-down
}

export function computeBasketAnalysis(transactions: TransactionLine[], products: Product[]): BasketPair[] {
  const fuelIds = fuelProductIds(products)
  const excludedIds = productIdsInGroup(products, 'crossSellExcluded')
  const receipts: Receipt[] = groupIntoReceipts(transactions, fuelIds, excludedIds)

  return BASKET_PAIRS.map((def) => {
    const baseIds = productIdsInGroup(products, def.baseGroup)
    const otherIds = productIdsInGroup(products, def.otherGroup)
    let baseReceipts = 0
    let commonReceipts = 0
    const commonLines: TransactionLine[] = []
    for (const r of receipts) {
      const hasBase = receiptContainsProduct(r, baseIds)
      if (!hasBase) continue
      baseReceipts++
      if (receiptContainsProduct(r, otherIds)) {
        commonReceipts++
        commonLines.push(...r.lines)
      }
    }
    return {
      key: def.key,
      label: `${def.baseLabel} + ${def.otherLabel}`,
      baseLabel: def.baseLabel,
      otherLabel: def.otherLabel,
      baseReceipts,
      commonReceipts,
      attachmentRatePct: baseReceipts > 0 ? (commonReceipts / baseReceipts) * 100 : 0,
      commonLines,
    }
  })
}
