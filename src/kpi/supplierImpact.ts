import type { TransactionLine } from '@/types/domain'
import type { ProductPriceSummary } from '@/kpi/suppliers'
import { addDays } from '@/kpi/dateRanges'

export interface SupplierImpactRow {
  summary: ProductPriceSummary
  monthlyVolumeEstimate: number // cantitate vândută în ultimele 30 zile — folosită ca proxy pentru "volumul actual"
  hikeImpactPerMonth: number | null // (diffAbs, doar dacă e o scumpire) × monthlyVolumeEstimate — o estimare, nu o certitudine
  theoreticalMonthlySaving: number | null // (preț curent - preț cel mai ieftin furnizor) × monthlyVolumeEstimate
}

/**
 * "Impact estimat la volumul actual" folosește ritmul de vânzare din
 * ultimele 30 de zile ca proxy pentru volumul lunar — e o estimare
 * explicită, nu o previziune de achiziții viitoare (acelea pot varia din
 * multe alte motive: sezonalitate, promoții, stoc existent etc.).
 */
export function computeSupplierImpact(
  summaries: ProductPriceSummary[],
  transactions: TransactionLine[],
  asOfDate: string,
): SupplierImpactRow[] {
  const windowStart = addDays(asOfDate, -29)
  const volumeByProduct = new Map<string, number>()
  for (const t of transactions) {
    if (t.date < windowStart || t.date > asOfDate) continue
    volumeByProduct.set(t.productId, (volumeByProduct.get(t.productId) ?? 0) + t.quantity)
  }

  return summaries.map((summary) => {
    const monthlyVolumeEstimate = volumeByProduct.get(summary.product.id) ?? 0

    const hikeImpactPerMonth =
      summary.diffAbs != null && summary.diffAbs > 0 ? summary.diffAbs * monthlyVolumeEstimate : null

    let theoreticalMonthlySaving: number | null = null
    const cheapest = summary.bySupplier.find((s) => s.isCheapest)
    if (cheapest && summary.lastPrice != null && summary.lastSupplier && summary.lastSupplier !== cheapest.supplier) {
      const saving = (summary.lastPrice - cheapest.lastPrice) * monthlyVolumeEstimate
      theoreticalMonthlySaving = saving > 0 ? saving : null
    }

    return { summary, monthlyVolumeEstimate, hikeImpactPerMonth, theoreticalMonthlySaving }
  })
}
