import type { FuelMovement, FuelType, TankReading, TankSettings } from '@/types/domain'
import { addDays, todayStr } from '@/kpi/dateRanges'
import { FUEL_LABELS } from '@/kpi/tankFuel'

export interface TankForecast {
  tankId: string
  fuel: FuelType
  fuelLabel: string
  avgPerDay7: number | null
  avgPerDay14: number | null
  avgPerDay30: number | null
  maxDailyConsumption: number | null
  daysRemaining: number | null
  estimatedStockoutDate: string | null
  recommendedOrderQty: number | null // null until the tank's capacity is configured
  diffTrend: 'crescator' | 'descrescator' | 'stabil' | null
}

function sumOutBetween(movements: FuelMovement[], tankId: string, startDate: string, endDate: string): number {
  return movements
    .filter((m) => m.tankId === tankId && m.direction === 'out' && m.date >= startDate && m.date <= endDate)
    .reduce((s, m) => s + Math.abs(m.quantity), 0)
}

function maxDailyOut(movements: FuelMovement[], tankId: string, startDate: string, endDate: string): number | null {
  const byDay = new Map<string, number>()
  for (const m of movements) {
    if (m.tankId !== tankId || m.direction !== 'out' || m.date < startDate || m.date > endDate) continue
    byDay.set(m.date, (byDay.get(m.date) ?? 0) + Math.abs(m.quantity))
  }
  if (byDay.size === 0) return null
  return Math.max(...byDay.values())
}

export function computeTankForecast(
  tankId: string,
  fuel: FuelType,
  currentStock: number | null,
  readings: TankReading[],
  movements: FuelMovement[],
  settings: TankSettings | null,
  asOfDate: string = todayStr(),
): TankForecast {
  const start7 = addDays(asOfDate, -6)
  const start14 = addDays(asOfDate, -13)
  const start30 = addDays(asOfDate, -29)

  const total7 = sumOutBetween(movements, tankId, start7, asOfDate)
  const total14 = sumOutBetween(movements, tankId, start14, asOfDate)
  const total30 = sumOutBetween(movements, tankId, start30, asOfDate)
  const avgPerDay7 = movements.some((m) => m.tankId === tankId && m.date >= start7) ? total7 / 7 : null
  const avgPerDay14 = movements.some((m) => m.tankId === tankId && m.date >= start14) ? total14 / 14 : null
  const avgPerDay30 = movements.some((m) => m.tankId === tankId && m.date >= start30) ? total30 / 30 : null
  const maxDailyConsumption = maxDailyOut(movements, tankId, start30, asOfDate)

  // Best available average, preferring the widest (most stable) window.
  const bestAvg = avgPerDay30 ?? avgPerDay14 ?? avgPerDay7

  const daysRemaining = currentStock != null && bestAvg != null && bestAvg > 0 ? currentStock / bestAvg : null
  const estimatedStockoutDate = daysRemaining != null ? addDays(asOfDate, Math.floor(daysRemaining)) : null

  let recommendedOrderQty: number | null = null
  if (settings?.capacityLiters != null && currentStock != null) {
    const leadDays = settings.resupplyLeadDays ?? 0
    const safetyTarget = settings.minSafetyStockLiters ?? 0
    const projectedAtDelivery = currentStock - (bestAvg ?? 0) * leadDays
    const needed = Math.max(0, safetyTarget - projectedAtDelivery)
    const roomLeft = Math.max(0, settings.capacityLiters - currentStock)
    const withMinOrder = needed > 0 ? Math.max(needed, settings.minOrderQuantity ?? 0) : 0
    recommendedOrderQty = Math.min(withMinOrder, roomLeft)
  }

  // Trend of the |scriptic-faptic| gap: average of the 5 most recent
  // readings vs. the 5 before that — a growing gap (even if the sign
  // flips) is worth flagging regardless of direction.
  const tankReadings = readings.filter((r) => r.tankId === tankId).sort((a, b) => a.lastUpdate - b.lastUpdate)
  let diffTrend: TankForecast['diffTrend'] = null
  if (tankReadings.length >= 6) {
    const recent = tankReadings.slice(-5).map((r) => Math.abs(r.difference ?? 0))
    const prior = tankReadings.slice(-10, -5).map((r) => Math.abs(r.difference ?? 0))
    if (prior.length > 0) {
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length
      const priorAvg = prior.reduce((s, v) => s + v, 0) / prior.length
      if (priorAvg > 0) {
        const changePct = ((recentAvg - priorAvg) / priorAvg) * 100
        diffTrend = changePct > 10 ? 'crescator' : changePct < -10 ? 'descrescator' : 'stabil'
      }
    }
  }

  return {
    tankId,
    fuel,
    fuelLabel: FUEL_LABELS[fuel],
    avgPerDay7,
    avgPerDay14,
    avgPerDay30,
    maxDailyConsumption,
    daysRemaining,
    estimatedStockoutDate,
    recommendedOrderQty,
    diffTrend,
  }
}
