import type { DateRange, ComparisonMode } from '../lib/periods'
import { resolveComparisonPeriod, resolvePeriod } from '../lib/periods'
import type { Channel } from '../types'

/**
 * Filtrele globale disponibile pentru orice raport (spec §14). Toate
 * selecțiile sunt multi-select (liste goale = "toate").
 */
export interface GlobalFilters {
  period: DateRange
  comparisonMode: ComparisonMode
  comparisonPeriod: DateRange | null

  channels: Channel[]
  clientIds: number[]
  productIds: number[]
  categoryIds: number[]
  counties: string[]
  localities: string[]
  agents: string[]

  topN: number | null
  sortBy: 'value' | 'quantity' | 'growth' | 'alphabetic'
  metric: 'value' | 'quantity'
}

export function defaultFilters(): GlobalFilters {
  const period = resolvePeriod('current-year')
  return {
    period,
    comparisonMode: 'previous-period',
    comparisonPeriod: resolveComparisonPeriod(period, 'previous-period'),
    channels: [],
    clientIds: [],
    productIds: [],
    categoryIds: [],
    counties: [],
    localities: [],
    agents: [],
    topN: null,
    sortBy: 'value',
    metric: 'value',
  }
}
