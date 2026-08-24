export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom'

export interface DateRange {
  start: string // YYYY-MM-DD inclusive
  end: string // YYYY-MM-DD inclusive
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return fmt(d)
}

export function todayStr(): string {
  return fmt(new Date())
}

// The last COMPLETE day — today's own data is always partial while the day
// is still in progress (a few hours of sales can look like a crash at the
// tail of a trend chart, and drags down any "average per day" figure), so
// every rolling reporting window (last 7/30 days, this month/year to date,
// Dashboard forecast, stock rotation averages) ends here instead of at
// todayStr(). The explicit "Astăzi"/"Ieri" single-day presets are
// deliberately NOT built from this — those ask for a specific day on
// purpose, partial or not.
export function reportingEndStr(): string {
  return addDays(todayStr(), -1)
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Astăzi',
  yesterday: 'Ieri',
  last7: 'Ultimele 7 zile',
  last30: 'Ultimele 30 zile',
  thisMonth: 'Luna curentă',
  lastMonth: 'Luna precedentă',
  thisYear: 'Anul curent',
  custom: 'Perioadă personalizată',
}

export function resolvePreset(preset: PeriodPreset, custom?: DateRange): DateRange {
  const now = new Date()
  const today = fmt(now)
  const reportingEnd = addDays(today, -1)

  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { start: y, end: y }
    }
    case 'last7':
      return { start: addDays(today, -7), end: reportingEnd }
    case 'last30':
      return { start: addDays(today, -30), end: reportingEnd }
    case 'thisMonth': {
      const start = fmt(new Date(now.getFullYear(), now.getMonth(), 1))
      // On the 1st of the month there's no complete prior day within this
      // month to fall back to — show today's (partial) figure rather than
      // an empty/inverted range.
      return { start, end: reportingEnd >= start ? reportingEnd : today }
    }
    case 'lastMonth': {
      const start = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      const end = fmt(new Date(now.getFullYear(), now.getMonth(), 0))
      return { start, end }
    }
    case 'thisYear': {
      const start = fmt(new Date(now.getFullYear(), 0, 1))
      return { start, end: reportingEnd >= start ? reportingEnd : today }
    }
    case 'custom':
      return custom ?? { start: addDays(today, -7), end: reportingEnd }
  }
}

export function dayCountInRange(range: DateRange): number {
  const start = new Date(`${range.start}T00:00:00`)
  const end = new Date(`${range.end}T00:00:00`)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
}

export function weekdayName(dateStr: string): string {
  const names = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă']
  return names[new Date(`${dateStr}T00:00:00`).getDay()]
}

export function monthLabel(dateStr: string): string {
  const names = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
  ]
  const d = new Date(`${dateStr}T00:00:00`)
  return `${names[d.getMonth()]} ${d.getFullYear()}`
}
