// Month-end run-rate forecast and "pace to target" — both are explicitly
// estimates (a straight-line projection of the pace seen so far), never
// presented as anything else. See ReportsPage/DashboardPage for how the
// "estimare" label is always kept attached to these numbers in the UI.

export interface ForecastResult {
  actual: number
  forecast: number
  target: number | null
  gap: number | null // forecast - target (negative = projected to miss it)
  operationalDaysSoFar: number
  daysRemainingInMonth: number
  avgPerOperationalDay: number
}

export function computeForecast(
  actual: number,
  operationalDaysSoFar: number,
  daysElapsedInMonth: number,
  daysInMonth: number,
  target: number | null,
): ForecastResult {
  const daysRemainingInMonth = Math.max(0, daysInMonth - daysElapsedInMonth)
  const avgPerOperationalDay = operationalDaysSoFar > 0 ? actual / operationalDaysSoFar : 0
  const forecast = actual + avgPerOperationalDay * daysRemainingInMonth
  return {
    actual,
    forecast,
    target,
    gap: target != null ? forecast - target : null,
    operationalDaysSoFar,
    daysRemainingInMonth,
    avgPerOperationalDay,
  }
}

export type PaceStatus = 'reached' | 'sufficient' | 'marginal' | 'insufficient'

export interface PaceResult {
  remaining: number
  daysRemaining: number
  neededPerDay: number
  recentAvgPerDay: number
  status: PaceStatus
}

// recentAvgPerDay should be the average of the last ~7 operational days, so
// "e suficient ritmul actual?" compares against recent reality, not the
// whole month's average (which would hide a recent slowdown or pickup).
export function computePace(actual: number, target: number, daysRemaining: number, recentAvgPerDay: number): PaceResult {
  const remaining = target - actual
  if (remaining <= 0) {
    return { remaining: 0, daysRemaining, neededPerDay: 0, recentAvgPerDay, status: 'reached' }
  }
  const neededPerDay = daysRemaining > 0 ? remaining / daysRemaining : Infinity
  let status: PaceStatus
  if (neededPerDay <= recentAvgPerDay * 0.95) status = 'sufficient'
  else if (neededPerDay <= recentAvgPerDay * 1.15) status = 'marginal'
  else status = 'insufficient'
  return { remaining, daysRemaining, neededPerDay, recentAvgPerDay, status }
}
