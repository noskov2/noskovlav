import type { ProductProfitRow } from '@/kpi/profitability'

export type MatrixQuadrant = 'star' | 'traffic-builder' | 'hidden-gem' | 'slab' | 'necunoscut'

export const MATRIX_LABELS: Record<MatrixQuadrant, string> = {
  star: 'Star',
  'traffic-builder': 'Traffic Builder',
  'hidden-gem': 'Hidden Gem',
  slab: 'Slab',
  necunoscut: 'Cost necunoscut',
}

export const MATRIX_DESCRIPTIONS: Record<MatrixQuadrant, string> = {
  star: 'Vânzări mari + marjă mare',
  'traffic-builder': 'Vânzări mari + marjă mică',
  'hidden-gem': 'Vânzări mici + marjă mare',
  slab: 'Vânzări mici + marjă mică',
  necunoscut: 'Nu are cost cunoscut — marja nu poate fi calculată',
}

export interface MatrixRow {
  row: ProductProfitRow
  quadrant: MatrixQuadrant
}

export interface MarginMatrix {
  rows: MatrixRow[]
  salesMedian: number
  marginMedian: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Uses the median of sales and margin among products with a known margin as
// the split point for each axis — adapts to whatever range of values this
// station's own product mix has, instead of a fixed lei/% cutoff that would
// misclassify everything for a very small or very large station.
export function computeMarginMatrix(productRows: ProductProfitRow[]): MarginMatrix {
  const eligible = productRows.filter((r) => r.marginPct != null && r.salesValue > 0)
  const salesMedian = median(eligible.map((r) => r.salesValue))
  const marginMedian = median(eligible.map((r) => r.marginPct as number))

  const rows: MatrixRow[] = productRows.map((row) => {
    if (row.marginPct == null || row.salesValue <= 0) return { row, quadrant: 'necunoscut' as MatrixQuadrant }
    const highSales = row.salesValue >= salesMedian
    const highMargin = row.marginPct >= marginMedian
    let quadrant: MatrixQuadrant
    if (highSales && highMargin) quadrant = 'star'
    else if (highSales && !highMargin) quadrant = 'traffic-builder'
    else if (!highSales && highMargin) quadrant = 'hidden-gem'
    else quadrant = 'slab'
    return { row, quadrant }
  })

  return { rows, salesMedian, marginMedian }
}
