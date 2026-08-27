import type { BreakdownRow } from './aggregate'

/** Un rând de breakdown îmbinat cu perioada de comparație (spec §16: „diferență valoare; diferență %"). */
export interface ComparedRow extends BreakdownRow {
  share: number // pondere în total (%), pe baza valorii
  previousValue: number | null
  previousQuantity: number | null
  diffValue: number | null
  diffPercent: number | null
}

function pctDiff(current: number, previous: number | null): number | null {
  if (previous === null) return null
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

/**
 * Îmbină rândurile perioadei curente cu cele ale perioadei de comparație
 * (potrivite după `id`, sau după `name` pentru grupuri fără id — ex. canal).
 * Include și rândurile care există DOAR în comparație (dispărute), cu valori 0 acum.
 */
export function mergeWithComparison(
  current: BreakdownRow[],
  previous: BreakdownRow[] | null,
  totalValue: number,
): ComparedRow[] {
  const key = (r: BreakdownRow) => (r.id !== null ? `id:${r.id}` : `name:${r.name}`)
  const previousByKey = new Map((previous ?? []).map((r) => [key(r), r]))
  const seen = new Set<string>()

  const merged: ComparedRow[] = current.map((r) => {
    const k = key(r)
    seen.add(k)
    const prev = previousByKey.get(k) ?? null
    return {
      ...r,
      share: totalValue > 0 ? (r.value / totalValue) * 100 : 0,
      previousValue: prev ? prev.value : previous ? 0 : null,
      previousQuantity: prev ? prev.quantity : previous ? 0 : null,
      diffValue: previous ? r.value - (prev ? prev.value : 0) : null,
      diffPercent: previous ? pctDiff(r.value, prev ? prev.value : 0) : null,
    }
  })

  if (previous) {
    for (const prev of previous) {
      const k = key(prev)
      if (seen.has(k)) continue
      merged.push({
        id: prev.id,
        name: prev.name,
        value: 0,
        quantity: 0,
        count: 0,
        distinctClients: 0,
        distinctProducts: 0,
        share: 0,
        previousValue: prev.value,
        previousQuantity: prev.quantity,
        diffValue: -prev.value,
        diffPercent: -100,
      })
    }
  }

  return merged.sort((a, b) => b.value - a.value)
}
