/**
 * Selector universal de perioadă + comparație (spec §13). Toate datele sunt
 * ISO yyyy-mm-dd, inclusiv la ambele capete ([start, end]).
 */

export type PeriodPreset =
  | 'today'
  | 'current-month'
  | 'last-month'
  | 'last-3-months'
  | 'last-6-months'
  | 'current-year'
  | 'last-year'
  | 'ytd'
  | 'custom'

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today', label: 'Astăzi' },
  { id: 'current-month', label: 'Luna curentă' },
  { id: 'last-month', label: 'Luna trecută' },
  { id: 'last-3-months', label: 'Ultimele 3 luni' },
  { id: 'last-6-months', label: 'Ultimele 6 luni' },
  { id: 'current-year', label: 'An curent' },
  { id: 'last-year', label: 'An precedent' },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Perioadă personalizată' },
]

export type ComparisonMode = 'none' | 'previous-period' | 'same-period-last-year' | 'previous-year' | 'custom'

export const COMPARISON_MODES: { id: ComparisonMode; label: string }[] = [
  { id: 'none', label: 'Fără comparație' },
  { id: 'previous-period', label: 'Perioada precedentă' },
  { id: 'same-period-last-year', label: 'Aceeași perioadă anul trecut' },
  { id: 'previous-year', label: 'Anul precedent' },
  { id: 'custom', label: 'Perioadă personalizată' },
]

export interface DateRange {
  start: string // ISO yyyy-mm-dd
  end: string // ISO yyyy-mm-dd
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

function today(): { y: number; m: number; d: number } {
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

/** Adaugă (sau scade) luni calendaristice, ajustând ziua dacă luna țintă e mai scurtă. */
function addMonths(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const total = (y * 12 + (m - 1)) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const nd = Math.min(d, lastDayOfMonth(ny, nm))
  return { y: ny, m: nm, d: nd }
}

/** Rezolvă un preset (sau o perioadă personalizată) într-un interval [start, end]. */
export function resolvePeriod(preset: PeriodPreset, custom?: DateRange): DateRange {
  const { y, m, d } = today()

  switch (preset) {
    case 'today':
      return { start: toIso(y, m, d), end: toIso(y, m, d) }
    case 'current-month':
      return { start: toIso(y, m, 1), end: toIso(y, m, d) }
    case 'last-month': {
      const prev = addMonths(y, m, 1, -1)
      return { start: toIso(prev.y, prev.m, 1), end: toIso(prev.y, prev.m, lastDayOfMonth(prev.y, prev.m)) }
    }
    case 'last-3-months': {
      const from = addMonths(y, m, 1, -2)
      return { start: toIso(from.y, from.m, 1), end: toIso(y, m, d) }
    }
    case 'last-6-months': {
      const from = addMonths(y, m, 1, -5)
      return { start: toIso(from.y, from.m, 1), end: toIso(y, m, d) }
    }
    case 'current-year':
      return { start: toIso(y, 1, 1), end: toIso(y, 12, 31) }
    case 'last-year':
      return { start: toIso(y - 1, 1, 1), end: toIso(y - 1, 12, 31) }
    case 'ytd':
      return { start: toIso(y, 1, 1), end: toIso(y, m, d) }
    case 'custom':
      return custom ?? { start: toIso(y, 1, 1), end: toIso(y, m, d) }
  }
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return toIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

function shiftYear(iso: string, deltaYears: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toIso(y + deltaYears, m, Math.min(d, lastDayOfMonth(y + deltaYears, m)))
}

/** Rezolvă perioada de comparație pentru o perioadă principală deja rezolvată (spec §13). */
export function resolveComparisonPeriod(
  main: DateRange,
  mode: ComparisonMode,
  custom?: DateRange,
): DateRange | null {
  switch (mode) {
    case 'none':
      return null
    case 'previous-period': {
      const lengthDays = daysBetween(main.start, main.end)
      return { start: shiftDate(main.start, -(lengthDays + 1)), end: shiftDate(main.start, -1) }
    }
    case 'same-period-last-year':
      return { start: shiftYear(main.start, -1), end: shiftYear(main.end, -1) }
    case 'previous-year': {
      const y = Number(main.start.slice(0, 4)) - 1
      return { start: toIso(y, 1, 1), end: toIso(y, 12, 31) }
    }
    case 'custom':
      return custom ?? null
  }
}

export function formatPeriodLabel(range: DateRange): string {
  const [sy, sm, sd] = range.start.split('-')
  const [ey, em, ed] = range.end.split('-')
  return `${sd}.${sm}.${sy} – ${ed}.${em}.${ey}`
}
