import type { DateRange, PeriodPreset } from '@/kpi/dateRanges'
import { resolvePreset } from '@/kpi/dateRanges'

export interface FilterState {
  preset: PeriodPreset
  customRange: DateRange | null
  teamId: string | 'all'
  cashierId: string | 'all'
  shift: 1 | 2 | 'all'
  category: string | 'all'
  productId: string | 'all'
}

export const defaultFilterState: FilterState = {
  preset: 'last30',
  customRange: null,
  teamId: 'all',
  cashierId: 'all',
  shift: 'all',
  category: 'all',
  productId: 'all',
}

export function effectiveRange(filter: FilterState): DateRange {
  return resolvePreset(filter.preset, filter.customRange ?? undefined)
}
