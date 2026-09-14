import type { FuelMovement, TankReading } from '@/types/domain'

export interface StockSeriesPoint {
  ts: number
  actualVolume: number | null
  bookStock: number | null
  volume15C: number | null
}
export function buildStockSeries(readings: TankReading[], tankId: string): StockSeriesPoint[] {
  return readings
    .filter((r) => r.tankId === tankId)
    .sort((a, b) => a.lastUpdate - b.lastUpdate)
    .map((r) => ({ ts: r.lastUpdate, actualVolume: r.actualVolume, bookStock: r.bookStock, volume15C: r.volume15C }))
}

export interface DiffSeriesPoint {
  ts: number
  difference: number | null
  diffPct: number | null
}
export function buildDiffSeries(readings: TankReading[], tankId: string): DiffSeriesPoint[] {
  return readings
    .filter((r) => r.tankId === tankId)
    .sort((a, b) => a.lastUpdate - b.lastUpdate)
    .map((r) => ({
      ts: r.lastUpdate,
      difference: r.difference,
      diffPct: r.difference != null && r.bookStock ? (r.difference / r.bookStock) * 100 : null,
    }))
}

export interface TempSeriesPoint {
  ts: number
  avgTemperature: number | null
  actualVolume: number | null
  volume15C: number | null
}
export function buildTempSeries(readings: TankReading[], tankId: string): TempSeriesPoint[] {
  return readings
    .filter((r) => r.tankId === tankId)
    .sort((a, b) => a.lastUpdate - b.lastUpdate)
    .map((r) => ({ ts: r.lastUpdate, avgTemperature: r.avgTemperature, actualVolume: r.actualVolume, volume15C: r.volume15C }))
}

export interface InOutDayPoint {
  date: string
  totalIn: number
  totalOut: number
}
export function buildInOutByDay(movements: FuelMovement[], tankId: string): InOutDayPoint[] {
  const byDay = new Map<string, InOutDayPoint>()
  for (const m of movements) {
    if (m.tankId !== tankId) continue
    const entry = byDay.get(m.date) ?? { date: m.date, totalIn: 0, totalOut: 0 }
    if (m.direction === 'in') entry.totalIn += m.quantity
    else entry.totalOut += Math.abs(m.quantity)
    byDay.set(m.date, entry)
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export interface ConsumptionByHourPoint {
  hour: number // 0-23
  total: number
}
export function buildConsumptionByHour(movements: FuelMovement[], tankId: string): ConsumptionByHourPoint[] {
  const byHour = new Array(24).fill(0)
  for (const m of movements) {
    if (m.tankId !== tankId || m.direction !== 'out') continue
    const hour = Number(m.time.slice(0, 2))
    if (Number.isFinite(hour)) byHour[hour] += Math.abs(m.quantity)
  }
  return byHour.map((total, hour) => ({ hour, total }))
}
