import type { TransactionLine } from '@/types/domain'
import { monthLabel, todayStr } from '@/kpi/dateRanges'

export interface MonthOption {
  year: number
  month: number // 1-12
  key: string // "YYYY-MM"
  label: string // "Iulie 2026"
  isCurrentMonth: boolean
  rowCount: number
}

/** Every distinct calendar month that has at least one imported transaction, newest first. */
export function listAvailableMonths(transactions: TransactionLine[]): MonthOption[] {
  const today = todayStr()
  const currentKey = today.slice(0, 7)
  const counts = new Map<string, number>()
  for (const t of transactions) {
    const key = t.date.slice(0, 7)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, rowCount]) => {
      const [y, m] = key.split('-').map(Number)
      return {
        year: y,
        month: m,
        key,
        label: monthLabel(`${key}-01`),
        isCurrentMonth: key === currentKey,
        rowCount,
      }
    })
}

/**
 * Calendar months that are fully in the past (not the current month), have
 * transaction data, and haven't been marked as "picked up" yet — these
 * drive the "Ai de ridicat rapoarte" banner.
 */
export function listPendingReportMonths(transactions: TransactionLine[], acknowledged: string[]): MonthOption[] {
  const ackSet = new Set(acknowledged)
  return listAvailableMonths(transactions).filter((m) => !m.isCurrentMonth && !ackSet.has(m.key))
}
