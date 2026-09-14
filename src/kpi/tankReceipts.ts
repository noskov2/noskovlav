import type { FuelMovement, FuelType, TankReading } from '@/types/domain'
import { FUEL_LABELS } from '@/kpi/tankFuel'

export interface TankReceipt {
  tankId: string
  fuel: FuelType
  fuelLabel: string
  timestamp: number
  documentNo: string | null
  actualBefore: number | null
  actualAfter: number | null
  quantityFromDocument: number | null // cantitatea intrată conform mișcărilor (the Intrare movement's own quantity)
  quantitySoldDuring: number // vânzări în timpul descărcării — sales between the bracketing readings
  quantityReceivedPhysical: number | null // actualAfter + quantitySoldDuring − actualBefore
  tempBefore: number | null
  tempAfter: number | null
  diffVsDocument: number | null // quantityReceivedPhysical − quantityFromDocument
  scripticFapticDiffBefore: number | null
  scripticFapticDiffAfter: number | null
  isEstimate: boolean
  source: 'movement' | 'jump' // detected from an "Intrare" movement, or from a large unexplained jump between readings
}

// A jump between consecutive readings this large, with no matching Intrare
// movement, is treated as a likely undocumented receipt rather than probe
// noise — normal consumption only ever decreases actualVolume (or holds
// roughly flat), so a real increase this size is never ordinary variance.
const JUMP_THRESHOLD_LITERS = 500

function nearestBefore(sorted: TankReading[], ts: number): TankReading | null {
  let candidate: TankReading | null = null
  for (const r of sorted) {
    if (r.lastUpdate <= ts) candidate = r
    else break
  }
  return candidate
}
function nearestAfter(sorted: TankReading[], ts: number): TankReading | null {
  for (const r of sorted) {
    if (r.lastUpdate >= ts) return r
  }
  return null
}

export function computeTankReceipts(allReadings: TankReading[], allMovements: FuelMovement[]): TankReceipt[] {
  const receipts: TankReceipt[] = []
  const tankIds = new Set([...allReadings.map((r) => r.tankId), ...allMovements.map((m) => m.tankId).filter((t): t is string => !!t)])

  for (const tankId of tankIds) {
    const readings = allReadings.filter((r) => r.tankId === tankId).sort((a, b) => a.lastUpdate - b.lastUpdate)
    const movements = allMovements.filter((m) => m.tankId === tankId).sort((a, b) => a.timestamp - b.timestamp)
    if (readings.length === 0) continue
    const fuel = readings[0].fuel

    function salesBetween(fromTs: number, toTs: number): number {
      return movements
        .filter((m) => m.direction === 'out' && m.timestamp >= fromTs && m.timestamp <= toTs)
        .reduce((s, m) => s + Math.abs(m.quantity), 0)
    }

    function buildReceipt(
      timestamp: number,
      quantityFromDocument: number | null,
      source: 'movement' | 'jump',
      documentNo: string | null,
    ): TankReceipt {
      const before = nearestBefore(readings, timestamp)
      const after = nearestAfter(readings, timestamp)
      const actualBefore = before?.actualVolume ?? null
      const actualAfter = after?.actualVolume ?? null
      const quantitySoldDuring = before && after ? salesBetween(before.lastUpdate, after.lastUpdate) : 0
      const quantityReceivedPhysical =
        actualAfter != null && actualBefore != null ? actualAfter + quantitySoldDuring - actualBefore : null
      return {
        tankId,
        fuel,
        fuelLabel: FUEL_LABELS[fuel],
        timestamp,
        documentNo,
        actualBefore,
        actualAfter,
        quantityFromDocument,
        quantitySoldDuring,
        quantityReceivedPhysical,
        tempBefore: before?.avgTemperature ?? null,
        tempAfter: after?.avgTemperature ?? null,
        diffVsDocument:
          quantityReceivedPhysical != null && quantityFromDocument != null
            ? quantityReceivedPhysical - quantityFromDocument
            : null,
        scripticFapticDiffBefore: before?.difference ?? null,
        scripticFapticDiffAfter: after?.difference ?? null,
        // Hourly-ish periodic readings essentially never land exactly at the
        // start/end of a real delivery — always flagged as an estimate per
        // the module's own spec, rather than implying false precision.
        isEstimate: true,
        source,
      }
    }

    const coveredWindows: { start: number; end: number }[] = []
    for (const m of movements) {
      if (m.direction !== 'in') continue
      if (!m.movementTypeRaw || !/intrare/i.test(m.movementTypeRaw)) continue
      const receipt = buildReceipt(m.timestamp, m.quantity, 'movement', m.documentNo)
      receipts.push(receipt)
      const before = nearestBefore(readings, m.timestamp)
      const after = nearestAfter(readings, m.timestamp)
      if (before && after) coveredWindows.push({ start: before.lastUpdate, end: after.lastUpdate })
    }

    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1]
      const cur = readings[i]
      if (prev.actualVolume == null || cur.actualVolume == null) continue
      const jump = cur.actualVolume - prev.actualVolume
      if (jump < JUMP_THRESHOLD_LITERS) continue
      const alreadyCovered = coveredWindows.some((w) => prev.lastUpdate >= w.start && cur.lastUpdate <= w.end)
      if (alreadyCovered) continue
      receipts.push(buildReceipt(cur.lastUpdate, null, 'jump', null))
    }
  }

  return receipts.sort((a, b) => b.timestamp - a.timestamp)
}
