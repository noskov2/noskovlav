import type { DateRange } from '@/kpi/dateRanges'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Shifts a date by whole calendar months, clamping the day to the target
// month's actual length instead of letting the JS Date constructor overflow
// it into the following month. Plain `new Date(y, m-1, 31)` for a 30-day or
// 28/29-day target month silently rolls forward — e.g. "31 martie - 1 lună"
// naively lands on 2/3 aprilie instead of 28/29 februarie — so every
// "previous month" comparison anchored on a month-end date was wrong.
function shiftDateByMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const targetMonthIndex = m - 1 + months
  const daysInTargetMonth = new Date(y, targetMonthIndex + 1, 0).getDate()
  const clampedDay = Math.min(d, daysInTargetMonth)
  return fmt(new Date(y, targetMonthIndex, clampedDay))
}

// Shifts a selected range back exactly one calendar month, keeping its
// length — "lastMonth"/"thisMonth" presets become the literal previous
// month, and any other range (last7, custom, ...) becomes the same span of
// days one month earlier, so "compară cu luna anterioară" always means
// something comparable regardless of which filter is active.
export function previousMonthRange(range: DateRange): DateRange {
  return {
    start: shiftDateByMonths(range.start, -1),
    end: shiftDateByMonths(range.end, -1),
  }
}

export interface Delta {
  current: number
  previous: number
  abs: number
  pct: number | null // null when previous is 0 (percentage change undefined)
}

export function computeDelta(current: number, previous: number): Delta {
  return {
    current,
    previous,
    abs: current - previous,
    pct: previous !== 0 ? ((current - previous) / previous) * 100 : null,
  }
}
