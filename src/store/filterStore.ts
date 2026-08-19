import { create } from 'zustand'
import { defaultFilterState, type FilterState } from '@/kpi/filterState'

interface FilterStoreState {
  filter: FilterState
  setFilter: (patch: Partial<FilterState>) => void
  resetFilter: () => void
}

export const useFilterStore = create<FilterStoreState>((set) => ({
  filter: defaultFilterState,
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set({ filter: defaultFilterState }),
}))
