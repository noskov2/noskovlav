import type { BreakdownRow } from './aggregate'

export interface ConcentrationResult {
  totalValue: number
  top1Share: number
  top5Share: number
  top10Share: number
  top20Share: number
  herfindahlIndex: number // scala standard 0-10.000
  riskLevel: 'scazut' | 'moderat' | 'ridicat'
  clientsAboveThreshold: { id: number | null; name: string; share: number }[]
}

const CONCENTRATION_THRESHOLD = 5 // % — spec §24: "clienți care reprezintă >5% din cifra de vânzări"

/**
 * Risc de concentrare / dependență de clienți (spec §24). Indicele
 * Herfindahl-Hirschman (HHI, scala 0-10.000) e o măsură standard de
 * concentrare a pieței: <1.500 = risc scăzut, 1.500-2.500 = moderat, >2.500 = ridicat.
 */
export function computeConcentration(rows: BreakdownRow[]): ConcentrationResult {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value)
  const totalValue = sorted.reduce((s, r) => s + r.value, 0)

  function shareOfTopN(n: number): number {
    return totalValue > 0 ? (sorted.slice(0, n).reduce((s, r) => s + r.value, 0) / totalValue) * 100 : 0
  }

  const herfindahlIndex = totalValue > 0 ? sorted.reduce((s, r) => s + (r.value / totalValue) ** 2, 0) * 10000 : 0
  const riskLevel: ConcentrationResult['riskLevel'] = herfindahlIndex >= 2500 ? 'ridicat' : herfindahlIndex >= 1500 ? 'moderat' : 'scazut'

  const clientsAboveThreshold = sorted
    .map((r) => ({ id: r.id, name: r.name, share: totalValue > 0 ? (r.value / totalValue) * 100 : 0 }))
    .filter((r) => r.share > CONCENTRATION_THRESHOLD)

  return {
    totalValue,
    top1Share: shareOfTopN(1),
    top5Share: shareOfTopN(5),
    top10Share: shareOfTopN(10),
    top20Share: shareOfTopN(20),
    herfindahlIndex,
    riskLevel,
    clientsAboveThreshold,
  }
}
