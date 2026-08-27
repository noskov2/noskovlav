import { db } from '../db/db'
import { computeAggregate } from './aggregate'
import type { GlobalFilters } from './filters'

export type ClientDynamicStatus = 'nou' | 'pierdut' | 'reactivat' | 'crescut' | 'scazut' | 'activ'

export const STATUS_LABEL: Record<ClientDynamicStatus, string> = {
  nou: 'Client nou',
  pierdut: 'Client pierdut',
  reactivat: 'Client reactivat',
  crescut: 'Client în creștere',
  scazut: 'Client în scădere',
  activ: 'Client activ (stabil)',
}

export interface ClientDynamicRow {
  id: number
  name: string
  currentValue: number
  previousValue: number
  status: ClientDynamicStatus
  diffPercent: number | null
}

export interface ClientDynamicsResult {
  rows: ClientDynamicRow[]
  countByStatus: Record<ClientDynamicStatus, number>
  valueByStatus: Record<ClientDynamicStatus, number>
}

/**
 * Dinamica clienților (spec §19): nou / pierdut / reactivat / activ / în
 * creștere / în scădere, comparând perioada curentă cu cea de comparație.
 * „Client pierdut" = a cumpărat în comparație, zero acum (definiție dată
 * explicit de spec) — restul categoriilor sunt definite simetric.
 *
 * @param growthThresholdPercent prag peste care o variație contează drept
 * „creștere"/„scădere" (sub prag rămâne „activ (stabil)"); implicit 10%,
 * ajustabil din UI (spec: „Permite ajustarea regulilor").
 */
export async function computeClientDynamics(filters: GlobalFilters, growthThresholdPercent = 10): Promise<ClientDynamicsResult | null> {
  if (!filters.comparisonPeriod) return null

  const [current, previous, historyRows] = await Promise.all([
    computeAggregate(filters),
    computeAggregate({ ...filters, period: filters.comparisonPeriod }),
    db.transactions.where('date').below(filters.comparisonPeriod.start).toArray(),
  ])

  const clientsWithHistory = new Set(historyRows.map((t) => t.canonicalClientId).filter((id): id is number => id !== null))

  const currentByClient = new Map(current.byClient.filter((r) => r.id !== null).map((r) => [r.id as number, r]))
  const previousByClient = new Map(previous.byClient.filter((r) => r.id !== null).map((r) => [r.id as number, r]))

  const allIds = new Set([...currentByClient.keys(), ...previousByClient.keys()])

  const rows: ClientDynamicRow[] = []
  for (const id of allIds) {
    const cur = currentByClient.get(id)
    const prev = previousByClient.get(id)
    const currentValue = cur?.value ?? 0
    const previousValue = prev?.value ?? 0
    const name = cur?.name ?? prev?.name ?? `#${id}`

    let status: ClientDynamicStatus
    let diffPercent: number | null = null

    if (currentValue > 0 && previousValue === 0) {
      status = clientsWithHistory.has(id) ? 'reactivat' : 'nou'
    } else if (currentValue === 0 && previousValue > 0) {
      status = 'pierdut'
      diffPercent = -100
    } else {
      diffPercent = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : null
      if (diffPercent !== null && diffPercent >= growthThresholdPercent) status = 'crescut'
      else if (diffPercent !== null && diffPercent <= -growthThresholdPercent) status = 'scazut'
      else status = 'activ'
    }

    rows.push({ id, name, currentValue, previousValue, status, diffPercent })
  }

  const countByStatus: Record<ClientDynamicStatus, number> = { nou: 0, pierdut: 0, reactivat: 0, crescut: 0, scazut: 0, activ: 0 }
  const valueByStatus: Record<ClientDynamicStatus, number> = { nou: 0, pierdut: 0, reactivat: 0, crescut: 0, scazut: 0, activ: 0 }
  for (const r of rows) {
    countByStatus[r.status]++
    valueByStatus[r.status] += r.currentValue
  }

  rows.sort((a, b) => b.currentValue - a.currentValue)

  return { rows, countByStatus, valueByStatus }
}
