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

  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { start: y, end: y }
    }
    case 'last7':
      return { start: addDays(today, -6), end: today }
    case 'last30':
      return { start: addDays(today, -29), end: today }
    case 'thisMonth': {
      const start = fmt(new Date(now.getFullYear(), now.getMonth(), 1))
      return { start, end: today }
    }
    case 'lastMonth': {
      const start = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      const end = fmt(new Date(now.getFullYear(), now.getMonth(), 0))
      return { start, end }
    }
    case 'thisYear': {
      const start = fmt(new Date(now.getFullYear(), 0, 1))
      return { start, end: today }
    }
    case 'custom':
      return custom ?? { start: addDays(today, -6), end: today }
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
