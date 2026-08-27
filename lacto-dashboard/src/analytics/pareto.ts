import type { BreakdownRow } from './aggregate'

export interface AbcRow {
  id: number | null
  name: string
  value: number
  share: number
  cumulativeShare: number
  abcClass: 'A' | 'B' | 'C'
}

export interface ParetoResult {
  totalValue: number
  itemCount: number
  topNShares: { n: number; sharePercent: number }[]
  thresholds: { thresholdPercent: number; itemCount: number }[]
  rows: AbcRow[]
  countByClass: { A: number; B: number; C: number }
}

const TOP_NS = [5, 10, 20, 50]
const THRESHOLDS = [50, 70, 80, 90]

/**
 * Pareto / 80-20 (spec §20) + Clasificare ABC (spec §21), pe orice listă de
 * rânduri deja agregate (clienți sau produse). Convenție ABC standard:
 * A = până la 80% din valoarea cumulată, B = până la 95%, C = restul.
 */
export function computeParetoAndAbc(rows: BreakdownRow[]): ParetoResult {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value)
  const totalValue = sorted.reduce((s, r) => s + r.value, 0)

  const topNShares = TOP_NS.map((n) => ({
    n,
    sharePercent: totalValue > 0 ? (sorted.slice(0, n).reduce((s, r) => s + r.value, 0) / totalValue) * 100 : 0,
  }))

  const thresholds = THRESHOLDS.map((thresholdPercent) => {
    if (totalValue === 0) return { thresholdPercent, itemCount: 0 }
    let cumulative = 0
    let count = 0
    for (const r of sorted) {
      cumulative += r.value
      count++
      if ((cumulative / totalValue) * 100 >= thresholdPercent) break
    }
    return { thresholdPercent, itemCount: count }
  })

  let cumulative = 0
  const abcRows: AbcRow[] = sorted.map((r) => {
    cumulative += r.value
    const cumulativeShare = totalValue > 0 ? (cumulative / totalValue) * 100 : 0
    const abcClass: AbcRow['abcClass'] = cumulativeShare <= 80 ? 'A' : cumulativeShare <= 95 ? 'B' : 'C'
    return { id: r.id, name: r.name, value: r.value, share: totalValue > 0 ? (r.value / totalValue) * 100 : 0, cumulativeShare, abcClass }
  })

  const countByClass = { A: 0, B: 0, C: 0 }
  for (const r of abcRows) countByClass[r.abcClass]++

  return { totalValue, itemCount: sorted.length, topNShares, thresholds, rows: abcRows, countByClass }
}
