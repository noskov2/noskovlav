import type { FuelMovement, TankReading } from '@/types/domain'
import type { TankStatus } from '@/kpi/tankStatus'
import type { TankForecast } from '@/kpi/tankForecast'
import type { TankReceipt } from '@/kpi/tankReceipts'
import { formatNumber } from '@/lib/format'

export type TankAlertSeverity = 'red' | 'orange' | 'yellow'

export interface TankAlert {
  id: string
  tankId: string
  fuelLabel: string
  severity: TankAlertSeverity
  text: string
  timestamp: number
}

const JUMP_THRESHOLD_LITERS = 500
// A reading gap wider than this many normal intervals is worth calling out
// even without a configured expected interval — most FCC exports report
// roughly hourly, so 3 hours with silence is already unusual.
const DEFAULT_STALE_MINUTES = 180

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function computeTankAlerts(
  statuses: TankStatus[],
  allReadings: TankReading[],
  allMovements: FuelMovement[],
  receipts: TankReceipt[],
  forecasts: Map<string, TankForecast>,
  nowMs: number = Date.now(),
): TankAlert[] {
  const alerts: TankAlert[] = []
  let seq = 0
  function push(tankId: string, fuelLabel: string, severity: TankAlertSeverity, text: string, timestamp: number) {
    alerts.push({ id: `alert-${seq++}`, tankId, fuelLabel, severity, text, timestamp })
  }

  for (const status of statuses) {
    const { tankId, fuelLabel, latest, diffPct, settings } = status

    // Sondă neconectată.
    if (!latest.connected) {
      push(tankId, fuelLabel, 'orange', `Rezervorul ${tankId} (${fuelLabel}) are sonda neconectată — se cunoaște doar stocul scriptic.`, latest.lastUpdate)
    }

    // Citire neactualizată.
    const staleAfterMin = settings?.normalUpdateIntervalMin ?? DEFAULT_STALE_MINUTES
    const minutesSince = (nowMs - latest.lastUpdate) / 60000
    if (minutesSince > staleAfterMin) {
      push(
        tankId,
        fuelLabel,
        'yellow',
        `Rezervorul ${tankId} (${fuelLabel}) nu a mai trimis o citire de ${formatNumber(minutesSince / 60, 1)} ore (ultima: ${fmtDateTime(latest.lastUpdate)}).`,
        latest.lastUpdate,
      )
    }

    // Apă detectată.
    if ((latest.waterLevel ?? 0) > 0 || (latest.waterVolume ?? 0) > 0) {
      push(tankId, fuelLabel, 'red', `Apă detectată în rezervorul ${tankId} (${fuelLabel}).`, latest.lastUpdate)
    }

    // Diferență peste limita configurată (litri și/sau %) — și, separat,
    // aceeași verificare citită ca "lipsă" atunci când diferența e negativă.
    if (latest.difference != null) {
      const overLiters = settings?.warnDiffLiters != null && Math.abs(latest.difference) > settings.warnDiffLiters
      const overPct = settings?.warnDiffPct != null && diffPct != null && Math.abs(diffPct) > settings.warnDiffPct
      if (overLiters || overPct) {
        const kind = latest.difference < 0 ? 'lipsă' : 'surplus'
        push(
          tankId,
          fuelLabel,
          'red',
          `Diferență peste prag la ${tankId} (${fuelLabel}): ${kind} de ${formatNumber(Math.abs(latest.difference), 2)} L${diffPct != null ? ` (${formatNumber(Math.abs(diffPct), 1)}%)` : ''}.`,
          latest.lastUpdate,
        )
      }
    }

    // Stoc sub limita minimă de siguranță.
    if (settings?.minSafetyStockLiters != null && latest.actualVolume != null && latest.actualVolume < settings.minSafetyStockLiters) {
      push(
        tankId,
        fuelLabel,
        'red',
        `Stoc sub limita minimă la ${tankId} (${fuelLabel}): ${formatNumber(latest.actualVolume, 0)} L, sub pragul de ${formatNumber(settings.minSafetyStockLiters, 0)} L.`,
        latest.lastUpdate,
      )
    }

    // Diferență care se mărește succesiv.
    const forecast = forecasts.get(tankId)
    if (forecast?.diffTrend === 'crescator') {
      push(tankId, fuelLabel, 'orange', `Diferența scriptic-faptic la ${tankId} (${fuelLabel}) e în creștere pe ultimele citiri.`, latest.lastUpdate)
    }

    // Zile de stoc rămase foarte puține — se estimează epuizarea în curând.
    if (forecast?.daysRemaining != null && forecast.daysRemaining < 3) {
      push(
        tankId,
        fuelLabel,
        'red',
        `Stocul de la ${tankId} (${fuelLabel}) se epuizează în aproximativ ${formatNumber(forecast.daysRemaining, 1)} zile la ritmul actual de consum.`,
        latest.lastUpdate,
      )
    }
  }

  // Scădere bruscă fără vânzări corespunzătoare / creștere de stoc fără
  // mișcare de intrare — ambele derivate din citiri consecutive per tank.
  const tankIds = new Set(allReadings.map((r) => r.tankId))
  for (const tankId of tankIds) {
    const readings = allReadings.filter((r) => r.tankId === tankId).sort((a, b) => a.lastUpdate - b.lastUpdate)
    const fuelLabel = readings[0] ? readings[0].fuel : null
    const status = statuses.find((s) => s.tankId === tankId)
    const label = status?.fuelLabel ?? fuelLabel ?? tankId
    for (let i = 1; i < readings.length; i++) {
      const prev = readings[i - 1]
      const cur = readings[i]
      if (prev.actualVolume == null || cur.actualVolume == null) continue
      const delta = cur.actualVolume - prev.actualVolume
      if (delta <= -JUMP_THRESHOLD_LITERS) {
        const soldInGap = allMovements
          .filter((m) => m.tankId === tankId && m.direction === 'out' && m.timestamp > prev.lastUpdate && m.timestamp <= cur.lastUpdate)
          .reduce((s, m) => s + Math.abs(m.quantity), 0)
        if (soldInGap < Math.abs(delta) * 0.5) {
          push(
            tankId,
            label,
            'orange',
            `Scădere bruscă de ${formatNumber(Math.abs(delta), 0)} L la ${tankId} (${label}) între ${fmtDateTime(prev.lastUpdate)} și ${fmtDateTime(cur.lastUpdate)}, fără vânzări care s-o explice.`,
            cur.lastUpdate,
          )
        }
      }
    }
  }

  // Recepții cu diferență mare față de document.
  for (const r of receipts) {
    if (r.diffVsDocument != null && r.quantityFromDocument != null && Math.abs(r.diffVsDocument) > Math.max(50, r.quantityFromDocument * 0.03)) {
      push(
        r.tankId,
        r.fuelLabel,
        'orange',
        `Recepție cu diferență mare la ${r.tankId} (${r.fuelLabel}, ${fmtDateTime(r.timestamp)}): document ${formatNumber(r.quantityFromDocument, 0)} L, fizic estimat ${formatNumber(r.quantityReceivedPhysical ?? 0, 0)} L.`,
        r.timestamp,
      )
    }
    if (r.source === 'jump') {
      push(
        r.tankId,
        r.fuelLabel,
        'yellow',
        `Creștere de stoc de ~${formatNumber((r.actualAfter ?? 0) - (r.actualBefore ?? 0), 0)} L la ${r.tankId} (${r.fuelLabel}, ${fmtDateTime(r.timestamp)}) fără o mișcare de tip Intrare care s-o explice.`,
        r.timestamp,
      )
    }
  }

  return alerts.sort((a, b) => b.timestamp - a.timestamp)
}
