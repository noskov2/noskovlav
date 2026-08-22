import type { ProductProfitRow } from '@/kpi/profitability'

export type AbcBasis = 'sales' | 'profit'
export type AbcClass = 'A' | 'B' | 'C'

export interface AbcRow {
  row: ProductProfitRow
  value: number
  cumulativeValue: number
  cumulativePct: number
  abcClass: AbcClass
}

export interface AbcClassSummary {
  abcClass: AbcClass
  productCount: number
  valueShare: number // % din valoarea totală generată de clasa asta
}

export interface AbcAnalysis {
  rows: AbcRow[]
  summary: AbcClassSummary[]
  // "X% dintre produse generează ~80% din vânzări/profit" — primul punct
  // unde curba cumulativă atinge 80%.
  paretoPoint: { productSharePct: number; valueSharePct: number } | null
}

// Standard Pareto/ABC cutoffs: A = primele 80% din valoare cumulată,
// B = până la 95%, C = restul.
const A_CUTOFF = 80
const B_CUTOFF = 95

export function computeAbcAnalysis(productRows: ProductProfitRow[], basis: AbcBasis): AbcAnalysis {
  const eligible = productRows
    .map((row) => ({ row, value: basis === 'sales' ? row.salesValue : (row.grossProfit ?? 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)

  const totalValue = eligible.reduce((s, r) => s + r.value, 0)

  let cumulative = 0
  const rows: AbcRow[] = eligible.map(({ row, value }) => {
    cumulative += value
    const cumulativePct = totalValue > 0 ? (cumulative / totalValue) * 100 : 0
    const abcClass: AbcClass = cumulativePct <= A_CUTOFF ? 'A' : cumulativePct <= B_CUTOFF ? 'B' : 'C'
    return { row, value, cumulativeValue: cumulative, cumulativePct, abcClass }
  })

  const summary: AbcClassSummary[] = (['A', 'B', 'C'] as AbcClass[]).map((cls) => {
    const inClass = rows.filter((r) => r.abcClass === cls)
    const classValue = inClass.reduce((s, r) => s + r.value, 0)
    return {
      abcClass: cls,
      productCount: inClass.length,
      valueShare: totalValue > 0 ? (classValue / totalValue) * 100 : 0,
    }
  })

  let paretoPoint: AbcAnalysis['paretoPoint'] = null
  const firstAt80 = rows.find((r) => r.cumulativePct >= A_CUTOFF)
  if (firstAt80 && rows.length > 0) {
    const idx = rows.indexOf(firstAt80)
    paretoPoint = { productSharePct: ((idx + 1) / rows.length) * 100, valueSharePct: firstAt80.cumulativePct }
  }

  return { rows, summary, paretoPoint }
}
