export function growthPercent(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined) return null
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}
