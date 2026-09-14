import type { FuelType, TankReading, TankSettings } from '@/types/domain'
import { FUEL_LABELS } from '@/kpi/tankFuel'

export interface TankStatus {
  tankId: string
  fuel: FuelType
  fuelLabel: string
  latest: TankReading
  diffPct: number | null // difference / bookStock × 100
  fillPct: number | null // actualVolume / capacity × 100 — null until capacity is configured
  settings: TankSettings | null
}

// Latest reading per tank — grouping is by tankId, not fuel, since a
// station could (in theory) have two tanks of the same fuel and they must
// never be merged into one card.
export function computeTankStatuses(
  readings: TankReading[],
  tankSettingsById: Record<string, TankSettings>,
): TankStatus[] {
  const latestByTank = new Map<string, TankReading>()
  for (const r of readings) {
    const current = latestByTank.get(r.tankId)
    if (!current || r.lastUpdate > current.lastUpdate) latestByTank.set(r.tankId, r)
  }

  return Array.from(latestByTank.values())
    .map((latest) => {
      const settings = tankSettingsById[latest.tankId] ?? null
      const diffPct =
        latest.difference != null && latest.bookStock ? (latest.difference / latest.bookStock) * 100 : null
      const fillPct =
        latest.actualVolume != null && settings?.capacityLiters
          ? (latest.actualVolume / settings.capacityLiters) * 100
          : null
      return {
        tankId: latest.tankId,
        fuel: latest.fuel,
        fuelLabel: FUEL_LABELS[latest.fuel],
        latest,
        diffPct,
        fillPct,
        settings,
      }
    })
    .sort((a, b) => a.tankId.localeCompare(b.tankId, undefined, { numeric: true }))
}
