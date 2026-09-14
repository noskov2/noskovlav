import type { DateRange } from '@/kpi/dateRanges'
import type { FuelMovement, FuelType, TankReading } from '@/types/domain'
import { FUEL_LABELS } from '@/kpi/tankFuel'

export interface TankReconciliation {
  tankId: string
  fuel: FuelType
  fuelLabel: string
  actualStart: number | null // stoc faptic inițial
  bookStockStart: number | null // stoc scriptic inițial
  totalIn: number // total intrări
  totalOut: number // total ieșiri/vânzări (magnitude, always ≥ 0)
  bookStockCalculatedEnd: number | null // stoc scriptic calculat = scriptic inițial + intrări − ieșiri
  actualEnd: number | null // stoc faptic final (măsurat)
  bookStockEnd: number | null // stoc scriptic final (măsurat)
  diffEnd: number | null // diferență finală = faptic final − scriptic final
  diffChange: number | null // variația diferenței față de începutul perioadei
  // "Abatere" — faptic final minus faptic proiectat prin aceleași mișcări
  // pornind de la faptic inițial (nu de la scriptic) — izolează pierderea/
  // câștigul real, netă de decalajul scriptic-faptic deja existent la
  // începutul perioadei.
  unexplained: number | null
}

// Readings for a tank aren't necessarily aligned to the requested range's
// exact boundaries (they land whenever the probe happened to report) — the
// "stoc inițial" reading is the latest one AT OR BEFORE the range start
// (falling back to the earliest reading in range if none exists before it),
// and "stoc final" is the latest one AT OR BEFORE the range end.
function findBoundaryReading(sorted: TankReading[], atOrBeforeMs: number): TankReading | null {
  let candidate: TankReading | null = null
  for (const r of sorted) {
    if (r.lastUpdate <= atOrBeforeMs) candidate = r
    else break
  }
  return candidate
}

export function computeTankReconciliation(
  tankId: string,
  fuel: FuelType,
  allReadings: TankReading[],
  allMovements: FuelMovement[],
  range: DateRange,
): TankReconciliation {
  const rangeStartMs = new Date(`${range.start}T00:00:00`).getTime()
  const rangeEndMs = new Date(`${range.end}T23:59:59.999`).getTime()

  const tankReadings = allReadings.filter((r) => r.tankId === tankId).sort((a, b) => a.lastUpdate - b.lastUpdate)
  const startReading = findBoundaryReading(tankReadings, rangeStartMs) ?? tankReadings.find((r) => r.lastUpdate <= rangeEndMs) ?? null
  const endReading = findBoundaryReading(tankReadings, rangeEndMs)

  const tankMovements = allMovements.filter(
    (m) => m.tankId === tankId && m.timestamp >= rangeStartMs && m.timestamp <= rangeEndMs,
  )
  const totalIn = tankMovements.filter((m) => m.direction === 'in').reduce((s, m) => s + m.quantity, 0)
  const totalOut = tankMovements.filter((m) => m.direction === 'out').reduce((s, m) => s + Math.abs(m.quantity), 0)
  const netMovement = totalIn - totalOut

  const actualStart = startReading?.actualVolume ?? null
  const bookStockStart = startReading?.bookStock ?? null
  const actualEnd = endReading?.actualVolume ?? null
  const bookStockEnd = endReading?.bookStock ?? null

  const bookStockCalculatedEnd = bookStockStart != null ? bookStockStart + netMovement : null
  const diffStart = actualStart != null && bookStockStart != null ? actualStart - bookStockStart : null
  const diffEnd = actualEnd != null && bookStockEnd != null ? actualEnd - bookStockEnd : null
  const diffChange = diffEnd != null && diffStart != null ? diffEnd - diffStart : null
  const projectedActualEnd = actualStart != null ? actualStart + netMovement : null
  const unexplained = actualEnd != null && projectedActualEnd != null ? actualEnd - projectedActualEnd : null

  return {
    tankId,
    fuel,
    fuelLabel: FUEL_LABELS[fuel],
    actualStart,
    bookStockStart,
    totalIn,
    totalOut,
    bookStockCalculatedEnd,
    actualEnd,
    bookStockEnd,
    diffEnd,
    diffChange,
    unexplained,
  }
}
