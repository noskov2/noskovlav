import type { Product, TransactionLine } from '@/types/domain'
import { computePromoLineLabels } from '@/kpi/promoLines'

export interface PromoBreakdownRow {
  label: string
  linesCurrent: number
  valueCurrent: number
  linesPrevSamePeriod: number
  valuePrevSamePeriod: number
  linesPrevFullMonth: number
  valuePrevFullMonth: number
}

function countByLabel(transactions: TransactionLine[], products: Product[]): Map<string, { lines: number; value: number }> {
  const labelsById = computePromoLineLabels(transactions, products)
  const byId = new Map(transactions.map((t) => [t.id, t]))
  const result = new Map<string, { lines: number; value: number }>()
  for (const [txId, label] of labelsById) {
    const t = byId.get(txId)
    if (!t) continue
    const acc = result.get(label) ?? { lines: 0, value: 0 }
    acc.lines += 1
    acc.value += t.value
    result.set(label, acc)
  }
  return result
}

// One row per distinct promo label (the "Promoție" tag from the POS, or the
// promotional product's own name when the combo's other half carries no tag
// of its own — see promoLines.ts), each with its line count/value for three
// windows: the currently viewed period, the same elapsed days one month
// earlier, and that earlier month in full. "Linii" matches exactly what the
// Dashboard's own "Promoții" tile already counts (its hint reads
// "N linii") — kept as the same unit here so the breakdown never implies a
// different, incompatible total.
export function computePromoBreakdown(
  currentTx: TransactionLine[],
  prevSamePeriodTx: TransactionLine[],
  prevFullMonthTx: TransactionLine[],
  products: Product[],
): PromoBreakdownRow[] {
  const current = countByLabel(currentTx, products)
  const prevSame = countByLabel(prevSamePeriodTx, products)
  const prevFull = countByLabel(prevFullMonthTx, products)
  const labels = new Set([...current.keys(), ...prevSame.keys(), ...prevFull.keys()])

  const rows: PromoBreakdownRow[] = []
  for (const label of labels) {
    const c = current.get(label) ?? { lines: 0, value: 0 }
    const ps = prevSame.get(label) ?? { lines: 0, value: 0 }
    const pf = prevFull.get(label) ?? { lines: 0, value: 0 }
    rows.push({
      label,
      linesCurrent: c.lines,
      valueCurrent: c.value,
      linesPrevSamePeriod: ps.lines,
      valuePrevSamePeriod: ps.value,
      linesPrevFullMonth: pf.lines,
      valuePrevFullMonth: pf.value,
    })
  }

  return rows.sort((a, b) => b.valueCurrent - a.valueCurrent)
}
