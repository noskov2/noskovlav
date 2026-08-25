import type { Cashier } from '@/types/domain'

/**
 * Resolves which team a cashier belonged to "as of" a given sale date, from
 * their dated team-change history — so moving someone to a new team today
 * never silently rewrites which team their past sales count toward.
 *
 * A cashier with no history yet (the vast majority, before this feature
 * existed) falls back to "has always been on their current teamId" — this
 * matters for every sale imported before any team change was ever recorded,
 * which must keep resolving to their current team, not to "no team".
 */
export function buildTeamAsOfResolver(cashiers: Cashier[]): (cashierId: string, date: string) => string | null {
  const byCashier = new Map<string, { teamId: string | null; from: string }[]>()

  for (const c of cashiers) {
    const history =
      c.teamHistory.length > 0
        ? [...c.teamHistory].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
        : [{ teamId: c.teamId, from: '0000-01-01' }]
    byCashier.set(c.id, history)
  }

  return (cashierId: string, date: string): string | null => {
    const history = byCashier.get(cashierId)
    if (!history || history.length === 0) return null
    let lo = 0
    let hi = history.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (history[mid].from <= date) {
        ans = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return ans >= 0 ? history[ans].teamId : null
  }
}
