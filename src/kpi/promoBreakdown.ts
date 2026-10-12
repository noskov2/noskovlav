import type { Product, TransactionLine } from '@/types/domain'
import { computePromoLineLabels } from '@/kpi/promoLines'
import type { PeriodBreakdownRow } from '@/kpi/periodBreakdown'

function countByLabel(transactions: TransactionLine[], products: Product[]): Map<string, { count: number; value: number }> {
  const labelsById = computePromoLineLabels(transactions, products)
  const byId = new Map(transactions.map((t) => [t.id, t]))
  const result = new Map<string, { count: number; value: number }>()
  for (const [txId, label] of labelsById) {
    const t = byId.get(txId)
    if (!t) continue
    const acc = result.get(label) ?? { count: 0, value: 0 }
    acc.count += t.quantity
    acc.value += t.value
    result.set(label, acc)
  }
  return result
}

// One row per distinct promo label (the "Promoție" tag from the POS, or the
// promotional product's own name when the combo's other half carries no tag
// of its own — see promoLines.ts), each with its quantity/value for three
// windows: the currently viewed period, the same elapsed days one month
// earlier, and that earlier month in full. The count is QUANTITY (buc),
// summed across every tagged line under that label — for a combo where both
// items carry the same tag (e.g. "PROMOTIE CASCAVAL RUCAR/DALIA", tagged on
// both the Dalia and the Rucar lines), this is the total units of either
// variant sold through the promo, matching how a station manager actually
// counts "how many cascavaluri went out on this promo" rather than how many
// receipt lines happened to carry the tag.
export function computePromoBreakdown(
  currentTx: TransactionLine[],
  prevSamePeriodTx: TransactionLine[],
  prevFullMonthTx: TransactionLine[],
  products: Product[],
): PeriodBreakdownRow[] {
  const current = countByLabel(currentTx, products)
  const prevSame = countByLabel(prevSamePeriodTx, products)
  const prevFull = countByLabel(prevFullMonthTx, products)
  const labels = new Set([...current.keys(), ...prevSame.keys(), ...prevFull.keys()])

  const rows: PeriodBreakdownRow[] = []
  for (const label of labels) {
    rows.push({
      key: label,
      label,
      current: current.get(label) ?? { count: 0, value: 0 },
      prevSamePeriod: prevSame.get(label) ?? { count: 0, value: 0 },
      prevFullMonth: prevFull.get(label) ?? { count: 0, value: 0 },
    })
  }

  return rows.sort((a, b) => b.current.value - a.current.value)
}
